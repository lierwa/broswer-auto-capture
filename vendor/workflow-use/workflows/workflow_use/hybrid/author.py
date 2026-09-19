"""Natural task entry over the native Agent and its public callbacks."""
import re
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
from .invokes import VerifiedChild
from .lifecycle_diagnostics import action_metadata, observe_lifecycle
from .native_event_capture import NativeEventCapture
from .registry import ActionRegistry
from .request import NaturalCompilationRequest, ResultSpec


class AuthorInput(Contract):
    task: str = Field(min_length=1, max_length=100000)
    input: JsonValue
    inputSchema: dict[str, JsonValue]
    outputSchema: dict[str, JsonValue]
    resultSpec: ResultSpec
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


AUTHOR_URL_SHORTENING_LIMIT = 2048
VISIBLE_TEXT_EXTRACTION_GUIDANCE = (
    ' Return every string as literal browser-visible text: add no Markdown, YAML, bullets, numbering, backticks, '
    'or link/image syntax unless those characters are visibly present. Collapse every whitespace run to one space '
    'and concatenate inline element text without adding delimiters.')


async def author_step(browser, raw, models, output_model_for: Callable, diagnostic=None):
    request = AuthorInput.model_validate(raw)
    Draft202012Validator(request.inputSchema).validate(request.input)
    _validate_result_spec(request)
    output_model, unwrap = output_model_for(request.outputSchema, 'HybridAgentOutput')
    # WHY：执行能力缺口保留在 registry/coverage；不允许源码执行和文件操作绕开受控能力。
    collector = None
    tools = author_tools(output_model)
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
                                  dispatch_audit=dispatch_audit, result_spec=request.resultSpec)
    current_action = {}
    async def before_action(summary, model_output, step):
        try:
            actions = model_output.action
            for action in actions:
                normalize_author_action(action)
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
        async def collect():
            result = await collector.after_step(agent)
            if metadata.get('actionName') == 'find_elements':
                metadata.update(find_elements_outcome(agent))
            if metadata.get('actionName') == 'bat_read_fields':
                metadata.update(field_read_outcome(agent))
            return result
        try:
            return await observe_lifecycle(diagnostic, 'after_step', collect, metadata)
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
                           _url_shortening_limit=AUTHOR_URL_SHORTENING_LIMIT,
                           file_system_path=directory, save_conversation_path=None,
                          extend_system_message=NATURAL_AGENT_GUIDANCE)
            # Agent finalizes its public registry during construction (including screenshot/output actions).
            registry = ActionRegistry.from_tools(tools)
            collector.registry = registry
            run_failed = False
            try:
                history = await _run_business_agent(agent, request.maxSteps, after_step)
            except Exception:
                # WHY：原生运行异常可能发生在回调之后；保留已采集来源事实但不保存异常正文，也不伪造成功。
                history = agent.history
                run_failed = True
            succeeded, validated, output, output_gaps = _business_result(
                history, run_failed, output_model, unwrap, request.outputSchema)
            # WHY：动作参数和选定证据是复跑数据；只省略 raw history，不再按内容来源破坏执行原值。
            redaction = put('redaction-manifest', {'policy': 'execution-values-preserved/v1', 'rawHistorySaved': False})
            collector.redact_action = redactor(request, output)
            trace, gaps, output = collector.finish(
                history, history_ref='normalized-trace:' + str(uuid4()), final_output=output,
                redaction_manifest=redaction, source_judged=validated, source_completed=succeeded)
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
    return {'output': output, 'request': _public_compilation_request(compilation),
            'response': compilation_response(compilation, registry, request.verifiedChildren, gaps,
                                             output_schema=request.outputSchema),
            'history': {'localRef': trace.source.historyRef, 'digest': trace.digest},
            'sourceSuccess': succeeded, 'sourceValidated': validated,
            'browserCommands': sum(action.name not in ('done', 'bat_summarize') for action in trace.actions)}


def _public_compilation_request(compilation):
    # WHY：Pydantic 内部字段名不能进入跨语言事实源；canonical payload 与普通 request 必须同用公共别名。
    return compilation.model_dump(mode='json', by_alias=True)


async def _run_business_agent(agent, max_steps, after_step):
    history = await agent.run(max_steps=max_steps, on_step_end=after_step)
    judgement = history.judgement() or {}
    retry = (history.is_done() is True and history.is_successful() is True
             and history.is_validated() is False and not judgement.get('reached_captcha')
             and not judgement.get('impossible_task'))
    if not retry:
        return history
    # WHY：judge 拒绝的是业务完成，不是编译证据；在同一 Agent/Browser 内只允许一次继续，避免随机重跑和第二浏览器。
    feedback = judgement.get('failure_reason') or judgement.get('reasoning') or 'required browser work was not fully demonstrated'
    feedback = ' '.join(str(feedback).split())[:2000]
    agent.add_new_task(
        'Restart the same original task from its exact runtime input in the current browser. Your previous success '
        'report was rejected by the '
        f'judge. Judge feedback: {feedback}. Complete every required navigation and '
        'data-reading step from the original task, preserving every input URL query parameter exactly. Use native '
        'extract on each page that contributes business values, including a conditional detail page, before leaving '
        'that page or calling done. Verify the resulting page state, and only then call done. Do not invent missing '
        'values, reconstruct the input query, or return early with placeholder or empty data.')
    return await agent.run(max_steps=max_steps, on_step_end=after_step)


