"""Typed fact adapter for the existing workflow-use StepVerifier; no wait/retry/model loop."""
import asyncio
from types import SimpleNamespace
from typing import Literal

from jsonschema import Draft202012Validator
from pydantic import Field, JsonValue, model_validator
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, stop_before_delay, wait_fixed

from workflow_use.workflow.step_verifier import StepVerifier, VerificationCheck, VerificationMethod, VerificationResult

from .evidence import Contract, digest
from .natural_effects import read_page_effect, read_target_state, read_target_value
from .read import ReadSpec, read_fields
from .semantic import bounded_schema
from .target_scroll import read_target_in_view
from .targets import TargetResolver, materialize_target
from .visible_wait import read_visible_target


class SettlePolicy(Contract):
    maxMs: int = Field(ge=1, le=30000)
    maxAttempts: int = Field(ge=1, le=100)
    intervalMs: int = Field(ge=10, le=1000)


class PostconditionNotMet(RuntimeError):
    pass


class Postcondition(Contract):
    kind: Literal['url', 'url_digest', 'title', 'target_value', 'target_text', 'target_state',
                  'target_in_view', 'target_visible', 'scroll_position', 'visible_overlays', 'read_fields']
    bindingArgument: str | None = None
    equals: JsonValue = None
    clauseRef: str | None = None
    read: ReadSpec | None = None
    settle: SettlePolicy | None = None
    changed: bool | None = None

    @model_validator(mode='after')
    def one_authority(self):
        if self.changed is not None and self.changed is not True:
            raise ValueError('changed_must_be_true')
        if sum([self.bindingArgument is not None, self.equals is not None, self.changed is True]) != 1:
            raise ValueError('one_postcondition_authority_required')
        if (self.kind == 'read_fields') != (self.read is not None):
            raise ValueError('postcondition_read_specification_required')
        if self.read is not None:
            if self.bindingArgument is not None or not bounded_schema(self.read.outputSchema):
                raise ValueError('bounded_postcondition_read_required')
            Draft202012Validator.check_schema(self.read.outputSchema)
            if self.changed is None:
                Draft202012Validator(self.read.outputSchema).validate(self.equals)
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
    checks = []
    for item in raw:
        condition = Postcondition.model_validate(item)
        expected = args.get(condition.bindingArgument) if condition.bindingArgument is not None else condition.equals
        if condition.changed is None and condition.kind != 'read_fields' and not isinstance(expected, str):
            raise ValueError('postcondition_value_required')
        if condition.kind.startswith('target_'):
            if resolved_target.get('strategy') == 'title':
                raise ValueError('postcondition_locator_required')
        checks.append(VerificationCheck(name=condition.kind, method=VerificationMethod.DETERMINISTIC,
                      check_function='check_declared_fact', description='Declared bounded page fact',
                      parameters={'kind': condition.kind, 'expected': expected, 'target': resolved_target,
                                  **({'changed': True, 'baselineCaptured': False} if condition.changed else {}),
                                  **({'read': condition.read.model_dump()} if condition.read else {})}))
    return checks


async def capture_check_baselines(browser, checks):
    for check in checks:
        if check.parameters.get('changed') is True:
            # WHY：只读取本次执行的明确字段；读取失败必须先于副作用，不用探索样本冒充当前前态。
            check.parameters['expected'] = await read_check_value(check.parameters, browser)
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
    step = SimpleNamespace(type='hybrid_declared', verification_checks=checks)
    outcome = await StepVerifier(llm=None).verify_step(step, browser)
    if outcome.result != VerificationResult.SUCCESS or outcome.checks_failed:
        raise PostconditionNotMet('ordinary_postcondition_failed')


async def check_fact(parameters, browser):
    if parameters.get('changed') is True and parameters.get('baselineCaptured') is not True:
        return False, 'declared_baseline_missing'
    actual = await read_check_value(parameters, browser)
    passed = actual != parameters['expected'] if parameters.get('changed') is True else actual == parameters['expected']
    return passed, 'declared_fact_checked'


async def read_check_value(parameters, browser):
    return await read_fields(browser, ReadSpec.model_validate(parameters['read'])) if parameters['kind'] == 'read_fields' else (
           await read_fact(parameters['kind'], parameters['target'], browser))


async def read_fact(kind, target, browser):
    if kind.startswith('target_'):
        if kind == 'target_visible':
            return await read_visible_target(browser, target)
        element = await TargetResolver(browser).resolve_element(target)
        if kind == 'target_state':
            return await read_target_state(element)
        if kind == 'target_value':
            return await read_target_value(element)
        if kind == 'target_in_view':
            return await read_target_in_view(element)
        # Fixed property reads use the public Element API; no task-provided script is executed.
        return await element.evaluate('() => this.textContent')
    page = await browser.get_current_page()
    if page is None:
        raise ValueError('page_unavailable')
    if kind in ('scroll_position', 'visible_overlays'):
        return await read_page_effect(kind, page)
    if kind in ('url', 'url_digest'):
        actual = await page.get_url()
        if kind == 'url_digest':
            actual = digest(actual)
    else:
        actual = await page.get_title()
    return actual
