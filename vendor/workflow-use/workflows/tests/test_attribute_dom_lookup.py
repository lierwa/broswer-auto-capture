"""Attribute-only DOM discovery stays scoped source evidence and supplies no runtime values."""
import unittest
from types import SimpleNamespace

from browser_use.agent.views import ActionResult

from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.coverage import validate_coverage
from workflow_use.hybrid.dom_evidence import capture_find_elements_query, complete_find_elements_query
from workflow_use.hybrid.evidence import NormalizedAction, NormalizedObservation, digest
from workflow_use.hybrid.natural_compile import natural_dom_lookup_coverage
from test_method_source_compile import fact, method_source, reference


ARGS = {'selector': 'a.next', 'max_results': 10, 'attributes': ['href'], 'include_text': False}


def attribute_source(*, total=0, include_text=False):
    request, registry, schema, _read = method_source()
    raw = request.model_dump(mode='json', by_alias=True)
    actions, observations = raw['trace']['actions'], raw['trace']['observations']
    url = observations[0]['url']
    args = {**ARGS, 'include_text': include_text}
    result = ActionResult(long_term_memory=f'Found {total} elements matching "a.next".')
    query = complete_find_elements_query(capture_find_elements_query(
        SimpleNamespace(url=url), 'a-0002', args, args, 'tab-1'), [result])
    result_ref = reference(result.model_dump(mode='json'))
    probe_observations = [NormalizedObservation(id=f'o-{index:04d}', sequence=index - 1, url=url, tabId='tab-1',
        sourceRefs=[reference(index)], facts=[fact('url_digest', digest(url)),
            *([fact('dom_query', query.model_dump(mode='json'))] if index == 4 else [])]).model_dump(mode='json')
        for index in (3, 4)]
    for index, item in enumerate(observations[2:], start=5):
        item.update(id=f'o-{index:04d}', sequence=index - 1)
    actions[-1].update(id='a-0003', stepIndex=2, preObservationRef='o-0005', postObservationRef='o-0006')
    actions.insert(1, NormalizedAction(id='a-0002', stepIndex=1, actionIndex=0,
        name='find_elements', args=args, status='succeeded', effect='read', resultRef=result_ref,
        preObservationRef='o-0003', postObservationRef='o-0004').model_dump(mode='json'))
    observations[2:2] = probe_observations
    raw['trace']['digest'] = digest({key: value for key, value in raw['trace'].items() if key != 'digest'})
    return type(request).model_validate(raw), registry, schema, query, result


class NoBrowserReads:
    @property
    def agent_focus_target_id(self):
        raise AssertionError('attribute_discovery_must_not_reread_browser')


