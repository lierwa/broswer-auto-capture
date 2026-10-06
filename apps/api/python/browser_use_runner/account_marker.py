"""Chrome's native element inspector, scoped to the original owner page."""
import asyncio, json, re
from urllib.parse import urlsplit


async def pick(borrowed, url):
    if borrowed.page.url != url:
        raise ValueError('account_marker_page_changed')
    selected = asyncio.get_running_loop().create_future()
    def inspect(event):
        if not selected.done(): selected.set_result(event['backendNodeId'])
    def cancel(_event):
        if not selected.done(): selected.set_exception(ValueError('account_marker_cancelled'))
    cdp = borrowed.cdp
    cdp.on('Overlay.inspectNodeRequested', inspect)
    cdp.on('Overlay.inspectModeCanceled', cancel)
    try:
        await cdp.send('DOM.enable')
        await cdp.send('Overlay.enable')
        await cdp.send('Overlay.setInspectMode', {'mode':'searchForNode', 'highlightConfig':{'showInfo':True,
            'contentColor':{'r':255,'g':190,'b':0,'a':0.3}}})
        await borrowed.page.bring_to_front()
        backend = await asyncio.wait_for(selected, 55)
        node = (await cdp.send('DOM.describeNode', {'backendNodeId':backend}))['node']
        attributes = dict(zip(node.get('attributes', [])[::2], node.get('attributes', [])[1::2]))
        attribute = 'data-testid' if attributes.get('data-testid') else 'id'
        value = attributes.get(attribute, '')
        # WHY：只适配公开原生定位；没有唯一稳定属性时不编写自己的选择器生成/修复引擎。
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,119}', value):
            raise ValueError('account_marker_stable_locator_missing')
        selector = f'[{attribute}={json.dumps(value)}]'
        locator = borrowed.page.get_by_test_id(value) if attribute=='data-testid' else borrowed.page.locator(selector)
        if await locator.count() != 1 or not await locator.is_visible():
            raise ValueError('account_marker_not_unique_or_visible')
        preview = (await locator.inner_text(timeout=5000)).strip()[:120]
        if not preview or borrowed.page.url != url:
            raise ValueError('account_marker_page_changed')
        return {'selector':selector, 'preview':preview, 'url':url}
    finally:
        # 不注入页面监听器，不触发所选站点按钮；超时/取消必须退出原生选取模式。
        await asyncio.wait_for(cdp.send('Overlay.setInspectMode', {'mode':'none', 'highlightConfig':{}}), 5)
        cdp.remove_listener('Overlay.inspectNodeRequested', inspect)
        cdp.remove_listener('Overlay.inspectModeCanceled', cancel)
