"""Host read evidence and output mappings over one proven DOM snapshot pair."""
import asyncio
import unittest
from types import SimpleNamespace

from test_record_projection_capture import Node, issue, page, SCHEMA
from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.record_projection_capture import (
    CapturedHostRead, HostReadMapping, capture_host_read, projection_candidates,
)
from workflow_use.hybrid.record_projection_snapshot import HostSnapshotPair, derive_host_read


class HostReadMappingTest(unittest.TestCase):
    def setUp(self):
        Node.next_backend = 1

    def test_host_read_replaces_model_presentation_with_the_proven_dom_value(self):
        schema = {'type': 'object', 'properties': {'title': {'type': 'string'}},
                  'required': ['title'], 'additionalProperties': False}
        root = page(Node('article', children=[Node('span', text='Plain title')]))
        specification = projection_candidates(root, schema, {'title': 'Plain title'})[0]
        captured = CapturedHostRead(
            specification=specification, output={'title': 'Plain title'},
            mappings=[HostReadMapping(outputPath=['title'], readPath=['title'])],
            urlDigest='a' * 64, targetId='tab-1', containerIdsDigest='b' * 64, stable=True)
        collector = object.__new__(EvidenceCollector)
        collector.output_schema = schema
        collector.host_read_captures = [{
            'actionRef': 'a-0001', 'resultDigest': 'c' * 64,
            'capture': captured, 'postObservationRef': 'o-0002',
        }]
        observation = SimpleNamespace(id='o-0002', facts=[])
        collector.observations = [observation]
        collector.value_fact = lambda kind, value: SimpleNamespace(kind=kind, value=value)

        canonical = collector.attach_host_reads({'title': '`Plain title`'})

        self.assertEqual(canonical, {'title': 'Plain title'})
        self.assertEqual(observation.facts[0].value['outputPath'], ['title'])

    def test_live_capture_requires_the_derived_rule_to_reproduce_the_extract(self):
        output = [
            {'title': 'First issue', 'url': 'https://example.test/1', 'labels': ['bug']},
            {'title': 'Second issue', 'url': 'https://example.test/2', 'labels': ['docs']},
        ]
        root = page(
            issue('First issue', 'https://example.test/1', ['bug']),
            issue('Second issue', 'https://example.test/2', ['docs']),
        )
        summary = SimpleNamespace(url='https://example.test/issues',
            dom_state=SimpleNamespace(_root=SimpleNamespace(original_node=root)))

        class Page:
            async def get_target_info(self):
                return {'targetId': 'tab-1'}

            async def get_url(self):
                return 'https://example.test/issues'

        class Browser:
            async def get_current_page(self):
                return Page()

        async def reader(_browser, specification, identity):
            self.assertEqual(specification.container, 'body > main.issues > article.issue')
            self.assertEqual(identity['targetId'], 'tab-1')
            return output, 'b' * 64

        captured = asyncio.run(capture_host_read(
            Browser(), summary, SCHEMA, output, reader=reader))

        self.assertEqual(captured.output, output)
        self.assertTrue(captured.stable)

    def test_final_output_is_linked_to_two_same_page_dom_snapshots_without_extract_metadata(self):
        issues = [
            {'title': 'First issue', 'url': 'https://example.test/1', 'labels': ['bug']},
            {'title': 'Second issue', 'url': 'https://example.test/2', 'labels': ['docs']},
        ]
        root = page(
            issue('First issue', '/1', ['bug']),
            issue('Second issue', '/2', ['docs']),
        )
        summary = SimpleNamespace(url='https://example.test/issues',
            dom_state=SimpleNamespace(_root=SimpleNamespace(original_node=root)))
        snapshots = HostSnapshotPair(first=summary, second=summary,
            identity={'targetId': 'tab-1', 'url': 'https://example.test/issues'})
        output_schema = {'type': 'object', 'properties': {'issues': SCHEMA},
                         'required': ['issues'], 'additionalProperties': False}

        captured = derive_host_read(snapshots, output_schema, {'issues': issues})

        self.assertEqual(captured.output, issues)
        self.assertEqual([item.model_dump() for item in captured.mappings], [
            {'outputPath': ['issues'], 'readPath': []},
        ])
        articles = root.children_nodes[0].children_nodes[0].children_nodes[0].children_nodes
        self.assertEqual(captured.containerIdsDigest,
                         digest([article.backend_node_id for article in articles]))

    def test_dynamic_record_list_keeps_full_read_with_runtime_bound(self):
        records = [
            {'title': 'First issue', 'url': 'https://example.test/1', 'labels': ['bug']},
            {'title': 'Second issue', 'url': 'https://example.test/2', 'labels': ['docs']},
        ]
        root = page(issue('First issue', '/1', ['bug']), issue('Second issue', '/2', ['docs']))
        summary = SimpleNamespace(url='https://example.test/issues',
            dom_state=SimpleNamespace(_root=SimpleNamespace(original_node=root)))
        snapshots = HostSnapshotPair(first=summary, second=summary,
            identity={'targetId': 'tab-1', 'url': 'https://example.test/issues'})
        schema = {key: value for key, value in SCHEMA.items() if key != 'maxItems'}

        captured = derive_host_read(snapshots, schema, records)

        self.assertEqual(captured.output, records)
        self.assertEqual(captured.specification.outputSchema, schema)
        self.assertEqual(captured.specification.maxItems, 300)

    def test_root_scalar_output_is_wrapped_only_inside_the_read_spec(self):
        text = 'Catalog result for alpha'
        root = page(Node('output', text=text, attributes={'data-testid': 'result'}))
        summary = SimpleNamespace(url='https://example.test/catalog',
            dom_state=SimpleNamespace(_root=SimpleNamespace(original_node=root)))
        snapshots = HostSnapshotPair(first=summary, second=summary,
            identity={'targetId': 'tab-1', 'url': 'https://example.test/catalog'})

        captured = derive_host_read(snapshots, {'type': 'string'}, text)

        self.assertEqual(captured.output, {'value': text})
        self.assertEqual(captured.specification.outputSchema, {
            'type': 'object', 'properties': {'value': {'type': 'string'}},
            'required': ['value'], 'additionalProperties': False,
        })
        self.assertEqual([item.model_dump() for item in captured.mappings], [
            {'outputPath': [], 'readPath': ['value']},
        ])

    def test_partial_object_projection_maps_each_verified_field_to_the_final_object(self):
        title = Node('h1', text='Issue title', attributes={'class': 'title'})
        body = Node('div', text='Issue body', attributes={'class': 'body'})
        root = page(Node('article', attributes={'class': 'issue-detail'}, children=[title, body]))
        summary = SimpleNamespace(url='https://example.test/issues/1',
            dom_state=SimpleNamespace(_root=SimpleNamespace(original_node=root)))
        snapshots = HostSnapshotPair(first=summary, second=summary,
            identity={'targetId': 'tab-1', 'url': 'https://example.test/issues/1'})
        detail_schema = {'type': 'object', 'properties': {
            'title': {'type': 'string'}, 'body': {'type': 'string'},
            'sourceUrl': {'type': 'string'}, 'unavailableReason': {'type': 'string'},
        }, 'required': ['title', 'body', 'sourceUrl', 'unavailableReason'],
            'additionalProperties': False}
        final = {'detail': {'title': 'Issue title', 'body': 'Issue body',
                            'sourceUrl': 'https://example.test/issues/1', 'unavailableReason': ''}}
        output_schema = {'type': 'object', 'properties': {'detail': detail_schema},
                         'required': ['detail'], 'additionalProperties': False}

        captured = derive_host_read(snapshots, output_schema, final)

        self.assertEqual(captured.output, {'title': 'Issue title', 'body': 'Issue body'})
        self.assertEqual({(tuple(item.outputPath), tuple(item.readPath)) for item in captured.mappings}, {
            (('detail', 'title'), ('title',)), (('detail', 'body'), ('body',)),
        })



if __name__ == '__main__':
    unittest.main()
