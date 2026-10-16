"""Unused verified DOM probes cannot become replay prerequisites."""

import unittest
from types import SimpleNamespace

from browser_use.agent.views import ActionResult
from workflow_use.hybrid.action_dispatch import not_dispatched_coverage, proven_not_dispatched_ids
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
from workflow_use.hybrid.native_sequence_stop import sequence_stop_coverage

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


def sequence_stopped_fixture():
    """Observed native error-stop shape, with public fixture values and no page contents."""
    broad, narrow = verified_query('a-0002', 'a', 2, 2), verified_query('a-0006', 'a.item', 1, 2)
    producer = SimpleNamespace(id='a-0001', name='navigate', effect='navigation', status='succeeded',
        resultRef=REF, stepIndex=0, actionIndex=0, preObservationRef='pre-a-0001', postObservationRef='post-a-0001')
    broad[0].stepIndex, broad[0].actionIndex = 1, 0
    narrow[0].stepIndex, narrow[0].actionIndex = 3, 0
    native_result = ActionResult(error='find_elements: Invalid CSS selector').model_dump(mode='json')
    checksum = digest(native_result)
    result_ref = EvidenceRef(ref='sha256:' + checksum, digest=checksum)
    cause = SimpleNamespace(id='a-0003', name='find_elements', effect='read', status='failed',
        stepIndex=2, actionIndex=0, resultRef=result_ref, args={'selector': '['},
        preObservationRef='pre-a-0003', postObservationRef='post-a-0003')
    tails = [SimpleNamespace(id=identity, name=name, effect=effect, status='proposed',
        stepIndex=2, actionIndex=index, resultRef=None, postObservationRef=None,
        preObservationRef='pre-' + identity) for identity, name, effect, index in (
            ('a-0004', 'find_elements', 'read', 1), ('a-0005', 'scroll', 'ui_state', 2))]

    def dispatch(action, entered):
        return fact('dispatch-' + action.id, 'native_action_dispatch', {
            'schemaVersion': 'bat.native-action-dispatch/v3', 'nativeStepNumber': 3,
            'nativeActionIndex': action.actionIndex, 'actionRef': action.id, 'actionName': action.name,
            'intentTarget': None, 'entered': entered, 'resultReceived': entered,
            'resultRef': action.resultRef.model_dump(mode='json') if action.resultRef else None,
            'eventCapture': {'status': 'not_configured' if entered else 'not_dispatched',
                'eventExpectation': 'none', 'eventCount': 0, 'limitations': []}})

    cause_post = observation(cause.postObservationRef, [dispatch(cause, True),
        fact('result-' + cause.id, 'native_action_result', {
            'schemaVersion': 'bat.native-action-result/v1', 'actionRef': cause.id,
            'resultRef': result_ref.model_dump(mode='json'), 'receivedFromToolsAct': True,
            'result': native_result})])
    tail_observations = [observation(action.preObservationRef, [dispatch(action, False),
        fact('stop-' + action.id, 'native_sequence_stop', {
            'schemaVersion': 'bat.native-sequence-stop/v1', 'nativeStepNumber': 3,
            'nativeActionIndex': action.actionIndex, 'actionRef': action.id,
            'causeActionRef': cause.id, 'causeResultRef': result_ref.model_dump(mode='json'),
            'reason': 'action_error', 'proof': {}})]) for action in tails]
    destination = SimpleNamespace(id='a-0007', name='navigate', effect='navigation', status='succeeded',
        stepIndex=4, actionIndex=0, preObservationRef='pre-a-0007', postObservationRef='post-a-0007')
    trace = SimpleNamespace(actions=[producer, broad[0], cause, *tails, narrow[0], destination],
        observations=[observation(producer.preObservationRef), observation(producer.postObservationRef),
            broad[1], broad[2], observation(cause.preObservationRef), cause_post, *tail_observations,
            narrow[1], narrow[2], observation(destination.preObservationRef), observation(destination.postObservationRef)])
    readiness = consumer_readiness_by_action(trace)[producer.id]
    segments = [{'id': 's-' + producer.id, 'kind': 'deterministic',
        'operation': {'name': 'browser.workflow-step'}, 'postconditions': [{'kind': 'url'}, readiness['condition']],
        'proofRefs': [REF.model_dump(mode='json'), broad[0].resultRef.model_dump(mode='json')]}, broad[3], narrow[3],
        {'id': 's-' + destination.id, 'kind': 'deterministic', 'operation': {'name': 'browser.workflow-step'},
         'postconditions': [{'kind': 'url'}], 'proofRefs': [],
         'bindings': [{'binding': {'source': 'node', 'nodeId': narrow[0].id, 'path': [0, 'text']}}]}]
    ledger = [broad[4], *[sequence_stop_coverage(trace, action) for action in tails], narrow[4]]
    return trace, segments, ledger


