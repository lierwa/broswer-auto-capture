"""Consumer-owned readiness: producers run once and wait only on proven downstream facts."""
import json
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.causal import waits_owned_by_next_target
from workflow_use.hybrid.evidence import ActionCoverage, EvidenceRef, digest
from workflow_use.hybrid.coverage import validate_coverage
from workflow_use.hybrid.natural_compile import consumer_readiness_by_action, natural_postconditions
from workflow_use.hybrid.natural_reads import compile_verified_read
from workflow_use.hybrid.postconditions import (
    PostconditionNotMet,
    SettlePolicy,
    capture_check_baselines,
    check_fact,
    declared_checks,
    read_check_value,
    verify_once,
)
from workflow_use.hybrid.read import ReadField, ReadSpec
from workflow_use.hybrid.rendered_field_text import FieldReadError
from workflow_use.hybrid.visible_wait import VisibleWaitParams, register_visible_wait_tool

REF = EvidenceRef(ref='fixture:evidence', digest='1' * 64)
OUTPUT_SCHEMA = {'type': 'array', 'maxItems': 5, 'items': {
    'type': 'object', 'properties': {'title': {'type': 'string', 'maxLength': 200}},
    'required': ['title'], 'additionalProperties': False,
}}
SPECIFICATION = ReadSpec(container='.record', fields={'title': ReadField(selector='.title')},
                         maxItems=5, outputSchema=OUTPUT_SCHEMA)
SETTLE = {'maxMs': 1000, 'maxAttempts': 5, 'intervalMs': 10}


def observation(identity, sequence, url, facts=()):
    return SimpleNamespace(id=identity, sequence=sequence, url=url, tabId='tab-1',
                           facts=list(facts), sourceRefs=[REF])


def readiness_trace(producer_effect, consumer_name='extract'):
    url = 'https://example.test/issues'
    url_fact = lambda identity: SimpleNamespace(
        id=identity, kind='url_digest', value=digest(url), sourceRefs=[REF])
    result = EvidenceRef(ref='fixture:read-result', digest='2' * 64)
    read_fact = SimpleNamespace(id='verified-read', kind='verified_natural_read', sourceRefs=[REF], value={
        'actionRef': 'a-0002', 'specification': SPECIFICATION.model_dump(mode='json'),
        'outputPath': [], 'readPath': [], 'output': [{'title': 'Ready'}],
        'resultDigest': result.digest, 'urlDigest': digest(url), 'targetId': 'tab-1',
        'containerIdsDigest': '3' * 64, 'stable': True,
    })
    observations = [
        observation('o-0001', 0, url, [url_fact('url-1')]),
        observation('o-0002', 1, url, [url_fact('url-2')]),
        observation('o-0003', 2, url, [url_fact('url-3')]),
        observation('o-0004', 3, url, [url_fact('url-4'), read_fact]),
    ]
    producer = SimpleNamespace(id='a-0001', name='click', effect=producer_effect, status='succeeded',
                               preObservationRef='o-0001', postObservationRef='o-0002', resultRef=REF)
    consumer = SimpleNamespace(id='a-0002', name=consumer_name, effect='read', status='succeeded',
                               preObservationRef='o-0003', postObservationRef='o-0004', resultRef=result)
    return SimpleNamespace(actions=[producer, consumer], observations=observations)