def _business_result(history, run_failed, output_model, unwrap, output_schema):
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
            Draft202012Validator(output_schema).validate(output)
        except Exception:
            output = None
            output_gaps.append(gap('invalid_source', [], 'business_output_schema_not_proven', 'reject_trace'))
    return succeeded, validated, output, output_gaps


def _validate_result_spec(request):
    value = request.resultSpec.model_dump(mode='json', by_alias=True)
    if value['mode'] == 'execution':
        if request.outputSchema != {'type': 'null'}:
            raise ValueError('execution_result_requires_null_output')
        return
    Draft202012Validator.check_schema(value['schema'])
    if value['schema'] != request.outputSchema:
        raise ValueError('data_result_schema_mismatch')


def find_elements_outcome(agent):
    try:
        results = agent.history.history[-1].result
        if len(results) != 1:
            return {'queryOutcome': 'unavailable'}
        result = results[0]
        if result.error:
            return {'queryOutcome': 'invalid_selector' if 'Invalid CSS selector' in result.error else 'error'}
        matched = re.match(r'^Found ([0-9]+) elements? matching ', result.long_term_memory or '')
        if matched is None:
            return {'queryOutcome': 'unavailable'}
        count = int(matched.group(1))
        return {'queryOutcome': 'matched' if count else 'no_match', 'matchCount': count}
    except Exception:
        return {'queryOutcome': 'unavailable'}


def field_read_outcome(agent):
    try:
        results = agent.history.history[-1].result
        if len(results) != 1:
            return {'readOutcome': 'unavailable'}
        result = results[0]
        if not result.error:
            return {'readOutcome': 'succeeded'}
        error = result.error
        allowed = ('ambiguous_or_missing_read_field', 'read_', 'natural_read_', 'dom_reference_',
                   'bat_read_fields_failed')
        if not isinstance(error, str) or not error.startswith(allowed) or len(error) > 2000:
            return {'readOutcome': 'unavailable'}
        return {'readOutcome': 'failed', 'readError': error}
    except Exception:
        return {'readOutcome': 'unavailable'}


FIND_ELEMENTS_DEFAULT_ATTRIBUTES = ['data-testid', 'class', 'role', 'aria-label', 'href', 'datetime']


def normalize_author_action(action):
    """Fill Browser-Use's optional DOM attributes before capture and dispatch."""
    extract = getattr(action, 'extract', None)
    query = getattr(extract, 'query', None)
    if isinstance(query, str) and VISIBLE_TEXT_EXTRACTION_GUIDANCE not in query:
        # WHY：extract LLM 可能把视觉样式转写成 Markdown；固定为纯可见文本与既有
        # normalizeWhitespace DOM 投影对齐，业务值仍由页面证明而不是由模型格式决定。
        extract.query = query.rstrip() + VISIBLE_TEXT_EXTRACTION_GUIDANCE
    params = getattr(action, 'find_elements', None)
    if params is not None and getattr(params, 'attributes', None) is None:
        # WHY：B-A-T 后续要编译相对字段 selector；只有数量和文本不足以证明真实 DOM 属性，
        # 因此在适配边界复用 Browser-Use 公开 attributes 参数，而不是让模型反复猜 selector。
        params.attributes = list(FIND_ELEMENTS_DEFAULT_ATTRIBUTES)


NATURAL_AGENT_GUIDANCE = (
    'Complete the required browser business traversal with native Browser-Use actions and return one complete output. '
    'Navigate from an explicit runtime input URL exactly as supplied; never shorten, rebuild, or replace its query. '
    'Use native extract on every page that contributes business values, including conditional detail pages, before '
    'leaving that page or calling done; preserve exact source values allowed by the output schema. '
    'For string fields return complete visible text only, collapse whitespace runs to one space, and do not add '
    'Markdown syntax, non-visible media URLs, image URLs, or transient signed URLs absent from the visible text. '
    'Do not spend steps inventing replay selectors, DOM relationships, wait types, output bindings, or compiler metadata: '
    'B-A-T records and validates replay evidence outside the model. Missing replay evidence must not block later business '
    'pages or downgrade an otherwise completed business result; compilation reports that separately. '
    'For filters and ordering, verify the applied state from current-page evidence instead of trusting a guessed URL. '
    'After navigation or an asynchronous action, inspect the resulting business state before using it. '
    'Do not invent a separate rules document.')


def author_tools(output_model, output_schema=None, *, summary_model=None, summary_context_provider=None):
    # WHY：探索模型只使用 Browser-Use 原生能力。投影、等待和输出装配由宿主回调形成，
    # 不再注册五个 B-A-T 工具让模型二次描述已经发生的浏览器事实。
    tools = Tools(output_model=output_model, exclude_actions=['evaluate', 'read_file', 'write_file', 'replace_file',
                  'upload_file', 'download_file', 'screenshot'])
    tools._bat_target_scroll_records = None
    tools._bat_visible_wait_records = None
    tools._bat_field_read_records = None
    tools._bat_summary_records = None
    return tools


def natural_compilation_request(request, trace, registry):
    requirement = {'id': request.requirementId, 'version': request.requirementVersion,
                   'text': request.requirementText, 'taskText': request.task,
                   'sourceDigest': request.requirementDigest}
    plan = {'id': request.planId, 'version': request.planVersion, 'sourceDigest': request.planDigest,
            'stepId': request.stepId, 'callMode': request.callMode,
            'inputSchemaDigest': digest(request.inputSchema), 'outputSchemaDigest': digest(request.outputSchema),
            'resultSpec': request.resultSpec.model_dump(mode='json', by_alias=True)}
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
