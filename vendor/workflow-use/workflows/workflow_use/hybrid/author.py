"""Natural task entry over the native Agent and its public callbacks."""
import re
from copy import deepcopy
from tempfile import TemporaryDirectory
from typing import Callable, Literal
from uuid import uuid4

from browser_use import Agent
from jsonschema import Draft202012Validator
from pydantic import Field, JsonValue

from .__main__ import compilation_response
from .action_dispatch import ActionDispatchAudit, bind_tools_act
from .author_tools import AuthorTools
from .author_callbacks import AuthorCaptureCallbacks
from .capture import EvidenceCollector
from .dialog_event_bridge import DialogEventBridge
from .evidence import Contract, EvidenceRef, digest, gap
from .invokes import VerifiedChild
from .native_event_capture import NativeEventCapture
from .observation_scope import SourceObservationScope
from .registry import ActionRegistry
from .request import NaturalCompilationRequest, ResultSpec
from .selection_annotation import annotate_selections


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
    verifiedChildren: list[VerifiedChild] = Field(default_factory=list, max_length=100)


AUTHOR_URL_SHORTENING_LIMIT = 2048
VISIBLE_TEXT_EXTRACTION_GUIDANCE = (
    ' Return every string as literal browser-visible text: add no Markdown, YAML, bullets, numbering, backticks, '
    'or link/image syntax unless those characters are visibly present. Collapse every whitespace run to one space '
    'and concatenate inline element text without adding delimiters.')


class NavigationScopeViolation(RuntimeError):
    pass


async def author_step(browser, raw, models, output_model_for: Callable, diagnostic=None):
    request = AuthorInput.model_validate(raw)
    Draft202012Validator(request.inputSchema).validate(request.input)
    _validate_result_spec(request)
    output_model, unwrap = output_model_for(request.outputSchema, 'HybridAgentOutput')
    # WHY：执行能力缺口保留在 registry/coverage；不允许源码执行和文件操作绕开受控能力。
    collector = None
    tools = author_tools_for_result_spec(output_model, request.resultSpec)
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
    callbacks = AuthorCaptureCallbacks(collector, lambda: registry, diagnostic=diagnostic,
        normalize_action=normalize_author_action,
        action_outcomes={'find_elements': find_elements_outcome, 'bat_read_fields': field_read_outcome},
        reject_navigation_scope=_reject_navigation_scope_retry)
    observation_scope = SourceObservationScope(browser, collector, callbacks)
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
            observation_scope.start()
            # Agent finalizes its public registry during construction (including screenshot/output actions).
            registry = ActionRegistry.from_tools(tools)
            collector.registry = registry
            run_failed = False
            try:
                history = await agent.run(max_steps=request.maxSteps, on_step_end=callbacks.after_step)
            except Exception:
                # WHY：原生运行异常可能发生在回调之后；保留已采集来源事实但不保存异常正文，也不伪造成功。
                history = agent.history
                run_failed = True
            run_failed = run_failed or callbacks.failed
            completed, output, output_gaps = _business_result(
                history, run_failed, output_model, unwrap, request.outputSchema)
            source_success = completed and not output_gaps
            # WHY：动作参数和选定证据是复跑数据；只省略 raw history，不再按内容来源破坏执行原值。
            redaction = put('redaction-manifest', {'policy': 'execution-values-preserved/v1', 'rawHistorySaved': False})
            collector.redact_action = redactor(request, output)
            trace, gaps, output = collector.finish(
                history, history_ref='normalized-trace:' + str(uuid4()), final_output=output,
                redaction_manifest=redaction, source_completed=completed)
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
    # The normalized trace itself is persisted inside the v2 artifact; raw AgentHistory is never serialized.
    if source_success:
        trace, selection_gaps = await annotate_selections(request, trace, models['semantic_annotation'])
        gaps.extend(selection_gaps)
    compilation = natural_compilation_request(request, trace, registry)
    return {'output': output, 'request': _public_compilation_request(compilation),
            'response': compilation_response(compilation, registry, request.verifiedChildren, gaps,
                                             output_schema=request.outputSchema),
            'history': {'localRef': trace.source.historyRef, 'digest': trace.digest},
            'sourceSuccess': source_success,
            'browserCommands': sum(action.name not in ('done', 'bat_summarize') for action in trace.actions)}


