"""C interaction contract: prepare once, dispatch once, then retry only declared facts."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from browser_use.agent.views import ActionResult

from workflow_use.hybrid.capability import OrdinaryCapability, navigation_tab_ids, reconcile_new_navigation_tab
from workflow_use.hybrid.postconditions import PostconditionNotMet, SettlePolicy
from workflow_use.hybrid.target_preparation import (
    assert_action_target,
    prepare_mapped_target,
    verify_event_target,
)


READY = {'connected': True, 'visible': True, 'inView': True, 'hitRelation': 'self',
         'disabled': False, 'readOnly': False, 'pointerBlocked': False,
         'scrollContainer': {'tag': 'window', 'id': None, 'scrollTop': 0, 'scrollLeft': 0}}


class FakeElement:
    def __init__(self, backend, preparation):
        self.backend = backend
        self.preparation = preparation
        self.scrolls = 0

    async def evaluate(self, script):
        if 'scrollIntoView' in script:
            self.scrolls += 1
            return None
        return json.dumps(self.preparation)

    async def get_basic_info(self):
        return {'backendNodeId': self.backend}


class FakePage:
    def __init__(self, elements):
        self.elements = elements

    async def get_target_info(self):
        return {'targetId': 'tab-1'}

    async def get_elements_by_css_selector(self, selector):
        return [object()] if selector == 'html' else []

    async def get_element(self, backend):
        return self.elements[backend]


class PreparationTests(unittest.IsolatedAsyncioTestCase):
    async def test_click_navigation_focuses_the_single_new_tab_before_postcondition_checks(self):
        tab = lambda target_id, url: SimpleNamespace(target_id=target_id, url=url)
        browser = SimpleNamespace(
            agent_focus_target_id='old',
            get_current_page=AsyncMock(return_value=SimpleNamespace(
                get_url=AsyncMock(side_effect=['about:blank', 'https://example.test/result']))),
            get_tabs=AsyncMock(side_effect=[
                [tab('old', 'https://example.test/start')],
                [tab('old', 'https://example.test/start'), tab('new', 'about:blank')],
                [tab('old', 'https://example.test/start'), tab('new', 'https://example.test/result')],
            ]),
            on_SwitchTabEvent=AsyncMock())
        browser.on_SwitchTabEvent.side_effect = lambda event: setattr(browser, 'agent_focus_target_id', event.target_id)

        before = await navigation_tab_ids(browser)
        await reconcile_new_navigation_tab(browser, before, attempts=2, interval=0)

        event = browser.on_SwitchTabEvent.await_args.args[0]
        self.assertEqual(event.target_id, 'new')

    async def test_click_navigation_rejects_a_tab_that_stays_about_blank(self):
        tab = lambda target_id, url: SimpleNamespace(target_id=target_id, url=url)
        browser = SimpleNamespace(
            agent_focus_target_id='old',
            get_current_page=AsyncMock(return_value=SimpleNamespace(get_url=AsyncMock(return_value='about:blank'))),
            get_tabs=AsyncMock(side_effect=[
                [tab('old', 'https://example.test/start')],
                [tab('old', 'https://example.test/start'), tab('new', 'about:blank')],
                [tab('old', 'https://example.test/start'), tab('new', 'about:blank')],
            ]),
            on_SwitchTabEvent=AsyncMock())
        browser.on_SwitchTabEvent.side_effect = lambda event: setattr(browser, 'agent_focus_target_id', event.target_id)

        before = await navigation_tab_ids(browser)
        with self.assertRaisesRegex(ValueError, 'new_navigation_tab_not_ready'):
            await reconcile_new_navigation_tab(browser, before, attempts=2, interval=0)
        browser.on_SwitchTabEvent.assert_awaited_once()

    async def test_offscreen_target_scrolls_then_rebinds_before_dispatch(self):
        before = FakeElement(11, {**READY, 'inView': False, 'hitRelation': 'outside'})
        after = FakeElement(22, {**READY, 'hitRelation': 'descendant'})
        page = FakePage({11: before, 22: after})
        node = lambda backend, index: {index: {'backendNodeId': backend, 'target_id': 'tab-1',
                                               'frame_id': None, 'shadow_root_type': None}}
        resolver = SimpleNamespace(
            _assert_page_identity=AsyncMock(),
            _refresh_snapshot=AsyncMock(return_value=(page, node(22, 2))),
            _resolve_index=AsyncMock(return_value=2),
        )

        prepared = await prepare_mapped_target(
            resolver, {'strategy': 'css', 'value': '#target'}, 'click', page,
            node(11, 1), 'tab-1', 1, False)

        self.assertEqual(before.scrolls, 1)
        self.assertEqual((prepared.index, prepared.backend_id, prepared.scrolled), (2, 22, True))
        self.assertEqual(prepared.hit_relation, 'descendant')

    async def test_document_replacement_is_relocated_within_the_preparation_budget(self):
        capability = OrdinaryCapability.__new__(OrdinaryCapability)
        capability.target_settle = SettlePolicy(maxMs=200, maxAttempts=3, intervalMs=10)
        prepared = SimpleNamespace(index=7)
        capability.targets = SimpleNamespace(prepare_action_target=AsyncMock(
            side_effect=[ValueError('target_document_changed'), prepared]))

        result = await capability.resolve_target({'strategy': 'history'}, action_name='click')

        self.assertIs(result, prepared)
        self.assertEqual(capability.targets.prepare_action_target.await_count, 2)

    async def test_settle_retries_facts_without_redispatching_the_action(self):
        capability = OrdinaryCapability.__new__(OrdinaryCapability)
        capability.browser = object()
        capability.execute = AsyncMock(return_value=ActionResult())
        condition = {'kind': 'url', 'equals': 'https://example.test/ready',
                     'settle': {'maxMs': 1000, 'maxAttempts': 5, 'intervalMs': 10}}
        with patch('workflow_use.hybrid.postconditions.verify_once', new=AsyncMock(
                side_effect=[PostconditionNotMet('not-ready'), PostconditionNotMet('not-ready'), None])) as verify:
            await capability.execute_checked('navigate', {'url': 'https://example.test/ready'}, None, [condition])

        capability.execute.assert_awaited_once()
        self.assertEqual(verify.await_count, 3)


class HitContractTests(unittest.TestCase):
    def test_hidden_disabled_or_covered_targets_are_rejected_before_dispatch(self):
        for update, reason in [({'visible': False}, 'target_not_visible'),
                               ({'disabled': True}, 'target_disabled'),
                               ({'hitRelation': 'outside'}, 'target_hit_blocked')]:
            with self.subTest(reason=reason), self.assertRaisesRegex(ValueError, reason):
                assert_action_target({**READY, **update}, 'click')

    def test_captured_event_must_hit_the_intended_target_or_its_child(self):
        event = lambda relation: {'graph': {'intentRelation': relation}}
        self.assertEqual(verify_event_target({'status': 'captured', 'events': [event('descendant')]}), 1)
        with self.assertRaisesRegex(RuntimeError, 'ordinary_event_target_mismatch'):
            verify_event_target({'status': 'captured', 'events': [event('outside')]})


if __name__ == '__main__':
    unittest.main()
