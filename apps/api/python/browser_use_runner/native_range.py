"""Adapt Windows' native RangeValuePattern, limited to the current owned target."""
import asyncio
import json
import subprocess
import sys
from pathlib import Path


async def _focused(page, object_id):
    result = await page._client.send.Runtime.callFunctionOn(params={'objectId': object_id,
        'functionDeclaration': '''function(){return this.isConnected && !this.disabled && !this.readOnly &&
          this.type==='range' && this.ownerDocument.hasFocus() && this.getRootNode().activeElement===this;}''',
        'returnByValue': True}, session_id=page._session_id)
    return result.get('result', {}).get('value') is True


async def _apply(page, object_id, owner, request):
    process = await asyncio.create_subprocess_exec('powershell.exe', '-NoProfile', '-NonInteractive', '-File',
        str(Path(__file__).with_suffix('.ps1')), stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW)
    dispatched = False
    try:
        async with asyncio.timeout(8):
            process.stdin.write((json.dumps(request, ensure_ascii=True) + '\n').encode())
            await process.stdin.drain()
            if json.loads(await process.stdout.readline()) != {'status': 'ready'}: return False
            # WHY：UIA准备只读；真正设值前再次核租约/焦点，取消不得进入兼容路径重发动作。
            if owner(page._target_id) != request['owner']: raise RuntimeError('native_range_owner_changed')
            if not await _focused(page, object_id): raise RuntimeError('native_range_target_changed')
            process.stdin.write(b'apply\n')
            dispatched = True
            await process.stdin.drain()
            if json.loads(await process.stdout.readline()) != {'status': 'dispatched'}:
                raise RuntimeError('native_range_action_unconfirmed')
            return True
    except asyncio.CancelledError:
        raise
    except (TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
        if dispatched: raise RuntimeError('native_range_action_unconfirmed') from error
        return False
    finally:
        if process.returncode is None:
            process.kill()
        await process.wait()


async def fill_native_range(page, node, value, object_id):
    owner = getattr(page._browser_session, '_bat_native_range_owner', None)
    if sys.platform != 'win32' or owner is None: return False
    evidence = owner(page._target_id)
    if evidence is None: return False
    await page._client.send.DOM.focus(params={'backendNodeId': node['backendNodeId']}, session_id=page._session_id)
    if not await _focused(page, object_id): return False
    tree = await page._client.send.Accessibility.getPartialAXTree(params={
        'backendNodeId': node['backendNodeId'], 'fetchRelatives': False}, session_id=page._session_id)
    target = next((item for item in tree['nodes'] if item.get('backendDOMNodeId') == node['backendNodeId']), {})
    if target.get('role', {}).get('value') != 'slider': return False
    attrs = dict(zip(node.get('attributes', [])[::2], node.get('attributes', [])[1::2]))
    request = {'owner': evidence, 'id': attrs.get('id', ''), 'name': target.get('name', {}).get('value', ''), 'value': value}
    if not await _apply(page, object_id, owner, request): return False
    # WHY：UIA成功回执只表示原生动作已接受；等真实DOM值，不重发或用陈旧AX缓存自证成功。
    async with asyncio.timeout(2):
        while True:
            actual = await page._client.send.Runtime.callFunctionOn(params={'objectId': object_id,
                'functionDeclaration': 'function(value){return this.value===value;}',
                'arguments': [{'value': value}], 'returnByValue': True}, session_id=page._session_id)
            if actual.get('result', {}).get('value') is True: return True
            await asyncio.sleep(.02)
