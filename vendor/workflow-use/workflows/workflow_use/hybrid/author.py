"""Natural task entry over the native Agent and its public callbacks."""
from copy import deepcopy
from tempfile import TemporaryDirectory
from typing import Callable, Literal
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
from .selection_tool import PreparedSelections, register_selection_tool
from .repeat_annotation import annotate_repeat_method
from .source_response import author_source_response
from .method_read_tool import register_method_read_tool
from .page_content import content_result
from .repeat_query_feedback import repeat_query_feedback
from .method_read_schema import representative_schema
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

async def author_step(browser, raw, models, output_model_for: Callable, diagnostic=None, human_wait=None,
                      compilation_exchange=None):
    request = AuthorInput.model_validate(raw)
    Draft202012Validator(request.inputSchema).validate(request.input)
    _validate_result_spec(request)
    output_model, unwrap = output_model_for(request.outputSchema, 'HybridAgentOutput')
    # WHY：执行能力缺口保留在 registry/coverage；不允许源码执行和文件操作绕开受控能力。
    collector = None
    tools = author_tools_for_result_spec(output_model, request.resultSpec, source_protocol=request.sourceProtocol)
    tools._bat_human_wait = human_wait
    field_read_records, summary_records = tools._bat_field_read_records, tools._bat_summary_records
    if field_read_records is not None:
        field_read_records.input_value = request.input
        field_read_records.input_schema = request.inputSchema
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
                                  entry_urls=request.entryUrls,
                                  sanitize_evidence_value=evidence_sanitizer(request),
                                  field_read_records=field_read_records, target_scroll_records=target_scroll_records,
                                  visible_wait_records=visible_wait_records,
                                  summary_records=summary_records,
                                  dispatch_audit=dispatch_audit, result_spec=request.resultSpec)
    tools._bat_selections.bind(collector, request, models['agent'])
    tools._bat_method_collector, tools._bat_method_requirement = collector, request.requirementDigest
    redaction = put('redaction-manifest', {'policy': 'execution-values-preserved/v1', 'rawHistorySaved': False})
    live = AuthorCompilation(request, collector, tools._bat_selections, compilation_exchange, redaction, models['semantic_annotation']) \
        if compilation_exchange is not None else None
    callbacks = AuthorCaptureCallbacks(collector, lambda: registry, diagnostic=diagnostic,
        normalize_action=normalize_author_action,
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
                                               settle_dispatch=dialog_bridge.settle)
            guidance = (NATURAL_EXECUTION_AGENT_GUIDANCE if request.resultSpec.mode == 'execution'
                        else NATURAL_AGENT_GUIDANCE)
            if request.sourceProtocol == 'bat-hybrid/3':
                guidance += METHOD_AGENT_GUIDANCE
            # WHY：保留全部原生默认观察属性；已有 href 是识别无字链接的证据，不能只反馈点击成功。
            agent = Agent(task=request.task, browser=browser, tools=tools, llm=models['agent'],
                          include_attributes=[*AgentSettings().include_attributes, 'href'],
                          page_extraction_llm=models['extract'],
                          register_new_step_callback=callbacks.before_action, use_vision=True, use_judge=False,
                           max_actions_per_step=1, directly_open_url=False, enable_signal_handler=False,
                           _url_shortening_limit=AUTHOR_URL_SHORTENING_LIMIT,
                           file_system_path=directory, save_conversation_path=None,
                          extend_system_message=guidance)
            callbacks.bind(agent)
            tools._bat_method_can_continue = lambda: (not callbacks.failed and not agent.state.stopped
                and not agent.state.paused and agent.state.n_steps < request.maxSteps)
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
                history, run_failed, output_model, unwrap, request.outputSchema, field_read_records, request.resultSpec)
            source_success = completed and not output_gaps
            # WHY：动作参数和选定证据是复跑数据；只省略 raw history，不再按内容来源破坏执行原值。
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
    if source_success:
        trace, repeat_gaps, repeat_advances = await annotate_repeat_method(request, trace, models['semantic_annotation'])
        gaps.extend(repeat_gaps)
        if live is None:
            trace, selection_gaps = await annotate_selections(
                request, trace, models['semantic_annotation'], skip_action_refs=repeat_advances)
            gaps.extend(selection_gaps)
    compilation = natural_compilation_request(request, trace, registry)
    if live is not None:
        await live.finish(compilation, gaps)
    return author_source_response(output, compilation, gaps)

def _public_compilation_request(compilation):
    # WHY：Pydantic 内部字段名不能进入跨语言事实源；canonical payload 与普通 request 必须同用公共别名。
    return compilation.model_dump(mode='json', by_alias=True)