class AttributeDomLookupTests(unittest.IsolatedAsyncioTestCase):
    async def test_capture_preserves_query_without_live_read_or_source_gap(self):
        for total in (0, 2):
            with self.subTest(total=total):
                request, registry, _schema, query, result = attribute_source(total=total)
                collector = EvidenceCollector(NoBrowserReads(), registry,
                    put_evidence=lambda _kind, value: reference(value), redact_action=lambda value: value)
                collector.pending = {'sourceUrl': request.trace.observations[0].url, 'actionId': 'a-0002'}
                collector.results[(1, 0)] = request.trace.actions[1].resultRef
                saved = collector.dom_query_fact(query)
                reads = await collector.find_elements_read_facts(query, [result], 1)
                self.assertEqual(reads, [])
                self.assertEqual(collector.completed_queries, [])
                self.assertEqual(collector.source_gaps, [])
                self.assertEqual(saved.kind, 'dom_query')
                self.assertEqual(saved.value['total'], total)
                self.assertTrue(saved.value['complete'])

    def test_full_compiler_keeps_only_data_method_and_scoped_discovery_coverage(self):
        for total in (0, 2):
            with self.subTest(total=total):
                request, registry, schema, _query, _result = attribute_source(total=total)
                compiled = compile_request(request, registry, output_schema=schema)
                self.assertEqual(compiled.gaps, [])
                self.assertEqual([item['id'] for item in compiled.segments], ['s-a-0001'])
                row = compiled.coverage[1]
                self.assertEqual(row.disposition, 'agent_internal')
                self.assertEqual(row.exclusionRule, 'native_dom_lookup_observation/v1')
                self.assertIsNone(row.ownerSegmentId)
                self.assertFalse(any(item.kind == 'verified_natural_read' for item in request.trace.observations[3].facts))
                self.assertEqual(validate_coverage(request.trace, compiled.coverage, {'s-a-0001'},
                                                  registry=registry, consumed_query_ids=set()), [])

    def test_complete_text_query_still_requires_verified_read(self):
        request, registry, schema, _query, _result = attribute_source(include_text=True)
        self.assertIsNone(natural_dom_lookup_coverage(
            registry, request.trace.actions[1], request.trace.observations[2], request.trace.observations[3]))
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertIn('natural_field_read_evidence_missing', [item['reason'] for item in compiled.gaps])
        self.assertEqual(compiled.controlGraph['entry'], '')

    def test_attribute_probe_cannot_supply_a_later_navigation_binding(self):
        request, registry, schema, _query, _result = attribute_source(total=1)
        destination = 'https://example.test/discovered-only'
        action = request.trace.actions[-1]
        action.name, action.effect, action.args = 'navigate', 'navigation', {'url': destination}
        post = request.trace.observations[-1]
        post.url = destination
        post.facts = [fact('url_digest', digest(destination)), fact('natural_postcondition', {
            'actionRef': action.id, 'kind': 'url', 'bindingArgument': 'url', 'matched': True})]
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertIn('natural_binding_evidence_missing:url', [item['reason'] for item in compiled.gaps])
        self.assertEqual(compiled.controlGraph['entry'], '')

    def test_tampered_query_identity_and_reference_cannot_be_excluded(self):
        mutations = [lambda action, pre, post: action.args.update(selector='a.other'),
                     lambda action, pre, post: action.args.update(attributes=['title']),
                     lambda action, pre, post: setattr(pre, 'url', 'https://other.test/'),
                     lambda action, pre, post: setattr(post, 'tabId', 'other-tab'),
                     lambda action, pre, post: setattr(post.facts[-1].sourceRefs[0], 'digest', 'f' * 64),
                     lambda action, pre, post: setattr(action, 'postObservationRef', 'o-9999')]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                request, registry, schema, _query, _result = attribute_source()
                action, pre, post = request.trace.actions[1], request.trace.observations[2], request.trace.observations[3]
                mutate(action, pre, post)
                self.assertIsNone(natural_dom_lookup_coverage(registry, action, pre, post))
                compiled = compile_request(request, registry, output_schema=schema)
                self.assertTrue(compiled.gaps)
                self.assertEqual(compiled.controlGraph['entry'], '')

    def test_coverage_cannot_drop_evidence_or_claim_discovery_is_consumed(self):
        request, registry, _schema, _query, _result = attribute_source()
        row = natural_dom_lookup_coverage(registry, request.trace.actions[1],
                                         request.trace.observations[2], request.trace.observations[3])
        self.assertIsNotNone(row)
        for forged in [row.model_copy(update={'evidenceRefs': [row.evidenceRefs[0]]}),
                       row.model_copy(update={'actionRef': 'a-0001'})]:
            issues = validate_coverage(request.trace, [forged], set(), registry=registry, consumed_query_ids=set())
            self.assertIn('invalid_exclusion', [item.reason for item in issues])
        issues = validate_coverage(request.trace, [row], set(), registry=registry, consumed_query_ids={'a-0002'})
        self.assertIn('invalid_exclusion', [item.reason for item in issues])


if __name__ == '__main__':
    unittest.main()
