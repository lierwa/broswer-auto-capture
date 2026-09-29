"""A query-derived click cannot outrun the evidence required by online compilation."""
import copy
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from workflow_use.hybrid.evidence import NormalizedAction, NormalizedObservation, NormalizedTrace, digest
from workflow_use.hybrid.natural_reads import VerifiedNaturalRead, find_elements_read_spec, runtime_read_specification
from workflow_use.hybrid.natural_selection import bind_selection_function
from workflow_use.hybrid.natural_target_compile import natural_target
from workflow_use.hybrid.selection_tool import PreparedSelections, SelectionCheck
from test_execution_dynamic_selection import URL, URL_DIGEST, REF, fact, query


def fixture(total=1):
    current = query(total)
    spec = find_elements_read_spec(current)
    read = VerifiedNaturalRead(actionRef='a-0001', specification=spec, outputPath=[], readPath=[],
        output=[{'text': 'chosen' if n == 1 else 'other', 'ordinal': n} for n in range(1, total + 1)],
        resultDigest='2' * 64, urlDigest=URL_DIGEST, targetId='tab-1',
        containerIdsDigest='3' * 64, stable=True)
    structure = {'actionRef': 'a-0002', 'scope': {'url': URL, 'urlDigest': URL_DIGEST,
        'tabId': 'tab-1', 'targetId': 'tab-1', 'frameId': None}, 'targetRef': 'n-0001',
        'nodes': [{'id': 'n-0001', 'tag': 'a', 'xpath': '/html/body/a[1]'}],
        'queryCandidate': {'scope': {'kind': 'document', 'tabId': 'tab-1', 'frameId': None},
            'container': {'kind': 'css', 'value': 'html'}, 'items': {'kind': 'css', 'value': 'a.item'},
            'withinItem': None, 'matchedItemOrdinal': 1, 'targetRef': 'n-0001', 'complete': True,
            'readActionRef': 'a-0001'}, 'historyTarget': None, 'limitations': []}
    read_fact = fact('read', 'verified_natural_read', read.model_dump(mode='json'))
    observations = []
    for index, facts in enumerate(([fact('url-1', 'url_digest', URL_DIGEST),
            fact('query', 'dom_query', current.model_dump(mode='json')), read_fact],
            [fact('url-2', 'url_digest', URL_DIGEST), fact('target', 'dom_structure', structure)])):
        facts.append(fact(f'document-{index}', 'document_identity',
                          {'targetId': 'tab-1', 'documentDigest': '5' * 64}))
        for item in facts:
            item.sourceRefs = [REF.model_copy(update={'digest': digest(item.value)})]
        observations.append(NormalizedObservation(id=f'o-{index + 1:04d}', sequence=index,
            url=URL, tabId='tab-1', facts=facts, sourceRefs=[REF]))
    actions = [NormalizedAction(id='a-0001', stepIndex=0, actionIndex=0, name='find_elements',
        args={}, status='succeeded', postObservationRef='o-0001', effect='read'),
        NormalizedAction(id='a-0002', stepIndex=1, actionIndex=0, name='click',
        args={'index': 42}, status='succeeded', preObservationRef='o-0002', effect='ui_state')]
    body = {'mediaType': 'application/vnd.bat.browser-use-trace+json;version=2',
        'source': {'provider': 'browser-use', 'version': '0.13.8', 'historyRef': 'fixture'},
        'completed': False, 'actions': [a.model_dump(mode='json') for a in actions],
        'observations': [o.model_dump(mode='json') for o in observations],
        'finalResultRef': None, 'redactionManifestRef': REF.model_dump(mode='json')}
    trace = NormalizedTrace.model_validate({**body, 'digest': digest(body)})
    prepared = PreparedSelections()
    prepared.bind(SimpleNamespace(observations=trace.observations,
        pending={'pre': 'o-0002', 'actionId': 'a-0002', 'action': {'click': {'index': 42}}}),
        SimpleNamespace(requirementDigest='4' * 64, requirementText='Choose the first item.',
                        task='Open the first item from the list.'), None)
    draft = {'language': 'javascript', 'source': 'function main({candidates}) { '
        'const hits = candidates.filter(c => c.text === "chosen"); '
        'if (hits.length !== 1) throw new Error("ambiguous"); return hits[0].ordinal; }',
        'inputs': {'candidates': spec.outputSchema},
        'outputSchema': {'type': 'integer', 'minimum': 1, 'maximum': spec.maxItems},
        'examples': [{'input': {'candidates': read.output}, 'output': 1}]}
    prepared.validated[read_fact.id] = {'readActionRef': 'a-0001', 'readFactRef': read_fact.id,
                                      'ordinal': 1, 'draft': draft}
    segment = {'id': 's-a-0001', 'operation': {'name': 'browser.read-fields',
        'specification': runtime_read_specification(spec)}, 'outputs': [{'sourceRef': read_fact.id}]}
    return prepared, trace, segment