class NaturalReadLivenessTests(unittest.TestCase):
    def test_normal_native_error_stop_rebinds_readiness_to_the_retained_consumer(self):
        trace, segments, ledger = sequence_stopped_fixture()
        self.assertEqual(proven_not_dispatched_ids(trace, ledger), {'a-0004', 'a-0005'})
        retained, coverage, consumed, issues = prune_unused_queries(SimpleNamespace(trace=trace), REGISTRY, segments, ledger)
        self.assertEqual((consumed, issues), ({'a-0006'}, []))
        self.assertEqual([row['id'] for row in retained], ['s-a-0001', 's-a-0006', 's-a-0007'])
        self.assertEqual(rebind_consumer_readiness(trace, retained, coverage), [])
        self.assertEqual(retained[0]['postconditions'][1]['consumerRef'], 's-a-0006')
        self.assertNotIn(trace.actions[1].resultRef.model_dump(mode='json'), retained[0]['proofRefs'])

    def test_normal_stop_rule_without_exact_dispatch_or_receipt_cannot_erase_an_effect(self):
        for mutation in ('dispatch', 'receipt', 'ledger', 'partial_effect'):
            with self.subTest(mutation=mutation):
                trace, _segments, ledger = sequence_stopped_fixture()
                tail = trace.actions[4]
                if mutation == 'ledger':
                    ledger[2] = ledger[2].model_copy(update={'evidenceRefs': []})
                elif mutation == 'partial_effect':
                    tail.status, tail.resultRef = 'failed', REF
                else:
                    kind = 'native_action_dispatch' if mutation == 'dispatch' else 'native_action_result'
                    located = next(f for o in trace.observations for f in o.facts
                        if f.kind == kind and f.value['actionRef'] == (tail.id if mutation == 'dispatch' else 'a-0003'))
                    located.value['entered' if mutation == 'dispatch' else 'receivedFromToolsAct'] = False if mutation == 'receipt' else True
                    located.sourceRefs[0].digest = digest(located.value)
                self.assertNotIn(tail.id, proven_not_dispatched_ids(trace, ledger))
                readiness = consumer_readiness_by_action(trace, allowed_consumer_ids={'a-0006'},
                    proven_not_dispatched_ids=proven_not_dispatched_ids(trace, ledger))
                self.assertNotIn('a-0001', readiness)

    def test_proven_unentered_done_does_not_terminate_the_actual_consumer_chain(self):
        trace, _segments, ledger = sequence_stopped_fixture()
        tail = trace.actions[4]
        tail.name, tail.effect = 'done', 'none'
        for observation_row in trace.observations:
            for item in observation_row.facts:
                if item.kind == 'native_action_dispatch' and item.value['actionRef'] == tail.id:
                    item.value['actionName'] = 'done'
                    item.sourceRefs[0].digest = digest(item.value)
        ledger[2] = sequence_stop_coverage(trace, tail)
        readiness = consumer_readiness_by_action(trace, allowed_consumer_ids={'a-0006'},
            proven_not_dispatched_ids=proven_not_dispatched_ids(trace, ledger))
        self.assertEqual(readiness['a-0001']['condition']['consumerRef'], 's-a-0006')
        self.assertNotIn('a-0001', consumer_readiness_by_action(trace, allowed_consumer_ids={'a-0006'}))

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

    def test_trace_only_read_proofs_do_not_keep_query_live(self):
        for kind in ('natural_binding', 'dom_structure', 'selection_function'):
            with self.subTest(kind=kind):
                trace, segments, _ledger = self.fixture()
                segments[-1]['bindings'] = []
                trace.observations[-1].facts.append(fact('stale-' + kind, kind, {
                    'actionRef': 'a-0003',
                    'binding': {'source': 'node', 'nodeId': 'a-0002', 'path': []},
                }))

                self.assertEqual(consumed_query_ids(trace, segments), set())

    def test_retained_owner_without_executable_reference_does_not_keep_query_live(self):
        trace, segments, _ledger = self.fixture()
        segments[-1]['bindings'] = []
        trace.observations[-1].facts.append(fact('stale-owned-binding', 'natural_binding', {
            'actionRef': 'a-0005',
            'binding': {'source': 'node', 'nodeId': 'a-0002', 'path': []},
        }))

        self.assertEqual(consumed_query_ids(trace, segments), set())

    def test_retained_executable_references_keep_query_live(self):
        references = {
            'bindings': [{'binding': {'source': 'node', 'nodeId': 's-a-0002', 'path': []}}],
            'target': {'strategy': 'history',
                       'ordinalBinding': {'source': 'node', 'nodeId': 's-a-0002', 'path': []}},
            'inputBindings': {
                'candidates': {'source': 'node', 'nodeId': 's-a-0002', 'path': []}},
        }
        for key, value in references.items():
            with self.subTest(key=key):
                trace, segments, _ledger = self.fixture()
                segments[-1]['bindings'] = []
                segments[-1][key] = value

                self.assertEqual(consumed_query_ids(trace, segments), {'a-0002'})

    def test_repeat_method_read_reference_keeps_query_live(self):
        trace, segments, ledger = self.fixture()
        segments[-1]['bindings'] = []
        trace.observations[-1].facts.append(fact('repeat', 'repeat_method', {
            'iterations': [{'readActionRef': 'a-0002',
                            'continuationActionRef': 'a-0003',
                            'advanceActionRef': 'a-0005'}],
        }))

        retained, _coverage, consumed, issues = prune_unused_queries(
            SimpleNamespace(trace=trace), REGISTRY, segments, ledger)

        self.assertEqual(issues, [])
        self.assertIn('a-0002', consumed)
        self.assertIn('s-a-0002', [segment['id'] for segment in retained])
        self.assertNotIn('s-a-0004', [segment['id'] for segment in retained])

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

    def test_only_proven_readiness_query_survives_without_a_value_binding(self):
        trace, segments, ledger = self.fixture()
        segments[0]['postconditions'] = segments[0]['postconditions'][1:]
        segments[-1]['bindings'] = []
        retained, coverage, consumed, gaps = prune_unused_queries(
            SimpleNamespace(trace=trace), REGISTRY, segments, ledger)

        self.assertEqual(gaps, [])
        self.assertEqual(consumed, {'a-0002'})
        self.assertEqual([segment['id'] for segment in retained],
                         ['s-a-0001', 's-a-0002', 's-a-0005'])
        self.assertEqual(rebind_consumer_readiness(trace, retained, coverage), [])
        self.assertEqual(retained[0]['postconditions'][0]['consumerRef'], 's-a-0002')

    def test_forged_readiness_reference_cannot_keep_a_query_live(self):
        trace, segments, ledger = self.fixture()
        segments[0]['postconditions'][1]['clauseRef'] = 'forged-read'
        segments[-1]['bindings'] = []
        retained, _coverage, consumed, gaps = prune_unused_queries(
            SimpleNamespace(trace=trace), REGISTRY, segments, ledger)

        self.assertEqual(gaps, [])
        self.assertEqual(consumed, set())
        self.assertEqual([segment['id'] for segment in retained], ['s-a-0001', 's-a-0005'])

    def test_lost_only_consumer_proof_returns_gap_without_invalid_segment(self):
        trace, segments, ledger = self.fixture()
        segments[0]['postconditions'] = segments[0]['postconditions'][1:]
        segments[-1]['bindings'] = []
        # The proven read is genuinely absent, not merely unused as an action value.
        segments.pop(1)
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
