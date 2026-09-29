"""Live document identity distinguishes stale URL metadata from stale model decisions."""
import unittest
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from tempfile import TemporaryDirectory
from threading import Thread
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from browser_use import Browser, BrowserProfile
from browser_use.tools.views import ScrollAction

from tests.test_author_callback_stop import setup_callbacks
from workflow_use.hybrid.author import normalize_author_action
from workflow_use.hybrid.action_dispatch import ActionDispatchAudit
from workflow_use.hybrid.author_callbacks import AuthorCaptureStopped
from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.evidence import EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.observation_scope import (
    ObservationRefreshRequired, SourceObservationScope, live_document_sample, summary_document_digest,
)
from workflow_use.hybrid.navigation import navigation_tab_ids, reconcile_new_navigation_tab
from workflow_use.hybrid.snapshot_consistency import (
    ObservationUrlChanged, capture_consistent_post_snapshot, _RetryPolicy,
)


def summary(url, backend=11):
    html = SimpleNamespace(node_name='HTML', backend_node_id=backend, target_id='tab-1', parent_node=None)
    document = SimpleNamespace(node_name='#document', children_nodes=[html], parent_node=None)
    html.parent_node = document
    return SimpleNamespace(url=url, tabs=[SimpleNamespace(target_id='tab-1', url=url)],
        dom_state=SimpleNamespace(_root=SimpleNamespace(original_node=document), selector_map={1: html}))


def setup_scope(url='https://example.test/current?private=value'):
    collector, agent, callbacks, _model, _events = setup_callbacks()
    agent.state.n_steps = 1
    page = SimpleNamespace(get_target_info=AsyncMock(return_value={'targetId': 'tab-1', 'url': url}),
        get_elements_by_css_selector=AsyncMock(return_value=[SimpleNamespace(
            get_basic_info=AsyncMock(return_value={'backendNodeId': 11}))]))
    browser = SimpleNamespace(id='test-browser', agent_focus_target_id='tab-1', get_current_page=AsyncMock(return_value=page),
        get_browser_state_summary=AsyncMock(return_value=summary(url)))
    native_dom = SimpleNamespace(getDocument=AsyncMock(return_value={'root': {'children': [
        {'nodeName': 'HTML', 'nodeType': 1, 'backendNodeId': 11}]}}))
    session = SimpleNamespace(session_id='session-1', cdp_client=SimpleNamespace(send=SimpleNamespace(DOM=native_dom)))
    browser.get_or_create_cdp_session = AsyncMock(return_value=session)
    return SourceObservationScope(browser, collector, callbacks), browser, page, callbacks


class ObservationScopeTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_model_index_keeps_native_retry_and_undispatched_audit(self):
        scope, browser, page, callbacks = setup_scope()
        browser.id = 'test-browser'
        observed = await scope.capture()
        audit = ActionDispatchAudit()
        collector = EvidenceCollector(browser, SimpleNamespace(), dispatch_audit=audit,
            put_evidence=lambda kind, value: EvidenceRef(ref=kind + '-' + digest(value), digest=digest(value)),
            redact_action=lambda value: value)
        collector.observation_scope = scope
        scope.collector = callbacks.collector = collector
        raw = {'click': {'index': 4771}}
        model = SimpleNamespace(action=[SimpleNamespace(model_dump=lambda **kwargs: raw)])

        with self.assertRaisesRegex(ObservationRefreshRequired, 'index'):
            await callbacks.before_action(observed, model, 1)
        await callbacks.after_step(callbacks.agent)

        self.assertFalse(callbacks.failed)
        callbacks.agent.stop.assert_not_called()
        self.assertEqual(collector.source_gaps, [])
        self.assertIsNone(collector.pending)
        self.assertIsNone(audit.active)
        self.assertFalse(audit.entries[(1, 0)]['entered'])
        self.assertFalse(audit.entries[(1, 0)]['resultReceived'])
        self.assertIs(await scope.verify_before_action(observed, 2, 1, 'click'), observed)

    async def test_post_diagnostics_keep_pending_step_and_safe_live_url_evidence(self):
        scope, browser, page, callbacks = setup_scope()
        browser.id = 'test-browser'
        callbacks.agent.state.n_steps = 2
        scope.collector.pending = {'nativeStep': 1}
        observed = await scope.capture_post()
        scope.record_live_url(observed, 'tab-1', 'https://example.test/changed?private=other')
        self.assertEqual([item['nativeStepNumber'] for item in scope.diagnostics], [1, 1])
        self.assertEqual(scope.diagnostics[-1]['outcome'], 'url_changed_before_observe')
        observation = SimpleNamespace(id='o-1', facts=[])
        imported = SimpleNamespace(records=[SimpleNamespace(preObservationRef='o-1')], observations=[observation])
        history = SimpleNamespace(history=[SimpleNamespace(metadata=SimpleNamespace(step_number=1),
            model_output=SimpleNamespace(action=[{}]))])
        scope.collector.value_fact = lambda kind, value: ObservationFact(id='fact-' + digest(value),
            kind=kind, value=value, sourceRefs=[EvidenceRef(ref='test', digest=digest(value))])
        scope.attach(imported, history)
        self.assertEqual([item.value['actionRef'] for item in observation.facts], ['a-0001', 'a-0001'])
        self.assertNotIn('private=', str(observation.facts))
        original = [item.model_copy(deep=True) for item in observation.facts]
        # WHY：在线 retain/snapshot/final 重复投影同一来源，不能累加旧诊断撑破传输上限。
        for _ in range(40):
            scope.attach(imported, history)
        self.assertEqual(observation.facts, original)
        observation.facts[0].value = {'changed': True}
        with self.assertRaisesRegex(ValueError, 'observation_diagnostic_conflict'):
            scope.attach(imported, history)

    async def test_stable_document_corrects_cached_url_before_model_observation(self):
        scope, browser, page, callbacks = setup_scope()
        original = browser.get_browser_state_summary
        original.return_value = summary('https://example.test/stale')
        scope.start()
        try:
            observed = await browser.get_browser_state_summary(cached=True)
            await scope.verify_before_action(observed, 1)
            self.assertEqual(observed.url, 'https://example.test/current?private=value')
            self.assertEqual(observed.tabs[0].url, observed.url)
            original.assert_awaited_once_with(include_screenshot=True, cached=False, include_recent_events=False)
            self.assertEqual(scope.diagnostics[0]['outcome'], 'cache_url_corrected')
            self.assertNotIn('private=value', str(scope.diagnostics))
            self.assertFalse(callbacks.failed)
        finally:
            scope.close()
        self.assertIs(browser.get_browser_state_summary, original)

    async def test_model_wait_url_or_document_change_is_rejected_without_refreshing_old_index(self):
        for changed in ('url', 'document'):
            scope, browser, page, callbacks = setup_scope()
            observed = await scope.capture()
            if changed == 'url':
                page.get_target_info.return_value = {'targetId': 'tab-1', 'url': 'https://example.test/next'}
            else:
                native_document(browser).return_value['root']['children'][0]['backendNodeId'] = 22
            with self.subTest(changed=changed), self.assertRaises(ObservationRefreshRequired):
                await scope.verify_before_action(observed, 1)
            self.assertEqual(browser.get_browser_state_summary.await_count, 1)
            self.assertEqual(scope.diagnostics[-1]['outcome'], 'changed_after_capture')

    async def test_navigation_during_capture_defers_to_native_retry_without_returning_mixed_observation(self):
        scope, browser, page, callbacks = setup_scope()
        old, new = {'targetId': 'tab-1', 'url': 'https://example.test/old'}, {
            'targetId': 'tab-1', 'url': 'https://example.test/new'}
        page.get_target_info.side_effect = [old, old, new, new]
        with self.assertRaises(ObservationRefreshRequired):
            await scope.capture()
        self.assertFalse(callbacks.failed)
        callbacks.agent.stop.assert_not_called()
        self.assertEqual(scope.collector.source_gaps, [])
        self.assertEqual(scope.stamps, [])

    async def test_capture_ownership_loss_still_stops_including_post_action(self):
        for change in ('tab', 'session'):
            scope, browser, page, callbacks = setup_scope()
            async def changed_summary(**kwargs):
                if change == 'tab':
                    browser.agent_focus_target_id = 'tab-2'
                    page.get_target_info.return_value = {'targetId': 'tab-2', 'url': 'https://example.test/new'}
                else:
                    browser.id = 'other-browser'
                return summary('https://example.test/current?private=value')
            scope.original.side_effect = changed_summary
            with self.subTest(change=change), self.assertRaises(AuthorCaptureStopped):
                await scope.capture_post()
            self.assertTrue(callbacks.failed)
            self.assertEqual(scope.stamps, [])

    async def test_post_action_navigation_remains_retryable_without_reusing_old_model_baseline(self):
        scope, browser, page, callbacks = setup_scope()
        old, new = {'targetId': 'tab-1', 'url': 'https://example.test/old'}, {
            'targetId': 'tab-1', 'url': 'https://example.test/new'}
        page.get_target_info.side_effect = [old, old, new, new]
        with self.assertRaises(ObservationUrlChanged):
            await scope.capture_post()
        self.assertFalse(callbacks.failed)


