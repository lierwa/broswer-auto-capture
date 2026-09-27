"""Unused verified DOM probes cannot become replay prerequisites."""

import unittest
from types import SimpleNamespace

from workflow_use.hybrid.action_dispatch import not_dispatched_coverage
from workflow_use.hybrid.coverage import unused_verified_dom_read_coverage, validate_coverage
from workflow_use.hybrid.dom_evidence import DomQueryEvidence, DomScope
from workflow_use.hybrid.evidence import ActionCoverage, EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.natural_compile import natural_postconditions
from workflow_use.hybrid.natural_read_liveness import (
    consumed_query_ids,
    prune_unused_queries,
    rebind_consumer_readiness,
)
from workflow_use.hybrid.natural_readiness import consumer_readiness_by_action
from workflow_use.hybrid.natural_reads import VerifiedNaturalRead, find_elements_read_spec

URL = 'https://example.test/list'
URL_DIGEST = digest(URL)
REF = EvidenceRef(ref='fixture:browser', digest='1' * 64)
REGISTRY = SimpleNamespace(validate_action=lambda _name, _args: None)


def fact(identity, kind, value):
    checksum = digest(value)
    return ObservationFact(id=identity, kind=kind, value=value,
                           sourceRefs=[EvidenceRef(ref='sha256:' + checksum, digest=checksum)])


def observation(identity, facts=()):
    return SimpleNamespace(id=identity, tabId='tab-1', url=URL, sourceRefs=[REF],
                           facts=[fact(identity + '-url', 'url_digest', URL_DIGEST), *facts])


def verified_query(action_id, selector, total, maximum):
    query = DomQueryEvidence(actionRef=action_id,
        scope=DomScope(url=URL, urlDigest=URL_DIGEST, tabId='tab-1', targetId=None,
                       frameId=None, document=None),
        query={'kind': 'css', 'value': selector}, requestedAttributes=[], includeText=True,
        maxResults=maximum, total=total, showing=total, truncated=False, complete=True,
        limitations=['result_bodies_omitted'])
    result = EvidenceRef(ref='fixture:' + action_id, digest=digest(action_id))
    output = [{'text': str(index), 'ordinal': index} for index in range(1, total + 1)]
    read = VerifiedNaturalRead(actionRef=action_id, specification=find_elements_read_spec(query),
        outputPath=[], readPath=[], output=output, resultDigest=result.digest,
        urlDigest=URL_DIGEST, targetId='tab-1', containerIdsDigest=digest(output), stable=True)
    action = SimpleNamespace(id=action_id, name='find_elements', effect='read', status='succeeded',
        args={'selector': selector, 'max_results': maximum}, resultRef=result,
        preObservationRef='pre-' + action_id, postObservationRef='post-' + action_id)
    pre = observation(action.preObservationRef)
    post = observation(action.postObservationRef, [
        fact(action_id + '-query', 'dom_query', query.model_dump(mode='json')),
        fact(action_id + '-read', 'verified_natural_read', read.model_dump(mode='json'))])
    segment = {'id': 's-' + action_id, 'kind': 'deterministic',
               'operation': {'name': 'browser.read-fields',
                             'specification': read.specification.model_dump(mode='json')},
               'outputs': [{'schema': read.specification.outputSchema, 'sourceRef': action_id + '-read'}]}
    coverage = ActionCoverage(actionRef=action_id, disposition='compiled',
                              ownerSegmentId=segment['id'], evidenceRefs=[result])
    return action, pre, post, segment, coverage


def not_dispatched(action_id):
    result = EvidenceRef(ref='fixture:' + action_id, digest=digest(action_id))
    action = SimpleNamespace(id=action_id, name='click', effect='ui_state', status='failed',
        resultRef=result, actionIndex=0, preObservationRef='pre-' + action_id,
        postObservationRef='post-' + action_id)
    body = {'schemaVersion': 'bat.native-action-dispatch/v3', 'nativeStepNumber': 3,
            'nativeActionIndex': 0, 'actionRef': action_id, 'actionName': 'click',
            'intentTarget': None, 'resultRef': result.model_dump(mode='json'),
            'entered': False, 'resultReceived': False,
            'eventCapture': {'status': 'not_dispatched', 'eventCount': 0,
                             'eventExpectation': 'required', 'limitations': []}}
    return action, observation(action.preObservationRef), observation(
        action.postObservationRef, [fact('dispatch', 'native_action_dispatch', body)])


