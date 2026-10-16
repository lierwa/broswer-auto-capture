"""Natural task entry over the native Agent and its public callbacks."""
from copy import deepcopy
from tempfile import TemporaryDirectory
from typing import Literal
from uuid import uuid4

from browser_use import Agent
from browser_use.agent.views import AgentSettings
from jsonschema import Draft202012Validator
from pydantic import Field, JsonValue

from .action_dispatch import ActionDispatchAudit, bind_tools_act
from .author_tools import AuthorTools
from .author_callbacks import AuthorCaptureCallbacks
from .author_compilation import AuthorCompilation
from .capture import EvidenceCollector
from .dialog_event_bridge import DialogEventBridge
from .evidence import Contract, EvidenceRef, digest, gap
from .native_event_capture import NativeEventCapture
from .observation_scope import SourceObservationScope
from .registry import ActionRegistry
from .request import NaturalCompilationRequest, ResultSpec
from .selection_annotation import annotate_selections
from .selection_tool import PreparedSelections
from .repeat_annotation import annotate_repeat_method
from .source_response import author_source_response
from .method_read_tool import register_method_read_tool
from .page_content import content_result
from .repeat_query_feedback import repeat_query_feedback
from .method_read_schema import representative_schema
from .method_completion import complete_from_read_refs, content_read_refs, unambiguous_read_refs
from .natural_reads import value_at_path
from .author_action_helpers import find_elements_outcome, field_read_outcome, normalize_author_action
from .human_wait import human_step_callback, register_human_wait_tool
from .method_inspection import register_inspection_tool
from .method_receipt import attach_method_receipt

class AuthorInput(Contract):
    sourceProtocol: Literal['bat-hybrid/2', 'bat-hybrid/3'] = 'bat-hybrid/2'
    readOnly: bool = False
    task: str = Field(min_length=1, max_length=100000)
    input: JsonValue
    inputSchema: dict[str, JsonValue]
    outputSchema: dict[str, JsonValue]
    resultSpec: ResultSpec
    requirementId: str
    requirementVersion: int = Field(gt=0)
    requirementText: str = Field(min_length=1, max_length=100000)
    requirementDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    entryUrls: list[str] = Field(max_length=32)
    planId: str
    planVersion: int = Field(gt=0)
    planDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    stepId: str
    callMode: Literal['once', 'each', 'batch']
    maxSteps: int = Field(gt=0, le=100)

AUTHOR_URL_SHORTENING_LIMIT = 2048

class NavigationScopeViolation(RuntimeError):
    pass

