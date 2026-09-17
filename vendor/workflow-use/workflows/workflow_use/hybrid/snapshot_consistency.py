"""Bounded URL/tab consistency checks, not DOM readiness or action completion."""
import asyncio
from dataclasses import dataclass

from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, stop_before_delay, wait_fixed

from .evidence import digest


class ObservationUrlChanged(ValueError):
    def __init__(self):
        super().__init__('observation_url_changed')


class ObservationStateTransitionPending(ValueError):
    def __init__(self):
        super().__init__('observation_state_transition_pending')


@dataclass(frozen=True)
class _RetryPolicy:
    timeout_seconds: float = 30
    max_attempts: int = 100
    interval_seconds: float = 0.3


async def capture_consistent_post_snapshot(browser, facts_before_live, facts_after_live, live_facts, observe,
                                           *, closed_target_id=None, _policy=None):
    """Re-read on URL sampling mismatch; this does not prove rendering or business completion."""
    policy = _policy or _RetryPolicy()
    stable_tab_id = browser.agent_focus_target_id

    async def attempt():
        expected_tab_id = await _post_action_tab_id(browser, stable_tab_id, closed_target_id)
        summary = await browser.get_browser_state_summary(cached=False)
        await _require_live_snapshot(browser, summary, expected_tab_id)
        if closed_target_id in {str(tab.target_id) for tab in summary.tabs}:
            raise ObservationStateTransitionPending()
        current_facts = await live_facts(summary)
        return await observe(summary, [*facts_before_live, *current_facts, *facts_after_live],
                             expected_tab_id=expected_tab_id)

    # WHY: upstream snapshots read URL before awaiting DOM construction; retry the read, never the action.
    async with asyncio.timeout(policy.timeout_seconds):
        return await AsyncRetrying(
            stop=stop_after_attempt(policy.max_attempts) | stop_before_delay(policy.timeout_seconds),
            wait=wait_fixed(policy.interval_seconds), retry=retry_if_exception_type(
                (ObservationUrlChanged, ObservationStateTransitionPending)),
            reraise=True,
        )(attempt)


async def _post_action_tab_id(browser, stable_tab_id, closed_target_id):
    if closed_target_id is None:
        return stable_tab_id
    tabs = await browser.get_tabs()
    available = {str(tab.target_id) for tab in tabs}
    if closed_target_id in available:
        raise ObservationStateTransitionPending()
    try:
        await browser.get_or_create_cdp_session(target_id=None, focus=False)
    except (TimeoutError, ValueError):
        raise ObservationStateTransitionPending() from None
    focus = browser.agent_focus_target_id
    if not focus or str(focus) == closed_target_id or str(focus) not in available:
        raise ObservationStateTransitionPending()
    return focus


def resolve_closed_target_id(summary, raw_action):
    if not isinstance(raw_action, dict) or set(raw_action) != {'close'}:
        return None
    arguments = raw_action['close']
    suffix = arguments.get('tab_id') if isinstance(arguments, dict) else None
    if not isinstance(suffix, str) or not suffix:
        raise ValueError('close_target_identity_unavailable')
    matches = [str(tab.target_id) for tab in summary.tabs if str(tab.target_id).endswith(suffix)]
    if len(matches) != 1:
        raise ValueError('close_target_identity_unavailable')
    return matches[0]


async def _require_live_snapshot(browser, summary, expected_tab_id):
    if browser.agent_focus_target_id != expected_tab_id:
        raise ValueError('observation_tab_changed')
    if not expected_tab_id or expected_tab_id not in {tab.target_id for tab in summary.tabs}:
        raise ValueError('observation_tab_identity_unavailable')
    page = await browser.get_current_page()
    if page is None:
        raise ValueError('page_unavailable')
    live_url = await page.get_url()
    if browser.agent_focus_target_id != expected_tab_id:
        raise ValueError('observation_tab_changed')
    if not isinstance(summary.url, str) or digest(summary.url) != digest(live_url):
        raise ObservationUrlChanged()
