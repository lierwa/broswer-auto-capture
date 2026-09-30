"""Focus is a physical effect, without rewriting legacy control-state contracts."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.natural_compile import natural_postconditions
from workflow_use.hybrid.natural_effects import read_page_effect, read_target_state
from workflow_use.hybrid.postconditions import read_check_value


def observation(value, identity):
    return SimpleNamespace(facts=[SimpleNamespace(id=identity, kind='focused_element',
        value=value, sourceRefs=[])])


class FocusEffectTests(unittest.IsolatedAsyncioTestCase):
    async def test_target_focus_is_opt_in_and_legacy_reader_stays_identical(self):
        element = SimpleNamespace(evaluate=AsyncMock(side_effect=[
            json.dumps({'connected': True, 'disabled': False}),
            json.dumps({'connected': True, 'disabled': False, 'focused': True}),
        ]))
        self.assertEqual(await read_target_state(element), '{"disabled":false}')
        self.assertEqual(await read_target_state(element, include_focus=True),
                         '{"disabled":false,"focused":true}')

    async def test_runtime_reads_focus_only_when_declared_by_the_saved_condition(self):
        for expected, body in (
            ('{"disabled":false}', {'connected': True, 'disabled': False}),
            ('{"disabled":false,"focused":true}',
             {'connected': True, 'disabled': False, 'focused': True})):
            element = SimpleNamespace(evaluate=AsyncMock(return_value=json.dumps(body)))
            self.assertEqual(await read_check_value({'kind': 'target_state', 'target': {},
                'expected': expected, '_retainedElement': element}, object()), expected)

    async def test_page_focus_uses_opaque_identity_not_page_text(self):
        element = SimpleNamespace(get_basic_info=AsyncMock(return_value={'backendNodeId': 42}))
        page = SimpleNamespace(get_target_info=AsyncMock(return_value={'targetId': 'tab-1'}),
                               get_elements_by_css_selector=AsyncMock(return_value=[element]))
        self.assertEqual(await read_page_effect('focused_element', page), digest([42]))
        page.get_elements_by_css_selector.assert_awaited_once_with(':focus')

    async def test_focus_identity_drift_or_missing_backend_never_publishes_a_digest(self):
        for backend, targets in ((None, ['tab-1', 'tab-1']), (42, ['tab-1', 'tab-2'])):
            element = SimpleNamespace(get_basic_info=AsyncMock(return_value={'backendNodeId': backend}))
            page = SimpleNamespace(get_target_info=AsyncMock(
                side_effect=[{'targetId': target} for target in targets]),
                get_elements_by_css_selector=AsyncMock(return_value=[element]))
            with self.assertRaisesRegex(ValueError, 'focused_element_identity_'):
                await read_page_effect('focused_element', page)

    async def test_focused_target_is_a_proven_control_state_even_if_already_focused(self):
        state = '{"disabled":false,"focused":true}'
        facts = [SimpleNamespace(id='focus', kind='target_state', value=state, sourceRefs=[])]
        action = SimpleNamespace(id='a-click', name='click')
        conditions, _, gaps = natural_postconditions(action, SimpleNamespace(facts=facts),
            SimpleNamespace(facts=facts), {'strategy': 'history'}, [])
        self.assertEqual(gaps, [])
        self.assertEqual(conditions[0]['equals'], state)

    async def test_keyboard_focus_change_is_proven_but_unchanged_focus_stays_a_gap(self):
        action = SimpleNamespace(id='a-key', name='send_keys')
        conditions, _, gaps = natural_postconditions(action,
            observation(digest([]), 'before'), observation(digest([42]), 'after'), None, [])
        self.assertEqual(gaps, [])
        self.assertEqual(conditions[0]['kind'], 'focused_element')
        self.assertTrue(conditions[0]['changed'])
        _, _, gaps = natural_postconditions(action,
            observation(digest([42]), 'before'), observation(digest([42]), 'after'), None, [])
        self.assertEqual(gaps[0].reason, 'natural_concrete_effect_missing')