def _business_result(history, run_failed, output_model, unwrap, output_schema, read_records=None, result_spec=None):
    completed = not run_failed and history.is_done() is True and history.is_successful() is True
    output, output_gaps = None, []
    if run_failed:
        output_gaps.append(gap('invalid_source', [], 'native_agent_run_failed', 'reject_trace'))
    # WHY：Agent 正常结束和输出合同是来源事实；不得再追加链外 judge 改写这两个事实。
    if completed:
        try:
            structured = history.get_structured_output(output_model)
            if structured is None:
                raise ValueError('hybrid_structured_output_missing')
            output = unwrap(structured)
            selected = set(getattr(read_records, 'selected_refs', ()))
            reads = [record for record in getattr(read_records, 'records', ()) if record.readRef in selected]
            paths = [record.mapping.outputPath for record in reads]
            for record in reads:
                if digest(value_at_path(output, record.mapping.outputPath)) != digest(
                        value_at_path(record.sample.output, record.mapping.readPath)):
                    raise ValueError('representative_read_sample_mismatch')
            Draft202012Validator(representative_schema(
                output_schema, paths, result_spec=result_spec, output=output)).validate(output)
        except Exception:
            output = None
            output_gaps.append(gap('invalid_source', [], 'business_output_schema_not_proven', 'reject_trace'))
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
    'Use browser-use native actions to complete the confirmed business step from the authorized entry. '
    'Keep runtime input URLs exact. Prepare one reusable method, not a separate graph or a plan invented by you. '
    'For a step returning result data, immediately after opening its initial page and BEFORE entering inputs '
    'or submitting, use find_elements to inspect the result/status regions and their id, class, aria-busy, '
    'data-state and data-status attributes. Do this even when you do not yet know whether updates are '
    'asynchronous. Repeat that state query immediately after the action that generates the result. '
    'Do not postpone the initial-state observation until the result has already been generated. '
    'Keep confirmed text and search terms exact when submitting. Use the observed submit control or native '
    'send_keys with Enter after input; do not replace the confirmed value with an autocomplete suggestion. '
    'For page/region content output, use bat_read_fields with regions: supply CSS selecting the relevant '
    'whole container or observed related regions. The host captures exactly those selected regions. '
    'Capture the entire relevant region, '
    'not individual final parameters. Expand and scroll relevant content before capturing so text and images '
    'are actually loaded. The host stores original HTML, Markdown and original loaded image bytes without cleaning. '
    'When the task requests a specific region, locate and inspect that region in the native page observation. '
    'Do not substitute body/html, unrelated navigation, reviews or recommendations for the requested region. '
    'A tab click or scroll alone does not prove the requested content loaded: inspect the actual region, '
    'and continue native investigation if it is still an empty placeholder. '
    'For asynchronous final results, use those observed initial and processing states; '
    'waiting until the sample finishes loses the evidence needed for a reusable completion condition. '
    'This applies to both structured field reads and raw content capture: put the condition in the '
    'structured read container or the content regions selector; readable fields alone are not final. '
    'Use browser-native CSS only; :has-text() and text= are not supported. '
    'Put the observed readiness condition in the read-region CSS selector, using an ancestor/descendant '
    'condition when needed. An always-present container alone is not a final-result read method: exclude '
    'the observed in-progress states while preserving every valid terminal outcome, not only this sample. '
    'An outcome such as acceptance/rejection is result data, not a reusable completion condition. '
    'Preserve this condition when correcting selector syntax. Prefer one observed whole result container '
    'with the readiness condition on it, or CSS :has(...) when the status is a descendant. '
    'Before recording the read, compare the proposed CSS against your just-observed processing snapshot: '
    'it must match NOTHING in that snapshot. An outcome/summary may already be populated while details '
    'are still processing, so nonempty or nonpending result data cannot substitute for lifecycle readiness. '
    'CSS comma lists are OR, not AND: use the SAME observed lifecycle condition for all required regions, '
    'preferably on their common ancestor. Different per-region state filters do not wait for all regions. '
    'Model thinking and exploratory queries are not replay waits. If no executable terminal condition '
    'can be observed, report the missing method instead of relying on time spent exploring. '
    'To locate visible text structurally, use native search_page with an observed text fragment: its matches '
    'include the actual DOM ancestor path. Inspect that path with native find_elements, including id/class '
    'attributes and children, then select the relevant whole region or related regions for capture. '
    'Do not use extract to produce this raw content: native extract is a semantic exploration tool, not raw capture. '
    'For explicitly confirmed structured control/navigation reads, use the available read tool schema; '
    'the host owns technical IDs, budgets, types and evidence. Apply only confirmed ordering and take limits. '
    'Repeat the same recorded method when the business step repeats. Preserve source identity and query '
    'the real continuation condition; never treat a representative sample as the entire dataset. '
    'Choose controls using current native browser observations. '
    'For an input ElementEntry, backendNodeId identifies the whole selected record, not a native action index. '
    'Choose the current native index of the intended link/control inside that record using its observed name; '
    'do not click a decorative wrapper or switch to another record. After navigation, expansion, scrolling or '
    'loading, inspect the new state before consuming it. Ordinary compilation gaps do not cancel exploration '
    'and never authorize the host to replay your actions. Unsupported methods cannot be published as replay. '
    'For login, CAPTCHA or access requiring a person use bat_request_human in the same owned tab. '
    'Never bypass restrictions; new business ambiguity must return to requirement dialogue. '
    'Finish with explicit success/failure and an observed reason. Content delivery is taken from the host '
    'capture receipt, so you need not copy content or list final fields in done. Other structured results '
    'use their successful readRefs; execution-only tasks have no data output. '
    'Never invent DOM selectors to fill absent business parameters or require a global completion judge.')
