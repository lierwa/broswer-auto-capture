"""Map selected related regions to one native DOM ancestor on the owned page."""
import json
from .observation_scope import live_document_sample
from .page_content import assert_content_document

COMMON_REGION = '''(selector) => { const regions = Array.from(document.querySelectorAll(selector));
  if (!regions.length) return null;
  let root = regions[0];
  while (root && !regions.every(node => root.contains(node))) root = root.parentElement;
  return root; }'''


async def resolve_read_regions(browser, specification, resolver, *, scope=None, page=None):
    if specification.contentRegion is not None and page is None:
        page = await browser.get_current_page()
        if page is None:
            raise ValueError('content_page_missing')
        if scope is not None:
            await resolver.assert_scope(scope, (await page.get_target_info())['targetId'])
    # WHY：范围查询与Page.get_element复用同一个原生Actor页，保留它已初始化的DOM前端身份。
    elements = await resolver.resolve_collection(specification.container, scope, page=page)
    if specification.contentRegion is None or len(elements) < 2:
        return elements
    if len(elements) > 300:
        raise ValueError('content_region_limit')
    before = await live_document_sample(browser)
    page = page or await browser.get_current_page()
    if (await page.get_target_info())['targetId'] != before['targetId']:
        raise ValueError('content_page_identity_changed')
    session = await browser.get_or_create_cdp_session(target_id=before['targetId'], focus=False)
    runtime, dom = session.cdp_client.send.Runtime, session.cdp_client.send.DOM
    result = await runtime.evaluate(params={'expression': '(' + COMMON_REGION + ')(' + json.dumps(specification.container) + ')',
                                           'returnByValue': False}, session_id=session.session_id)
    object_id = result.get('result', {}).get('objectId')
    try:
        if result.get('exceptionDetails') or not object_id:
            raise ValueError('content_region_resolution_failed')
        node = await dom.describeNode(params={'objectId': object_id}, session_id=session.session_id)
        element = await page.get_element(node['node']['backendNodeId'])
        await assert_content_document(browser, before)
        return [element]
    finally:
        if object_id:
            try:
                await runtime.releaseObject(params={'objectId': object_id}, session_id=session.session_id)
            except Exception:
                # WHY：导航已销毁context时释放失败，不能覆盖读取的身份错误或成功结果。
                pass