class ReadOnlyRefreshTests(unittest.IsolatedAsyncioTestCase):
    async def test_same_document_url_change_refreshes_read_once_without_changing_model_observation(self):
        for name in ('find_elements', 'search_page'):
            scope, browser, page, callbacks = setup_scope()
            observed = await scope.capture()
            old_url = observed.url
            new_url = 'https://example.test/current?private=new'
            page.get_target_info.return_value = {'targetId': 'tab-1', 'url': new_url}
            browser.get_browser_state_summary.return_value = summary(new_url)
            with self.subTest(name=name):
                refreshed = await scope.verify_before_action(observed, 1, action_name=name)
                self.assertIsNot(refreshed, observed)
                self.assertEqual(observed.url, old_url)
                self.assertEqual(refreshed.url, new_url)
                self.assertEqual(browser.get_browser_state_summary.await_count, 2)
                diagnostic = scope.diagnostics[-1]
                self.assertEqual(diagnostic['outcome'], 'readonly_observation_refreshed')
                self.assertEqual(diagnostic['baseline']['urlDigest'], digest(old_url))
                self.assertEqual(diagnostic['current']['urlDigest'], digest(new_url))
                self.assertFalse(callbacks.failed)

    async def test_indexed_actions_navigation_and_document_or_tab_changes_never_refresh(self):
        cases = [('click', 1, 'url'), ('navigate', None, 'url'), ('find_elements', 1, 'url'),
                 ('find_elements', None, 'document'), ('search_page', None, 'tab')]
        for name, index, change in cases:
            scope, browser, page, callbacks = setup_scope()
            observed = await scope.capture()
            page.get_target_info.return_value = {'targetId': 'tab-1', 'url': 'https://example.test/next'}
            if change == 'document':
                native_document(browser).return_value['root']['children'][0]['backendNodeId'] = 22
            if change == 'tab':
                page.get_target_info.return_value['targetId'] = browser.agent_focus_target_id = 'tab-2'
            expected = ((ObservationRefreshRequired, 'observation_refresh_required') if change != 'tab'
                        else (ValueError, 'observation_changed_after_capture'))
            with self.subTest(name=name, change=change), self.assertRaisesRegex(*expected):
                await scope.verify_before_action(observed, 1, index, name)
            self.assertEqual(browser.get_browser_state_summary.await_count, 1)

    async def test_change_during_or_immediately_before_refresh_is_rejected(self):
        for moment in ('during', 'before'):
            scope, browser, page, callbacks = setup_scope()
            observed = await scope.capture()
            new = {'targetId': 'tab-1', 'url': 'https://example.test/next'}
            last = {'targetId': 'tab-1', 'url': 'https://example.test/later'}
            page.get_target_info.side_effect = [new, new, *(new if moment == 'during' else last for _ in range(2)), last, last]
            browser.get_browser_state_summary.return_value = summary(last['url'] if moment == 'before' else new['url'])
            with self.subTest(moment=moment), self.assertRaises(ObservationRefreshRequired):
                await scope.verify_before_action(observed, 1, action_name='find_elements')
            self.assertEqual(browser.get_browser_state_summary.await_count, 2)

    async def test_collector_query_and_pre_observation_use_refreshed_scope(self):
        scope, browser, page, callbacks = setup_scope()
        observed = await scope.capture()
        old_url, new_url = observed.url, 'https://example.test/new'
        page.get_target_info.return_value = {'targetId': 'tab-1', 'url': new_url}
        page.get_url, page.get_title = AsyncMock(return_value=new_url), AsyncMock(return_value='Fixture')
        browser.get_browser_state_summary.return_value = summary(new_url)
        collector = EvidenceCollector(browser, SimpleNamespace(),
            put_evidence=lambda kind, value: EvidenceRef(ref=kind + '-' + digest(value), digest=digest(value)),
            redact_action=lambda value: value)
        collector.observation_scope, scope.collector = scope, collector
        raw = {'find_elements': {'selector': 'a', 'attributes': ['href']}}
        model_output = SimpleNamespace(action=[SimpleNamespace(model_dump=lambda **kwargs: raw)])
        await collector.before_action(observed, model_output, 1)
        self.assertEqual(collector.pending['sourceUrl'], new_url)
        self.assertEqual(collector.pending['queryEvidence'].scope.urlDigest, digest(new_url))
        pre = next(item for item in collector.observations if item.id == collector.pending['pre'])
        self.assertEqual(pre.url, new_url)
        self.assertEqual(next(fact.value for fact in pre.facts if fact.kind == 'url_digest'), digest(new_url))
        self.assertEqual(observed.url, old_url)
        self.assertIs(collector.pending['action'], raw)
        self.assertEqual(browser.get_browser_state_summary.await_count, 2)
        identity = {'targetId': 'tab-1', 'documentDigest': digest({'targetId': 'tab-1', 'htmlBackendNodeId': 11})}
        self.assertEqual(next(fact.value for fact in pre.facts if fact.kind == 'document_identity'), identity)
        post = await collector.observe(await scope.capture_post(), [])
        self.assertEqual(next(fact.value for fact in post.facts if fact.kind == 'document_identity'), identity)


