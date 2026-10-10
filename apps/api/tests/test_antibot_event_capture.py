"""Local headless regression: event evidence survives without page-global instrumentation.

This tests the shared capture component, not the user's daily browser or a human baseline.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import psutil
from browser_use import BrowserProfile
from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog
from workflow_use.hybrid.native_event_capture import NativeEventCapture

sys.path.insert(0, str(Path(__file__).parent / 'antibot-m0'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'python'))
from browser import endpoint, close_owned, save
from browser_use_runner.task_browser import TaskBrowser as Browser

ROOT = Path.cwd().resolve()
BUNDLE = ROOT / 'work/antibot-m0/artifact/package/dist/fpScanner.es.js'
PAGE = b'''<!doctype html><meta charset="utf-8">
<button id="choose" onclick="this.dataset.done='yes'">Choose</button>
<button id="delegated">Delegated</button>
<input id="entry"><div id="shadow"></div>
<script>document.addEventListener('click', event => {
  if (event.target.id !== 'delegated') return;
  event.target.dataset.done = 'yes';
  event.stopImmediatePropagation();
}, true);
document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML =
  '<button id="shadow-button">Inside</button>';</script>'''


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = BUNDLE.read_bytes() if self.path == '/probe.js' else PAGE
        if self.path == '/':
            body += b'<iframe src="/frame"></iframe>'
            body += f'<iframe src="http://localhost:{self.server.server_port}/cross"></iframe>'.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript' if self.path == '/probe.js' else 'text/html')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


@unittest.skipUnless(os.environ.get('BAT_CAPTURE_HEADLESS_TEST') == '1', 'explicit headless component test')
class CaptureIsolationTest(unittest.IsolatedAsyncioTestCase):
    async def test_real_events_navigation_and_probe(self):
        self.assertEqual(hashlib.sha256(BUNDLE.read_bytes()).hexdigest(),
                         '75abba497a00625ed053ce7a0bc9353fa5d5c9859cc67438141fe83d8d0946b2')
        parent = ROOT / 'work/antibot-m0'
        directory = Path(tempfile.mkdtemp(prefix='capture-', dir=parent)).resolve()
        self.evidence_directory = directory
        profile = directory / 'profile'
        profile.mkdir()
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f'http://127.0.0.1:{server.server_port}/'
        executable = LocalBrowserWatchdog._find_installed_browser_path('chrome')
        owner = subprocess.Popen([str(executable), '--headless=new', '--remote-debugging-port=0',
            '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + str(profile),
            '--no-first-run', '--no-default-browser-check', '--window-size=1100,850', url],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        started = psutil.Process(owner.pid).create_time()
        receipt = {'ownerPid': owner.pid, 'ownerStarted': started, 'profile': str(profile),
                   'headless': True, 'closed': False, 'purpose': 'capture_component'}
        save(directory, 'owner.json', receipt)
        browser, capture = None, None
        try:
            cdp = await endpoint(profile, owner)
            browser = Browser(browser_profile=BrowserProfile(cdp_url=cdp, is_local=False,
                keep_alive=True, enable_default_extensions=False), cdp_url=cdp, is_local=False)
            await browser.start()
            capture = NativeEventCapture(browser)
            facts = await self.exercise(browser, capture, url)
            save(directory, 'result.json', facts)
            print(json.dumps({'directory': str(directory), **facts}), flush=True)
            self.assertEqual(facts['mainWorldCaptureKeys'], [])
            self.assertIs(facts['cdp'], False)
            self.assertTrue(facts['frameIdentity'])
        finally:
            try:
                if capture is not None:
                    await capture.close()
                if browser is not None:
                    await browser.stop()
            finally:
                receipt['closed'] = close_owned(owner.pid, started, profile)
                if receipt['closed']:
                    owner.wait(timeout=5)
                save(directory, 'closed.json', receipt)
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)
                self.assertTrue(receipt['closed'])
                self.assertEqual(profile.resolve().parent, directory)
                self.assertTrue(directory.is_relative_to(parent))
                self.assertFalse(any(item.is_symlink() or item.is_junction()
                                     for item in [profile, *profile.rglob('*')]))
                shutil.rmtree(profile)
                save(directory, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})

    async def exercise(self, browser, capture, url):
        page = await browser.get_current_page()
        await self.delegated_click(browser, page, capture)
        target = (await page.get_elements_by_css_selector('#choose'))[0]
        await capture.arm('click', element=target)
        await target.click()
        click = await capture.complete()
        self.assert_event(click, 'click', 'choose')
        self.assertEqual(await target.get_attribute('data-done'), 'yes')
        entry = (await page.get_elements_by_css_selector('#entry'))[0]
        await capture.arm('input', element=entry)
        await entry.fill('local example')
        typed = await capture.complete()
        self.assert_event(typed, 'input', 'entry')
        additional = await self.frame_and_shadow(browser, page, capture)
        await page.goto(url + 'next')
        target = (await page.get_elements_by_css_selector('#choose'))[0]
        await capture.arm('click', element=target)
        await target.click()
        after_navigation = await capture.complete()
        self.assert_event(after_navigation, 'click', 'choose')
        self.assertNotEqual(click['events'][0]['documentId'], after_navigation['events'][0]['documentId'])
        keys = json.loads(await page.evaluate("() => Object.getOwnPropertyNames(globalThis).filter(k => k.startsWith('__bat_native_event_'))"))
        cdp = json.loads(await page.evaluate("""() => (async () => {
          const {default: Scanner} = await import('/probe.js');
          const fingerprint = await new Scanner().collectFingerprint({encrypt:false});
          return {cdp: fingerprint.signals.automation.cdp};
        })()"""))['cdp']
        # The prior navigation destroyed the OOPIF session; verify the remaining live document's worlds.
        current_session = await page.session_id
        contexts = [key for key in capture.contexts if key[0] == current_session]
        self.assertTrue(contexts)
        await capture.close()
        for session_id, context_id in contexts:
            released = await browser.cdp_client.send.Runtime.evaluate(params={'expression':
                f'[typeof globalThis[{json.dumps(capture.state_key)}], typeof globalThis[{json.dumps(capture.binding)}]]',
                'contextId': context_id, 'returnByValue': True}, session_id=session_id)
            self.assertEqual(released['result']['value'], ['undefined', 'undefined'])
        return {'mainWorldCaptureKeys': keys, 'cdp': cdp, 'click': True, 'input': True,
                'delegatedClick': True,
                'navigation': True, 'frameIdentity': all(event['scope']['frameId']
                    for result in [click, typed, after_navigation] for event in result['events']),
                **additional, 'bridgeReleased': True, 'modelCalls': 0, 'scope': 'headless component only'}

    async def delegated_click(self, browser, page, capture):
        target = (await page.get_elements_by_css_selector('#delegated'))[0]
        await capture.arm('click', element=target)
        await target.click()
        result = await capture.complete()
        done = await target.get_attribute('data-done') == 'yes'
        save(self.evidence_directory, 'delegated-click.json', {'businessCompleted': done,
            'captureStatus': result['status'], 'eventCount': len(result['events']),
            'trustedEvents': sum(event['event']['isTrusted'] is True for event in result['events'])})
        self.assertTrue(done)
        self.assert_event(result, 'click', 'delegated')
        from workflow_use.hybrid.capability import OrdinaryCapability
        capability = OrdinaryCapability(browser)
        capability.event_capture = capture
        await target.evaluate("() => { this.dataset.done = 'no'; }")
        replay = await capability.execute_checked('click', {}, {'strategy': 'css', 'value': '#delegated'}, [])
        self.assertEqual(await target.get_attribute('data-done'), 'yes')
        self.assertEqual(replay['metadata']['batActionPreparation']['eventCount'], 1)
        save(self.evidence_directory, 'delegated-replay.json', {'businessCompleted': True,
            'capturedEvents': replay['metadata']['batActionPreparation']['eventCount'], 'modelCalls': 0})

    async def frame_and_shadow(self, browser, page, capture):
        session = await browser.get_or_create_cdp_session(focus=False)
        client = browser.cdp_client
        expressions = [("document.querySelector('iframe').contentDocument.querySelector('#choose')", 'choose'),
                       ("document.querySelector('#shadow').shadowRoot.querySelector('button')", 'shadow-button')]
        for expression, expected_id in expressions:
            remote = await client.send.Runtime.evaluate(params={'expression': expression}, session_id=session.session_id)
            object_id = remote['result']['objectId']
            try:
                node = await client.send.DOM.describeNode(params={'objectId': object_id}, session_id=session.session_id)
                element = await page.get_element(node['node']['backendNodeId'])
            finally:
                await client.send.Runtime.releaseObject(params={'objectId': object_id}, session_id=session.session_id)
            await capture.arm('click', element=element)
            await element.click()
            result = await capture.complete()
            self.assert_event(result, 'click', expected_id)
            self.assertTrue(all(event['scope']['frameId'] for event in result['events']))
        frames, _sessions = await browser.get_all_frames()
        cross = next(frame for frame in frames.values() if '/cross' in frame.get('url', ''))
        from browser_use.actor.page import Page
        target_id = cross['frameTargetId']
        self.assertNotEqual(target_id, browser.agent_focus_target_id)
        session = await browser.get_or_create_cdp_session(target_id=target_id, focus=False)
        cross_page = Page(browser, target_id, session_id=session.session_id)
        element = (await cross_page.get_elements_by_css_selector('#choose'))[0]
        await capture.arm('click', element=element)
        await element.click()
        result = await capture.complete()
        self.assert_event(result, 'click', 'choose')
        self.assertEqual(result['events'][-1]['scope']['targetId'], target_id)
        # Idle/close is checked in the actual worlds, not inferred from the Python active flag.
        frames, _sessions = await browser.get_all_frames()
        live_targets = {str(frame.get('frameTargetId')) for frame in frames.values()}
        for session_id, context_id in capture.contexts:
            # 导航已销毁的iframe没有活动监听；只校验仍存在的真实document，不能向旧session发查询。
            if capture.sessions.get(session_id, {}).get('targetId') not in live_targets:
                continue
            state = await client.send.Runtime.evaluate(params={'expression':
                f'globalThis[{json.dumps(capture.state_key)}].enabled', 'contextId': context_id,
                'returnByValue': True}, session_id=session_id)
            self.assertIs(state['result']['value'], False)
        return {'iframe': True, 'oopif': True, 'shadow': True, 'idleCaptureDisabled': True}

    def assert_event(self, capture, event_type, element_id):
        self.assertEqual(capture['status'], 'captured', capture.get('limitations'))
        events = [event for event in capture['events'] if event['event']['type'] == event_type]
        self.assertTrue(events)
        event = events[-1]
        self.assertTrue(event['event']['isTrusted'])
        self.assertIn(event['graph']['intentRelation'], ['self', 'descendant', 'composed'])
        self.assertTrue(any(node['attributes'].get('id') == element_id for node in event['graph']['nodes']))


if __name__ == '__main__':
    unittest.main()
