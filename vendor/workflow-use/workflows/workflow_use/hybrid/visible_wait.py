"""Bounded visible-condition wait shared by exploration and deterministic replay.

Product Alignment:
- natural-language task: continue after a page result, form state, or overlay control is ready.
- reusable chain boundary: wait for one unique visible CSS target without repeating an action.
- runtime inputs: one technical CSS selector.
- dynamic task outputs: the current-run ready fact.
- generic platform capability used: browser-use Page/Element reads and StepVerifier/Tenacity.
- replay model calls: 0.
- site/task-specific code added: no.
"""
import json
from typing import Literal

from browser_use.agent.views import ActionResult
from browser_use.browser.session import BrowserSession
from pydantic import Field

from .dom_evidence import safe_url
from .evidence import Contract, digest
from .targets import TargetResolver, validate_target

VISIBLE_WAIT_CONFIRMATION = 'Condition is ready.'
DEFAULT_VISIBLE_WAIT_POLICY = {'maxMs': 30000, 'maxAttempts': 100, 'intervalMs': 300}
TARGET_VISIBLE_SCRIPT = """() => ({
  connected: Boolean(this.isConnected),
  visible: Boolean(this.isConnected && this.checkVisibility({checkOpacity:true, checkVisibilityCSS:true}))
})"""


class VisibleWaitParams(Contract):
    selector: str = Field(min_length=1, max_length=2000)


class VisibleWaitPageIdentity(Contract):
    targetId: str = Field(min_length=1)
    url: str = Field(min_length=1)


class VisibleWaitRecord(Contract):
    params: VisibleWaitParams
    pageIdentity: VisibleWaitPageIdentity
    result: Literal['ready'] = 'ready'


class VerifiedVisibleWait(Contract):
    actionRef: str = Field(pattern=r'^a-\d{4,}$')
    selector: str = Field(min_length=1, max_length=2000)
    targetId: str = Field(min_length=1)
    urlDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    ready: bool
    resultDigest: str = Field(pattern=r'^[a-f0-9]{64}$')


class VisibleWaitEvidenceFailure(ValueError):
    pass


class VisibleWaitRecords:
    def __init__(self):
        self.records: list[VisibleWaitRecord] = []


class _PinnedBrowser:
    """Keep every verifier read on the page observed when waiting began."""

    def __init__(self, browser, identity):
        self._browser = browser
        self._identity = identity

    def __getattr__(self, name):
        return getattr(self._browser, name)

    async def get_current_page(self):
        page = await self._browser.get_current_page()
        if page is None or not hasattr(page, 'get_target_info'):
            raise ValueError('visible_wait_page_identity_unavailable')
        info = await page.get_target_info()
        url = await page.get_url()
        if (not isinstance(info, dict) or info.get('targetId') != self._identity.targetId
                or url != self._identity.url):
            raise ValueError('visible_wait_page_changed')
        return page


async def read_target_visible(element):
    """Return the declared fact string for fixed connected/visibility reads."""
    try:
        value = json.loads(await element.evaluate(TARGET_VISIBLE_SCRIPT))
    except Exception as error:
        raise ValueError('target_visibility_unavailable') from error
    if (not isinstance(value, dict) or set(value) != {'connected', 'visible'}
            or any(type(value[key]) is not bool for key in value)):
        raise ValueError('target_visibility_invalid')
    return 'true' if value['connected'] and value['visible'] else 'false'


async def read_visible_target(browser, raw_target):
    """Resolve zero/one/many CSS matches without treating absence as an error."""
    target = validate_target(raw_target)
    if target['strategy'] != 'css':
        raise ValueError('visible_wait_css_target_required')
    elements = await TargetResolver(browser).resolve_collection(target['value'], target.get('scope'))
    if not elements:
        return 'false'
    if len(elements) != 1:
        raise ValueError('ambiguous_visible_wait_target')
    return await read_target_visible(elements[0])


def register_visible_wait_tool(tools, *, settle_policy=None):
    """Register one selector-only read action; policy injection is internal/probe-only."""
    successful = VisibleWaitRecords()

    @tools.action(
        'Wait for one unique visible CSS target without repeating a browser action or calling a model.',
        param_model=VisibleWaitParams,
    )
    async def bat_wait_for(params: VisibleWaitParams, browser_session: BrowserSession) -> ActionResult:
        try:
            record = await wait_for_visible(browser_session, params, settle_policy=settle_policy)
        except TimeoutError:
            return ActionResult(error='bat_wait_for_timeout')
        except RuntimeError as error:
            code = 'bat_wait_for_timeout' if str(error) == 'ordinary_postcondition_failed' else 'bat_wait_for_failed'
            return ActionResult(error=code)
        except ValueError as error:
            return ActionResult(error=_fixed_wait_error(error))
        except Exception:
            return ActionResult(error='bat_wait_for_failed')
        successful.records.append(record)
        return ActionResult(extracted_content=VISIBLE_WAIT_CONFIRMATION)

    return successful


