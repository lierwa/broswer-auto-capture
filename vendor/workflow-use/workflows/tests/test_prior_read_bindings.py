import unittest
from types import SimpleNamespace

from workflow_use.hybrid.evidence import EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.natural_binding_compile import anchored_navigation_binding, natural_bindings
from workflow_use.hybrid.natural_facts import binding_facts
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


def read_fact(identity, output, action_ref='a-0001'):
    value = {
        'actionRef': action_ref, 'specification': SPECIFICATION.model_dump(mode='json'),
        'outputPath': ['issues'], 'readPath': [], 'output': output,
        'resultDigest': '1' * 64, 'urlDigest': '2' * 64, 'targetId': 'tab-1',
        'containerIdsDigest': '3' * 64, 'stable': True,
    }
    return ObservationFact(id=identity, kind='verified_natural_read', value=value,
                           sourceRefs=[EvidenceRef(ref='fixture:' + identity, digest=digest(value))])


class PriorReadBindingTests(unittest.TestCase):
    def test_plan_entry_url_is_an_authorized_navigation_constant(self):
        entry = 'https://example.test/'
        facts = binding_facts('a-0001', 'navigate', {'url': entry, 'new_tab': False},
                              {}, {'type': 'object'}, 'Open Example.', [entry])
        observed_facts = []
        for index, item in enumerate(facts):
            value = item.model_dump(mode='json')
            observed_facts.append(ObservationFact(id=f'fact-entry-{index}', kind='natural_binding', value=value,
                sourceRefs=[EvidenceRef(ref=f'fixture:entry-{index}', digest=digest(value))]))
        request = SimpleNamespace(runtimeInputSchema={'type': 'object'},
            requirement=SimpleNamespace(text='Open Example.'),
            plan=SimpleNamespace(entryUrls=[entry]), trace=SimpleNamespace(actions=[], observations=[]))
        action = SimpleNamespace(id='a-0001', name='navigate', args={'url': entry, 'new_tab': False})

        decisions, issues = natural_bindings(
            request, action, SimpleNamespace(facts=observed_facts), False)

        self.assertEqual(issues, [])
        decision = next(item for item in decisions if item['argumentPath'] == 'url')
        self.assertEqual(decision['kind'], 'authorized_constant')
        self.assertEqual(decision['binding'], {'source': 'constant', 'value': entry})

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

    def test_recent_unique_read_resolves_value_repeated_in_older_broad_read(self):
        destination = 'https://example.test/series'
        broad = read_fact('fact-broad', [
            {'title': 'Card A', 'url': destination}, {'title': 'Card B', 'url': destination},
        ])
        exact = read_fact('fact-exact', [{'title': 'Series', 'url': destination}], 'a-0002')
        binding = binding_from_prior_reads('a-0003', 'url', destination, [broad, exact])
        self.assertEqual(binding.binding, {
            'source': 'node', 'nodeId': 'a-0002', 'path': [0, 'url']})
        self.assertEqual(binding.sourceReadRef, 'fact-exact')
        self.assertIsNone(binding_from_prior_reads(
            'a-0003', 'url', destination, [exact, broad]))

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

    def test_offline_compiler_derives_missing_binding_from_immutable_read(self):
        destination = 'https://example.test/series'
        broad = read_fact('fact-broad', [
            {'title': 'Card A', 'url': destination}, {'title': 'Card B', 'url': destination}])
        exact = read_fact('fact-exact', [{'title': 'Series', 'url': destination}], 'a-0002')
        observations = [SimpleNamespace(id='o-broad', facts=[broad]),
                        SimpleNamespace(id='o-exact', facts=[exact]),
                        SimpleNamespace(id='o-navigate', facts=[])]
        actions = [SimpleNamespace(id='a-0001', preObservationRef=None, postObservationRef='o-broad'),
                   SimpleNamespace(id='a-0002', preObservationRef=None, postObservationRef='o-exact')]
        action = SimpleNamespace(id='a-0003', name='navigate', args={'url': destination})
        actions.append(action)
        request = SimpleNamespace(runtimeInputSchema={'type': 'null'},
            trace=SimpleNamespace(actions=actions, observations=observations))
        segments = [{'id': 's-a-0001', 'outputs': [{'sourceRef': broad.id, 'schema': READ_SCHEMA}]},
                    {'id': 's-a-0002', 'outputs': [{'sourceRef': exact.id, 'schema': READ_SCHEMA}]}]
        decisions, issues = natural_bindings(request, action, observations[-1], False, segments)
        self.assertEqual(issues, [])
        self.assertEqual(decisions[0]['derivation'], 'prior_verified_read')
        self.assertEqual(decisions[0]['sourceRef'], exact.id)
        self.assertEqual(decisions[0]['binding'], {'source': 'node', 'nodeId': 'a-0002', 'path': [0, 'url']})

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