def native_document(browser):
    return browser.get_or_create_cdp_session.return_value.cdp_client.send.DOM.getDocument


class PooledDocumentSamplingTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_viewport_scroll_zero_is_captured_without_a_dom_target(self):
        scope, browser, page, callbacks = setup_scope()
        observed = await scope.capture()
        page.get_url, page.get_title = AsyncMock(return_value=observed.url), AsyncMock(return_value='Fixture')
        page.evaluate = AsyncMock(return_value='{"x":0,"y":0}')
        collector = EvidenceCollector(browser, SimpleNamespace(),
            put_evidence=lambda kind, value: EvidenceRef(ref=kind + '-' + digest(value), digest=digest(value)),
            redact_action=lambda value: value)
        collector.observation_scope, scope.collector = scope, collector
        scroll = ScrollAction(index=0, down=True, pages=0.5)
        normalize_author_action(SimpleNamespace(scroll=scroll))
        raw = {'scroll': scroll.model_dump(exclude_unset=True)}
        model = SimpleNamespace(action=[SimpleNamespace(model_dump=lambda **kwargs: raw)])
        await collector.before_action(observed, model, 1)
        self.assertIsNone(collector.pending['targetRef'])
        self.assertIsNone(collector.pending['action']['scroll']['index'])
        self.assertTrue(any(fact.kind == 'scroll_position' for fact in collector.observations[0].facts))
        indexed = ScrollAction(index=12)
        normalize_author_action(SimpleNamespace(scroll=indexed))
        self.assertEqual(indexed.index, 12)

    async def test_document_identity_uses_existing_native_session_and_one_root_read(self):
        scope, browser, page, callbacks = setup_scope()
        result = await live_document_sample(browser)
        self.assertEqual(result['documentDigest'], digest({'targetId': 'tab-1', 'htmlBackendNodeId': 11}))
        browser.get_or_create_cdp_session.assert_awaited_once_with(target_id='tab-1', focus=False)
        native_document(browser).assert_awaited_once_with({'depth': 1}, session_id='session-1')
        page.get_elements_by_css_selector.assert_not_awaited()

    async def test_unknown_root_or_session_failure_remains_fatal_and_safe(self):
        for stage in ('document_root', 'document_session'):
            scope, browser, page, callbacks = setup_scope()
            operation = native_document(browser) if stage == 'document_root' else browser.get_or_create_cdp_session
            operation.side_effect = RuntimeError('unavailable https://example.test/?private=secret')
            with self.subTest(stage=stage), self.assertRaises(AuthorCaptureStopped):
                await scope.capture_post()
            self.assertTrue(callbacks.failed)
            self.assertEqual(scope.stamps, [])
            self.assertEqual(scope.diagnostics[-1]['errorStage'], stage)
            self.assertEqual(scope.diagnostics[-1]['errorCode'], 'document_read_failed')
            self.assertNotIn('private=secret', str(scope.diagnostics))


class FixtureHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/delayed':
            time.sleep(0.1)
        body = b'<!doctype html><html><body><a id="go" target="_blank" href="/opened">Continue</a><p>Fixture</p></body></html>'
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