class NaturalReadLivenessTests(unittest.TestCase):
    def fixture(self):
        broad = verified_query('a-0002', 'a', 2, 2)
        narrow = verified_query('a-0004', 'a.item', 1, 2)
        failed = not_dispatched('a-0003')
        producer = SimpleNamespace(id='a-0001', name='navigate', effect='navigation',
            status='succeeded', resultRef=REF,
            preObservationRef='pre-a-0001', postObservationRef='post-a-0001')
        navigate = SimpleNamespace(id='a-0005', name='navigate', effect='navigation',
            status='succeeded', preObservationRef='pre-a-0005', postObservationRef='post-a-0005')
        observations = [observation(producer.preObservationRef), observation(producer.postObservationRef),
                        broad[1], broad[2], failed[1], failed[2], narrow[1], narrow[2],
                        observation(navigate.preObservationRef), observation(navigate.postObservationRef)]
        trace = SimpleNamespace(actions=[producer, broad[0], failed[0], narrow[0], navigate],
                                observations=observations)
        dead_readiness = consumer_readiness_by_action(trace)['a-0001']['condition']
        producer_segment = {'id': 's-a-0001', 'kind': 'deterministic',
                            'operation': {'name': 'browser.workflow-step'},
                            'postconditions': [{'kind': 'url'}, dead_readiness],
                            'proofRefs': [REF.model_dump(mode='json'),
                                          broad[0].resultRef.model_dump(mode='json')]}
        destination = {'id': 's-a-0005', 'kind': 'deterministic',
                       'operation': {'name': 'browser.workflow-step'}, 'postconditions': [{'kind': 'url'}],
                       'bindings': [{'binding': {'source': 'node', 'nodeId': 'a-0004', 'path': [0, 'text']}}],
                       'proofRefs': []}
        omitted = not_dispatched_coverage(trace, failed[0])
        segments = [producer_segment, broad[3], narrow[3], destination]
        ledger = [broad[4], omitted, narrow[4]]
        return trace, segments, ledger

    def test_dead_complete_query_is_audited_and_readiness_rebinds_across_proven_non_dispatch(self):
        trace, segments, ledger = self.fixture()
        request = SimpleNamespace(trace=trace)
        retained, coverage, consumed, issues = prune_unused_queries(request, REGISTRY, segments, ledger)
        self.assertEqual(issues, [])
        self.assertEqual(consumed, {'a-0004'})
        self.assertEqual([item['id'] for item in retained], ['s-a-0001', 's-a-0004', 's-a-0005'])
        self.assertEqual(coverage[0].exclusionRule, 'native_dom_lookup_observation/v1')
        self.assertEqual(coverage[0], unused_verified_dom_read_coverage(
            REGISTRY, trace.actions[1], trace.observations[2], trace.observations[3]))
        self.assertEqual(rebind_consumer_readiness(trace, retained, coverage), [])
        self.assertEqual(retained[0]['postconditions'][1]['consumerRef'], 's-a-0004')
        self.assertNotIn(trace.actions[1].resultRef.model_dump(mode='json'), retained[0]['proofRefs'])
        audit = [ActionCoverage(actionRef='a-0001', disposition='compiled',
                                ownerSegmentId='s-a-0001', evidenceRefs=[REF]),
                 *coverage, ActionCoverage(actionRef='a-0005', disposition='compiled',
                                            ownerSegmentId='s-a-0005', evidenceRefs=[REF])]
        self.assertEqual(validate_coverage(trace, audit, {item['id'] for item in retained},
            registry=REGISTRY, result_spec=SimpleNamespace(mode='execution'),
            output_schema={'type': 'null'}, consumed_query_ids=consumed), [])

    def test_dispatched_failure_blocks_readiness_rebinding(self):
        trace, segments, ledger = self.fixture()
        retained, coverage, _consumed, issues = prune_unused_queries(
            SimpleNamespace(trace=trace), REGISTRY, segments, ledger)
        self.assertEqual(issues, [])
        gaps = rebind_consumer_readiness(trace, retained, [row for row in coverage
                                          if row.actionRef != 'a-0003'])
        self.assertEqual(len(gaps), 1)
        self.assertEqual(gaps[0].code, 'missing_effect_proof')
        self.assertEqual(retained[0]['postconditions'], [{'kind': 'url'}])

    def test_final_output_binding_preserves_a_read_even_without_later_action(self):
        trace, segments, ledger = self.fixture()
        trace.observations[-1].facts.append(fact('assembly', 'verified_output_assembly', {
            'fields': [{'binding': {'source': 'node', 'nodeId': 'a-0002', 'path': []}}]}))
        self.assertEqual(consumed_query_ids(trace, segments), {'a-0002', 'a-0004'})
        retained, coverage, _consumed, issues = prune_unused_queries(
            SimpleNamespace(trace=trace), REGISTRY, segments, ledger)
        self.assertEqual(issues, [])
        self.assertEqual(len(retained), len(segments))
        self.assertEqual(coverage[0].disposition, 'compiled')

    def test_scroll_keeps_physical_effect_after_all_following_reads_are_pruned(self):
        trace, segments, ledger = self.fixture()
        producer = trace.actions[0]
        producer.name, producer.effect = 'scroll', 'ui_state'
        producer.args = {'down': True, 'pages': 1}
        before, after = trace.observations[:2]
        before.facts.append(fact('scroll-before', 'scroll_position', '{"x":0,"y":0}'))
        after.facts.append(fact('scroll-after', 'scroll_position', '{"x":0,"y":600}'))
        consumer = consumer_readiness_by_action(trace)[producer.id]
        conditions, refs, gaps = natural_postconditions(producer, before, after, None, [], consumer)
        self.assertEqual(gaps, [])
        segments[0]['postconditions'] = conditions
        segments[0]['proofRefs'] = [ref.model_dump(mode='json') for ref in refs]
        segments[-1]['bindings'] = []
        retained, coverage, _consumed, gaps = prune_unused_queries(
            SimpleNamespace(trace=trace), REGISTRY, segments, ledger)

        self.assertEqual(gaps, [])
        self.assertEqual(rebind_consumer_readiness(trace, retained, coverage), [])
        self.assertEqual([segment['id'] for segment in retained], ['s-a-0001', 's-a-0005'])
        self.assertEqual(retained[0]['postconditions'][0]['kind'], 'scroll_position')
        self.assertEqual(retained[0]['postconditions'][0]['clauseRef'], 'scroll-after')

    def test_lost_only_consumer_proof_returns_gap_without_invalid_segment(self):
        trace, segments, ledger = self.fixture()
        segments[0]['postconditions'] = segments[0]['postconditions'][1:]
        segments[-1]['bindings'] = []
        ledger.insert(0, ActionCoverage(actionRef='a-0001', disposition='compiled',
                                       ownerSegmentId='s-a-0001', evidenceRefs=[REF]))
        retained, coverage, _consumed, gaps = prune_unused_queries(
            SimpleNamespace(trace=trace), REGISTRY, segments, ledger)

        self.assertEqual(gaps, [])
        gaps = rebind_consumer_readiness(trace, retained, coverage)
        self.assertEqual([gap.reason for gap in gaps], ['consumer_readiness_live_read_required'])
        self.assertEqual([segment['id'] for segment in retained], ['s-a-0005'])
        self.assertTrue(all(segment['postconditions'] for segment in retained))
        self.assertEqual(coverage[0].disposition, 'not_compilable')
        self.assertIsNone(coverage[0].ownerSegmentId)
        self.assertEqual(coverage[0].evidenceRefs, [REF])


if __name__ == '__main__':
    unittest.main()