class CompilerReadinessTests(unittest.TestCase):
    def test_host_verified_native_extract_compiles_as_the_read_node(self):
        trace = readiness_trace('external_write')
        action = trace.actions[1]
        request = SimpleNamespace(plan=SimpleNamespace(outputSchemaDigest=digest(OUTPUT_SCHEMA)))

        segment, path, issues = compile_verified_read(
            request, action, trace.observations[2], trace.observations[3], OUTPUT_SCHEMA, [])

        self.assertEqual(issues, [])
        self.assertEqual(path, [[]])
        self.assertEqual(segment['operation']['name'], 'browser.read-fields')
        self.assertEqual(segment['id'], 's-a-0002')

    def test_same_document_effect_does_not_invent_a_read_value_transition(self):
        readiness = consumer_readiness_by_action(readiness_trace('external_write'))['a-0001']

        self.assertEqual(readiness['condition']['ready'], True)
        self.assertEqual(readiness['condition']['consumerRef'], 's-a-0002')
        expected = SPECIFICATION.model_dump(mode='json')
        expected['maxInputBytes'] = 128000
        self.assertEqual(readiness['condition']['read'], expected)

    def test_only_a_proven_change_of_the_same_projection_requires_transition(self):
        for previous_output, authority in [([{'title': 'Old'}], 'transition'),
                                            ([{'title': 'Ready'}], 'ready')]:
            with self.subTest(authority=authority):
                trace = readiness_trace('ui_state')
                prior = deepcopy(trace.observations[-1].facts[-1])
                prior.id = 'prior-read'; prior.value['actionRef'] = 'a-prior'
                prior.value['output'] = previous_output
                trace.observations[0].facts.append(prior)
                trace.actions.insert(0, SimpleNamespace(id='a-prior', name='extract', effect='read',
                    status='succeeded', preObservationRef='o-0001', postObservationRef='o-0001'))
                condition = consumer_readiness_by_action(trace)['a-0001']['condition']
                self.assertTrue(condition[authority])

    def test_navigation_uses_stable_ready_projection_without_old_page_baseline(self):
        readiness = consumer_readiness_by_action(readiness_trace('navigation'))['a-0001']

        self.assertEqual(readiness['condition']['ready'], True)
        self.assertNotIn('transition', readiness['condition'])

    def test_complete_native_query_can_prove_consumer_readiness(self):
        readiness = consumer_readiness_by_action(
            readiness_trace('external_write', consumer_name='find_elements'))['a-0001']

        self.assertEqual(readiness['condition']['consumerRef'], 's-a-0002')
        self.assertEqual(readiness['condition']['read']['maxInputBytes'], 128000)

    def test_url_changing_click_keeps_the_proven_consumer_readiness(self):
        before = SimpleNamespace(id='url-before', kind='url_digest', value='1' * 64,
                                 sourceRefs=[REF])
        after = SimpleNamespace(id='url-after', kind='url_digest', value='2' * 64,
                                sourceRefs=[REF])
        consumer = consumer_readiness_by_action(
            readiness_trace('external_write', consumer_name='find_elements'))['a-0001']

        conditions, _refs, issues = natural_postconditions(
            SimpleNamespace(id='a-0001', name='click'),
            observation('pre', 0, 'https://example.test/search', [before]),
            observation('post', 1, 'https://example.test/detail', [after]),
            {'strategy': 'history'}, [], consumer)

        self.assertEqual(issues, [])
        self.assertEqual([item['kind'] for item in conditions], ['url_digest', 'read_fields'])
        self.assertTrue(all(item['settle'] == {
            'maxMs': 30000, 'maxAttempts': 100, 'intervalMs': 300,
        } for item in conditions))

    def test_business_text_without_max_length_uses_the_native_read_byte_budget(self):
        schema = {'type': 'array', 'maxItems': 5, 'items': {
            'type': 'object', 'properties': {'title': {'type': 'string'}},
            'required': ['title'], 'additionalProperties': False,
        }}
        specification = ReadSpec(
            container='.record', fields={'title': ReadField(selector='.title')},
            maxItems=5, maxInputBytes=128000, outputSchema=schema)
        condition = {'kind': 'read_fields', 'transition': True, 'consumerRef': 's-a-0002',
                     'read': specification.model_dump(mode='json'),
                     'scope': {'url': 'https://example.test/issues'}, 'settle': SETTLE}

        checks = declared_checks([condition], {}, None)

        self.assertEqual(len(checks), 1)
        self.assertEqual(checks[0].parameters['read']['maxInputBytes'], 128000)

    def test_navigation_readiness_scope_follows_the_runtime_url_binding(self):
        sample_url = 'https://example.test/issues?from=sample'
        runtime_url = 'https://example.test/issues?from=verification'
        conditions = [
            {'kind': 'url', 'bindingArgument': 'url', 'settle': SETTLE},
            {'kind': 'read_fields', 'ready': True, 'consumerRef': 's-a-0002',
             'read': SPECIFICATION.model_dump(mode='json'),
             'scope': {'url': sample_url, 'urlDigest': digest(sample_url)}, 'settle': SETTLE},
        ]

        checks = declared_checks(conditions, {'url': runtime_url}, None)

        self.assertEqual(checks[1].parameters['scope'], {
            'url': runtime_url,
            'urlDigest': digest(runtime_url),
        })

    def test_fixed_wait_is_owned_by_the_next_bounded_target(self):
        wait = SimpleNamespace(
            id='a-wait', name='wait', status='succeeded', effect='none', args={'seconds': 2},
            resultRef=REF, preObservationRef='o-before', postObservationRef='o-after')
        click = SimpleNamespace(id='a-click', name='click', status='succeeded', effect='external_write',
                                postObservationRef='o-after')
        observations = [observation('o-before', 0, 'https://example.test/issues'),
                        observation('o-after', 1, 'https://example.test/issues')]
        request = SimpleNamespace(trace=SimpleNamespace(actions=[wait, click], observations=observations))
        registry = SimpleNamespace(validate_action=lambda *_args: None)
        owner = {'id': 's-a-click', 'kind': 'deterministic',
                 'operation': {'name': 'browser.workflow-step'}, 'target': {'strategy': 'history'},
                 'proofRefs': []}

        supported = waits_owned_by_next_target(request, registry, [owner])

        self.assertEqual(supported['a-wait'].ownerSegmentId, owner['id'])
        self.assertEqual(supported['a-wait'].exclusionRule,
                         'fixed_wait_before_bounded_target_resolution/v1')
        self.assertTrue(owner['proofRefs'])

        ledger = [supported['a-wait'], ActionCoverage(actionRef=click.id,
            disposition='compiled', ownerSegmentId=owner['id'], evidenceRefs=[REF])]
        self.assertEqual(validate_coverage(request.trace, ledger, {owner['id']},
            registry=registry, compiled_segments=[owner]), [])

        for mutation in ('owner', 'boundary', 'evidence', 'target', 'effect'):
            with self.subTest(mutation=mutation):
                changed_trace, changed_ledger, changed_owner = (
                    deepcopy(request.trace), deepcopy(ledger), deepcopy(owner))
                if mutation == 'owner':
                    changed_ledger[0].ownerSegmentId = 's-other'
                elif mutation == 'boundary':
                    changed_trace.observations[-1].url += '/different'
                elif mutation == 'evidence':
                    changed_ledger[0].evidenceRefs = []
                elif mutation == 'target':
                    changed_owner['target'] = None
                else:
                    changed_trace.actions[0].effect = 'external_write'
                self.assertTrue(validate_coverage(changed_trace, changed_ledger,
                    {owner['id'], 's-other'}, registry=registry,
                    compiled_segments=[changed_owner]))


