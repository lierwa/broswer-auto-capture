"""One-shot native scrolling to a unique CSS target in the current main document."""
import json

from browser_use.agent.views import ActionResult
from browser_use.browser.session import BrowserSession
from pydantic import Field

from .dom_evidence import safe_url
from .evidence import Contract, digest
from .targets import SCROLL_INTO_VIEW_SCRIPT, TargetResolver


class TargetScrollParams(Contract):
    selector: str = Field(min_length=1, max_length=2000)


class TargetScrollResult(Contract):
    selector: str = Field(min_length=1, max_length=2000)
    targetId: str = Field(min_length=1)
    urlDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    visible: bool
    scrollInvoked: bool


class TargetScrollRecord(Contract):
    result: TargetScrollResult
    url: str = Field(min_length=1)


class TargetScrollRecords:
    def __init__(self):
        self.records: list[TargetScrollRecord] = []


class VerifiedTargetScroll(Contract):
    actionRef: str
    selector: str = Field(min_length=1, max_length=2000)
    targetId: str = Field(min_length=1)
    urlDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    visible: bool
    scrollInvoked: bool
    resultDigest: str = Field(pattern=r'^[a-f0-9]{64}$')


class TargetScrollEvidenceFailure(ValueError):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


TARGET_SCROLL_CONFIRMATION = 'Target is in view.'


TARGET_IN_VIEW_SCRIPT = """async () => {
  if (!this.isConnected) return {connected:false, visible:false, intersecting:false};
  const visible = this.checkVisibility({checkOpacity:true, checkVisibilityCSS:true});
  if (!visible) return {connected:true, visible:false, intersecting:false};
  return await new Promise((resolve) => {
    let observer;
    const finish = (intersecting) => {
      clearTimeout(timer);
      if (observer) observer.disconnect();
      const connected = this.isConnected;
      const currentVisible = connected && this.checkVisibility({checkOpacity:true, checkVisibilityCSS:true});
      resolve({connected, visible:currentVisible, intersecting:Boolean(currentVisible && intersecting)});
    };
    const timer = setTimeout(() => finish(false), 1000);
    observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      finish(Boolean(entry && entry.isIntersecting && entry.intersectionRatio > 0));
    });
    observer.observe(this);
  });
}"""


async def target_in_view(element):
    try:
        raw = await element.evaluate(TARGET_IN_VIEW_SCRIPT)
        value = json.loads(raw)
    except Exception as error:
        raise ValueError('target_visibility_unavailable') from error
    if (not isinstance(value, dict) or set(value) != {'connected', 'visible', 'intersecting'}
            or any(type(value[key]) is not bool for key in value)):
        raise ValueError('target_visibility_invalid')
    return value


async def read_target_in_view(element):
    state = await target_in_view(element)
    return 'true' if all(state.values()) else 'false'


def register_target_scroll_tool(tools):
    successful = TargetScrollRecords()

    @tools.action(
        'Scroll one unique CSS target in the current page into view without searching or model calls.',
        param_model=TargetScrollParams,
    )
    async def bat_scroll_to(params: TargetScrollParams, browser_session: BrowserSession) -> ActionResult:
        try:
            record = await scroll_to_target(browser_session, params)
        except ValueError as error:
            return ActionResult(error=_fixed_scroll_error(error))
        except Exception:
            return ActionResult(error='bat_scroll_to_failed')
        successful.records.append(record)
        return ActionResult(extracted_content=TARGET_SCROLL_CONFIRMATION)

    return successful


