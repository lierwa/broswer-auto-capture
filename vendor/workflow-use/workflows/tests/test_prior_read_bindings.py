import unittest
from types import SimpleNamespace

from workflow_use.hybrid.evidence import EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.natural_binding_compile import anchored_navigation_binding, natural_bindings
from workflow_use.hybrid.prior_read_bindings import binding_from_prior_reads
from workflow_use.hybrid.read import ReadField, ReadSpec

READ_SCHEMA = {'type': 'array', 'maxItems': 5, 'items': {
    'type': 'object', 'properties': {'title': {'type': 'string'}, 'url': {'type': 'string'}},
    'required': ['title', 'url'], 'additionalProperties': False,
}}
SPECIFICATION = ReadSpec(
    container='article.issue', fields={
        'title': ReadField(selector=':scope > a'),
        'url': ReadField(selector=':scope > a', attribute='href', resolveUrl=True),
    }, maxItems=5, outputSchema=READ_SCHEMA)


def read_fact(identity, output):
    value = {
        'actionRef': 'a-0001', 'specification': SPECIFICATION.model_dump(mode='json'),
        'outputPath': ['issues'], 'readPath': [], 'output': output,
        'resultDigest': '1' * 64, 'urlDigest': '2' * 64, 'targetId': 'tab-1',
        'containerIdsDigest': '3' * 64, 'stable': True,
    }
    return ObservationFact(id=identity, kind='verified_natural_read', value=value,
                           sourceRefs=[EvidenceRef(ref='fixture:' + identity, digest=digest(value))])


class PriorReadBindingTests(unittest.TestCase):
    def test_host_links_exact_later_argument_to_one_prior_output_path(self):
        source = read_fact('fact-read', [
            {'title': 'One', 'url': 'https://example.test/1'},
            {'title': 'Two', 'url': 'https://example.test/2'},
        ])

        binding = binding_from_prior_reads(
            'a-0002', 'url', 'https://example.test/2', [source, source])

        self.assertEqual(binding.binding, {
            'source': 'node', 'nodeId': 'a-0001', 'path': [1, 'url'],
        })
        self.assertEqual(binding.sourceReadRef, 'fact-read')
        self.assertEqual(binding.provenance, 'node_output')

    def test_host_rejects_same_argument_value_at_multiple_prior_paths(self):
        source = read_fact('fact-read', [
            {'title': 'Same', 'url': 'https://example.test/1'},
            {'title': 'Same', 'url': 'https://example.test/2'},
        ])

        self.assertIsNone(binding_from_prior_reads('a-0002', 'text', 'Same', [source]))

    def test_compiler_revalidates_node_path_value_and_source_read_fact(self):
        source = read_fact('fact-read', [
            {'title': 'One', 'url': 'https://example.test/1'},
            {'title': 'Two', 'url': 'https://example.test/2'},
        ])
        binding_value = binding_from_prior_reads(
            'a-0002', 'url', 'https://example.test/2', [source]).model_dump(mode='json')
        binding_fact = ObservationFact(
            id='fact-binding', kind='natural_binding', value=binding_value,
            sourceRefs=[EvidenceRef(ref='fixture:binding', digest=digest(binding_value))])
        read_observation = SimpleNamespace(id='o-read', facts=[source])
        pre = SimpleNamespace(id='o-action', facts=[binding_fact])
        source_action = SimpleNamespace(
            id='a-0001', preObservationRef='o-before-read', postObservationRef='o-read')
        request = SimpleNamespace(
            runtimeInputSchema={'type': 'object', 'properties': {},
                                'required': [], 'additionalProperties': False},
            requirement=SimpleNamespace(text='Open the selected issue.'),
            trace=SimpleNamespace(actions=[source_action], observations=[read_observation, pre]))
        action = SimpleNamespace(
            id='a-0002', name='navigate', args={'url': 'https://example.test/2'})
        prior_segment = {
            'id': 's-a-0001', 'outputs': [{'sourceRef': source.id, 'schema': READ_SCHEMA}],
        }

        decisions, issues = natural_bindings(
            request, action, pre, False, [prior_segment])

        self.assertEqual(issues, [])
        self.assertEqual(decisions[0]['kind'], 'prior_output')
        self.assertEqual(decisions[0]['binding'], {
            'source': 'node', 'nodeId': 'a-0001', 'path': [1, 'url'],
        })
        self.assertEqual(len(decisions[0]['proofRefs']), 2)

    def test_anchor_navigation_uses_the_unique_prior_read_url(self):
        destination = 'https://example.test/2'
        source = read_fact('fact-read', [
            {'title': 'One', 'url': 'https://example.test/1'},
            {'title': 'Two', 'url': destination},
        ])
        dom_value = {'actionRef': 'a-0002'}
        dom = ObservationFact(id='fact-dom', kind='dom_structure', value=dom_value,
            sourceRefs=[EvidenceRef(ref='fixture:dom', digest=digest(dom_value))])
        url = ObservationFact(id='fact-url', kind='url', value=destination,
            sourceRefs=[EvidenceRef(ref='fixture:url', digest=digest(destination))])
        pre = SimpleNamespace(id='o-pre', facts=[dom])
        post = SimpleNamespace(id='o-post', facts=[url])
        request = SimpleNamespace(
            runtimeInputSchema={'type': 'object', 'properties': {},
                                'required': [], 'additionalProperties': False},
            trace=SimpleNamespace(observations=[SimpleNamespace(id='o-read', facts=[source]), pre, post]))
        action = SimpleNamespace(id='a-0002', name='click')
        target = {'strategy': 'history', 'identity': {'nodeName': 'a'}}
        prior = {'id': 's-a-0001', 'outputs': [{'sourceRef': source.id, 'schema': READ_SCHEMA}]}

        decision, destination_fact = anchored_navigation_binding(
            request, action, pre, post, target, [prior])

        self.assertEqual(destination_fact.id, url.id)
        self.assertEqual(decision['derivation'], 'anchor_navigation')
        self.assertEqual(decision['binding'], {
            'source': 'node', 'nodeId': 'a-0001', 'path': [1, 'url'],
        })


if __name__ == '__main__':
    unittest.main()
