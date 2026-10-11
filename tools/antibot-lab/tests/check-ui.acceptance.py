"""Owned UI acceptance against real detector receipts and default Chrome certificate validation."""
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time

import psutil
from playwright.sync_api import sync_playwright

ROOT = Path.cwd().resolve()
BASE = Path(os.environ.get('BAT_ANTIBOT_DATA', ROOT/'work/antibot-service')).resolve()
URL = 'https://localhost:4185/measurement/check'


def save(out, name, data):
    (out/name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def automatic(page):
    page.goto(URL)
    page.wait_for_function("globalThis.__batCheckReport?.phase === 'complete'")
    result = page.evaluate('globalThis.__batCheckReport')
    assert result['verdict'] == 'bot', 'headless_webdriver_control_must_remain_positive'
    assert page.locator('#report-rows tr[data-signal]').count() == 39
    assert json.loads(page.locator('#shield-report').text_content()) == result
    assert page.locator('#report').get_attribute('data-run-id') == result['runId']
    assert page.evaluate('getComputedStyle(document.body).backgroundColor') == 'rgb(16, 23, 25)'
    assert page.locator('#scene,.prototype-bar').count() == 0
    assert not page.get_by_role('tab', name='报告', exact=True).count()
    return result


def fill_sample(page):
    page.locator('#sample-text').press_sequentially('Typing a test sentence.', delay=55)
    page.locator('#reading').hover()
    page.mouse.wheel(0, 120)
    page.wait_for_function("!document.querySelector('#submit').disabled")


def interaction(page, out):
    page.locator('#interaction-tab').click()
    fill_sample(page)
    page.screenshot(path=str(out/'interaction.png'))
    page.wait_for_timeout(1300)  # drain the periodic batch before delaying the explicit submit
    pending_feedback = []
    def delay_receipt(route):
        response = route.fetch()
        if not pending_feedback:
            pending_feedback.append(page.locator('#report').get_attribute('data-status'))
            assert pending_feedback[0] == 'running'
            assert page.locator('#submit').is_disabled()
        time.sleep(1.5)
        route.fulfill(response=response)
    page.route('**/measurement/check/telemetry/**', delay_receipt)
    try:
        page.locator('#submit').click()
        page.wait_for_function("globalThis.__batCheckReport?.phase === 'complete'")
        assert pending_feedback == ['running']
        result = page.evaluate('globalThis.__batCheckReport')
        assert result['scope'] == 'automatic+interactive'
        assert result['verdict'] == 'bot'
        assert result['counts']['pending'] == 0
        assert not page.locator('#interaction-area').is_visible()
        save(out,'interaction-report.json',result)
        page.screenshot(path=str(out/'interaction-result.png'))
    finally:
        page.unroute('**/measurement/check/telemetry/**', delay_receipt)
    with page.expect_download() as download:
        page.locator('#export').click()
    downloaded = json.loads(Path(download.value.path()).read_text())
    assert downloaded['runId'] == result['runId'] and downloaded['verdict'] == result['verdict']
    assert len(downloaded['signals']) == 39


def excluded(page, out):
    automatic(page)
    page.locator('#interaction-tab').click()
    # Real browser paste exclusion goes through the original collector/HTTP detector.
    page.locator('#sample-text').dispatch_event('paste')
    page.locator('#sample-text').press_sequentially('Paste excluded sample.', delay=45)
    page.locator('#reading').hover();page.mouse.wheel(0,100)
    page.wait_for_function("!document.querySelector('#submit').disabled")
    page.locator('#submit').click()
    page.wait_for_function("globalThis.__batCheckReport?.phase === 'complete'")
    report = page.evaluate('globalThis.__batCheckReport')
    row = next(row for row in report['signals'] if row['id'] == 'typing-cadence')
    assert row['status'] == 'excluded' and not row['valid']
    save(out,'excluded.json',report)
    old = report['runId'];page.locator('#restart').click()
    page.wait_for_function("old => globalThis.__batCheckReport?.runId && globalThis.__batCheckReport.runId !== old",arg=old)
    assert page.locator('#interaction-area').is_visible()
    assert page.locator('#sample-text').input_value() == '' and page.locator('#submit').is_disabled()


def navigation(page, out):
    first = automatic(page)
    page.locator('#automatic-tab').focus();page.locator('#automatic-tab').press('ArrowRight')
    page.wait_for_timeout(1100)
    assert page.locator('#interaction-area').is_visible()
    assert page.evaluate('globalThis.__batCheckReport.input.untrusted') == 0, 'keyboard_mode_switch_created_scripted_click'
    fill_sample(page);page.wait_for_timeout(1300)
    switched = []
    def late_receipt(route):
        response = route.fetch()
        if not switched:
            assert page.locator('#report').get_attribute('data-status') == 'running'
            page.locator('#automatic-tab').click();switched.append(True)
        route.fulfill(response=response)
    page.route('**/measurement/check/telemetry/**',late_receipt)
    try:
        page.locator('#submit').click()
        page.wait_for_timeout(500)
        result = page.evaluate('globalThis.__batCheckReport')
        assert switched and result['scope'] == 'automatic' and result['phase'] == 'complete'
        assert result['runId'] == first['runId'] and result['verdict'] == 'bot'
        assert not page.locator('#interaction-area').is_visible()
        save(out,'navigation.json',dict(keyboardNative=True,lateReceiptCannotSwitchMode=True,
            sameRun=True,positivePreserved=True,report=result))
    finally:
        page.unroute('**/measurement/check/telemetry/**',late_receipt)


def run(out, profile):
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(str(profile), channel='chrome', headless=True,
            viewport={'width':1440,'height':1020}, ignore_https_errors=False)
        try:
            page = context.pages[0]
            errors = [];page.on('pageerror',lambda error: errors.append(str(error)))
            if '--navigation-only' in sys.argv:
                navigation(page,out)
                assert not errors, errors
                return
            first = automatic(page);save(out,'automatic.json',first)
            page.screenshot(path=str(out/'bot.png'))
            interaction(page,out)
            excluded(page,out)
            page.set_viewport_size({'width':390,'height':844})
            page.emulate_media(reduced_motion='reduce')
            page.wait_for_function("globalThis.__batCheckReport?.phase === 'waiting_interaction'")
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(out/'mobile.png'))
            assert not errors, errors
            response = page.goto(URL)
            security = response.security_details()
            assert security and 'mkcert' in security['issuer']
            save(out,'result.json',dict(defaultChromeTLS=True, certificateIgnored=False,security=security,
                darkTheme=True,singlePageRows=39,explicitSubmitReceipt=True,nestedScroll=True,export=True,
                originalPasteExclusion=True,freshRestart=True,mobileFits=True,consoleErrors=errors))
        finally:
            context.close()
            save(out,'browser-closed.json',dict(closed=True,owner='shield-ui-acceptance',profile=str(profile)))