class PreparedSelectionDispatchTests(unittest.IsolatedAsyncioTestCase):
    async def test_latest_empty_read_requests_a_new_query_without_validating_an_older_read(self):
        prepared, trace, _ = fixture(3)
        empty = trace.observations[0].model_copy(deep=True)
        empty.id = 'o-0003'
        empty.sequence = 2
        read = next(f for f in empty.facts if f.kind == 'verified_natural_read')
        read.id = 'empty-read'
        read.value['actionRef'] = 'a-0003'
        read.value['output'] = []
        prepared.collector.observations.append(empty)
        prepared.model = SimpleNamespace(endpoint='http://validator.invalid', token='test')
        with patch('workflow_use.hybrid.selection_tool.aiohttp.ClientSession',
                   side_effect=ValueError('empty candidates must not reach the validator')) as client:
            result = await prepared.validate(SelectionCheck(source='function main({candidates}) { return 1; }'))
        self.assertTrue(result.error.startswith('selection_candidates_empty:'), result.error)
        self.assertIn('find_elements', result.error)
        self.assertEqual(prepared.current_read().id, 'empty-read')
        client.assert_not_called()
        self.assertEqual(prepared.clicks, {})

    def test_validated_singleton_and_collection_reach_the_same_compiler(self):
        for total in (1, 3):
            with self.subTest(total=total):
                prepared, trace, read_segment = fixture(total)
                original = copy.deepcopy(trace)
                prepared.before_dispatch()
                self.assertIn('o-0002', prepared.clicks)
                updated = prepared.attach(trace)
                target, _, issues = natural_target(updated.actions[-1], updated.observations[-1])
                self.assertEqual(issues, [])
                request = SimpleNamespace(trace=updated, requirement=SimpleNamespace(sourceDigest='4' * 64))
                functions, click, gaps = bind_selection_function(request, updated.actions[-1],
                    [read_segment], {'id': 's-a-0002', 'target': target})
                self.assertEqual(gaps, [])
                self.assertEqual(functions[0]['draft'], prepared.validated['read']['draft'])
                self.assertEqual(click['target']['ordinalBinding']['nodeId'], 'selection-a-0002')
                self.assertEqual(trace, original)

    def test_unique_query_without_program_attaches_a_cardinality_guard(self):
        prepared, trace, read_segment = fixture()
        prepared.validated.clear()
        prepared.before_dispatch()
        updated = prepared.attach(trace)
        target, _, _ = natural_target(updated.actions[-1], updated.observations[-1])
        functions, click, gaps = bind_selection_function(SimpleNamespace(trace=updated,
            requirement=SimpleNamespace(sourceDigest='4' * 64)), updated.actions[-1],
            [read_segment], {'id': 's-a-0002', 'target': target})
        self.assertEqual(gaps, [])
        self.assertIn('candidates.length !== 1', functions[0]['draft']['source'])
        self.assertEqual(click['target']['ordinalBinding']['nodeId'], 'selection-a-0002')
        self.assertEqual(prepared.validated, {})

    def test_missing_program_does_not_block_native_click_or_invent_proof(self):
        for mode in ('collection', 'wrong_ordinal', 'missing_document', 'incomplete_query'):
            with self.subTest(mode=mode):
                prepared, trace, _ = fixture(3 if mode == 'collection' else 1)
                if mode == 'wrong_ordinal':
                    prepared.validated['read']['ordinal'] = 2
                else:
                    prepared.validated.clear()
                if mode == 'missing_document':
                    prepared.collector.observations[-1].facts = [f for f in trace.observations[-1].facts
                                                               if f.kind != 'document_identity']
                if mode == 'incomplete_query':
                    next(f for f in trace.observations[0].facts if f.kind == 'dom_query').value['complete'] = False
                prepared.before_dispatch()
                self.assertEqual(prepared.clicks, {})


if __name__ == '__main__':
    unittest.main()