class RuntimeReadinessTests(unittest.IsolatedAsyncioTestCase):
    def condition(self, authority):
        return {'kind': 'read_fields', authority: True, 'consumerRef': 's-a-0002',
                'read': SPECIFICATION.model_dump(mode='json'),
                'scope': {'url': 'https://example.test/issues'}, 'settle': SETTLE}

    async def test_transition_requires_change_and_two_identical_consumer_reads(self):
        checks = declared_checks([self.condition('transition')], {}, None)
        with patch('workflow_use.hybrid.postconditions.read_fields', new=AsyncMock(
                side_effect=[[{'title': 'Old'}], [{'title': 'New'}], [{'title': 'New'}]])):
            await capture_check_baselines(object(), checks)
            self.assertEqual(await check_fact(checks[0].parameters, object()),
                             (False, 'declared_projection_not_stable'))
            self.assertEqual(await check_fact(checks[0].parameters, object()),
                             (True, 'declared_fact_checked'))

    async def test_unchanged_compares_against_the_current_runtime_baseline(self):
        checks = declared_checks([{'kind': 'url_digest', 'unchanged': True}], {}, None)
        with patch('workflow_use.hybrid.postconditions.read_check_value', new=AsyncMock(
                side_effect=['runtime-url', 'runtime-url', 'different-url'])):
            await capture_check_baselines(object(), checks)
            self.assertEqual(await check_fact(checks[0].parameters, object()),
                             (True, 'declared_fact_checked'))
            self.assertEqual(await check_fact(checks[0].parameters, object()),
                             (False, 'declared_fact_checked'))

    async def test_stale_projection_is_not_ready_until_the_business_shape_stabilizes(self):
        checks = declared_checks([self.condition('transition')], {}, None)
        stale = FieldReadError('read_text_affix_invalid', field_name='title', match_count=1,
                               reason='text_prefix_mismatch')
        with patch('workflow_use.hybrid.postconditions.read_fields', new=AsyncMock(
                side_effect=[[{'title': 'Old'}], stale,
                             [{'title': 'New'}], [{'title': 'New'}]])):
            await capture_check_baselines(object(), checks)
            self.assertEqual(await check_fact(checks[0].parameters, object()),
                             (False, 'declared_projection_not_ready'))
            self.assertEqual(await check_fact(checks[0].parameters, object()),
                             (False, 'declared_projection_not_stable'))
            self.assertEqual(await check_fact(checks[0].parameters, object()),
                             (True, 'declared_fact_checked'))

    async def test_old_page_outside_result_shape_does_not_block_the_single_dispatch(self):
        checks = declared_checks([self.condition('transition')], {}, None)
        old_page = FieldReadError('read_text_affix_invalid', field_name='title', match_count=1,
                                  reason='text_prefix_mismatch')
        with patch('workflow_use.hybrid.postconditions.read_fields', new=AsyncMock(
                side_effect=[old_page])):
            await capture_check_baselines(object(), checks)
        self.assertTrue(checks[0].parameters['baselineUnavailable'])

    async def test_missing_pre_action_projection_may_appear_but_must_stabilize(self):
        checks = declared_checks([self.condition('transition')], {}, None)
        with patch('workflow_use.hybrid.postconditions.read_fields', new=AsyncMock(
                side_effect=[ValueError('target_scope_mismatch'),
                             [{'title': 'Ready'}], [{'title': 'Ready'}]])):
            await capture_check_baselines(object(), checks)
            self.assertTrue(checks[0].parameters['baselineUnavailable'])
            self.assertFalse((await check_fact(checks[0].parameters, object()))[0])
            self.assertTrue((await check_fact(checks[0].parameters, object()))[0])

    async def test_target_resolution_retries_missing_but_not_ambiguous(self):
        capability = OrdinaryCapability.__new__(OrdinaryCapability)
        capability.target_settle = SettlePolicy(maxMs=200, maxAttempts=3, intervalMs=10)
        capability.targets = SimpleNamespace(resolve_action_index=AsyncMock(
            side_effect=[ValueError('missing_stable_target'), 7]))
        self.assertEqual(await capability.resolve_target({'strategy': 'title'}), 7)
        capability.targets.resolve_action_index = AsyncMock(side_effect=ValueError('ambiguous_stable_target'))
        with self.assertRaisesRegex(ValueError, 'ambiguous_stable_target'):
            await capability.resolve_target({'strategy': 'title'})
        self.assertEqual(capability.targets.resolve_action_index.await_count, 1)

    async def test_exhausted_missing_target_has_a_stable_runtime_outcome_code(self):
        capability = OrdinaryCapability.__new__(OrdinaryCapability)
        capability.target_settle = SettlePolicy(maxMs=40, maxAttempts=3, intervalMs=10)
        capability.targets = SimpleNamespace(resolve_action_index=AsyncMock(
            side_effect=ValueError('missing_stable_target')))

        with self.assertRaisesRegex(RuntimeError, 'ordinary_target_missing'):
            await capability.resolve_target({'strategy': 'history'})

    async def test_target_readiness_uses_one_live_resolution_without_dispatch(self):
        capability = OrdinaryCapability.__new__(OrdinaryCapability)
        capability.browser = object()
        capability.targets = SimpleNamespace(prepare_action_target=AsyncMock(
            return_value=SimpleNamespace(document_id='doc-1')))
        with patch('workflow_use.hybrid.capability.current_document_id',
                   new=AsyncMock(return_value='doc-1')):
            self.assertEqual(await capability.target_readiness('click', {'strategy': 'history'}),
                             {'status': 'ready', 'documentId': 'doc-1'})
        capability.targets.prepare_action_target.assert_awaited_once()

    async def test_target_readiness_preserves_missing_blocked_and_ambiguous(self):
        for code, status in [('missing_stable_target', 'missing'),
                             ('target_hit_blocked', 'blocked'),
                             ('ambiguous_history_target', 'ambiguous')]:
            with self.subTest(code=code):
                capability = OrdinaryCapability.__new__(OrdinaryCapability)
                capability.browser = object()
                capability.targets = SimpleNamespace(prepare_action_target=AsyncMock(
                    side_effect=ValueError(code)))
                with patch('workflow_use.hybrid.capability.current_document_id',
                           new=AsyncMock(return_value='doc-1')):
                    self.assertEqual(await capability.target_readiness(
                        'click', {'strategy': 'history'}),
                        {'status': status, 'documentId': 'doc-1'})

    async def test_postcondition_reads_the_exact_dispatched_target_after_overlay(self):
        retained = object()
        parameters = {'kind': 'target_value', 'target': {'strategy': 'history'},
                      '_retainedElement': retained}
        with patch('workflow_use.hybrid.postconditions.read_target_value',
                   new=AsyncMock(return_value='alpha')) as read:
            self.assertEqual(await read_check_value(parameters, object()), 'alpha')
        read.assert_awaited_once_with(retained)


