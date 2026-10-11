"""Native navigation health reads are not model observations or pre-action authorization."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from workflow_use.hybrid.action_dispatch import ActionDispatchAudit, bind_tools_act
from workflow_use.hybrid.author_callbacks import AuthorCaptureCallbacks, AuthorCaptureStopped
from workflow_use.hybrid.observation_scope import ObservationRefreshRequired, SourceObservationScope


class NavigationHealthObservationTests(unittest.IsolatedAsyncioTestCase):
    def make_scope(self):
        native = SimpleNamespace(url='https://entry.invalid/', tabs=[],
                                 dom_state=SimpleNamespace(selector_map={}))
        browser = SimpleNamespace(id='browser', agent_focus_target_id='tab',
            get_browser_state_summary=AsyncMock(return_value=native),
            event_bus=SimpleNamespace(event_history={}))
        audit = ActionDispatchAudit()
        collector = SimpleNamespace(pending=None, source_gaps=[], dispatch_audit=audit)
        callbacks = AuthorCaptureCallbacks(collector, lambda: None, normalize_action=lambda x: x,
            action_outcomes={}, reject_navigation_scope=lambda x: None)
        callbacks.bind(SimpleNamespace(stop=Mock()))
        scope = SourceObservationScope(browser, collector, callbacks)
        before = {'url': native.url, 'targetId': 'tab', 'documentDigest': 'one', 'stable': True}
        after = {**before, 'url': 'https://landed.invalid/', 'documentDigest': 'two'}
        return scope, audit, native, before, after

    async def test_native_navigation_health_read_does_not_turn_dispatched_success_into_failure(self):
        scope, audit, native, before, after = self.make_scope()
        action = {'navigate': {'url': before['url']}}
        audit.propose(1, 0, action)
        async def native_act(*args, **kwargs):
            self.assertIs(await scope.browser.get_browser_state_summary(include_screenshot=False), native)
            return SimpleNamespace(error=None, model_dump=lambda **kwargs: {'error': None})
        tools = SimpleNamespace(act=native_act)
        restore = bind_tools_act(tools, audit)
        scope.start()
        try:
            with patch('workflow_use.hybrid.observation_scope.live_document_sample',
                       AsyncMock(side_effect=[before, after])) as sample:
                result = await tools.act(SimpleNamespace(model_dump=lambda **kwargs: action))
            self.assertIsNone(result.error)
            sample.assert_not_awaited()
            self.assertEqual(scope.stamps, [], 'native health data cannot authorize a later indexed action')
        finally:
            restore(); scope.close()

    async def test_proposed_navigation_input_and_completed_navigation_keep_observation_guard(self):
        for name, entered, completed in [('navigate', False, False), ('input', True, False),
                                          ('navigate', True, True)]:
            with self.subTest(name=name, entered=entered, completed=completed):
                scope, audit, _, before, after = self.make_scope()
                action = {name: {'url': before['url']} if name == 'navigate' else {'index': 1, 'text': 'value'}}
                audit.propose(1, 0, action)
                if entered:
                    await audit.enter(action)
                if completed:
                    await audit.complete(SimpleNamespace(model_dump=lambda **kwargs: {'error': None}))
                with patch('workflow_use.hybrid.observation_scope.live_document_sample',
                           AsyncMock(side_effect=[before, after])):
                    with self.assertRaises(ObservationRefreshRequired):
                        await scope.capture()

    async def test_native_navigation_still_preserves_security_denial(self):
        scope, audit, _, before, _ = self.make_scope()
        action = {'navigate': {'url': before['url']}}
        audit.propose(1, 0, action); await audit.enter(action)
        scope.browser.event_bus.event_history['denied'] = SimpleNamespace(error_type='NavigationBlocked')
        with self.assertRaisesRegex(AuthorCaptureStopped, 'hybrid_navigation_outside_authorized_scope'):
            await scope.capture()
        scope.original.assert_not_awaited()
