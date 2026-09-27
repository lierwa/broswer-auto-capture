"""Typed fact adapter for the existing workflow-use StepVerifier; no wait/retry/model loop."""
import asyncio
from contextvars import ContextVar
from types import SimpleNamespace
from typing import Literal

from jsonschema import Draft202012Validator
from pydantic import Field, JsonValue, model_validator
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, stop_before_delay, wait_fixed

from workflow_use.workflow.step_verifier import StepVerifier, VerificationCheck, VerificationMethod, VerificationResult

from .evidence import Contract, digest
from .natural_effects import read_page_effect, read_target_state, read_target_value
from .natural_reads import deterministic_read_schema
from .read import ReadSpec, read_fields
from .rendered_field_text import FieldReadError
from .semantic import bounded_schema
from .target_scroll import read_target_in_view
from .target_preparation import current_document_id
from .targets import TargetResolver, materialize_target
from .visible_wait import read_visible_target


class SettlePolicy(Contract):
    maxMs: int = Field(ge=1, le=30000)
    maxAttempts: int = Field(ge=1, le=100)
    intervalMs: int = Field(ge=10, le=1000)


class ConsumerReadinessScope(Contract):
    url: str = Field(min_length=1)
    urlDigest: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')


class PostconditionNotMet(RuntimeError):
    pass


# WHY：StepVerifier 的详情可能含依赖异常或页面内容；产品运行只接收受管适配层的固定诊断码。
_CHECK_KINDS = frozenset({
    'url', 'url_digest', 'title', 'target_value', 'target_text', 'target_state',
    'target_in_view', 'target_visible', 'scroll_position', 'visible_overlays',
    'media_playback', 'read_fields',
})
_FIELD_READ_CODES = frozenset({
    'read_container_resolution_failed', 'read_collection_limit', 'read_single_object_required',
    'read_output_schema_mismatch', 'read_field_projection_failed', 'read_field_value_limit',
    'ambiguous_or_missing_read_field', 'read_field_not_text', 'read_text_affix_invalid',
    'read_boolean_invalid', 'read_number_not_finite', 'read_field_native_projection_failed',
})
_VALUE_READ_CODES = frozenset({'page_unavailable', 'target_scope_mismatch', 'read_input_limit'})
_CHECK_REASONS = _FIELD_READ_CODES | _VALUE_READ_CODES | frozenset({
    'baseline_missing', 'fact_mismatch', 'projection_not_ready', 'projection_not_stable', 'check_error',
})
_PAGE_FACT_KINDS = frozenset({'url', 'url_digest', 'title', 'scroll_position',
                              'visible_overlays', 'media_playback'})
_ATTEMPT_PAGE = ContextVar('bat_postcondition_attempt_page', default=None)


def _safe_check_error(error):
    code = error.args[0] if len(error.args) == 1 and isinstance(error.args[0], str) else None
    if isinstance(error, FieldReadError) and code in _FIELD_READ_CODES:
        return code
    if type(error) is ValueError and code in _VALUE_READ_CODES:
        return code
    return 'check_error'


