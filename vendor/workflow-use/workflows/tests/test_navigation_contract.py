"""Navigation ownership, live-page convergence and replay's single dispatch contract."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from browser_use.agent.views import ActionResult
from browser_use.tools.service import Tools

from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.evidence import EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.natural_compile import classify_natural_action, natural_postconditions
from workflow_use.hybrid.navigation import (
    cross_tab_navigation_allowed, reconcile_captured_navigation, reconcile_new_navigation_tab,
)
from workflow_use.hybrid.registry import ActionRegistry, action_effect


REF = EvidenceRef(ref='fixture:navigation', digest='1' * 64)


def tab(identity, url='about:blank'):
    return SimpleNamespace(target_id=identity, url=url)


def browser_with_tabs(tabs, url='https://example.test/results'):
    browser = SimpleNamespace(agent_focus_target_id='old', get_tabs=AsyncMock(return_value=tabs),
        get_current_page=AsyncMock(return_value=SimpleNamespace(get_url=AsyncMock(return_value=url))))
    browser.on_SwitchTabEvent = AsyncMock(
        side_effect=lambda event: setattr(browser, 'agent_focus_target_id', event.target_id))
    return browser


def observation(identity, url, tabs):
    facts = [ObservationFact(id='url-' + identity, kind='url_digest', value=digest(url), sourceRefs=[REF]),
        ObservationFact(id='context-' + identity, kind='browser_context', value={
            'tabs': [{'targetId': value} for value in tabs]}, sourceRefs=[REF])]
    return SimpleNamespace(id='o-' + identity, tabId=identity, url=url, facts=facts, sourceRefs=[REF])


class NavigationOwnershipTests(unittest.IsolatedAsyncioTestCase):
    async def test_cached_blank_tab_uses_live_url_and_switches_once(self):
        browser = browser_with_tabs([tab('old'), tab('new')])

        result = await reconcile_new_navigation_tab(browser, {'old'}, attempts=2, interval=0)

        self.assertEqual(result, 'new')
        browser.on_SwitchTabEvent.assert_awaited_once()
        self.assertEqual(browser.get_tabs.await_count, 1)

    async def test_multiple_created_tabs_are_rejected_without_choosing_a_tab(self):
        browser = browser_with_tabs([tab('old'), tab('new-1'), tab('new-2')])

        with self.assertRaisesRegex(ValueError, 'ambiguous_new_navigation_tab'):
            await reconcile_new_navigation_tab(browser, {'old'}, attempts=2, interval=0)

        browser.on_SwitchTabEvent.assert_not_awaited()

    async def test_existing_tabs_are_not_adopted_as_new_navigation(self):
        browser = browser_with_tabs([tab('old'), tab('existing')])

        result = await reconcile_new_navigation_tab(browser, {'old', 'existing'}, attempts=2, interval=0)

        self.assertIsNone(result)
        browser.on_SwitchTabEvent.assert_not_awaited()

    async def test_capture_uses_the_same_adapter_and_does_not_retry_failed_actions(self):
        browser = browser_with_tabs([tab('old'), tab('new')])
        collector = SimpleNamespace(browser=browser, pending={'navigationTabs': {'old'}})
        await reconcile_captured_navigation(collector, [ActionResult(error='failed')])
        browser.get_tabs.assert_not_awaited()

        await reconcile_captured_navigation(collector, [ActionResult()])

        self.assertEqual(browser.agent_focus_target_id, 'new')
        browser.on_SwitchTabEvent.assert_awaited_once()

    async def test_enter_dispatches_once_then_focuses_before_declared_readiness(self):
        browser = browser_with_tabs([tab('old')])
        capability = OrdinaryCapability.__new__(OrdinaryCapability)
        capability.browser = browser
        async def dispatch(*args, **kwargs):
            browser.get_tabs.return_value = [tab('old'), tab('new')]
            return ActionResult()
        capability.execute = AsyncMock(side_effect=dispatch)
        async def verify(*args):
            self.assertEqual(browser.agent_focus_target_id, 'new')
        condition = {'kind': 'url_digest', 'changed': True,
            'settle': {'maxMs': 1000, 'maxAttempts': 5, 'intervalMs': 10}}

        with patch('workflow_use.hybrid.capability.capture_check_baselines', new=AsyncMock()), \
                patch('workflow_use.hybrid.capability.verify_declared', new=AsyncMock(side_effect=verify)):
            await capability.execute_checked('send_keys', {'keys': 'Enter'}, None, [condition])

        capability.execute.assert_awaited_once()
        browser.on_SwitchTabEvent.assert_awaited_once()


class NavigationCompilationTests(unittest.TestCase):
    def test_enter_new_tab_compiles_with_constant_key_but_no_recorded_tab_identity(self):
        registry = ActionRegistry.from_tools(Tools())
        action = SimpleNamespace(id='a-0001', name='send_keys', args={'keys': 'Enter'},
            effect=action_effect('send_keys'), status='succeeded', resultRef=REF)
        pre = observation('old', 'https://example.test/start', ['old'])
        post = observation('new', 'https://example.test/results', ['old', 'new'])
        pre.facts.append(ObservationFact(id='key-binding', kind='natural_binding', value={
            'actionRef': action.id, 'argumentPath': 'keys', 'binding': {'source': 'constant', 'value': 'Enter'},
            'provenance': 'native_parameter'}, sourceRefs=[REF]))

        segment, _path, issues = classify_natural_action(
            SimpleNamespace(runtimeInputSchema={'type': 'null'}), registry, action, pre, post)

        self.assertEqual(issues, [])
        self.assertEqual(segment['operation']['actionName'], 'send_keys')
        self.assertEqual(segment['postconditions'][0]['changed'], True)
        self.assertNotIn('example.test', str(segment))
        self.assertNotIn('tabId', str(segment))

    def test_unproven_switch_or_close_is_never_discarded_as_navigation(self):
        pre = observation('old', 'https://example.test/start', ['old', 'existing'])
        post = observation('existing', 'https://example.test/result', ['old', 'existing'])
        for name in ('switch', 'close', 'click', 'send_keys'):
            with self.subTest(name=name):
                self.assertFalse(cross_tab_navigation_allowed(SimpleNamespace(name=name, args={}), pre, post))

    def test_cross_page_consumer_readiness_has_no_previous_page_transition_baseline(self):
        pre = observation('old', 'https://example.test/start', ['old'])
        post = observation('new', 'https://example.test/results', ['old', 'new'])
        consumer = {'condition': {'kind': 'read_fields', 'transition': True}, 'proofRefs': [REF]}

        conditions, _refs, issues = natural_postconditions(
            SimpleNamespace(id='a-0001', name='send_keys'), pre, post, None, [], consumer)

        self.assertEqual(issues, [])
        self.assertTrue(conditions[1]['ready'])
        self.assertNotIn('transition', conditions[1])


if __name__ == '__main__':
    unittest.main()