NATURAL_EXECUTION_AGENT_GUIDANCE = NATURAL_AGENT_GUIDANCE

METHOD_AGENT_GUIDANCE = (
    ' Preparation must retain how to perform the task on future inputs, not only report current state. '
    'When a choice depends on current page data, read complete candidates with native find_elements '
    'including text and href. Successful native actions already record the method; recorded does not '
    'require bat_inspect_action. If the selected target is already open, use bat_inspect_action instead '
    'of clicking or navigating to it again. This records navigation without dispatch. '
    'If a later inspection fails, it does not erase earlier successful actions. '
    'After an inspection, record required page-wide effects with native wait; '
    'do not reuse an earlier playback observation as proof after that navigation. '
    'The host compiles selection source once; do not write code, IDs, graphs or tests. '
    'methodOutcome in done distinguishes a recorded reusable method from state_only or unsupported. '
    'Never repeat external writes merely to record a method.')


def _reject_navigation_scope_retry(agent):
    history = getattr(agent, 'history', None)
    steps = getattr(history, 'history', None)
    if not steps:
        return
    for result in getattr(steps[-1], 'result', []):
        error = getattr(result, 'error', None)
        if isinstance(error, str) and ('blocked by security policy' in error or 'not_in_allowed_domains' in error):
            raise NavigationScopeViolation('hybrid_navigation_outside_authorized_scope')

def author_tools(output_model, output_schema=None, *, summary_model=None, summary_context_provider=None,
                 exclude_extract=False, result_spec=None, legacy_model_fields=False, source_protocol='bat-hybrid/2'):
    # WHY：原生 Agent 继续拥有探索；唯一方法读取工具复用正式 ReadSpec，
    # done 只引用宿主记录，不让模型重抄业务值或另建一套执行图。
    excluded = ['evaluate', 'read_file', 'write_file', 'replace_file',
                'upload_file', 'download_file', 'screenshot',
                'search', 'find_text', 'close', 'save_as_pdf']
    # WHY：原生search绕过入口来源绑定，find_text含滚动副作用，close/PDF缺资源或交付合同。
    # switch 已由真实 tab 来源和运行时绑定核验，必须同时向原生探索与正式执行开放。
    # 缺合同的能力必须在模型选动作前明确不可用，不能执行之后才发现无法编译。
    if exclude_extract:
        # WHY：execution 没有业务数据输出，原生 extract 产生的是一次性模型判断，无法成为
        # 零模型复跑节点；动态列表读取必须走可证明的 find_elements/read-fields 合同。
        excluded.append('extract')
    tools = AuthorTools(output_model=output_model, exclude_actions=excluded,
                        output_schema=output_schema, result_spec=result_spec, legacy_model_fields=legacy_model_fields,
                        source_protocol=source_protocol)
    tools._bat_target_scroll_records = None
    tools._bat_visible_wait_records = None
    tools._bat_field_read_records = (register_method_read_tool(tools, output_schema=output_schema,
                                    capture_content=content_result(result_spec), legacy_model_fields=legacy_model_fields)
                                    if output_schema and output_schema != {'type': 'null'} else None)
    tools._bat_summary_records = None
    return tools

def author_tools_for_result_spec(output_model, result_spec, *, selection_methods=False, human_intervention=True,
                                 legacy_model_fields=False, source_protocol='bat-hybrid/2'):
    """Build the one registry shared by live authoring and offline recompilation."""
    schema = result_spec.schemaValue if result_spec.mode == 'data' else {'type': 'null'}
    tools = author_tools(output_model, schema, exclude_extract=False, result_spec=result_spec,
                         legacy_model_fields=legacy_model_fields, source_protocol=source_protocol)
    if source_protocol == 'bat-hybrid/3':
        register_inspection_tool(tools)
    if human_intervention:
        register_human_wait_tool(tools)
    # WHY：旧来源注册表仍可精确重建；实际探索不再向 B-U 暴露编译函数工具。
    tools._bat_selections = register_selection_tool(tools) if selection_methods else PreparedSelections()
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
