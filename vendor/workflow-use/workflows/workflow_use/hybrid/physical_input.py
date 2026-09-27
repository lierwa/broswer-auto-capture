"""Physical pointer dispatch through the Browser session already owned by the product run."""
import math

from browser_use.agent.views import ActionResult
from browser_use.actor.page import Page


async def dispatch_physical_click(browser, prepared):
    if prepared.coordinate_scope == 'unsupported':
        raise ValueError('physical_input_scope_unsupported')
    if not _inside_viewport(prepared):
        raise ValueError('physical_input_coordinates_invalid')
    target_id = getattr(browser, 'agent_focus_target_id', None)
    if target_id != prepared.target_id:
        raise ValueError('physical_input_target_changed')
    page = await browser.get_current_page()
    if page is None or (await page.get_target_info()).get('targetId') != target_id:
        raise ValueError('physical_input_target_changed')
    session = await browser.get_or_create_cdp_session(target_id=target_id, focus=False)
    if getattr(browser, 'agent_focus_target_id', None) != target_id:
        raise ValueError('physical_input_target_changed')
    # WHY：mouse 是异步属性；显式复用受管 session，避免 Page 自行 attach 另一会话。
    mouse = await Page(browser, target_id, session_id=session.session_id).mouse
    await mouse.move(prepared.center_x, prepared.center_y)
    try:
        await mouse.click(prepared.center_x, prepared.center_y)
    except BaseException:
        # WHY：上游 click 无失败释放，up 固定 0,0；仅补偿保留原坐标，不重派点击。
        try:
            await session.cdp_client.send.Input.dispatchMouseEvent(
                params={'type': 'mouseReleased', 'x': prepared.center_x, 'y': prepared.center_y,
                        'button': 'left', 'clickCount': 1}, session_id=session.session_id)
        except Exception:
            pass
        raise
    return ActionResult(extracted_content='Physical click dispatched', metadata={
        'batPhysicalInput': {
            'kind': 'mouse', 'trustedExpected': True,
            'targetId': prepared.target_id, 'frameId': prepared.frame_id,
            'sessionId': str(session.session_id), 'documentId': prepared.document_id,
            'coordinateScope': prepared.coordinate_scope,
            'point': {'x': prepared.center_x, 'y': prepared.center_y},
            'viewport': {'width': prepared.viewport_width, 'height': prepared.viewport_height},
        }})


def _inside_viewport(prepared):
    values = (prepared.center_x, prepared.center_y,
              prepared.viewport_width, prepared.viewport_height)
    return (all(type(value) in (int, float) and math.isfinite(value) for value in values)
            and prepared.viewport_width > 0 and prepared.viewport_height > 0
            and 0 <= prepared.center_x <= prepared.viewport_width
            and 0 <= prepared.center_y <= prepared.viewport_height)
