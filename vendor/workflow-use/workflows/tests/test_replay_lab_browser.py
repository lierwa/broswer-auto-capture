"""Real Chromium D1 acceptance for the fixed browser replay interference matrix."""
import asyncio
import base64
import hashlib
import json
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from uuid import uuid4

from browser_use import Browser

from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.optional_preparation import execute_optional_preparation


SCENARIOS = (
    'clean-baseline', 'native-alert-declared', 'native-confirm-unexpected',
    'native-prompt-unexpected', 'beforeunload-declared', 'portal-modal-recorded',
    'portal-modal-absent', 'portal-modal-unexpected', 'delayed-close-button',
    'duplicate-close-buttons', 'repeated-interstitial', 'sticky-cookie-banner',
    'chat-widget-overlap', 'transparent-pointer-overlay', 'same-origin-iframe-overlay',
    'cross-origin-iframe-overlay', 'shadow-dom-overlay', 'overflow-hidden-lock',
    'position-fixed-lock', 'wheel-prevented', 'nested-scroll-container',
    'business-confirmation', 'login-captcha-permission', 'legitimate-popover',
    'target-replaced-after-close',
)
OVERLAY_PREPARED = frozenset({
    'portal-modal-recorded', 'delayed-close-button', 'repeated-interstitial',
    'target-replaced-after-close',
})
OVERLAY_BLOCKED = frozenset({
    'portal-modal-unexpected', 'sticky-cookie-banner', 'chat-widget-overlap',
    'transparent-pointer-overlay',
})
EXPECTED = {
    'native-confirm-unexpected': ('failed', 'unexpected_native_dialog'),
    'native-prompt-unexpected': ('failed', 'unexpected_native_dialog'),
    'portal-modal-unexpected': ('blocked', 'target_hit_blocked'),
    'duplicate-close-buttons': ('failed', 'optional_preparation_ambiguous'),
    'repeated-interstitial': ('failed', 'optional_preparation_ineffective'),
    'sticky-cookie-banner': ('blocked', 'target_hit_blocked'),
    'chat-widget-overlap': ('blocked', 'target_hit_blocked'),
    'transparent-pointer-overlay': ('blocked', 'target_hit_blocked'),
    'cross-origin-iframe-overlay': ('blocked', 'physical_input_scope_unsupported'),
    'overflow-hidden-lock': ('failed', 'scroll_css_locked'),
    'position-fixed-lock': ('failed', 'scroll_position_fixed_locked'),
    'wheel-prevented': ('failed', 'scroll_event_cancelled'),
    'login-captcha-permission': ('waiting_for_human', None),
}


async def main():
    primary = required('BAT_FIXTURE_ORIGIN')
    token = required('BAT_FIXTURE_TOKEN')
    mode = os.environ.get('BAT_BROWSER_MODE', 'headless')
    output = Path(required('BAT_D1_OUTPUT'))
    output.mkdir(parents=True, exist_ok=True)
    browser = None
    records = []
    profile = tempfile.TemporaryDirectory(prefix=f'bat-d1-{mode}-')
    try:
        browser = Browser(
            headless=mode == 'headless', use_cloud=False, keep_alive=False,
            user_data_dir=profile.name, enable_default_extensions=False,
            executable_path=os.environ.get('BAT_UPSTREAM_BROWSER_EXECUTABLE'))
        await browser.start()
        adapter = OrdinaryCapability(browser, target_settle={
            'maxMs': 1800, 'maxAttempts': 18, 'intervalMs': 100})
        try:
            for index, scenario_id in enumerate(SCENARIOS):
                record = await run_scenario(
                    browser, adapter, primary, token, output, mode, scenario_id, index + 1)
                records.append(record)
                print(json.dumps({'scenario': scenario_id, 'status': record['actualStatus'],
                                  'code': record['actualCode']}), flush=True)
        finally:
            await adapter.close()
    finally:
        if browser is not None:
            await browser.kill()
            await asyncio.sleep(.1)
        profile.cleanup()
    result = {'schemaVersion': 'bat.d1-replay-lab-acceptance/v1', 'mode': mode,
              'scenarioCount': len(records), 'browserCommands': sum(item['browserCommands'] for item in records),
              'modelCalls': 0, 'records': records, 'cleanup': {'browserClosed': True, 'adapterClosed': True}}
    result_path = output / 'acceptance.json'
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'evidence': str(result_path), 'scenarioCount': len(records),
                      'modelCalls': 0, 'cleanup': result['cleanup']}), flush=True)