class PostconditionDiagnosticTests(unittest.IsolatedAsyncioTestCase):
    def readiness(self):
        return declared_checks([{
            'kind': 'read_fields', 'ready': True, 'consumerRef': 's-a-0002',
            'read': SPECIFICATION.model_dump(mode='json'),
            'scope': {'url': 'https://example.test/issues'}, 'settle': SETTLE,
        }], {}, None)

    async def test_field_read_limit_keeps_only_fixed_check_and_error_codes(self):
        checks = self.readiness()
        error = FieldReadError('read_collection_limit', field_name='secret', match_count=201,
                               reason='https://private.test/?token=secret')
        with patch('workflow_use.hybrid.postconditions.read_fields', new=AsyncMock(side_effect=error)):
            with self.assertRaises(PostconditionNotMet) as raised:
                await verify_once(object(), checks)
        self.assertEqual(str(raised.exception),
                         'ordinary_postcondition_failed_read_fields_read_collection_limit')

    async def test_unknown_dependency_message_cannot_cross_the_runtime_boundary(self):
        checks = self.readiness()
        with patch('workflow_use.hybrid.postconditions.read_fields', new=AsyncMock(
                side_effect=RuntimeError('https://private.test/?token=secret'))):
            with self.assertRaises(PostconditionNotMet) as raised:
                await verify_once(object(), checks)
        self.assertEqual(str(raised.exception), 'ordinary_postcondition_failed_read_fields_check_error')

    async def test_multiple_failed_checks_identify_the_first_fixed_failure(self):
        checks = declared_checks([
            {'kind': 'url_digest', 'changed': True, 'settle': SETTLE},
            {'kind': 'read_fields', 'ready': True, 'consumerRef': 's-a-0002',
             'read': SPECIFICATION.model_dump(mode='json'),
             'scope': {'url': 'https://example.test/issues'}, 'settle': SETTLE},
        ], {}, None)
        checks[0].parameters.update({'baselineCaptured': True, 'expected': 'old-url-digest'})
        with patch('workflow_use.hybrid.postconditions.read_check_value', new=AsyncMock(
                side_effect=['old-url-digest', ValueError('target_scope_mismatch')])):
            with self.assertRaises(PostconditionNotMet) as raised:
                await verify_once(object(), checks)
        self.assertEqual(str(raised.exception), 'ordinary_postcondition_failed_url_digest_fact_mismatch')

    async def test_target_state_mismatch_keeps_only_fixed_boolean_expected_and_actual(self):
        expected = json.dumps({'aria-expanded': True, 'disabled': False}, sort_keys=True,
                              separators=(',', ':'))
        actual = json.dumps({'aria-expanded': False, 'disabled': False}, sort_keys=True,
                            separators=(',', ':'))
        checks = declared_checks([{'kind': 'target_state', 'equals': expected}], {},
                                 {'strategy': 'css', 'value': 'button'})
        with patch('workflow_use.hybrid.postconditions.read_check_value', new=AsyncMock(return_value=actual)):
            with self.assertRaises(PostconditionNotMet) as raised:
                await verify_once(object(), checks)
        self.assertEqual(raised.exception.diagnostic, {
            'kind': 'target_state', 'attempts': 1,
            'expected': {'aria-expanded': True, 'disabled': False},
            'actual': {'aria-expanded': False, 'disabled': False},
        })

    async def test_sensitive_fact_mismatch_never_keeps_raw_expected_or_actual(self):
        checks = declared_checks([{'kind': 'target_value', 'equals': 'private-before'}], {},
                                 {'strategy': 'css', 'value': 'input'})
        with patch('workflow_use.hybrid.postconditions.read_check_value',
                   new=AsyncMock(return_value='private-after')):
            with self.assertRaises(PostconditionNotMet) as raised:
                await verify_once(object(), checks)
        self.assertEqual(raised.exception.diagnostic, {'kind': 'target_value', 'attempts': 1})
        self.assertNotIn('private', json.dumps(raised.exception.diagnostic))

    async def test_visible_wait_preserves_timeout_classification_for_diagnostic_suffix(self):
        class ToolSink:
            def action(self, *_args, **_kwargs):
                def register(action):
                    self.registered = action
                    return action
                return register

        tools = ToolSink()
        register_visible_wait_tool(tools)
        with patch('workflow_use.hybrid.visible_wait.wait_for_visible', new=AsyncMock(
                side_effect=PostconditionNotMet(
                    'ordinary_postcondition_failed_target_visible_fact_mismatch'))):
            result = await tools.registered(VisibleWaitParams(selector='.target'), object())
        self.assertEqual(result.error, 'bat_wait_for_timeout')


if __name__ == '__main__':
    unittest.main()