class Postcondition(Contract):
    kind: Literal['url', 'url_digest', 'title', 'target_value', 'target_text', 'target_state',
                  'target_in_view', 'target_visible', 'scroll_position', 'visible_overlays',
                  'media_playback', 'read_fields']
    bindingArgument: str | None = None
    equals: JsonValue = None
    clauseRef: str | None = None
    read: ReadSpec | None = None
    scope: ConsumerReadinessScope | None = None
    settle: SettlePolicy | None = None
    changed: bool | None = None
    unchanged: bool | None = None
    ready: bool | None = None
    transition: bool | None = None
    consumerRef: str | None = None

    @model_validator(mode='after')
    def one_authority(self):
        for value, error in ((self.changed, 'changed_must_be_true'),
                             (self.unchanged, 'unchanged_must_be_true'),
                             (self.ready, 'ready_must_be_true'),
                             (self.transition, 'transition_must_be_true')):
            if value is not None and value is not True:
                raise ValueError(error)
        if sum([self.bindingArgument is not None, self.equals is not None, self.changed is True,
                self.unchanged is True,
                self.ready is True, self.transition is True]) != 1:
            raise ValueError('one_postcondition_authority_required')
        if (self.kind == 'read_fields') != (self.read is not None):
            raise ValueError('postcondition_read_specification_required')
        if self.read is not None:
            budget_bounded = (self.read.maxInputBytes is not None
                              and self.read.maxInputBytes <= 128000
                              and deterministic_read_schema(self.read.outputSchema))
            # WHY：ResultSpec 的业务原文不应被迫声明 maxLength；DOM 读取已有字段/记录上限时，
            # ConsumerReadiness 复用 ReadSpec 的字节预算即可保证轮询有界。
            if self.bindingArgument is not None or not (
                    bounded_schema(self.read.outputSchema) or budget_bounded):
                raise ValueError('bounded_postcondition_read_required')
            if (self.ready is True or self.transition is True) and (
                    self.consumerRef is None or self.settle is None):
                raise ValueError('consumer_readiness_owner_and_settle_required')
            Draft202012Validator.check_schema(self.read.outputSchema)
            if self.changed is None and self.unchanged is None and self.ready is None and self.transition is None:
                Draft202012Validator(self.read.outputSchema).validate(self.equals)
        elif self.ready is not None or self.transition is not None or self.scope is not None or self.consumerRef is not None:
            raise ValueError('consumer_readiness_requires_read_projection')
        elif self.equals is not None and not isinstance(self.equals, str):
            raise ValueError('postcondition_text_required')
        return self


def declared_checks(raw: list[dict], args: dict, target: dict | None, allow_unresolved_target=False):
    if not raw:
        raise ValueError('postconditions_required')
    settle_policy(raw)
    target_checks = any(isinstance(item, dict) and str(item.get('kind', '')).startswith('target_') for item in raw)
    resolved_target = materialize_target(target, dict(args), allow_unresolved=allow_unresolved_target) \
        if target_checks else target
    conditions = [Postcondition.model_validate(item) for item in raw]
    checks = []
    for condition in conditions:
        expected = args.get(condition.bindingArgument) if condition.bindingArgument is not None else condition.equals
        if (condition.changed is None and condition.unchanged is None
                and condition.ready is None and condition.transition is None
                and condition.kind != 'read_fields' and not isinstance(expected, str)):
            raise ValueError('postcondition_value_required')
        if condition.kind.startswith('target_'):
            if resolved_target.get('strategy') == 'title':
                raise ValueError('postcondition_locator_required')
        checks.append(VerificationCheck(name=condition.kind, method=VerificationMethod.DETERMINISTIC,
                      check_function='check_declared_fact', description='Declared bounded page fact',
                      parameters={'kind': condition.kind, 'expected': expected, 'target': resolved_target,
                                  **({'changed': True, 'baselineCaptured': False} if condition.changed else {}),
                                  **({'unchanged': True, 'baselineCaptured': False}
                                     if condition.unchanged else {}),
                                  **({'transition': True, 'baselineCaptured': False}
                                     if condition.transition else {}),
                                  **({'ready': True} if condition.ready else {}),
                                  **({'read': condition.read.model_dump()} if condition.read else {}),
                                  **({'scope': _runtime_read_scope(condition, conditions, args)}
                                     if condition.scope else {}),
                                  **({'consumerRef': condition.consumerRef} if condition.consumerRef else {})}))
    return checks


def _runtime_read_scope(condition, conditions, args):
    scope = condition.scope.model_dump(exclude_none=True)
    if condition.kind != 'read_fields':
        return scope
    dynamic_urls = [args.get(item.bindingArgument) for item in conditions
                    if item.kind == 'url' and item.bindingArgument is not None]
    dynamic_urls = [value for value in dynamic_urls if isinstance(value, str) and value]
    if len(dynamic_urls) != 1:
        return scope
    # WHY：ConsumerReadiness 属于本次 producer；producer 的 URL 来自运行时输入时，
    # E1 样本 URL 只证明读取配方，不能继续充当复跑页面作用域。
    return {'url': dynamic_urls[0], 'urlDigest': digest(dynamic_urls[0])}