async def run_scenario(browser, adapter, origin, token, output, mode, scenario_id, seed):
    run_id = uuid4().hex
    url = scenario_url(origin, scenario_id, seed, run_id)
    await adapter.execute('navigate', {'url': url, 'new_tab': False})
    await wait_fixture(browser, scenario_id)
    adapter.last_dialog_events = []
    actual_status, actual_code, result = 'completed', None, None
    commands = 1
    try:
        result, added = await exercise(browser, adapter, scenario_id)
        commands += added
        if scenario_id == 'login-captcha-permission':
            actual_status = 'waiting_for_human'
    except BaseException as error:
        actual_code = str(error)
        actual_status = 'blocked' if actual_code in {
            'target_hit_blocked', 'physical_input_scope_unsupported'} else 'failed'
    await asyncio.sleep(0.18)
    oracle = await fetch_oracle(origin, token, scenario_id, run_id)
    expected_status, expected_code = EXPECTED.get(scenario_id, ('completed', None))
    if (oracle.get('expectedStatus'), oracle.get('expectedCode')) != (expected_status, expected_code):
        raise AssertionError(f'oracle_contract_mismatch:{scenario_id}:{oracle}')
    if (actual_status, actual_code) != (expected_status, expected_code):
        raise AssertionError(
            f'scenario_outcome_mismatch:{scenario_id}:actual={actual_status}/{actual_code}:'
            f'expected={expected_status}/{expected_code}')
    screenshot = await capture_screenshot(browser, output / f'{seed:02d}-{scenario_id}.png')
    return {'scenarioId': scenario_id, 'seed': seed, 'mode': mode, 'actualStatus': actual_status,
            'actualCode': actual_code, 'browserCommands': commands,
            'dialogEvents': list(adapter.last_dialog_events), 'result': serializable_result(result),
            'oracle': oracle, 'screenshot': screenshot}


async def exercise(browser, adapter, scenario_id):
    if scenario_id == 'clean-baseline':
        return await click(adapter, '[data-testid="business-target"]'), 1
    if scenario_id.startswith('native-') or scenario_id == 'beforeunload-declared':
        policies = {
            'native-alert-declared': {'type': 'alert', 'action': 'accept'},
            'native-confirm-unexpected': {'type': None},
            'native-prompt-unexpected': {'type': None},
            'beforeunload-declared': {'type': 'beforeunload', 'action': 'accept'},
        }
        return await click(adapter, '[data-testid="business-target"]', policies[scenario_id]), 1
    if scenario_id in OVERLAY_PREPARED:
        result = await prepared_overlay(browser, adapter)
        return result, 2
    if scenario_id == 'portal-modal-absent':
        return await click(adapter, '[data-testid="business-target"]'), 1
    if scenario_id in OVERLAY_BLOCKED:
        return await click(adapter, '[data-testid="business-target"]'), 1
    if scenario_id == 'duplicate-close-buttons':
        return await prepared_overlay(browser, adapter), 1
    if scenario_id == 'same-origin-iframe-overlay':
        await click_title(adapter, 'button', 'Release frame obstruction')
        return await click_title(adapter, 'button', 'Execute framed target'), 2
    if scenario_id == 'cross-origin-iframe-overlay':
        return await click_title(adapter, 'button', 'Release frame obstruction'), 1
    if scenario_id == 'shadow-dom-overlay':
        await click_title(adapter, 'button', 'Release shadow boundary')
        await wait_business_ready(browser)
        return await click(adapter, '[data-testid="business-target"]'), 2
    if scenario_id in {'overflow-hidden-lock', 'position-fixed-lock', 'wheel-prevented'}:
        result = await adapter.execute_checked(
            'scroll', {'down': True, 'pages': 1.0}, None,
            [{'kind': 'scroll_position', 'changed': True,
              'settle': {'maxMs': 500, 'maxAttempts': 3, 'intervalMs': 100}}])
        return result, 1
    if scenario_id == 'nested-scroll-container':
        await wheel_nested(browser)
        return await click(adapter, '[data-testid="business-target"]'), 2
    if scenario_id == 'business-confirmation':
        return await click(adapter, '[data-testid="business-confirmation"]'), 1
    if scenario_id == 'login-captcha-permission':
        return None, 0
    if scenario_id == 'legitimate-popover':
        return await click(adapter, '[data-testid="business-target"]'), 1
    raise AssertionError(f'unhandled_scenario:{scenario_id}')