class PublicBrowserObservationTests(unittest.IsolatedAsyncioTestCase):
    async def test_pooled_root_read_handles_new_tab_transition_without_temporary_node_queries(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), FixtureHandler)
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        browser = scope = None
        with TemporaryDirectory(prefix='bat-native-document-') as directory:
            try:
                browser = Browser(browser_profile=BrowserProfile(headless=True, use_cloud=False, keep_alive=False,
                    user_data_dir=directory, enable_default_extensions=False))
                await browser.start()
                page = await browser.get_current_page()
                await page.goto(f'http://127.0.0.1:{server.server_port}/start')
                before_tabs = await navigation_tab_ids(browser)
                link = (await page.get_elements_by_css_selector('#go'))[0]
                with patch.object(link, 'click', wraps=link.click) as click_action:
                    await link.click()
                await reconcile_new_navigation_tab(browser, before_tabs)
                destination = await browser.get_current_page()
                collector, _agent, callbacks, _model, _events = setup_callbacks()
                scope = SourceObservationScope(browser, collector, callbacks)
                session = await browser.get_or_create_cdp_session(target_id=browser.agent_focus_target_id, focus=False)
                dom = session.cdp_client.send.DOM
                attach = browser.cdp_client.send.Target.attachToTarget
                with patch.object(dom, 'getDocument', wraps=dom.getDocument) as root_read, \
                        patch.object(dom, 'querySelectorAll', side_effect=AssertionError('unexpected_node_query')), \
                        patch.object(browser.cdp_client.send.Target, 'attachToTarget', wraps=attach) as attach_call:
                    identity = await live_document_sample(browser)
                root_read.assert_awaited_once_with({'depth': 1}, session_id=session.session_id)
                attach_call.assert_not_awaited()
                self.assertIsNotNone(identity['documentDigest'])
                read_document, transitions = dom.getDocument, []
                async def transition_during_read(params=None, session_id=None):
                    document = await read_document(params, session_id=session_id)
                    if not transitions:
                        transitions.append(True)
                        await destination.goto(f'http://127.0.0.1:{server.server_port}/delayed')
                    return document
                with patch.object(dom, 'getDocument', new=transition_during_read):
                    observed = await capture_consistent_post_snapshot(browser, [], [], AsyncMock(return_value=[]),
                        AsyncMock(side_effect=lambda summary, _facts, **kwargs: summary),
                        snapshot_reader=scope.capture_post, _policy=_RetryPolicy(5, 10, 0.05))
                click_action.assert_awaited_once()
                self.assertEqual(len(transitions), 1)
                self.assertEqual(observed.url, f'http://127.0.0.1:{server.server_port}/delayed')
                self.assertFalse(callbacks.failed)
                self.assertEqual(scope.diagnostics[0]['outcome'], 'changed_during_capture')
                self.assertEqual(scope.diagnostics[-1]['outcome'], 'consistent')
                self.assertEqual(summary_document_digest(observed, browser.agent_focus_target_id),
                                 (await live_document_sample(browser))['documentDigest'])
            finally:
                if scope is not None:
                    scope.close()
                if browser is not None:
                    await browser.kill()
                server.shutdown()
                server.server_close()
                worker.join(timeout=2)

    async def test_real_headless_summary_matches_live_html_and_new_document_is_rejected(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), FixtureHandler)
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        browser = None
        scope = None
        with TemporaryDirectory(prefix='bat-observation-fixture-') as directory:
            try:
                browser = Browser(browser_profile=BrowserProfile(headless=True, use_cloud=False, keep_alive=False,
                    user_data_dir=directory, enable_default_extensions=False))
                await browser.start()
                page = await browser.get_current_page()
                collector, _agent, callbacks, _model, _events = setup_callbacks()
                scope = SourceObservationScope(browser, collector, callbacks)
                scope.start()
                blank = await browser.get_browser_state_summary(include_screenshot=False)
                self.assertEqual(blank.url, 'about:blank')
                await scope.verify_before_action(blank, 1)
                with self.assertRaisesRegex(ObservationRefreshRequired, 'target index'):
                    await scope.verify_before_action(blank, 1, 77)
                await page.goto(f'http://127.0.0.1:{server.server_port}/first')
                observed = await browser.get_browser_state_summary(include_screenshot=False)
                sample = await live_document_sample(browser)
                self.assertIsNotNone(sample['documentDigest'])
                self.assertEqual(summary_document_digest(observed, sample['targetId']), sample['documentDigest'])
                await scope.verify_before_action(observed, 1)
                await page.goto(f'http://127.0.0.1:{server.server_port}/second')
                with self.assertRaises(ObservationRefreshRequired):
                    await scope.verify_before_action(observed, 1)
            finally:
                if scope is not None:
                    scope.close()
                if browser is not None:
                    await browser.kill()
                server.shutdown()
                server.server_close()
                worker.join(timeout=2)


if __name__ == '__main__':
    unittest.main()