def action_result_readiness(action_name, raw):
    """Select an existing transition consumer; never create or erase a postcondition."""
    if action_name not in {'click', 'send_keys'}:
        return None
    conditions = [Postcondition.model_validate(item) for item in raw]
    urls = [item for item in conditions if item.kind in {'url', 'url_digest'}]
    if (not any(item.changed is True for item in urls)
            or any(item.equals is not None or item.bindingArgument is not None for item in urls)):
        return None
    candidates = [index for index, item in enumerate(conditions)
                  if item.kind == 'read_fields' and item.transition is True]
    if len(candidates) != 1:
        return None
    candidate = conditions[candidates[0]]
    complete = (candidate.read is not None and candidate.scope is not None and candidate.settle is not None
                and isinstance(candidate.consumerRef, str) and bool(candidate.consumerRef))
    # WHY：实际动作结果只参数化唯一消费者的读取作用域；固定 URL 条件仍是独立授权与验证。
    return candidates[0] if complete else None


async def capture_check_baselines(browser, checks):
    for check in checks:
        if (check.parameters.get('changed') is True or check.parameters.get('unchanged') is True
                or check.parameters.get('transition') is True):
            # WHY：只读取本次执行的明确字段；读取失败必须先于副作用，不用探索样本冒充当前前态。
            try:
                check.parameters['expected'] = await read_check_value(check.parameters, browser)
            except Exception as error:
                if check.parameters.get('transition') is not True or not transition_baseline_unavailable(error):
                    raise
                # WHY：消费者可能由本次动作创建。缺失基线允许“不可读 -> 稳定可读”，歧义和错误选择器仍立即失败。
                check.parameters['baselineUnavailable'] = True
            check.parameters['baselineCaptured'] = True


def settle_policy(raw):
    policies = [Postcondition.model_validate(item).settle for item in raw]
    if any(policy != policies[0] for policy in policies):
        raise ValueError('one_completion_settle_policy_required')
    return policies[0] if policies else None


async def verify_declared(browser, checks, policy=None):
    if policy is None:
        return await verify_once(browser, checks)
    # WHY：成熟库只重查事实；Tools.act 已在外层执行一次，取消和时限不被重试吞掉。
    async with asyncio.timeout(policy.maxMs / 1000):
        await AsyncRetrying(stop=stop_after_attempt(policy.maxAttempts) | stop_before_delay(policy.maxMs / 1000),
                           wait=wait_fixed(policy.intervalMs / 1000), retry=retry_if_exception_type(PostconditionNotMet),
                           reraise=True)(verify_once, browser, checks)


async def verify_once(browser, checks):
    for check in checks:
        check.parameters.pop('_batFailureReason', None)
    # WHY：同轮多个页面事实必须来自同一 Page；身份漂移只重读有界事实，不重派动作。
    page_checks = sum(check.parameters.get('kind') in _PAGE_FACT_KINDS for check in checks)
    pinned = page_checks > 1 or any(check.parameters.get('kind') == 'read_fields' for check in checks)
    try:
        identity = await _page_attempt_identity(browser) if pinned else None
        if identity is not None:
            _bind_attempt_reads(checks, identity)
    except PostconditionNotMet:
        _reset_read_stability(checks)
        raise
    token = _ATTEMPT_PAGE.set(identity[0]) if identity is not None else None
    try:
        step = SimpleNamespace(type='hybrid_declared', verification_checks=checks)
        outcome = await StepVerifier(llm=None).verify_step(step, browser)
        if identity is not None:
            await _assert_page_attempt_identity(browser, identity)
    except BaseException:
        _reset_read_stability(checks)
        raise
    finally:
        if token is not None:
            _ATTEMPT_PAGE.reset(token)
        for check in checks:
            check.parameters.pop('_runtimeReadScope', None)
    if outcome.result != VerificationResult.SUCCESS or outcome.checks_failed:
        failed = set(outcome.checks_failed)
        for check in checks:
            reason = check.parameters.get('_batFailureReason')
            if check.name in failed and check.name in _CHECK_KINDS and reason in _CHECK_REASONS:
                raise PostconditionNotMet(f'ordinary_postcondition_failed_{check.name}_{reason}')
        for name in outcome.checks_failed:
            if name in _CHECK_KINDS:
                raise PostconditionNotMet(f'ordinary_postcondition_failed_{name}_check_error')
        raise PostconditionNotMet('ordinary_postcondition_failed')


