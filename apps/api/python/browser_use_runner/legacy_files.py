"""File argument/result mapping through native CDP and Browser-Use download events."""
import asyncio
from pathlib import Path
import shutil

from browser_use.browser.events import FileDownloadedEvent
from browser_use_runner.legacy_capabilities import native_target
from workflow_use.hybrid.targets import SCROLL_INTO_VIEW_SCRIPT
from workflow_use.hybrid.target_preparation import inspect_action_target, assert_action_target


async def file_action(runtime, command):
    target = await native_target(runtime, command.get('target'))
    if command['type'] == 'upload':
        await upload(runtime, target, command)
        return None
    destination = Path(command['out']).expanduser().resolve()
    if destination.exists() and not command.get('overwrite', False):
        raise ValueError('hybrid_legacy_permission_denied')
    if target is None:
        files = runtime.browser.downloaded_files
        if not files:
            raise ValueError('hybrid_legacy_target_missing')
        source = Path(files[-1]).resolve()
    else:
        # WHY：下载完成事实由原 SDK watchdog 产生，不新建网络客户端或另一个浏览器。
        waiter = asyncio.create_task(runtime.browser.event_bus.expect(FileDownloadedEvent, timeout=60))
        try:
            await asyncio.sleep(0)
            await runtime.capability.execute_checked('click', {}, target, [])
            completed = await waiter
            source = Path(completed.path).resolve()
        finally:
            if not waiter.done():
                waiter.cancel()
                await asyncio.gather(waiter, return_exceptions=True)
    if not source.is_file():
        raise ValueError('hybrid_legacy_invalid_response')
    # WHY：out 是旧合同显式授权的路径；不删除 SDK 原文件，也不覆盖未授权文件。
    mode = 'wb' if command.get('overwrite', False) else 'xb'
    if source != destination:
        with source.open('rb') as incoming, destination.open(mode) as outgoing:
            shutil.copyfileobj(incoming, outgoing)
    return None


async def upload(runtime, target, command):
    files = [str(Path(value).expanduser().resolve(strict=True)) for value in command['files']]
    if any(not Path(value).is_file() for value in files):
        raise ValueError('hybrid_legacy_permission_denied')
    element = await runtime.capability.targets.resolve_element(target) if target['strategy'] == 'css' else (
        await runtime.capability.resolve_target(target, action_name='click')).element
    info = await element.get_basic_info()
    session_id = element._session_id
    client = runtime.browser.cdp_client
    if command.get('mode', 'input') == 'input':
        if await element.get_attribute('type') != 'file':
            raise ValueError('hybrid_legacy_target_missing')
        # Source: browser-use 0.13.8 DefaultActionWatchdog.on_UploadFileEvent;
        # existing cdp-use typed API accepts the old contract's list of files in one atomic assignment.
        await client.send.DOM.setFileInputFiles(params={'files': files, 'backendNodeId': info['backendNodeId']},
                                                session_id=session_id)
        return
    # WHY：原生selector map只编入可交互节点；文件drop区可以是普通容器。
    # 复用同一resolver的唯一Element及既有命中校验，不要求它具有点击动作索引。
    await element.evaluate(SCROLL_INTO_VIEW_SCRIPT)
    state = await inspect_action_target(element)
    assert_action_target(state, 'click')
    data = {'items': [], 'files': files, 'dragOperationsMask': 1}
    for event_type in ('dragEnter', 'dragOver', 'drop'):
        await client.send.Input.dispatchDragEvent(params={'type': event_type,
            'x': state['center']['x'], 'y': state['center']['y'], 'data': data}, session_id=session_id)
