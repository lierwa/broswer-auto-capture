"""Protect same-URL state changes with bounded public field reads, not title guesses or model checks."""
import unittest
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use.tools.service import Tools
from browser_use.agent.views import ActionResult
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.compiler import proven_effect
from workflow_use.hybrid.completion import completion_conditions
from workflow_use.hybrid.evidence import EvidenceRef, NormalizedObservation, ObservationFact, digest
from workflow_use.hybrid.postconditions import capture_check_baselines, declared_checks, check_fact
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.request import RequirementClause


def specification(container='#control'):
    return {'container': container, 'fields': {'state': {'selector': 'button', 'attribute': 'aria-expanded', 'valueType': 'boolean'}},
            'maxItems': 1, 'maxInputBytes': 2048, 'outputSchema': {'type': 'array', 'maxItems': 1,
            'items': {'type': 'object', 'properties': {'state': {'type': 'boolean'}}, 'required': ['state'], 'additionalProperties': False}}}


class CompletionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.element = SimpleNamespace(evaluate=AsyncMock(return_value='<button aria-expanded="false">Filter</button>'),
                                      get_basic_info=AsyncMock(return_value={'backendNodeId': 10}))
        self.page = SimpleNamespace(get_elements_by_css_selector=AsyncMock(return_value=[self.element]),
                                    get_target_info=AsyncMock(return_value={'targetId': 'target-1'}))
        self.browser = SimpleNamespace(get_current_page=AsyncMock(return_value=self.page),
                         get_browser_state_summary=AsyncMock(), get_selector_map=AsyncMock(return_value={
                             7: {'backend_node_id': 10, 'target_id': 'target-1', 'frame_id': None}}))
        self.tools = Tools()
        self.tools.act = AsyncMock(return_value=ActionResult())
        self.registry = ActionRegistry.from_tools(self.tools)
        self.clause = RequirementClause(id='opened', kind='completion', expression={'selectionRef': 'filter',
                      'factKind': 'read_fields', 'read': specification(), 'equals': [{'state': True}]})
        self.condition = next(completion_conditions([self.clause], 'a-0001', ['filter']))

    async def test_legacy_compiler_matches_only_the_declared_read_fact(self):
        before = legacy_read_observation('o-0001', 0, self.condition['read'], [{'state': False}])
        after = legacy_read_observation('o-0002', 1, self.condition['read'], [{'state': True}])
        request = SimpleNamespace(requirement=SimpleNamespace(clauses=[self.clause]),
                  control=SimpleNamespace(selections=[SimpleNamespace(id='filter', actionRefs=['a-0001'])]))
        action = SimpleNamespace(id='a-0001', name='click', args={'index': 7})
        self.assertEqual(proven_effect(request, action, before, after), [self.condition])
        wrong = deepcopy(after)
        wrong.facts[0].value['specificationDigest'] = 'f' * 64
        self.assertEqual(proven_effect(request, action, before, wrong), [])
        self.assertEqual(proven_effect(request, action, after, after), [])

    async def test_step_verifier_uses_same_read_and_never_retries_a_failed_click(self):
        adapter = OrdinaryCapability(self.browser, self.tools)
        target = {'strategy': 'css', 'value': '#control'}
        with self.assertRaisesRegex(RuntimeError, 'ordinary_postcondition_failed'):
            await adapter.execute_checked('click', {}, target, [self.condition])
        self.tools.act.assert_awaited_once()
        self.element.evaluate.return_value = '<button aria-expanded="true">Filter</button>'
        await adapter.execute_checked('click', {}, target, [self.condition])
        self.assertEqual(self.tools.act.await_count, 2)
        self.assertIsNone(self.tools.act.await_args.kwargs['page_extraction_llm'])

    def test_unbounded_or_untyped_field_conditions_fail_before_execution(self):
        for change in ('unbounded', 'wrong_value', 'missing_read', 'unrelated_read'):
            value = deepcopy(self.condition)
            if change == 'unbounded': del value['read']['outputSchema']['maxItems']
            elif change == 'wrong_value': value['equals'] = [{'state': 'true'}]
            elif change == 'missing_read': del value['read']
            else: value['kind'] = 'title'
            with self.subTest(change=change), self.assertRaises(Exception):
                declared_checks([value], {}, None)

    async def test_tenacity_rechecks_only_the_fact_and_bounds_attempts(self):
        self.condition['settle'] = {'maxMs': 200, 'maxAttempts': 2, 'intervalMs': 10}
        self.element.evaluate.side_effect = ['<button aria-expanded="false"></button>', '<button aria-expanded="true"></button>']
        adapter = OrdinaryCapability(self.browser, self.tools)
        await adapter.execute_checked('click', {}, {'strategy': 'css', 'value': '#control'}, [self.condition])
        self.tools.act.assert_awaited_once()
        self.assertEqual(self.element.evaluate.await_count, 2)
        self.element.evaluate.side_effect = None
        with self.assertRaisesRegex(RuntimeError, 'ordinary_postcondition_failed'):
            await adapter.execute_checked('click', {}, {'strategy': 'css', 'value': '#control'}, [self.condition])
        self.assertEqual(self.tools.act.await_count, 2)
        self.assertEqual(self.element.evaluate.await_count, 4)

    async def test_slow_fact_is_cancelled_at_the_declared_deadline(self):
        async def slow(_expression):
            await asyncio.sleep(10)
        self.element.evaluate.side_effect = slow
        self.condition['settle'] = {'maxMs': 20, 'maxAttempts': 5, 'intervalMs': 10}
        with self.assertRaises(TimeoutError):
            await OrdinaryCapability(self.browser, self.tools).execute_checked('click', {},
                {'strategy': 'css', 'value': '#control'}, [self.condition])
        self.tools.act.assert_awaited_once()
        self.assertEqual(self.element.evaluate.await_count, 1)

    async def test_changed_uses_each_runs_baseline_and_never_retries_the_action(self):
        condition = {'kind': 'title', 'changed': True}
        self.page.get_title = AsyncMock(side_effect=['First', 'Second', 'Second', 'Third', 'Third', 'Third'])
        adapter = OrdinaryCapability(self.browser, self.tools)
        for _ in range(2):
            await adapter.execute_checked('click', {}, {'strategy': 'css', 'value': '#control'}, [condition])
        with self.assertRaisesRegex(RuntimeError, 'ordinary_postcondition_failed'):
            await adapter.execute_checked('click', {}, {'strategy': 'css', 'value': '#control'}, [condition])
        self.assertEqual(self.tools.act.await_count, 3)
        self.assertEqual(self.page.get_title.await_count, 6)

    async def test_url_digest_changed_reads_complete_url_before_and_after(self):
        self.page.get_url = AsyncMock(side_effect=[
            'https://fixture.invalid/list?filter=open',
            'https://fixture.invalid/list?filter=closed',
        ])
        checks = declared_checks([{'kind': 'url_digest', 'changed': True}], {}, None)

        await capture_check_baselines(self.browser, checks)
        self.assertEqual(checks[0].parameters['expected'],
                         digest('https://fixture.invalid/list?filter=open'))
        self.assertEqual(await check_fact(checks[0].parameters, self.browser),
                         (True, 'declared_fact_checked'))

    async def test_missing_baseline_cannot_execute_or_prove_a_changed_condition(self):
        condition = {'kind': 'read_fields', 'read': specification(), 'changed': True}
        checks = declared_checks([condition], {}, None)
        self.assertEqual(await check_fact(checks[0].parameters, self.browser), (False, 'declared_baseline_missing'))
        self.element.evaluate.side_effect = ValueError('read_failed')
        with self.assertRaisesRegex(ValueError, 'read_failed'):
            await OrdinaryCapability(self.browser, self.tools).execute_checked('click', {},
                {'strategy': 'css', 'value': '#control'}, [condition])
        self.tools.act.assert_not_awaited()

    def test_changed_is_explicit_exclusive_and_never_freezes_a_sample(self):
        for raw in [{'changed': False}, {'changed': 1}, {'changed': True, 'equals': 'Saved'},
                    {'changed': False, 'equals': 'Saved'}]:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                declared_checks([{'kind': 'title', **raw}], {}, None)
        self.clause.expression.pop('equals')
        self.clause.expression['changed'] = True
        condition = next(completion_conditions([self.clause], 'a-0001', ['filter']))
        self.assertTrue(condition['changed'])
        self.assertNotIn('equals', condition)


def legacy_read_observation(identifier, sequence, read, output):
    value = {'specificationDigest': digest(read), 'output': output}
    fact_ref = EvidenceRef(ref=f'fixture:{identifier}:fact', digest=digest(value))
    observation_ref = EvidenceRef(ref=f'fixture:{identifier}:observation', digest=digest(identifier))
    return NormalizedObservation(id=identifier, sequence=sequence, url='https://fixture.invalid/list',
        tabId='tab-1', facts=[ObservationFact(id=f'fact-{sequence}', kind='read_fields', value=value,
                                             sourceRefs=[fact_ref])], sourceRefs=[observation_ref])
