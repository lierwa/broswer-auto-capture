"""Natural task entry over the native Agent and its public callbacks."""
from copy import deepcopy
from tempfile import TemporaryDirectory
from typing import Callable, Literal
from uuid import uuid4

from browser_use import Agent
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
from .repeat_query_feedback import repeat_query_feedback
from .method_read_schema import representative_schema
from .natural_reads import value_at_path
from .author_action_helpers import find_elements_outcome, field_read_outcome, normalize_author_action
from .human_wait import human_step_callback, register_human_wait_tool

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
    tools = author_tools_for_result_spec(output_model, request.resultSpec)
    tools._bat_human_wait = human_wait
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
                                  entry_urls=request.entryUrls,
                                  sanitize_evidence_value=evidence_sanitizer(request),
                                  field_read_records=field_read_records, target_scroll_records=target_scroll_records,
                                  visible_wait_records=visible_wait_records,
                                  summary_records=summary_records,
                                  dispatch_audit=dispatch_audit, result_spec=request.resultSpec)
    tools._bat_selections.bind(collector, request, models['agent'])
    redaction = put('redaction-manifest', {'policy': 'execution-values-preserved/v1', 'rawHistorySaved': False})
    live = AuthorCompilation(request, collector, tools._bat_selections, compilation_exchange, redaction, models['semantic_annotation']) \
        if compilation_exchange is not None else None
    callbacks = AuthorCaptureCallbacks(collector, lambda: registry, diagnostic=diagnostic,
        normalize_action=normalize_author_action,
        action_outcomes={'find_elements': find_elements_outcome, 'bat_read_fields': field_read_outcome},
        reject_navigation_scope=_reject_navigation_scope_retry,
        before_dispatch=tools._bat_selections.before_dispatch, compilation=live)
    observation_scope = SourceObservationScope(browser, collector, callbacks)
    on_step_end = human_step_callback(human_wait, collector, callbacks.after_step)
    with TemporaryDirectory(prefix='bat-hybrid-agent-') as directory:
        try:
            dialog_bridge.start()
            restore_tools_act = bind_tools_act(tools, dispatch_audit, diagnostic, lambda: registry,
                                               settle_dispatch=dialog_bridge.settle)
            guidance = (NATURAL_EXECUTION_AGENT_GUIDANCE if request.resultSpec.mode == 'execution'
                        else NATURAL_AGENT_GUIDANCE)
            agent = Agent(task=request.task, browser=browser, tools=tools, llm=models['agent'],
                          page_extraction_llm=models['extract'], output_model_schema=output_model,
                          register_new_step_callback=callbacks.before_action, use_vision=True, use_judge=False,
                           max_actions_per_step=1, directly_open_url=False, enable_signal_handler=False,
                           _url_shortening_limit=AUTHOR_URL_SHORTENING_LIMIT,
                           file_system_path=directory, save_conversation_path=None,
                          extend_system_message=guidance)
            callbacks.bind(agent)
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

