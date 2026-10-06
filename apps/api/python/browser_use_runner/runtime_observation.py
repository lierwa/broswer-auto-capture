"""A checkpoint observation over native live page state, without model calls."""
from datetime import datetime, timezone
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.target_preparation import current_document_id


async def observe_once(browser):
    page_before = await browser.get_current_page()
    url_before = await page_before.get_url() if page_before is not None else None
    state = await browser.get_browser_state_summary(include_screenshot=False)
    tab_id = browser.agent_focus_target_id
    if not tab_id or tab_id not in {tab.target_id for tab in state.tabs}:
        raise ValueError('hybrid_tab_identity_unavailable')
    tree = state.dom_state.llm_representation()
    page = await browser.get_current_page()
    live_url = await page.get_url() if page is not None else None
    # WHY：summary.title 来自异步 Target 缓存；导航后可仍为旧标题，不能让同一页面恢复误判漂移。
    title = await page.get_title() if page is not None else None
    document_id = await current_document_id(browser)
    page_after = await browser.get_current_page()
    url_after = await page_after.get_url() if page_after is not None else None
    if browser.agent_focus_target_id != tab_id:
        raise ValueError('hybrid_observation_identity_changed')
    if not live_url or live_url != url_before or url_after != live_url:
        raise ValueError('hybrid_observation_url_unstable')
    # 保持已有摘要合同；只在内存计算，页面原文、截图和 Profile 不进入日志或持久化。
    snapshot = {'url': live_url, 'title': title, 'documentDigest': digest(tree)}
    return {'sessionId': browser.id, 'tabId': str(tab_id), 'url': live_url, 'documentId': document_id,
        'observationDigest': digest(snapshot), 'observedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}
