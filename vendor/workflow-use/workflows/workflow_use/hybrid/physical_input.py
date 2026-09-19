"""Physical pointer dispatch through the Browser session already owned by the product run."""
import math

from browser_use.agent.views import ActionResult


async def dispatch_physical_click(browser, prepared):
    if prepared.coordinate_scope == 'unsupported':
        raise ValueError('physical_input_scope_unsupported')
    if not _inside_viewport(prepared):
        raise ValueError('physical_input_coordinates_invalid')
    target_id = getattr(browser, 'agent_focus_target_id', None) or prepared.target_id
    if not target_id:
        raise ValueError('physical_input_target_unavailable')
    session = await browser.get_or_create_cdp_session(target_id=target_id, focus=False)
    client = session.cdp_client
    common = {'x': prepared.center_x, 'y': prepared.center_y,
              'button': 'left', 'clickCount': 1}
    pressed = False
    try:
        await client.send.Input.dispatchMouseEvent(
            params={'type': 'mouseMoved', 'x': prepared.center_x, 'y': prepared.center_y},
            session_id=session.session_id)
        await client.send.Input.dispatchMouseEvent(
            params={'type': 'mousePressed', **common}, session_id=session.session_id)
        pressed = True
        await client.send.Input.dispatchMouseEvent(
            params={'type': 'mouseReleased', **common}, session_id=session.session_id)
        pressed = False
    finally:
        if pressed:
            try:
                await client.send.Input.dispatchMouseEvent(
                    params={'type': 'mouseReleased', **common}, session_id=session.session_id)
            except Exception:
                pass
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
