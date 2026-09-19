"""Consumer-owned readiness: producers run once and wait only on proven downstream facts."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.causal import waits_owned_by_next_target
from workflow_use.hybrid.evidence import EvidenceRef, digest
from workflow_use.hybrid.natural_compile import consumer_readiness_by_action
from workflow_use.hybrid.natural_reads import compile_verified_read
from workflow_use.hybrid.postconditions import (
    SettlePolicy,
    capture_check_baselines,
    check_fact,
    declared_checks,
)
from workflow_use.hybrid.read import ReadField, ReadSpec

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


def readiness_trace(producer_effect):
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
    consumer = SimpleNamespace(id='a-0002', name='extract', effect='read', status='succeeded',
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

    def test_same_document_effect_uses_transition_of_the_next_read(self):
        readiness = consumer_readiness_by_action(readiness_trace('external_write'))['a-0001']

        self.assertEqual(readiness['condition']['transition'], True)
        self.assertEqual(readiness['condition']['consumerRef'], 's-a-0002')
        self.assertEqual(readiness['condition']['read'], SPECIFICATION.model_dump(mode='json'))

    def test_navigation_uses_stable_ready_projection_without_old_page_baseline(self):
        readiness = consumer_readiness_by_action(readiness_trace('navigation'))['a-0001']

        self.assertEqual(readiness['condition']['ready'], True)
        self.assertNotIn('transition', readiness['condition'])

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
        click = SimpleNamespace(id='a-click', name='click', status='succeeded', effect='external_write')
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


if __name__ == '__main__':
    unittest.main()
