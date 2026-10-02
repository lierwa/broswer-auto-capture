"""Real managed extension, persistent credentials and B-U/W-U replay; fresh owned Profile only."""
import argparse
import asyncio
import base64
import hashlib
import json
import os
import shutil
import tempfile
import sys
from uuid import uuid4
from pathlib import Path

import psutil
from browser_use import Browser
from cdp_use import CDPClient
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'python'))
from browser_use_runner.attached_window import AttachedWindow


def owned_processes(profile):
    result = []
    for process in psutil.process_iter(['pid', 'cmdline', 'create_time']):
        try:
            if f'--user-data-dir={profile}' in (process.info['cmdline'] or []):
                result.append((process.pid, process.create_time()))
                result.extend((child.pid, child.create_time()) for child in process.children(recursive=True))
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return result


def still_owned(processes):
    live = []
    for pid, created in processes:
        try:
            process = psutil.Process(pid)
            if process.create_time() == created and process.status() != psutil.STATUS_ZOMBIE:
                live.append(process)
        except psutil.NoSuchProcess:
            continue
    return live


async def launch_process(binary, profile, extension):
    # 独立新建的合成测试 Profile；不向日常 Chrome 传 flag，不复制或注册个人 Profile。
    port = profile / 'DevToolsActivePort'
    port.unlink(missing_ok=True)
    process = await asyncio.create_subprocess_exec(binary, f'--user-data-dir={profile}',
        '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
        f'--disable-extensions-except={extension}', f'--load-extension={extension}', 'about:blank',
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    try:
        async with asyncio.timeout(30):
            while not port.exists():
                if process.returncode is not None:
                    raise ValueError('owned_test_chrome_exited')
                await asyncio.sleep(0.1)
        lines = port.read_text().splitlines()
        return process, f'ws://127.0.0.1:{lines[0]}{lines[1]}'
    except BaseException:
        process.terminate()
        await asyncio.wait_for(process.wait(), 10)
        raise


async def launch_owned(binary, profile, extension):
    process, endpoint = await launch_process(binary, profile, extension)
    loader = Browser(cdp_url=endpoint, use_cloud=False, is_local=False, keep_alive=True,
                     enable_default_extensions=False)
    try:
        await asyncio.wait_for(loader.start(), 35)
        return process, loader
    except BaseException:
        process.terminate()
        await asyncio.wait_for(process.wait(), 10)
        raise


async def disconnect(browser):
    if browser and browser._cdp_client_root:
        browser._intentional_stop = True
        await asyncio.wait_for(browser.cdp_client.stop(), 5)
        await browser.event_bus.stop(clear=True, timeout=2)


async def stop_owned(process, processes):
    if process and process.returncode is None:
        # 只退出本 fixture 持有的 create_subprocess_exec 句柄，不按端口/进程名清理。
        process.terminate()
        await asyncio.wait_for(process.wait(), 10)
    await asyncio.to_thread(psutil.wait_procs, still_owned(processes), timeout=5)
    if still_owned(processes):
        raise ValueError('owned_test_cleanup_required')


async def request(relay, op, **values):
    relay.stdin.write((json.dumps({'op': op, **values}) + '\n').encode())
    await relay.stdin.drain()
    response = json.loads(await asyncio.wait_for(relay.stdout.readline(), 55))
    if response.get('failed'):
        raise ValueError(f'product_probe_failed:{op}:{response.get("failureType")}:{response.get("code")}:{response.get("fields")}:{response.get("assertion")}')
    return response


async def extension_page(loader, extension_id):
    created = await loader.cdp_client.send.Target.createTarget(
        {'url': f'chrome-extension://{extension_id}/status.html'})
    await loader.get_or_create_cdp_session(created['targetId'], focus=True)
    page = await loader.get_current_page()
    await asyncio.sleep(0.5)
    return page


async def sdk_action(endpoint, fixture_url, facts, profile):
    owner = str(uuid4())
    window = AttachedWindow(profile / 'bat-sdk-fixture' / owner / 'default', owner, endpoint)
    consumer = None
    try:
        consumer = await asyncio.wait_for(window.start(resume=False, allowed_domains=None, retain_connection=True), 35)
        facts['sdkStart'] = True
        page = await consumer.get_current_page()
        await asyncio.wait_for(page.goto(fixture_url), 15)
        value = await asyncio.wait_for(page.evaluate('() => {document.querySelector("button").click(); return document.querySelector("button").textContent}'), 15)
        if value != 'done':
            raise ValueError('consumer_dom_action_failed')
        state = await asyncio.wait_for(consumer.get_browser_state_summary(), 20)
        facts.update({'navigationAndDom': True, 'observation': bool(state.dom_state)})
        return consumer, window
    except BaseException:
        await window.close(consumer)
        await disconnect(consumer)
        raise


async def lifecycle(relay, loader, extension_id, endpoint, facts, profile):
    facts['stage'] = 'persistent_pair'
    # WHY：直接消费产品无码授权；测试只模拟一次真实扩展按钮点击，不读取/输入 localStorage 令牌。
    pending = asyncio.create_task(request(relay, 'pair'))
    try:
        async with asyncio.timeout(25):
            while True:
                targets = (await loader.cdp_client.send.Target.getTargets()).get('targetInfos', [])
                page_target = next((target for target in targets if target.get('url', '').startswith(
                    f'chrome-extension://{extension_id}/connect.html')), None)
                if page_target:
                    await loader.get_or_create_cdp_session(page_target['targetId'], focus=True)
                    page = await loader.get_current_page()
                    clicked = json.loads(await page.evaluate('''() => {
                        const button = [...document.querySelectorAll('button')].find(
                            item => item.textContent === '允许并保存授权');
                        if (!button) return {clicked: false};
                        button.click(); return {clicked: true};
                    }'''))['clicked']
                    if clicked:
                        break
                await asyncio.sleep(0.1)
        result = await pending
    except BaseException:
        pending.cancel()
        await asyncio.gather(pending, return_exceptions=True)
        raise
    if not result.get('paired') or not result.get('connected') or not result.get('privateCredentials'):
        raise ValueError('persistent_pair_not_confirmed')
    facts.update({'extensionHandshake': True, 'privateCredentials': True,
                  'manualTokenReadOrInput': False, 'approvalClicks': 1})
    facts['stage'] = 'consumer_action'
    consumer, window = await sdk_action(result['cdpUrl'], endpoint['fixtureUrl'], facts, profile)
    await ownership_boundary(loader, consumer, window, extension_id, facts)
    original = next(original for _owner, name, original, _replacement in window.scope.restorations if name == 'getTargets')
    facts['extensionTargetsBeforeCleanup'] = len((await original()).get('targetInfos', []))
    facts['extensionConnectedBeforeCleanup'] = (await request(relay, 'status'))['connected']
    owned = set(window._load(window.owner_id).ownedTargets)
    cleanup = await window.close(consumer)
    facts['sdkCleanup'] = cleanup['status']
    facts['extensionConnectedAfterCleanup'] = (await request(relay, 'status'))['connected']
    native_targets = (await loader.cdp_client.send.Target.getTargets()).get('targetInfos', [])
    facts['nativeOwnedTargetsRemaining'] = sum(target['targetId'] in owned for target in native_targets)
    if cleanup['status'] != 'confirmed':
        raise ValueError('sdk_owned_target_cleanup_unconfirmed')
    await disconnect(consumer)
    facts['stage'] = 'runtime_replay'
    runtime = await request(relay, 'runtime')
    if runtime.get('replayRuns') != 2 or runtime.get('modelCalls') != 0 or runtime.get('cleanup') != 'confirmed':
        raise ValueError('runtime_replay_not_confirmed')
    facts.update(runtime)
    facts['stage'] = 'service_restart'
    restored = await request(relay, 'reload')
    if not restored.get('durableAuthorization'):
        raise ValueError('durable_authorization_not_confirmed')
    facts['serviceRestart'] = True
    return restored


async def ownership_boundary(loader, consumer, window, extension_id, facts):
    facts['stage'] = 'owned_target_boundary'
    page = await extension_page(loader, extension_id)
    target_id = consumer.agent_focus_target_id
    value = await page.evaluate('''() => (async () => {
        const targets = await chrome.debugger.getTargets();
        const owner = targets.find(target => target.id === OWNED_TARGET);
        const tab = await chrome.tabs.get(owner.tabId);
        const personal = await chrome.tabs.create({windowId: tab.windowId, url:'about:blank', active:false});
        if (tab.groupId >= 0) await chrome.tabs.group({groupId:tab.groupId, tabIds:[personal.id]});
        await new Promise(resolve => setTimeout(resolve, 400));
        const latest = await chrome.tabs.get(personal.id);
        const unowned = (await chrome.debugger.getTargets()).find(target => target.tabId === personal.id);
        return {targetId: unowned.id, dragged: tab.groupId >= 0, rejected: latest.groupId !== tab.groupId};
    })()'''.replace('OWNED_TARGET', json.dumps(target_id)))
    info = json.loads(value)
    # 直接调用被原 TargetScope 保存的原生 getTargets，独立检验扩展边界而不是只靠宿主过滤。
    original = next(original for _owner, name, original, _replacement in window.scope.restorations if name == 'getTargets')
    targets = (await original()).get('targetInfos', [])
    if any(target['targetId'] == info['targetId'] for target in targets):
        raise ValueError('extension_exposed_unowned_target')
    try:
        await consumer.cdp_client.send.Target.attachToTarget({'targetId': info['targetId'], 'flatten': True})
    except Exception:
        facts['unownedAttachRejected'] = True
    if not facts.get('unownedAttachRejected'):
        raise ValueError('unowned_attach_not_rejected')
    facts['sameWindowDoesNotGrantOwnership'] = True
    facts['personalGroupDragRejected'] = info['dragged'] and info['rejected']


async def rotation(relay, loader, extension_id, endpoint, fixture_url, facts, profile):
    facts['stage'] = 'extension_revoke'
    consumer, window = await sdk_action(endpoint, fixture_url, facts, profile)
    try:
        page = await extension_page(loader, extension_id)
        await page.evaluate('() => {document.querySelector(".auth-token-refresh").click(); return true}')
        await asyncio.sleep(0.5)
        facts['activeConnectionRevoked'] = not consumer.is_cdp_connected
        facts['automaticReconnectPrevented'] = window.scope.connection_lost
        if not facts.get('activeConnectionRevoked'):
            raise ValueError('active_connection_not_revoked')
    finally:
        # 撤销后控制器不能重连关页；保留原 cleanup_required 合同，fixture 的 Chrome owner 最后回收。
        facts['revokedRunCleanup'] = (await window.close(consumer))['status']
        await disconnect(consumer)
    facts['stage'] = 'old_token_rejected'
    if not (await request(relay, 'old-token')).get('oldTokenRejected'):
        raise ValueError('old_token_not_rejected')
    facts['oldTokenRejected'] = True
    if not (await request(relay, 'revoke')).get('revoked'):
        raise ValueError('host_credential_not_removed')
    facts['hostCredentialRemoved'] = True


async def probe(binary):
    root = Path.cwd().resolve()
    if Path(__file__).resolve().parents[4] != root:
        raise ValueError('run_from_actual_checkout_root')
    extension = root / 'work/daily-chrome-extension/extension'
    manifest = json.loads((extension / 'manifest.json').read_text())
    digest = hashlib.sha256(base64.b64decode(manifest['key'])).hexdigest()[:32]
    extension_id = ''.join(chr(ord('a') + int(c, 16)) for c in digest)
    profile = Path(tempfile.mkdtemp(prefix='bat-extension-owned-', dir=root / 'work/daily-chrome-p0'))
    relay = await asyncio.create_subprocess_exec('node', '--import', 'tsx',
        'apps/api/tests/fixtures/daily-chrome-playwright-relay.ts', cwd=root,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        env={**os.environ, 'BAT_TEST_PROFILE': str(profile), 'BAT_TEST_EXECUTABLE': binary})
    process, loader, processes = None, None, []
    facts = {'driver': 'browser-use/cdp-use', 'modelCalls': 0, 'dailyProfileAcceptance': False,
             'managedCompatibility': True, 'stage': 'browser_start'}
    try:
        endpoint = json.loads(await asyncio.wait_for(relay.stdout.readline(), 15))
        process, loader = await launch_owned(binary, profile, extension)
        processes = owned_processes(profile)
        await lifecycle(relay, loader, extension_id, endpoint, facts, profile)
        facts['stage'] = 'chrome_restart'
        await request(relay, 'close')
        await disconnect(loader)
        await stop_owned(process, processes)
        process, loader = await launch_owned(binary, profile, extension)
        processes = owned_processes(profile)
        restored = await request(relay, 'reload')
        if not restored.get('durableAuthorization'):
            raise ValueError('chrome_restart_authorization_not_confirmed')
        facts['chromeRestart'] = True
        await rotation(relay, loader, extension_id, restored['cdpUrl'], endpoint['fixtureUrl'], facts, profile)
        facts['status'] = 'passed'
    except Exception as error:
        facts.update({'status': 'failed', 'failureType': type(error).__name__})
        if isinstance(error, ValueError) and str(error).startswith('product_probe_failed:'):
            facts['failureCode'] = str(error)
        if loader and facts.get('stage') == 'persistent_pair':
            targets = (await loader.cdp_client.send.Target.getTargets()).get('targetInfos', [])
            facts['extensionConnectPagePresent'] = any('/connect.html' in target.get('url', '') for target in targets)
            facts['loopbackRedirectPagePresent'] = any('/connect/extension/' in target.get('url', '') for target in targets)
    finally:
        await disconnect(loader)
        relay.stdin.close()
        try:
            await asyncio.wait_for(relay.wait(), 10)
        except TimeoutError:
            relay.terminate()
            await asyncio.wait_for(relay.wait(), 5)
        await stop_owned(process, processes)
        shutil.rmtree(profile)
    print('BAT_PROOF ' + json.dumps({**facts, 'cleanup': 'confirmed'}), flush=True)
    if facts['status'] != 'passed':
        raise SystemExit(1)


async def connection_page_probe(binary):
    # WHY：用既有 cdp-use 独立检验原生启动/跳转；不让 B-U watchdog 的其他能力掩盖 Chrome 导航错误。
    root = Path.cwd().resolve()
    if Path(__file__).resolve().parents[4] != root:
        raise ValueError('run_from_actual_checkout_root')
    extension = root / 'work/daily-chrome-extension/extension'
    manifest = json.loads((extension / 'manifest.json').read_text())
    digest = hashlib.sha256(base64.b64decode(manifest['key'])).hexdigest()[:32]
    extension_id = ''.join(chr(ord('a') + int(c, 16)) for c in digest)
    profile = Path(tempfile.mkdtemp(prefix='bat-extension-owned-'))
    (profile / 'Default').mkdir()
    relay = await asyncio.create_subprocess_exec('node', '--import', 'tsx',
        'apps/api/tests/fixtures/daily-chrome-playwright-relay.ts', cwd=root,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        env={**os.environ, 'BAT_TEST_PROFILE': str(profile), 'BAT_TEST_EXECUTABLE': binary,
             'PWTEST_EXTENSION_CONNECT_TIMEOUT': '3000'})
    process, client, processes = None, None, []
    facts = {'driver': 'cdp-use', 'modelCalls': 0, 'dailyProfileAcceptance': False,
             'securityChecksEnabled': True, 'stage': 'browser_start'}
    try:
        await asyncio.wait_for(relay.stdout.readline(), 15)
        process, endpoint = await launch_process(binary, profile, extension)
        processes = owned_processes(profile)
        facts['stage'] = 'cdp_start'
        client = CDPClient(endpoint)
        await asyncio.wait_for(client.start(), 10)
        facts['browserVersion'] = (await client.send.Browser.getVersion())['product']
        facts['stage'] = 'extension_status'
        created = await client.send.Target.createTarget({'url': f'chrome-extension://{extension_id}/status.html'})
        session = (await client.send.Target.attachToTarget({'targetId': created['targetId'], 'flatten': True}))['sessionId']
        token = None
        for _ in range(30):
            result = await client.send.Runtime.evaluate({'expression': 'localStorage.getItem("auth-token")',
                                                        'returnByValue': True}, session_id=session)
            token = result.get('result', {}).get('value')
            if isinstance(token, str) and len(token) == 43:
                break
            await asyncio.sleep(0.1)
        if not isinstance(token, str) or len(token) != 43:
            raise ValueError('extension_status_not_loaded')
        facts['stage'] = 'native_redirect_pair'
        paired = await request(relay, 'pair', token=token)
        facts['extensionHandshake'] = paired.get('paired') and paired.get('connected')
        facts['status'] = 'passed' if facts['extensionHandshake'] else 'failed'
    except Exception as error:
        facts.update({'status': 'failed', 'failureType': type(error).__name__})
        if isinstance(error, ValueError) and str(error).startswith('product_probe_failed:'):
            facts['failureCode'] = str(error)
        if client:
            targets = (await client.send.Target.getTargets()).get('targetInfos', [])
            pages = [target for target in targets if target.get('url', '').startswith(f'chrome-extension://{extension_id}/connect.html')]
            facts['connectionPagePresent'] = bool(pages)
            for target in pages:
                session = (await client.send.Target.attachToTarget({'targetId': target['targetId'], 'flatten': True}))['sessionId']
                result = await client.send.Runtime.evaluate({'expression': 'Boolean(document.body?.innerText.includes("ERR_BLOCKED_BY_CLIENT"))',
                                                            'returnByValue': True}, session_id=session)
                facts['blockedByClient'] = result.get('result', {}).get('value') is True
    finally:
        if client:
            await asyncio.wait_for(client.stop(), 5)
        relay.stdin.close()
        try:
            await asyncio.wait_for(relay.wait(), 10)
        except TimeoutError:
            relay.terminate()
            await asyncio.wait_for(relay.wait(), 5)
        await stop_owned(process, processes)
        shutil.rmtree(profile)
    print('BAT_PROOF ' + json.dumps({**facts, 'cleanup': 'confirmed'}), flush=True)
    if facts['status'] != 'passed':
        raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser-executable', required=True)
    parser.add_argument('--connection-page-only', action='store_true')
    arguments = parser.parse_args()
    asyncio.run((connection_page_probe if arguments.connection_page_only else probe)(arguments.browser_executable))
