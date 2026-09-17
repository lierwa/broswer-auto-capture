"""Natural task entry over the native Agent and its public callbacks."""
from copy import deepcopy
from tempfile import TemporaryDirectory
from typing import Callable, Literal
from uuid import uuid4

from browser_use import Agent
from browser_use.tools.service import Tools
from jsonschema import Draft202012Validator
from pydantic import Field, JsonValue

from .__main__ import compilation_response
from .action_dispatch import ActionDispatchAudit, bind_tools_act
from .capture import EvidenceCollector
from .dialog_event_bridge import DialogEventBridge
from .evidence import Contract, EvidenceRef, digest, gap
from .field_read_tool import register_field_read_tool
from .invokes import VerifiedChild
from .lifecycle_diagnostics import action_metadata, observe_lifecycle
from .native_event_capture import NativeEventCapture
from .registry import ActionRegistry
from .request import NaturalCompilationRequest
from .summary_context import build_summary_context
from .summary_tool import register_summary_tool
from .target_scroll import register_target_scroll_tool
from .visible_wait import register_visible_wait_tool


class AuthorInput(Contract):
    task: str = Field(min_length=1, max_length=100000)
    input: JsonValue
    inputSchema: dict[str, JsonValue]
    outputSchema: dict[str, JsonValue]
    requirementId: str
    requirementVersion: int = Field(gt=0)
    requirementText: str = Field(min_length=1, max_length=100000)
    requirementDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    planId: str
    planVersion: int = Field(gt=0)
    planDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    stepId: str
    callMode: Literal['once', 'each', 'batch']
    maxSteps: int = Field(gt=0, le=100)
    verifiedChildren: list[VerifiedChild] = Field(default_factory=list, max_length=100)


