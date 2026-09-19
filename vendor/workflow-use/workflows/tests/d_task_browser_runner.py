"""Headless, model-free browser process used by the D5 TaskChain acceptance bridge."""
import asyncio
import base64
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path

from browser_use import Browser

from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.read import ReadSpec, read_fields


async def main():
    output = Path(required('BAT_D5_OUTPUT'))
    output.mkdir(parents=True, exist_ok=True)
    browser = None
    adapter = None
    profile = tempfile.TemporaryDirectory(prefix='bat-d5-headless-')
    try:
        browser = Browser(headless=True, use_cloud=False, keep_alive=False,
                          user_data_dir=profile.name, enable_default_extensions=False,
                          executable_path=os.environ.get('BAT_UPSTREAM_BROWSER_EXECUTABLE'))
        await browser.start()
        adapter = OrdinaryCapability(browser)
        respond({'type': 'ready', 'headless': True})
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line:
                break
            try:
                command = json.loads(line)
                kind = command.get('type')
                if kind == 'close':
                    respond({'ok': True, 'closed': True})
                    break
                if kind == 'navigate':
                    await adapter.execute('navigate', {'url': command['url'], 'new_tab': False})
                    respond({'ok': True, 'output': None, 'browserCommands': 1})
                    continue
                if kind == 'action':
                    await adapter.execute(command['actionName'], command.get('arguments', {}))
                    respond({'ok': True, 'output': None, 'browserCommands': 1})
                    continue
                if kind == 'read':
                    value = await read_fields(browser, ReadSpec.model_validate(command['specification']))
                    respond({'ok': True, 'output': value, 'browserCommands': 1})
                    continue
                if kind == 'screenshot':
                    name = re.sub(r'[^a-zA-Z0-9_-]', '-', str(command.get('name', 'page'))) + '.png'
                    path = output / name
                    shot = await capture_screenshot(browser, path)
                    respond({'ok': True, 'output': shot, 'browserCommands': 1})
                    continue
                raise ValueError('d5_browser_command_unsupported')
            except BaseException as error:
                respond({'ok': False, 'error': str(error) or type(error).__name__,
                         'browserCommands': 1 if command.get('type') in
                         ('navigate', 'action', 'read', 'screenshot') else 0})
    finally:
        if adapter is not None:
            await adapter.close()
        if browser is not None:
            await browser.kill()
            await asyncio.sleep(.1)
        profile.cleanup()


async def capture_screenshot(browser, path):
    session = await browser.get_or_create_cdp_session(
        target_id=browser.agent_focus_target_id, focus=False)
    value = await session.cdp_client.send.Page.captureScreenshot(
        params={'format': 'png', 'captureBeyondViewport': False}, session_id=session.session_id)
    payload = base64.b64decode(value['data'])
    path.write_bytes(payload)
    return {'path': str(path), 'sha256': hashlib.sha256(payload).hexdigest(),
            'bytes': len(payload)}


def respond(value):
    print('BAT_RESPONSE ' + json.dumps(value, ensure_ascii=False), flush=True)


def required(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f'{name}_required')
    return value


if __name__ == '__main__':
    asyncio.run(main())