async def author_step(browser, raw, models, diagnostic=None, human_wait=None,
                      compilation_exchange=None):
    request = AuthorInput.model_validate(raw)
    Draft202012Validator(request.inputSchema).validate(request.input)
    _validate_result_spec(request)
    # WHY：执行能力缺口保留在 registry/coverage；不允许源码执行和文件操作绕开受控能力。
    tools = author_tools_for_result_spec(request.resultSpec, source_protocol=request.sourceProtocol)
    tools._bat_human_wait = human_wait
    field_read_records, summary_records = tools._bat_field_read_records, tools._bat_summary_records
    if field_read_records is not None:
        field_read_records.input_value = request.input
        field_read_records.input_schema = request.inputSchema
    target_scroll_records, visible_wait_records = tools._bat_target_scroll_records, tools._bat_visible_wait_records
    event_capture, dialog_bridge = NativeEventCapture(browser), DialogEventBridge(browser)
    dispatch_audit, registry = ActionDispatchAudit(event_capture), ActionRegistry.from_tools(tools)
    restore_tools_act = lambda: None
    def put(kind, value):
        fingerprint = digest(value)
        return EvidenceRef(ref='sha256:' + fingerprint, digest=fingerprint)
    collector = EvidenceCollector(browser, registry, put_evidence=put, redact_action=redactor(request),
                                  input_value=request.input, input_schema=request.inputSchema,
                                  requirement_text=request.requirementText, output_schema=request.outputSchema,
                                  entry_urls=request.entryUrls,
                                  sanitize_evidence_value=evidence_sanitizer(request),
                                  field_read_records=field_read_records, target_scroll_records=target_scroll_records,
                                  visible_wait_records=visible_wait_records,
                                  summary_records=summary_records,
                                  dispatch_audit=dispatch_audit, result_spec=request.resultSpec)
    tools._bat_selections.bind(collector, request)
    tools._bat_method_collector, tools._bat_method_requirement = collector, request.requirementDigest
    redaction = put('redaction-manifest', {'policy': 'execution-values-preserved/v1', 'rawHistorySaved': False})
    live = AuthorCompilation(request, collector, tools._bat_selections, compilation_exchange, redaction, models['semantic_annotation']) \
        if compilation_exchange is not None else None
    callbacks = AuthorCaptureCallbacks(collector, lambda: registry, diagnostic=diagnostic,
        normalize_action=lambda action: normalize_author_action(action, field_read_records),
        action_outcomes={'find_elements': find_elements_outcome, 'bat_read_fields': field_read_outcome},
        reject_navigation_scope=_reject_navigation_scope_retry,
        before_dispatch=tools._bat_selections.before_dispatch, compilation=live)
    if request.readOnly:
        from .author_read_only import install_read_only
        install_read_only(callbacks, request.entryUrls)
    observation_scope = SourceObservationScope(browser, collector, callbacks)
    on_step_end = human_step_callback(human_wait, collector, callbacks.after_step)
    with TemporaryDirectory(prefix='bat-hybrid-agent-') as directory:
        try:
            dialog_bridge.start()
            restore_tools_act = bind_tools_act(tools, dispatch_audit, diagnostic, lambda: registry,
                                               settle_dispatch=dialog_bridge.settle,
                                               before_dispatch=callbacks.before_dispatch_action,
                                               after_dispatch=callbacks.after_dispatch_action)
            guidance = (NATURAL_EXECUTION_AGENT_GUIDANCE if request.resultSpec.mode == 'execution'
                        else NATURAL_AGENT_GUIDANCE)
            if request.sourceProtocol == 'bat-hybrid/3':
                guidance += METHOD_AGENT_GUIDANCE
            # WHY：保留全部原生默认观察属性；已有 href 是识别无字链接的证据，不能只反馈点击成功。
            agent = Agent(task=request.task, browser=browser, tools=tools, llm=models['agent'],
                          include_attributes=[*AgentSettings().include_attributes, 'href'],
                          page_extraction_llm=models['extract'],
                          register_new_step_callback=callbacks.before_action, use_vision=True, use_judge=False,
                           directly_open_url=False, enable_signal_handler=False,
                           _url_shortening_limit=AUTHOR_URL_SHORTENING_LIMIT,
                           file_system_path=directory, save_conversation_path=None,
                          extend_system_message=guidance)
            callbacks.bind(agent)
            # WHY：来源使用同一原生Agent拥有的FileSystem；文件字节不进入模型或编译消息。
            collector.native_file_system = agent.file_system
            collector.native_available_file_paths = lambda: agent.available_file_paths
            if field_read_records is not None:
                field_read_records.feedback_provider = lambda read_ref: repeat_query_feedback(collector, agent.history, read_ref)
            observation_scope.start()
            # Agent finalizes its public registry during construction (including screenshot/output actions).
            registry = ActionRegistry.from_tools(tools)
            collector.registry = registry
            run_failed = False
            try:
                history = await agent.run(max_steps=request.maxSteps, on_step_end=on_step_end)
            except Exception:
                # WHY：原生运行异常可能发生在回调之后；保留已采集来源事实但不保存异常正文，也不伪造成功。
                history = agent.history
                run_failed = True
            run_failed = run_failed or callbacks.failed
            completed, output, output_gaps = _business_result(
                history, run_failed, request.outputSchema, field_read_records, request.resultSpec)
            # WHY：原生业务成功和宿主输出/编译证明是不同事实；不能让装配错误延长Agent探索。
            source_success = completed
            collector.redact_action = redactor(request, output)
            trace, gaps, output = collector.finish(
                history, history_ref=live.history_ref if live else 'normalized-trace:' + str(uuid4()), final_output=output,
                redaction_manifest=redaction, source_completed=source_success)
            gaps.extend(output_gaps)
        finally:
            observation_scope.close()
            try:
                await dialog_bridge.close()
            finally:
                try:
                    await event_capture.close()
                finally:
                    restore_tools_act()
    return await finish_author_source(tools, request, trace, gaps, registry, output, source_success, models, live)