async def author_step(browser, raw, models, output_model_for: Callable, diagnostic=None):
    request = AuthorInput.model_validate(raw)
    Draft202012Validator(request.inputSchema).validate(request.input)
    output_model, unwrap = output_model_for(request.outputSchema, 'HybridAgentOutput')
    # WHY：执行能力缺口保留在 registry/coverage；不允许源码执行和文件操作绕开受控能力。
    collector = None
    def summary_context():
        if collector is None:
            raise ValueError('summary_collector_unavailable')
        return build_summary_context(task=request.task, runtime_input=request.input,
            runtime_input_schema=request.inputSchema, observations=collector.observations)
    tools = author_tools(output_model, request.outputSchema, summary_model=models['semantic_annotation'],
                         summary_context_provider=summary_context)
    field_read_records, summary_records = tools._bat_field_read_records, tools._bat_summary_records
    target_scroll_records, visible_wait_records = tools._bat_target_scroll_records, tools._bat_visible_wait_records
    event_capture = NativeEventCapture(browser)
    dialog_bridge = DialogEventBridge(browser)
    dispatch_audit, registry = ActionDispatchAudit(event_capture), ActionRegistry.from_tools(tools)
    restore_tools_act = lambda: None
    def put(kind, value):
        fingerprint = digest(value)
        return EvidenceRef(ref='sha256:' + fingerprint, digest=fingerprint)
    collector = EvidenceCollector(browser, registry, put_evidence=put, redact_action=redactor(request),
                                  input_value=request.input, input_schema=request.inputSchema,
                                  requirement_text=request.requirementText, output_schema=request.outputSchema,
                                  sanitize_evidence_value=evidence_sanitizer(request),
                                  field_read_records=field_read_records, target_scroll_records=target_scroll_records,
                                  visible_wait_records=visible_wait_records,
                                  summary_records=summary_records,
                                  dispatch_audit=dispatch_audit)
    current_action = {}
    async def before_action(summary, model_output, step):
        try:
            actions = model_output.action
            raw_action = actions[0].model_dump(exclude_unset=True) if len(actions) == 1 else None
        except Exception:
            raw_action = None
        metadata = action_metadata(registry, raw_action, step)
        current_action.clear()
        current_action.update(metadata)
        return await observe_lifecycle(diagnostic, 'before_action',
            lambda: collector.before_action(summary, model_output, step), metadata)
    async def after_step(agent):
        metadata = dict(current_action)
        try:
            return await observe_lifecycle(diagnostic, 'after_step', lambda: collector.after_step(agent), metadata)
        finally:
            current_action.clear()
    with TemporaryDirectory(prefix='bat-hybrid-agent-') as directory:
        try:
            dialog_bridge.start()
            restore_tools_act = bind_tools_act(tools, dispatch_audit, diagnostic, lambda: registry,
                                               settle_dispatch=dialog_bridge.settle)
            agent = Agent(task=request.task, browser=browser, tools=tools, llm=models['agent'], judge_llm=models['judge'],
                          page_extraction_llm=models['extract'], output_model_schema=output_model,
                          register_new_step_callback=before_action, use_vision=True, use_judge=True,
                          max_actions_per_step=1, directly_open_url=False, enable_signal_handler=False,
                          file_system_path=directory, save_conversation_path=None,
                          extend_system_message=NATURAL_AGENT_GUIDANCE)
            # Agent finalizes its public registry during construction (including screenshot/output actions).
            registry = ActionRegistry.from_tools(tools)
            collector.registry = registry
            run_failed = False
            try:
                history = await agent.run(max_steps=request.maxSteps, on_step_end=after_step)
            except Exception:
                # WHY：原生运行异常可能发生在回调之后；保留已采集来源事实但不保存异常正文，也不伪造成功。
                history = agent.history
                run_failed = True
            succeeded = not run_failed and history.is_done() is True and history.is_successful() is True
            validated = not run_failed and history.is_validated() is True
            output, output_gaps = None, []
            if run_failed:
                output_gaps.append(gap('invalid_source', [], 'native_agent_run_failed', 'reject_trace'))
            # WHY：符合已确认合同的业务输出也是失败诊断证据；judge 结论仍由 trace/gate 独立拒绝。
            if succeeded:
                try:
                    structured = history.get_structured_output(output_model)
                    if structured is None:
                        raise ValueError('hybrid_structured_output_missing')
                    output = unwrap(structured)
                    Draft202012Validator(request.outputSchema).validate(output)
                except Exception:
                    output = None
                    output_gaps.append(gap('invalid_source', [], 'business_output_schema_not_proven', 'reject_trace'))
            # WHY：动作参数和选定证据是复跑数据；只省略 raw history，不再按内容来源破坏执行原值。
            redaction = put('redaction-manifest', {'policy': 'execution-values-preserved/v1', 'rawHistorySaved': False})
            collector.redact_action = redactor(request, output)
            trace, gaps = collector.finish(history, history_ref='normalized-trace:' + str(uuid4()), final_output=output,
                                           redaction_manifest=redaction, source_judged=validated,
                                           source_completed=succeeded)
            gaps.extend(output_gaps)
        finally:
            try:
                await dialog_bridge.close()
            finally:
                try:
                    await event_capture.close()
                finally:
                    restore_tools_act()
    # The normalized trace itself is persisted inside the v2 artifact; raw AgentHistory is never serialized.
    compilation = natural_compilation_request(request, trace, registry)
    return {'output': output, 'request': compilation.model_dump(mode='json'),
            'response': compilation_response(compilation, registry, request.verifiedChildren, gaps,
                                             output_schema=request.outputSchema),
            'history': {'localRef': trace.source.historyRef, 'digest': trace.digest},
            'sourceSuccess': succeeded, 'sourceValidated': validated,
            'browserCommands': sum(action.name not in ('done', 'bat_summarize') for action in trace.actions)}