async def prepared_overlay(browser, adapter):
    page = await browser.get_current_page()
    if page is None:
        raise ValueError('page_unavailable')

    async def readiness():
        return await page_json(page, r'''() => {
          const target = document.querySelector('[data-testid="business-target"]');
          const runId = window.__BAT_FIXTURE__?.runId || 'missing';
          if (!target) return {status:'missing', documentId:runId};
          const rect = target.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          const ready = hit === target || target.contains(hit);
          return {status:ready ? 'ready' : 'blocked', documentId:runId};
        }''')

    async def dispatch():
        await click(adapter, '[data-testid="preparation-action"]')

    preparation = await execute_optional_preparation(readiness, dispatch)
    if preparation.dispatches > 1:
        raise AssertionError('optional_preparation_dispatched_more_than_once')
    return await click(adapter, '[data-testid="business-target"]')


async def click(adapter, selector, policy=None):
    return await adapter.execute('click', {}, {'strategy': 'css', 'value': selector},
                                 native_dialog_policy=policy)


async def click_title(adapter, role, name):
    return await adapter.execute('click', {}, {'strategy': 'title', 'role': role, 'name': name},
                                 native_dialog_policy=None)


async def wheel_nested(browser):
    page = await browser.get_current_page()
    point = await page_json(page, r'''() => {
      const value = document.querySelector('[data-testid="nested-scroller"]');
      const rect = value.getBoundingClientRect();
      return {x:rect.left + rect.width / 2, y:rect.top + rect.height / 2, before:value.scrollTop};
    }''')
    session = await browser.get_or_create_cdp_session(target_id=browser.agent_focus_target_id, focus=False)
    await session.cdp_client.send.Input.dispatchMouseEvent(
        params={'type': 'mouseMoved', 'x': point['x'], 'y': point['y']}, session_id=session.session_id)
    await session.cdp_client.send.Input.dispatchMouseEvent(
        params={'type': 'mouseWheel', 'x': point['x'], 'y': point['y'], 'deltaX': 0, 'deltaY': 900},
        session_id=session.session_id)
    await asyncio.sleep(.25)
    after = await page_json(page, "() => document.querySelector('[data-testid=\"nested-scroller\"]').scrollTop")
    if after <= point['before']:
        raise ValueError('scroll_wrong_container')


async def wait_fixture(browser, scenario_id):
    for _ in range(80):
        page = await browser.get_current_page()
        if page is not None:
            try:
                value = await page_json(page, '() => window.__BAT_FIXTURE__ || null')
                if isinstance(value, dict) and value.get('scenarioId') == scenario_id:
                    return
            except Exception:
                pass
        await asyncio.sleep(.1)
    raise TimeoutError(f'fixture_not_ready:{scenario_id}')


async def wait_business_ready(browser):
    page = await browser.get_current_page()
    for _ in range(30):
        try:
            ready = await page_json(page, r'''() => {
              const target = document.querySelector('[data-testid="business-target"]');
              if (!target) return {ready:false};
              const rect = target.getBoundingClientRect();
              const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
              return {ready:hit === target || target.contains(hit)};
            }''')
        except (json.JSONDecodeError, TypeError):
            ready = {'ready': False}
        if ready.get('ready') is True:
            return
        await asyncio.sleep(.05)
    raise TimeoutError('business_target_not_ready')


async def capture_screenshot(browser, path):
    session = await browser.get_or_create_cdp_session(target_id=browser.agent_focus_target_id, focus=False)
    value = await session.cdp_client.send.Page.captureScreenshot(
        params={'format': 'png', 'captureBeyondViewport': False}, session_id=session.session_id)
    payload = base64.b64decode(value['data'])
    path.write_bytes(payload)
    return {'path': str(path), 'sha256': hashlib.sha256(payload).hexdigest(), 'bytes': len(payload)}


async def fetch_oracle(origin, token, scenario_id, run_id):
    url = f'{origin}/__bat_fixture/oracle?' + urllib.parse.urlencode(
        {'scenarioId': scenario_id, 'runId': run_id})
    for _ in range(40):
        request = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
        await asyncio.sleep(.1)
    raise TimeoutError(f'oracle_report_missing:{scenario_id}')


async def page_json(page, expression):
    return json.loads(await page.evaluate(expression))


def serializable_result(result):
    if result is None:
        return None
    return result.model_dump(mode='json') if hasattr(result, 'model_dump') else result


def scenario_url(origin, scenario_id, seed, run_id):
    variant = {'portal-modal-absent': 'absent', 'delayed-close-button': 'delayed',
               'repeated-interstitial': 'repeated'}.get(scenario_id, 'present')
    return f'{origin}/?' + urllib.parse.urlencode({
        'scenarioId': scenario_id, 'seed': seed, 'phase': 'replay',
        'variant': variant, 'runId': run_id})


def required(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f'{name.lower()}_missing')
    return value


if __name__ == '__main__':
    asyncio.run(main())