async def finish_author_source(tools, request, trace, gaps, registry, output, source_success, models, live=None):
    # The normalized trace itself is persisted inside the v2 artifact; raw AgentHistory is never serialized.
    trace = tools._bat_selections.attach(trace)
    trace = attach_method_receipt(trace, request)
    annotation_failed = False
    if source_success:
        try:
            updated, repeat_gaps, repeat_advances = await annotate_repeat_method(request, trace, models['semantic_annotation'])
            if live is None:
                updated, selection_gaps = await annotate_selections(
                    request, updated, models['semantic_annotation'], skip_action_refs=repeat_advances)
                gaps.extend(selection_gaps)
            trace = updated
            gaps.extend(repeat_gaps)
        except Exception:
            # WHY：注解错误属于候选，不覆盖原生done或消灭已结束的真实来源，不启动离线救援。
            annotation_failed = True
            if live is None:
                gaps.append(gap('missing_binding', [], 'hybrid_semantic_annotation_failed', 'collect_evidence'))
    compilation = natural_compilation_request(request, trace, registry)
    if live is not None:
        await live.finish(compilation, gaps, annotation_failed=annotation_failed)
    return author_source_response(output, compilation, gaps)

def _business_result(history, run_failed, output_schema, read_records=None, result_spec=None):
    completed = not run_failed and history.is_done() is True and history.is_successful() is True
    output, output_gaps = None, []
    if run_failed:
        output_gaps.append(gap('invalid_source', [], 'native_agent_run_failed', 'reject_trace'))
    # WHY：Agent 正常结束和输出合同是来源事实；不得再追加链外 judge 改写这两个事实。
    if completed:
        try:
            references = (content_read_refs(read_records) if content_result(result_spec)
                          else unambiguous_read_refs(read_records))
            output = complete_from_read_refs(read_records, references, output_schema, result_spec)
            selected = set(getattr(read_records, 'selected_refs', ()))
            reads = [record for record in getattr(read_records, 'records', ()) if record.readRef in selected]
            paths = [record.mapping.outputPath for record in reads]
            for record in reads:
                if digest(value_at_path(output, record.mapping.outputPath)) != digest(
                        value_at_path(record.sample.output, record.mapping.readPath)):
                    raise ValueError('representative_read_sample_mismatch')
            Draft202012Validator(representative_schema(
                output_schema, paths, result_spec=result_spec, output=output)).validate(output)
        except Exception as error:
            output = None
            known = {'completion_read_document_conflict', 'completion_content_scope_ambiguous',
                     'completion_read_path_conflict', 'completion_read_reference_invalid',
                     'completion_read_schema_mismatch', 'completion_derivation_source_missing',
                     'completion_derivation_source_invalid', 'natural_output_leaf_uncovered'}
            code = str(error) if isinstance(error, ValueError) and str(error) in known else 'business_output_schema_not_proven'
            output_gaps.append(gap('missing_effect_proof', [], code, 'collect_evidence'))
    return completed, output, output_gaps

def _validate_result_spec(request):
    value = request.resultSpec.model_dump(mode='json', by_alias=True)
    if value['mode'] == 'execution':
        if request.outputSchema != {'type': 'null'}:
            raise ValueError('execution_result_requires_null_output')
        return
    Draft202012Validator.check_schema(value['schema'])
    if value['schema'] != request.outputSchema:
        raise ValueError('data_result_schema_mismatch')