NATURAL_AGENT_GUIDANCE = (
    'Use bat_read_fields for page-derived output fields and complete the read before navigating away. Its outputPath must '
    'be a path in the final output contract, never a temporary or scratch name. Give bat_read_fields only outputPath, '
    'container, and fields; each field contains selector and an optional attribute. For an object or array of objects, '
    'include every required field from that contract. For a scalar value, use fields.value. Never supply schema, types, '
    'cardinality, budgets, or readPath. You may use find_elements to discover a local CSS scope. If bat_read_fields reports '
    'an error, use its field name, match count, and fixed reason to correct that selector at the same final output path. '
    'Browser-use element indexes are not DOM ids, and its rendered tree is not proof of actual DOM parent-child structure. '
    'Do not invent DOM relationships or selectors. Do not embed sample '
    'values from the current input, such as one title or URL, or use generated runtime element IDs. Do not fall '
    'back to a non-replayable '
    'extraction. Native extract remains available for other exploration, but it does not prove a deterministic field read '
    'and its text must not be manually assembled into page-derived fields passed to done. Every page-derived field passed '
    'to done must come unchanged from a validated bat_read_fields result; find_elements or search text is not a substitute. '
    'For a known target, including pagination, first '
    'discover a local CSS selector and use bat_scroll_to. If a clickable index is already available, native click may be '
    'used directly. Do not search for a known target by scrolling an arbitrary number of pages. bat_scroll_to does not '
    'search lazy-loaded content. '
    'After an asynchronous action, use bat_wait_for with a CSS selector for the actual business-ready signal. Do not use '
    'fixed seconds, URL changes, title changes, or scroll position as proof that data refreshed. If no reliable ready '
    'selector exists, leave the completion gap unproven rather than inventing one. '
    'Use bat_summarize for an explicit report string after bat_read_fields has verified its source values. '
    'Do not use it to fill missing IDs, links, dates, authors, counts, or other page fields. '
    'When task order requires returning to a page and reading it again, call done only after a new bat_read_fields result '
    'from the returned page; do not substitute values cached before returning. '
    'Do not invent a separate rules document.')


def author_tools(output_model, output_schema=None, *, summary_model=None, summary_context_provider=None):
    # Agent(use_vision=True) also excludes screenshot through the public API; keep offline registry identical.
    tools = Tools(output_model=output_model, exclude_actions=['evaluate', 'read_file', 'write_file', 'replace_file',
                  'upload_file', 'download_file', 'screenshot'])
    tools._bat_target_scroll_records = register_target_scroll_tool(tools)
    tools._bat_visible_wait_records = register_visible_wait_tool(tools)
    if output_schema is not None:
        tools._bat_field_read_records = register_field_read_tool(tools, output_schema=output_schema)
        tools._bat_summary_records = register_summary_tool(tools, output_schema=output_schema,
            model=summary_model, context_provider=summary_context_provider or (lambda: None),
            occupied_paths=lambda: tools._bat_field_read_records.output_paths)
    return tools


def natural_compilation_request(request, trace, registry):
    requirement = {'id': request.requirementId, 'version': request.requirementVersion,
                   'text': request.requirementText, 'taskText': request.task,
                   'sourceDigest': request.requirementDigest}
    plan = {'id': request.planId, 'version': request.planVersion, 'sourceDigest': request.planDigest,
            'stepId': request.stepId, 'callMode': request.callMode,
            'inputSchemaDigest': digest(request.inputSchema), 'outputSchemaDigest': digest(request.outputSchema)}
    return NaturalCompilationRequest.model_validate({'compilerVersion': 'bat-hybrid/2',
        'actionRegistryVersion': registry.schemaDigest,
        'requirement': {**requirement, 'digest': digest(requirement)},
        'plan': {**plan, 'digest': digest(plan)}, 'runtimeInputSchema': request.inputSchema,
        'trace': trace.model_dump(mode='json')})


def redactor(_request, _output=None):
    # WHY：normalized trace 是复跑事实源；动作参数不能因未出现在需求、输入、输出或白名单中而变成摘要。
    return deepcopy


def evidence_sanitizer(request):
    input_refs = {}
    def collect(value, path):
        if isinstance(value, str):
            input_refs.setdefault(value, []).append(path)
        elif isinstance(value, dict):
            for key, item in value.items():
                collect(item, [*path, str(key)])
        elif isinstance(value, list):
            for index, item in enumerate(value):
                collect(item, [*path, str(index)])
    collect(request.input, [])
    def sanitize(_key, value):
        paths = input_refs.get(value, [])
        # WHY：只有唯一输入路径才是可复跑绑定；重复值不能任意绑定到第一次出现的位置。
        return {'inputRef': paths[0]} if len(paths) == 1 else value
    return sanitize