def _public_compilation_request(compilation):
    # WHY：Pydantic 内部字段名不能进入跨语言事实源；canonical payload 与普通 request 必须同用公共别名。
    return compilation.model_dump(mode='json', by_alias=True)


def _business_result(history, run_failed, output_model, unwrap, output_schema):
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
            Draft202012Validator(output_schema).validate(output)
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


FIND_ELEMENTS_DEFAULT_ATTRIBUTES = ['data-testid', 'class', 'role', 'aria-label', 'title', 'href', 'datetime']


def normalize_author_action(action):
    """Fill Browser-Use's optional DOM attributes before capture and dispatch."""
    scroll = getattr(action, 'scroll', None)
    if scroll is not None and getattr(scroll, 'index', None) == 0:
        # WHY：原生 scroll 的 0 与 None 都指向 viewport，不能当成缺失 DOM 索引。
        scroll.index = None
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
    'Before choosing from a list whose membership or order can change, use native find_elements with visible text and '
    'a max_results bound large enough to cover the complete candidate list, including the attributes needed by the '
    'confirmed rule. The host retains original candidate ordinals and compiles filtering/ordering into a pure Function; '
    'CSS need not express the business rule. Apply the confirmed rule to current candidates and click the matching '
    'live element. Do not narrow a dynamic collection to today\'s item identity. Explicitly select the required item '
    'even when persisted browser state already appears correct. '
    'After navigation or an asynchronous action, inspect the resulting business state before using it. '
    'Before done, actively establish and inspect the required final browser state; never treat profile history, a default '
    'selection, or merely opening the destination page as completion. '
    'When the required final state is active media playback, wait after the final start or selection action so the host '
    'can verify that visible media is actually playing, then call done when no business action remains. Do not use native '
    'extract to guess playback state and do not repeat extract/wait polling; playback is a fixed host verification. '
    'If navigation is rejected by browser security policy, stop immediately; never retry with another host, '
    'scheme, search engine, or mobile site. '
    'Call done with explicit success and reason. Use success=false when the required action or final state was not '
    'established; returning null does not mean success. Do not invent a separate rules document.')

NATURAL_EXECUTION_AGENT_GUIDANCE = NATURAL_AGENT_GUIDANCE.replace(
    'Use native extract on every page that contributes business values, including conditional detail pages, before '
    'leaving that page or calling done; preserve exact source values allowed by the output schema. '
    'For string fields return complete visible text only, collapse whitespace runs to one space, and do not add '
    'Markdown syntax, non-visible media URLs, image URLs, or transient signed URLs absent from the visible text. ',
    'This execution-only task has no business data output and native extract is intentionally unavailable. Use '
    'find_elements for complete candidate collections, then continue with browser actions and host-verifiable final state. ')


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
                 exclude_extract=False):
    # WHY：探索模型只使用 Browser-Use 原生能力。投影、等待和输出装配由宿主回调形成，
    # 不再注册五个 B-A-T 工具让模型二次描述已经发生的浏览器事实。
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
    tools = AuthorTools(output_model=output_model, exclude_actions=excluded)
    tools._bat_target_scroll_records = None
    tools._bat_visible_wait_records = None
    tools._bat_field_read_records = None
    tools._bat_summary_records = None
    return tools


def author_tools_for_result_spec(output_model, result_spec):
    """Build the one registry shared by live authoring and offline recompilation."""
    return author_tools(output_model, exclude_extract=result_spec.mode == 'execution')


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