def main():
    if os.environ.get('BAT_RUN_OWNED_CHECK') != '1': raise ValueError('owned_website_gate_required')
    # Playwright 的 route.fetch 属于 Node 客户端，显式使用公开 CA；Chrome 仍走系统默认信任。
    os.environ['NODE_EXTRA_CA_CERTS'] = str(BASE/'tls/rootCA.pem')
    out = Path(tempfile.mkdtemp(prefix='check-ui-',dir=BASE/'reports')).resolve()
    profile = out/'profile'
    print(json.dumps({'evidence':str(out)}),flush=True)
    try:
        run(out,profile)
        print(json.dumps({'passed':True,'evidence':str(out)}),flush=True)
    except Exception as error:
        save(out,'failure.json',dict(type=type(error).__name__,error=str(error)[:300]));raise
    finally:
        assert profile.parent == out and out.parent == (BASE/'reports').resolve()
        assert not any(p.is_symlink() or p.is_junction() for p in [profile,*profile.rglob('*')])
        for process in psutil.process_iter(['cmdline']):
            try:
                assert not any(str(profile) in arg for arg in (process.info['cmdline'] or [])), 'owned_profile_still_running'
            except (psutil.NoSuchProcess,psutil.AccessDenied): pass
        if profile.exists(): shutil.rmtree(profile)
        save(out,'profile-deleted.json',dict(permanentlyDeleted=not profile.exists()))


if __name__ == '__main__': main()