# WHY：通过原生 Agent 的指导接口保持已确认输入；动作仍直接使用 B-U Tools，不能固化误选联想项。
# 来源：browser-use eb4126921bea3373f91afc49fb4b59d6eda7fed6，browser_use/tools/service.py input/click/send_keys。
NATURAL_AGENT_GUIDANCE = (
    'Complete the confirmed step using native actions within the authorized entry and scope. '
    'Keep input URLs, text and required action order exact; submit using the observed control or Enter, '
    'without substituting an autocomplete suggestion. Inspect the current page after state changes. '
    'For requested data use bat_read_fields with observed browser-native CSS and relative projections. '
    'For raw content select the entire relevant loaded region, including requested text, tables and images. '
    'Native query text previews can include hidden text; they are not rendered-content reads. '
    # WHY：终态等待保留为方法，瞬时快照不是额外完成门；结果值不能冻结成唯一通过状态。
    'For asynchronous results inspect the required region completion marker and put that lifecycle condition '
    'in the read selector, preserving every valid terminal outcome. Use observed initial/processing states '
    'as counterexamples when available; do not repeat a completed submission to capture one. '
    'CSS comma branches are OR: apply the same completion condition to all required regions. '
    'Use browser-native CSS, not :has-text() or text=. If no completion condition is observable, report it. '
    'Representative samples verify a read, not the entire dataset. For repeated collection observe the '
    'actual continuation and stopping condition, then reuse the successful read method. '
    'For login, CAPTCHA or access requiring a person use bat_request_human; never bypass restrictions. '
    'Return new business ambiguity to requirement dialogue. Finish with native done; the host assembles '
    'data from successful reads. Do not copy data or technical fields into done.')
NATURAL_EXECUTION_AGENT_GUIDANCE = NATURAL_AGENT_GUIDANCE

METHOD_AGENT_GUIDANCE = (
    ' Inspect every requested result group. For graphical names or icon-only states inspect actual '
    'metadata and attributes (aria-label, title, alt, SVG href); use field parts for a label and its status. '
    'Exclude prohibited raw measurements while preserving the requested status. '
    'Each output path needs one complete read; alternative reads of the same path are not concatenated. '
    'For a current-page-dependent choice inspect the complete candidates and their destinations. '
    'If the intended target is already open, bat_inspect_action can record it without repeating navigation. '
    'Required page effects must be observed after that navigation. Never repeat external writes to record them. '
    'Finish required browser actions and reads before done; the host closes and audits this task-owned window.')


def _reject_navigation_scope_retry(agent):
    history = getattr(agent, 'history', None)
    steps = getattr(history, 'history', None)
    if not steps:
        return
    for result in getattr(steps[-1], 'result', []):
        error = getattr(result, 'error', None)
        if isinstance(error, str) and ('blocked by security policy' in error or 'not_in_allowed_domains' in error):
            raise NavigationScopeViolation('hybrid_navigation_outside_authorized_scope')

def author_tools(output_schema=None, *, result_spec=None):
    # WHY：原生探索保留extract；任意evaluate仍缺原生输入/请求预算guard，不开放。
    # 独立screenshot由Agent(use_vision=True)原生排除，不能与视觉观察混淆。
    tools = AuthorTools(exclude_actions=['evaluate'])
    tools._bat_target_scroll_records = None
    tools._bat_visible_wait_records = None
    tools._bat_field_read_records = (register_method_read_tool(tools, output_schema=output_schema,
                                    capture_content=content_result(result_spec))
                                    if output_schema and output_schema != {'type': 'null'} else None)
    tools._bat_summary_records = None
    return tools


def author_tools_for_result_spec(result_spec, *, source_protocol='bat-hybrid/2'):
    """Build the current registry shared by live authoring and recompilation."""
    schema = result_spec.schemaValue if result_spec.mode == 'data' else {'type': 'null'}
    tools = author_tools(schema, result_spec=result_spec)
    if source_protocol == 'bat-hybrid/3':
        register_inspection_tool(tools)
    register_human_wait_tool(tools)
    tools._bat_selections = PreparedSelections()
    return tools

def natural_compilation_request(request, trace, registry):
    requirement = {'id': request.requirementId, 'version': request.requirementVersion,
                   'text': request.requirementText, 'taskText': request.task,
                   'sourceDigest': request.requirementDigest}
    plan = {'id': request.planId, 'version': request.planVersion, 'sourceDigest': request.planDigest,
            'stepId': request.stepId, 'callMode': request.callMode,
            'entryUrls': request.entryUrls,
            'inputSchemaDigest': digest(request.inputSchema), 'outputSchemaDigest': digest(request.outputSchema),
            'resultSpec': request.resultSpec.model_dump(mode='json', by_alias=True)}
    return NaturalCompilationRequest.model_validate({'compilerVersion': getattr(request, 'sourceProtocol', 'bat-hybrid/2'),
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