async def _page_attempt_identity(browser):
    try:
        page = await browser.get_current_page()
        info = await page.get_target_info() if page is not None else None
        target_id = info.get('targetId') if isinstance(info, dict) else None
        url = await page.get_url() if page is not None else None
        if (not isinstance(target_id, str) or not target_id or not isinstance(url, str) or not url
                or getattr(browser, 'agent_focus_target_id', None) != target_id):
            raise ValueError('page_identity_unavailable')
        document_id = await current_document_id(browser, page=page)
        await TargetResolver(browser).assert_scope({'url': url}, target_id)
        if getattr(browser, 'agent_focus_target_id', None) != target_id:
            raise ValueError('target_document_changed')
        return page, target_id, url, document_id, getattr(browser, 'id', None)
    except Exception as error:
        raise PostconditionNotMet('ordinary_postcondition_page_identity_changed') from error


async def _assert_page_attempt_identity(browser, identity):
    page, target_id, url, document_id, session_id = identity
    try:
        if (getattr(browser, 'agent_focus_target_id', None) != target_id
                or getattr(browser, 'id', None) != session_id):
            raise ValueError('target_document_changed')
        await TargetResolver(browser).assert_scope({'url': url}, target_id)
        if (await current_document_id(browser, page=page) != document_id
                or await page.get_url() != url
                or getattr(browser, 'agent_focus_target_id', None) != target_id
                or getattr(browser, 'id', None) != session_id):
            raise ValueError('target_document_changed')
    except Exception as error:
        raise PostconditionNotMet('ordinary_postcondition_page_identity_changed') from error


def _bind_attempt_reads(checks, identity):
    _, target_id, url, document_id, session_id = identity
    key = (session_id, target_id, document_id, url)
    for check in checks:
        parameters = check.parameters
        if parameters.get('kind') != 'read_fields':
            continue
        if parameters.get('_stablePageIdentity') != key:
            parameters.pop('stableDigest', None)
            parameters['_stablePageIdentity'] = key
        owner = parameters.get('_actionResultOwner')
        if owner is not None:
            if owner != {'sessionId': session_id, 'targetId': target_id}:
                raise PostconditionNotMet('ordinary_postcondition_action_page_changed')
            parameters['_runtimeReadScope'] = {'url': url, 'urlDigest': digest(url)}


def _reset_read_stability(checks):
    for check in checks:
        check.parameters.pop('stableDigest', None)
        check.parameters.pop('_stablePageIdentity', None)
        check.parameters.pop('_runtimeReadScope', None)


