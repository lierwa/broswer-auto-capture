"""A proven unused probe cannot retain business-read gaps; live or unproven reads still do."""
import unittest
from types import SimpleNamespace as NS
from workflow_use.hybrid.evidence import ActionCoverage, EvidenceRef, digest, gap
from workflow_use.hybrid.natural_read_liveness import retire_unused_discovery
from tests.test_natural_read_liveness import verified_query, fact, REGISTRY


def fixture(action_id='a-0006'):
    action, pre, post, _, _ = verified_query(action_id, 'article', 2, 10)
    raw = {'error': None, 'long_term_memory': 'Found 2 elements matching "article".'}
    reference = EvidenceRef(ref='sha256:' + digest(raw), digest=digest(raw))
    action.resultRef, action.actionIndex = reference, 0
    identity = {'targetId': pre.tabId, 'documentDigest': digest('document')}
    pre.facts += [fact('pre-document', 'document_identity', identity),
        fact('dispatch', 'native_action_dispatch', {'schemaVersion': 'bat.native-action-dispatch/v3',
            'nativeStepNumber': 1, 'nativeActionIndex': 0, 'actionRef': action.id,
            'actionName': 'find_elements', 'intentTarget': None, 'resultRef': reference.model_dump(),
            'entered': True, 'resultReceived': True, 'eventCapture': {'status': 'not_applicable',
                'eventExpectation': 'none', 'eventCount': 0, 'limitations': []}}),
        fact('result', 'native_action_result', {'schemaVersion': 'bat.native-action-result/v1',
            'actionRef': action.id, 'resultRef': reference.model_dump(),
            'receivedFromToolsAct': True, 'result': raw})]
    post.facts = [row for row in post.facts if row.kind != 'verified_natural_read']
    post.facts.append(fact('post-document', 'document_identity', identity))
    request = NS(trace=NS(actions=[action], observations=[pre, post]))
    ledger = [ActionCoverage(actionRef=action.id, disposition='not_compilable', evidenceRefs=[reference])]
    return request, ledger


class DiscoveryGapLiveness(unittest.TestCase):
    def test_unused_proven_discovery_retires_only_derived_read_verification_gaps(self):
        for reason in ('natural_read_output_changed', 'natural_read_container_identity_changed'):
            with self.subTest(reason=reason):
                request, ledger = fixture()
                old = gap('missing_effect_proof', ['a-0006'], reason, 'collect_evidence')
                unrelated = gap('invalid_source', ['a-0006'], 'source_invalid', 'reject_trace')
                rows, remaining = retire_unused_discovery(request, REGISTRY, ledger, [old, unrelated], set())
                self.assertEqual(rows[0].disposition, 'agent_internal')
                self.assertEqual(remaining, [unrelated])

    def test_consumed_or_different_document_read_keeps_its_failure(self):
        for mode in ('consumed', 'document_changed'):
            with self.subTest(mode=mode):
                request, ledger = fixture()
                if mode == 'document_changed':
                    post = request.trace.observations[1]
                    post.facts[-1] = fact('post-document', 'document_identity', {
                        'targetId': post.tabId, 'documentDigest': digest('another-document')})
                issue = gap('missing_effect_proof', ['a-0006'], 'natural_read_output_changed', 'collect_evidence')
                rows, remaining = retire_unused_discovery(request, REGISTRY, ledger, [issue],
                    {'a-0006'} if mode == 'consumed' else set())
                self.assertEqual(rows[0].disposition, 'not_compilable')
                self.assertEqual(remaining, [issue])


if __name__ == '__main__':
    unittest.main()