async def scroll_to_target(browser, params):
    resolver = TargetResolver(browser)
    target_id, url, scope = await _page_identity(browser, resolver)
    elements = await resolver.resolve_collection(params.selector, scope)
    if len(elements) != 1:
        raise ValueError('ambiguous_or_missing_scroll_target')
    element, backend_id = elements[0], await _backend_id(elements[0])
    before = await target_in_view(element)
    if not before['connected'] or not before['visible']:
        raise ValueError('scroll_target_hidden')
    invoked = not before['intersecting']
    if invoked:
        await element.evaluate(SCROLL_INTO_VIEW_SCRIPT)
    await resolver.assert_scope(scope, target_id)
    matches = await resolver.resolve_collection(params.selector, scope)
    if len(matches) != 1 or await _backend_id(matches[0]) != backend_id:
        raise ValueError('scroll_target_changed')
    after = await target_in_view(matches[0])
    if not all(after.values()):
        raise ValueError('scroll_target_not_in_view')
    await resolver.assert_scope(scope, target_id)
    result = TargetScrollResult(selector=params.selector, targetId=target_id,
                                urlDigest=digest(url), visible=True, scrollInvoked=invoked)
    return TargetScrollRecord(result=result, url=url)


async def _page_identity(browser, resolver):
    target_id = await resolver.assert_scope(None)
    focused = getattr(browser, 'agent_focus_target_id', target_id)
    if focused is not None and focused != target_id:
        raise ValueError('scroll_page_changed')
    page = await browser.get_current_page()
    url = await page.get_url() if page is not None else None
    safe = safe_url(url) if isinstance(url, str) else None
    if safe is None:
        raise ValueError('scroll_page_identity_unavailable')
    scope = {'url': safe, 'urlDigest': digest(url)}
    await resolver.assert_scope(scope, target_id)
    return target_id, url, scope


async def _backend_id(element):
    info = await element.get_basic_info()
    value = info.get('backendNodeId') if isinstance(info, dict) else getattr(info, 'backendNodeId', None)
    if type(value) is not int:
        raise ValueError('scroll_target_identity_unavailable')
    return value


_SCROLL_ERRORS = frozenset({
    'ambiguous_or_missing_scroll_target',
    'scroll_page_changed',
    'scroll_page_identity_unavailable',
    'scroll_target_changed',
    'scroll_target_hidden',
    'scroll_target_identity_unavailable',
    'scroll_target_not_in_view',
    'target_document_changed',
    'target_scope_mismatch',
    'target_visibility_invalid',
    'target_visibility_unavailable',
})


def _fixed_scroll_error(error):
    reason = str(error)
    return reason if reason in _SCROLL_ERRORS else 'bat_scroll_to_failed'


def verified_target_scroll(*, records, start, arguments, results, result_ref, action_ref, pre, post):
    if records is None or type(start) is not int or start < 0 or start > len(records.records):
        raise TargetScrollEvidenceFailure('target_scroll_record_owner_missing')
    appended = records.records[start:]
    if len(results) != 1:
        raise TargetScrollEvidenceFailure('target_scroll_result_count_invalid')
    result = results[0]
    if result.error:
        if appended:
            raise TargetScrollEvidenceFailure('target_scroll_failed_with_record')
        return None
    if len(appended) != 1 or result_ref is None:
        raise TargetScrollEvidenceFailure('target_scroll_success_evidence_missing')
    try:
        params = TargetScrollParams.model_validate(arguments)
    except Exception as error:
        raise TargetScrollEvidenceFailure('target_scroll_result_invalid') from error
    record, actual = appended[0], appended[0].result
    if (result.extracted_content != TARGET_SCROLL_CONFIRMATION or params.selector != actual.selector
            or digest(record.url) != actual.urlDigest):
        raise TargetScrollEvidenceFailure('target_scroll_result_mismatch')
    if pre is None or post is None:
        raise TargetScrollEvidenceFailure('target_scroll_observation_missing')
    if not actual.visible or pre.tabId != post.tabId or pre.tabId != actual.targetId:
        raise TargetScrollEvidenceFailure('target_scroll_page_identity_mismatch')
    for observation in (pre, post):
        matches = [fact for fact in observation.facts if fact.kind == 'url_digest']
        if len(matches) != 1 or matches[0].value != actual.urlDigest:
            raise TargetScrollEvidenceFailure('target_scroll_url_identity_mismatch')
    return VerifiedTargetScroll(actionRef=action_ref, **actual.model_dump(mode='json'),
                                resultDigest=result_ref.digest)