async def check_fact(parameters, browser):
    parameters.pop('_batFailureReason', None)
    if ((parameters.get('changed') is True or parameters.get('unchanged') is True
             or parameters.get('transition') is True)
            and parameters.get('baselineCaptured') is not True):
        parameters['_batFailureReason'] = 'baseline_missing'
        return False, 'declared_baseline_missing'
    try:
        actual = await read_check_value(parameters, browser)
    except Exception as error:
        parameters.pop('stableDigest', None)
        parameters['_batFailureReason'] = _safe_check_error(error)
        if not readiness_projection_unavailable(parameters, error):
            # WHY：上游 StepVerifier 会记录捕获的异常文本；不能把页面或依赖消息交给它写日志。
            raise RuntimeError('ordinary_check_unavailable') from error
        # WHY：ConsumerReadiness 观察的是动作后的最终业务投影。页面仍显示旧值、
        # 容器尚未出现或投影暂时不满足合同都表示“尚未就绪”，应由有界 settle
        # 重读事实；动作本身仍只派发一次，正式消费者读取也不会被这里替代。
        parameters.pop('stableDigest', None)
        return False, 'declared_projection_not_ready'
    if parameters.get('ready') is True:
        passed = True
    elif parameters.get('transition') is True:
        passed = parameters.get('baselineUnavailable') is True or actual != parameters['expected']
    elif parameters.get('unchanged') is True:
        passed = actual == parameters['expected']
    else:
        passed = actual != parameters['expected'] if parameters.get('changed') is True else actual == parameters['expected']
    if parameters['kind'] == 'read_fields' and (
            parameters.get('ready') is True or parameters.get('transition') is True):
        if not passed:
            parameters.pop('stableDigest', None)
            parameters['_batFailureReason'] = 'projection_not_ready'
            return False, 'declared_projection_not_ready'
        current = digest(actual)
        if parameters.get('stableDigest') != current:
            parameters['stableDigest'] = current
            parameters['_batFailureReason'] = 'projection_not_stable'
            return False, 'declared_projection_not_stable'
    if not passed:
        parameters['_batFailureReason'] = 'fact_mismatch'
    return passed, 'declared_fact_checked'


def readiness_projection_unavailable(parameters, error):
    if parameters.get('kind') != 'read_fields' or not (
            parameters.get('ready') is True or parameters.get('transition') is True):
        return False
    if isinstance(error, FieldReadError):
        return True
    return str(error) in {'page_unavailable', 'read_single_object_required', 'target_scope_mismatch'}


async def read_check_value(parameters, browser):
    return await read_fields(browser, ReadSpec.model_validate(parameters['read']),
                             scope=parameters.get('_runtimeReadScope', parameters.get('scope')),
                             page=_ATTEMPT_PAGE.get()) if parameters['kind'] == 'read_fields' else (
           await read_fact(parameters['kind'], parameters['target'], browser,
                           parameters.get('_retainedElement')))


def transition_baseline_unavailable(error):
    if isinstance(error, FieldReadError):
        return error.match_count == 0 or error.reason in {
            'container_not_resolved', 'no_visible_native_text', 'projected_output_invalid',
            'selected_value_not_text', 'text_prefix_mismatch', 'text_suffix_mismatch',
        }
    return str(error) in {'page_unavailable', 'read_single_object_required', 'target_scope_mismatch'}


async def read_fact(kind, target, browser, retained_element=None):
    if kind.startswith('target_'):
        if kind == 'target_visible':
            return await read_visible_target(browser, target)
        # WHY：动作后核验读取本次实际派发的同一元素；若它已脱离文档，原生读取会失败。
        # 后续动作不会复用该元素，仍须重新解析并通过遮挡/命中检查。
        element = retained_element or await TargetResolver(browser).resolve_element(target)
        if kind == 'target_state':
            return await read_target_state(element)
        if kind == 'target_value':
            return await read_target_value(element)
        if kind == 'target_in_view':
            return await read_target_in_view(element)
        # Fixed property reads use the public Element API; no task-provided script is executed.
        return await element.evaluate('() => this.textContent')
    page = _ATTEMPT_PAGE.get()
    if page is None:
        page = await browser.get_current_page()
    if page is None:
        raise ValueError('page_unavailable')
    if kind in ('scroll_position', 'visible_overlays', 'media_playback'):
        return await read_page_effect(kind, page)
    if kind in ('url', 'url_digest'):
        actual = await page.get_url()
        if kind == 'url_digest':
            actual = digest(actual)
    else:
        actual = await page.get_title()
    return actual