NATURAL_AGENT_GUIDANCE = (
    'Prepare a reusable browser method for the confirmed task using this single browser session. '
    'Navigate from the confirmed entry and preserve explicit runtime input URLs exactly. '
    'For data outputs, call bat_read_fields with a DOM record container and relative field projections for a real '
    'outputPath in the confirmed result schema. Use current DOM observations to choose the method. The host derives '
    'field types and samples only a few records to verify it. maxItems is the per-read execution budget, not a sample '
    'count and not the total across repeated pages. Do not extract or copy the entire business dataset. '
    'Keep the returned readRef; done accepts only the readRefs supplying the result, never rewritten page values. '
    'For repetition prepare one representative transition: read the current collection, query its continuation '
    'links with find_elements (attributes=["href"], enough max_results for every match), then navigate to the '
    'single distinct observed href. Equivalent links may share that href. On the destination, call bat_read_fields '
    'with only readRef set to the first successful readRef; the host reuses its exact verified method. '
    'For same-page loading query one eligible continuation button or condition sentinel, click that unique button '
    'or use a fixed native scroll reaching the loading boundary, then reuse the readRef and observe newly loaded records. '
    'Runtime checks ONLY match count, never returned attributes: encode nonterminal state in the CSS selector so '
    'it is unique while continuing and empty at the end. Use the current browser click index for that unique button. '
    'Click targets must be enabled and visible, including ancestors. A scroll sentinel is a condition, not a click target: '
    'an observed end marker hidden until completion can be queried in its hidden nonterminal state; require it to exist '
    'and verify its semantics. Choose record selectors that exclude content still being populated or hidden. '
    'Repeat find_elements with exactly the same selector, attributes and max_results, including explicit nulls. '
    'If both reads and '
    'the transition succeed, finish preparation even when the second continuation query remains nonempty. '
    'Runtime repeats the method and stops when that complete continuation query is empty, subject to its budget. '
    'Do not seek the last page or traverse further pages just to prove an empty continuation query. '
    'For href navigation use the observed URL; DOM indexes from find_elements are not clickable element indexes. '
    'In done select only the first '
    'representative readRef for each output path, never several page reads for the same path. '
    'Do not traverse all pages merely to supply a final list. A sampled read proves only its current DOM scope; '
    'it is not proof that the complete business collection has been obtained. '
    'Before choosing an item from a dynamic collection, use find_elements to read the actual candidate set and '
    'attributes needed by the confirmed rule. Inspect other relevant controls or views before treating one local '
    'query as the full candidate set. Keep original ordinals for subsequent actions; never narrow the selector to '
    'the item identity seen only in this preparation. Apply the confirmed rule to observed candidates. '
    'Click the candidate selected by the confirmed rule; '
    'do not replace that selection action with navigation to its observed sample href. '
    'Use the browser click index, not the candidate ordinal, to perform that observed action. '
    'find_elements does not promise a clickable browser index. If the selected link has no current click index, '
    'use native wait, scroll or search_page to refresh or expose it, then use the index in the new browser state. '
    'A missing index in query output alone is not evidence that the task is impossible; do not end unsuccessfully '
    'solely for that reason. Never invent an index or bypass the confirmed navigation path. '
    'After navigation or an asynchronous action, inspect the resulting state before consuming it. '
    'Establish and observe any required final browser state; a default state or profile history is not an action proof. '
    'For active media playback, wait after the final start action for the existing host playback observation. '
    'For login, CAPTCHA, confirmation or access requiring a person, call bat_request_human and let the host '
    'wait for the user in this same tab. Provide a safe prompt and the exact authorized resumeUrl to return to. '
    'Never type credentials, solve CAPTCHA or bypass access restrictions. After resume, verify the required '
    'page state and continue the confirmed task to its actual result. New business ambiguity requires stopping. '
    'If browser security rejects navigation, do not retry through another host or scheme. '
    'End with explicit success, observed reason and readRefs. Execution-only tasks have no data reads in done: use []. '
    'Do not invent a second plan, graph, output schema or rules document.')

NATURAL_EXECUTION_AGENT_GUIDANCE = NATURAL_AGENT_GUIDANCE

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
                 exclude_extract=False, result_spec=None):
    # WHY：原生 Agent 继续拥有探索；唯一方法读取工具复用正式 ReadSpec，
    # done 只引用宿主记录，不让模型重抄业务值或另建一套执行图。
    excluded = ['evaluate', 'read_file', 'write_file', 'replace_file',
                'upload_file', 'download_file', 'screenshot',
                'search', 'find_text', 'switch', 'close', 'save_as_pdf']
    # WHY：原生search绕过入口来源绑定，find_text含滚动副作用，switch/close缺稳定tab身份，
    # PDF缺交付合同。导航/input+Enter、search_page/scroll仍保留，唯一新tab由共享适配器承接。
    # 缺合同的能力必须在模型选动作前明确不可用，不能执行之后才发现无法编译。
    if exclude_extract:
        # WHY：execution 没有业务数据输出，原生 extract 产生的是一次性模型判断，无法成为
        # 零模型复跑节点；动态列表读取必须走可证明的 find_elements/read-fields 合同。
        excluded.append('extract')
    tools = AuthorTools(output_model=output_model, exclude_actions=excluded,
                        output_schema=output_schema, result_spec=result_spec)
    tools._bat_target_scroll_records = None
    tools._bat_visible_wait_records = None
    tools._bat_field_read_records = (register_method_read_tool(tools, output_schema=output_schema)
                                    if output_schema and output_schema != {'type': 'null'} else None)
    tools._bat_summary_records = None
    return tools

def author_tools_for_result_spec(output_model, result_spec, *, selection_methods=False, human_intervention=True):
    """Build the one registry shared by live authoring and offline recompilation."""
    schema = result_spec.schemaValue if result_spec.mode == 'data' else {'type': 'null'}
    tools = author_tools(output_model, schema, exclude_extract=True, result_spec=result_spec)
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