async def wait_for_visible(browser, params, *, settle_policy=None):
    # Local import prevents a cycle when postconditions delegates target_visible reads here.
    from .postconditions import SettlePolicy, declared_checks, verify_declared
    from .postconditions import settle_policy as declared_policy

    params = VisibleWaitParams.model_validate(params)
    policy = SettlePolicy.model_validate(settle_policy or DEFAULT_VISIBLE_WAIT_POLICY)
    identity, scope = await _page_identity(browser)
    pinned = _PinnedBrowser(browser, identity)
    target = {'strategy': 'css', 'value': params.selector, 'scope': scope}
    # Missing/hidden is retryable, but an already ambiguous target is a contract failure.
    await read_visible_target(pinned, target)
    raw = [{'kind': 'target_visible', 'equals': 'true', 'settle': policy.model_dump()}]
    checks = declared_checks(raw, {}, target)
    await verify_declared(pinned, checks, declared_policy(raw))
    await TargetResolver(pinned).assert_scope(scope, identity.targetId)
    return VisibleWaitRecord(params=params, pageIdentity=identity)


async def _page_identity(browser):
    resolver = TargetResolver(browser)
    target_id = await resolver.assert_scope(None)
    focused = getattr(browser, 'agent_focus_target_id', target_id)
    if focused is not None and focused != target_id:
        raise ValueError('visible_wait_page_changed')
    page = await browser.get_current_page()
    url = await page.get_url() if page is not None else None
    safe = safe_url(url) if isinstance(url, str) else None
    if safe is None:
        raise ValueError('visible_wait_page_identity_unavailable')
    identity = VisibleWaitPageIdentity(targetId=target_id, url=url)
    scope = {'url': safe, 'urlDigest': digest(url)}
    await resolver.assert_scope(scope, target_id)
    return identity, scope


_WAIT_ERRORS = frozenset({
    'ambiguous_visible_wait_target',
    'target_scope_mismatch',
    'target_visibility_invalid',
    'target_visibility_unavailable',
    'visible_wait_css_target_required',
    'visible_wait_page_changed',
    'visible_wait_page_identity_unavailable',
})


def _fixed_wait_error(error):
    reason = str(error)
    return reason if reason in _WAIT_ERRORS else 'bat_wait_for_failed'


def verified_visible_wait(*, records, start, arguments, results, result_ref, action_ref, pre, post):
    if records is None or type(start) is not int or start < 0 or start > len(records.records):
        raise VisibleWaitEvidenceFailure('visible_wait_record_owner_missing')
    appended = records.records[start:]
    if len(results) != 1:
        raise VisibleWaitEvidenceFailure('visible_wait_result_count_invalid')
    result = results[0]
    if result.error:
        if appended:
            raise VisibleWaitEvidenceFailure('visible_wait_failed_with_record')
        return None
    if len(appended) != 1 or result_ref is None:
        raise VisibleWaitEvidenceFailure('visible_wait_success_evidence_missing')
    try:
        params = VisibleWaitParams.model_validate(arguments)
    except Exception as error:
        raise VisibleWaitEvidenceFailure('visible_wait_result_invalid') from error
    record = appended[0]
    if (record.params != params or record.result != 'ready'
            or result.extracted_content != VISIBLE_WAIT_CONFIRMATION):
        raise VisibleWaitEvidenceFailure('visible_wait_result_mismatch')
    if pre is None or post is None or record.pageIdentity.targetId != pre.tabId or pre.tabId != post.tabId:
        raise VisibleWaitEvidenceFailure('visible_wait_page_identity_mismatch')
    url_digest = digest(record.pageIdentity.url)
    for observation in (pre, post):
        matches = [fact for fact in observation.facts if fact.kind == 'url_digest']
        if len(matches) != 1 or matches[0].value != url_digest:
            raise VisibleWaitEvidenceFailure('visible_wait_url_identity_mismatch')
    return VerifiedVisibleWait(actionRef=action_ref, selector=params.selector,
        targetId=record.pageIdentity.targetId, urlDigest=url_digest, ready=True,
        resultDigest=result_ref.digest)
