import asyncio
import unittest
from types import SimpleNamespace

from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.read import read_value
from workflow_use.hybrid.record_projection_capture import (
    CapturedHostRead,
    HostProjectionFailure,
    matching_output_paths,
    projection_candidates,
)
from workflow_use.hybrid.record_projection_snapshot import (
    HostSnapshotPair,
    _enhanced_root,
    capture_host_snapshots,
    derive_host_read,
)


class Node:
    next_backend = 1

    def __init__(self, tag, *, text='', attributes=None, children=None):
        self.node_name = tag
        self.node_value = text
        self.attributes = attributes or {}
        self.children_nodes = children or []
        self.parent_node = None
        self.backend_node_id = Node.next_backend
        Node.next_backend += 1
        self.target_id = 'tab-1'
        self.is_visible = True
        for child in self.children_nodes:
            child.parent_node = self

    def get_all_children_text(self):
        values = [self.node_value] if self.node_value else []
        values.extend(child.get_all_children_text() for child in self.children_nodes)
        return '\n'.join(value for value in values if value)


def issue(title, href, labels):
    link = Node('a', text=title, attributes={'class': 'issue-link', 'href': href})
    label_nodes = [Node('span', text=value, attributes={'class': 'label'}) for value in labels]
    return Node('article', attributes={'class': 'issue'}, children=[
        link, Node('div', attributes={'class': 'labels'}, children=label_nodes),
    ])


def page(*records):
    return Node('#document', children=[Node('html', children=[
        Node('body', children=[Node('main', attributes={'class': 'issues'}, children=list(records))]),
    ])])


SCHEMA = {
    'type': 'array',
    'items': {
        'type': 'object',
        'properties': {
            'title': {'type': 'string', 'maxLength': 200},
            'url': {'type': 'string', 'maxLength': 500},
            'labels': {'type': 'array', 'items': {'type': 'string', 'maxLength': 100}, 'maxItems': 10},
        },
        'required': ['title', 'url', 'labels'],
        'additionalProperties': False,
    },
    'maxItems': 5,
}


class RecordProjectionCaptureTest(unittest.TestCase):
    def test_snapshot_capture_freezes_mutable_browser_dom_before_later_observations(self):
        first_root = page(Node('article', text='First page'))
        second_root = page(Node('article', text='Second page'))
        shared = SimpleNamespace(url='https://example.test/issues',
            dom_state=SimpleNamespace(_root=SimpleNamespace(original_node=first_root)))

        class CurrentPage:
            async def get_target_info(self): return {'targetId': 'tab-1'}
            async def get_url(self): return shared.url

        class MutableBrowser:
            calls = 0

            async def get_browser_state_summary(self, **_kwargs):
                self.calls += 1
                if self.calls == 2:
                    shared.dom_state._root.original_node = second_root
                return shared

            async def get_current_page(self): return CurrentPage()

        snapshots = asyncio.run(capture_host_snapshots(MutableBrowser()))
        shared.dom_state._root.original_node = page(Node('article', text='Later page'))

        self.assertIn('First page', _enhanced_root(snapshots.first).get_all_children_text())
        self.assertIn('Second page', _enhanced_root(snapshots.second).get_all_children_text())

    def setUp(self):
        Node.next_backend = 1

    def test_host_derives_one_record_rule_not_one_selector_per_sample_row(self):
        output = [
            {'title': 'First issue', 'url': 'https://example.test/1', 'labels': ['bug', 'urgent']},
            {'title': 'Second issue', 'url': 'https://example.test/2', 'labels': ['docs']},
        ]
        root = page(
            issue('First issue', '/1', ['bug', 'urgent']),
            issue('Second issue', '/2', ['docs']),
        )

        specifications = projection_candidates(root, SCHEMA, output, 'https://example.test/issues')

        self.assertEqual(len(specifications), 1)
        spec = specifications[0]
        self.assertEqual(spec.container, 'body > main.issues > article.issue')
        self.assertEqual(spec.maxItems, 5)
        self.assertNotIn('nth-', spec.container)
        self.assertEqual(spec.fields['title'].selector, ':scope > a.issue-link')
        self.assertEqual(spec.fields['url'].attribute, 'href')
        self.assertTrue(spec.fields['url'].resolveUrl)
        self.assertEqual(spec.fields['labels'].selector, ':scope > div.labels > span.label')
        self.assertTrue(spec.fields['labels'].multiple)

    def test_duplicate_business_values_without_unique_record_anchor_fail_closed(self):
        output = [
            {'title': 'Same', 'url': 'https://example.test/same', 'labels': ['bug']},
            {'title': 'Same', 'url': 'https://example.test/same', 'labels': ['bug']},
        ]
        root = page(
            issue('Same', 'https://example.test/same', ['bug']),
            issue('Same', 'https://example.test/same', ['bug']),
        )

        with self.assertRaisesRegex(HostProjectionFailure, 'anchor_missing'):
            projection_candidates(root, SCHEMA, output, 'https://example.test/issues')

    def test_output_mapping_keeps_dynamic_array_whole(self):
        value = {'issues': [{'title': 'One'}], 'report': {'count': 1}}
        schema = {
            'type': 'object',
            'properties': {
                'issues': {'type': 'array', 'items': {'type': 'object', 'properties': {
                    'title': {'type': 'string'}}, 'required': ['title'], 'additionalProperties': False}, 'maxItems': 5},
                'report': {'type': 'object', 'properties': {'count': {'type': 'integer'}},
                           'required': ['count'], 'additionalProperties': False},
            },
            'required': ['issues', 'report'],
            'additionalProperties': False,
        }

        paths = matching_output_paths(schema, value, schema['properties']['issues'], value['issues'])

        self.assertEqual(paths, [['issues']])

    def test_integer_field_uses_one_proven_text_prefix_across_records(self):
        schema = {'type': 'array', 'maxItems': 5, 'items': {
            'type': 'object', 'properties': {
                'issueNumber': {'type': 'integer'}, 'title': {'type': 'string'},
            }, 'required': ['issueNumber', 'title'], 'additionalProperties': False,
        }}
        root = page(
            Node('article', attributes={'class': 'issue'}, children=[
                Node('span', text='#8059', attributes={'class': 'number'}),
                Node('a', text='First issue', attributes={'class': 'title'}),
            ]),
            Node('article', attributes={'class': 'issue'}, children=[
                Node('span', text='#8408', attributes={'class': 'number'}),
                Node('a', text='Second issue', attributes={'class': 'title'}),
            ]),
        )

        specification = projection_candidates(root, schema, [
            {'issueNumber': 8059, 'title': 'First issue'},
            {'issueNumber': 8408, 'title': 'Second issue'},
        ], 'https://example.test/issues')[0]

        field = specification.fields['issueNumber']
        self.assertEqual(field.textPrefix, '#')
        self.assertIsNone(field.textSuffix)
        self.assertEqual(read_value('issueNumber', '#8059', field), 8059)

    def test_string_field_uses_one_proven_text_prefix_across_records(self):
        schema = {'type': 'array', 'maxItems': 5, 'items': {
            'type': 'object', 'properties': {
                'issueNumber': {'type': 'string'}, 'title': {'type': 'string'},
            }, 'required': ['issueNumber', 'title'], 'additionalProperties': False,
        }}
        root = page(
            Node('article', attributes={'class': 'issue'}, children=[
                Node('span', text='#8059', attributes={'class': 'number'}),
                Node('a', text='First issue', attributes={'class': 'title'}),
            ]),
            Node('article', attributes={'class': 'issue'}, children=[
                Node('span', text='#8408', attributes={'class': 'number'}),
                Node('a', text='Second issue', attributes={'class': 'title'}),
            ]),
        )

        specification = projection_candidates(root, schema, [
            {'issueNumber': '8059', 'title': 'First issue'},
            {'issueNumber': '8408', 'title': 'Second issue'},
        ], 'https://example.test/issues')[0]

        field = specification.fields['issueNumber']
        self.assertEqual(field.valueType, 'string')
        self.assertEqual(field.textPrefix, '#')
        self.assertEqual(read_value('issueNumber', '#8059', field), '8059')

    def test_integer_affix_prefers_one_normalized_projection_for_the_same_dom_node(self):
        schema = {'type': 'array', 'maxItems': 2, 'items': {
            'type': 'object', 'properties': {
                'issueNumber': {'type': 'integer'}, 'title': {'type': 'string'},
            }, 'required': ['issueNumber', 'title'], 'additionalProperties': False,
        }}
        root = page(
            Node('article', attributes={'class': 'issue'}, children=[
                Node('span', attributes={'class': 'number'}, children=[
                    Node('span', text='#\n8059'), Node('span'),
                ]),
                Node('a', text='First issue', attributes={'class': 'title'}),
            ]),
            Node('article', attributes={'class': 'issue'}, children=[
                Node('span', attributes={'class': 'number'}, children=[
                    Node('span', text='#\n8408'), Node('span'),
                ]),
                Node('a', text='Second issue', attributes={'class': 'title'}),
            ]),
        )

        specification = projection_candidates(root, schema, [
            {'issueNumber': 8059, 'title': 'First issue'},
            {'issueNumber': 8408, 'title': 'Second issue'},
        ], 'https://example.test/issues')[0]

        field = specification.fields['issueNumber']
        self.assertTrue(field.normalizeWhitespace)
        self.assertEqual(field.textPrefix, '#')
        self.assertEqual(read_value('issueNumber', '#\n8059', field), 8059)
        self.assertEqual(read_value('issueNumber', '#8059', field), 8059)

    def test_scalar_field_uses_a_stable_child_position_when_plain_tag_matches_a_sibling(self):
        schema = {'type': 'array', 'maxItems': 2, 'items': {
            'type': 'object', 'properties': {
                'issueNumber': {'type': 'integer'}, 'title': {'type': 'string'},
            }, 'required': ['issueNumber', 'title'], 'additionalProperties': False,
        }}
        root = page(
            Node('article', attributes={'class': 'issue'}, children=[
                Node('div', attributes={'class': 'number'}, children=[
                    Node('span', text='#8059'), Node('span'),
                ]),
                Node('a', text='First issue', attributes={'class': 'title'}),
            ]),
            Node('article', attributes={'class': 'issue'}, children=[
                Node('div', attributes={'class': 'number'}, children=[
                    Node('span', text='#8408'), Node('span'),
                ]),
                Node('a', text='Second issue', attributes={'class': 'title'}),
            ]),
        )

        specification = projection_candidates(root, schema, [
            {'issueNumber': 8059, 'title': 'First issue'},
            {'issueNumber': 8408, 'title': 'Second issue'},
        ], 'https://example.test/issues')[0]

        field = specification.fields['issueNumber']
        self.assertEqual(field.selector, ':scope > div.number > span:nth-child(1)')
        self.assertEqual(read_value('issueNumber', '#8059', field), 8059)

    def test_scalar_field_ascends_when_value_child_positions_differ_across_records(self):
        schema = {'type': 'array', 'maxItems': 2, 'items': {
            'type': 'object', 'properties': {
                'issueNumber': {'type': 'integer'}, 'title': {'type': 'string'},
            }, 'required': ['issueNumber', 'title'], 'additionalProperties': False,
        }}
        root = page(
            Node('article', attributes={'class': 'issue'}, children=[
                Node('div', attributes={'class': 'number'}, children=[
                    Node('span', text='#8059'), Node('span'),
                ]),
                Node('a', text='First issue', attributes={'class': 'title'}),
            ]),
            Node('article', attributes={'class': 'issue'}, children=[
                Node('div', attributes={'class': 'number'}, children=[
                    Node('span'), Node('span', text='#8408'),
                ]),
                Node('a', text='Second issue', attributes={'class': 'title'}),
            ]),
        )

        specification = projection_candidates(root, schema, [
            {'issueNumber': 8059, 'title': 'First issue'},
            {'issueNumber': 8408, 'title': 'Second issue'},
        ], 'https://example.test/issues')[0]

        self.assertEqual(specification.fields['issueNumber'].selector, ':scope > div.number')

    def test_string_affix_prefers_one_normalized_projection_for_the_same_dom_node(self):
        schema = {'type': 'array', 'maxItems': 5, 'items': {
            'type': 'object', 'properties': {
                'issueNumber': {'type': 'string'}, 'title': {'type': 'string'},
            }, 'required': ['issueNumber', 'title'], 'additionalProperties': False,
        }}
        root = page(
            Node('article', attributes={'class': 'issue'}, children=[
                Node('span', text='#\n8059', attributes={'class': 'number'}),
                Node('a', text='First issue', attributes={'class': 'title'}),
            ]),
            Node('article', attributes={'class': 'issue'}, children=[
                Node('span', text='#\n8408', attributes={'class': 'number'}),
                Node('a', text='Second issue', attributes={'class': 'title'}),
            ]),
        )

        specifications = projection_candidates(root, schema, [
            {'issueNumber': '8059', 'title': 'First issue'},
            {'issueNumber': '8408', 'title': 'Second issue'},
        ], 'https://example.test/issues')

        self.assertEqual(len(specifications), 1)
        field = specifications[0].fields['issueNumber']
        self.assertTrue(field.normalizeWhitespace)
        self.assertEqual(field.textPrefix, '# ')
        self.assertEqual(read_value('issueNumber', '#\n8059', field), '8059')

    def test_text_projection_preserves_exact_multiline_content(self):
        schema = {'type': 'object', 'properties': {'body': {'type': 'string'}},
                  'required': ['body'], 'additionalProperties': False}
        body = 'Line one\n\nLine two'
        root = page(Node('article', attributes={'class': 'detail'}, children=[
            Node('div', text=body, attributes={'class': 'body'}),
        ]))

        specification = projection_candidates(
            root, schema, {'body': body}, 'https://example.test/issues/1')[0]

        field = specification.fields['body']
        self.assertFalse(field.normalizeWhitespace)
        self.assertEqual(read_value('body', body, field), body)

    def test_semantic_code_markup_is_canonicalized_to_plain_visible_text(self):
        schema = {'type': 'object', 'properties': {'title': {'type': 'string'}},
                  'required': ['title'], 'additionalProperties': False}
        title = Node('span', attributes={'class': 'title'}, children=[
            Node('span', text='nothing happens with '),
            Node('code', text='Developer: Policy Diagnostics'),
        ])
        root = page(Node('article', attributes={'class': 'issue'}, children=[title]))
        summary = SimpleNamespace(url='https://example.test/issues',
            dom_state=SimpleNamespace(_root=SimpleNamespace(original_node=root)))
        snapshots = HostSnapshotPair(first=summary, second=summary,
            identity={'targetId': 'tab-1', 'url': 'https://example.test/issues'})

        captured = derive_host_read(snapshots, schema, {
            'title': 'nothing happens with `Developer: Policy Diagnostics`',
        })

        self.assertEqual(captured.output, {
            'title': 'nothing happens with Developer: Policy Diagnostics',
        })
        field = captured.specification.fields['title']
        self.assertTrue(field.normalizeWhitespace)
        self.assertTrue(field.normalizePresentation)
        self.assertEqual(read_value(
            'title', 'nothing happens with \nDeveloper: Policy Diagnostics', field),
            captured.output['title'])

    def test_one_semantic_title_normalizes_the_field_without_deleting_other_visible_hyphens(self):
        schema = {**SCHEMA, 'maxItems': 3}
        def record(title):
            href = '/' + title.replace(' ', '-') if isinstance(title, str) else '/'
            return Node('article', attributes={'class': 'issue'}, children=[
                Node('a', attributes={'class': 'title', 'href': href},
                     children=[title] if isinstance(title, Node) else [
                         Node('span', children=[Node('span', text=title)]),
                     ]),
                Node('div', attributes={'class': 'labels'}, children=[
                    Node('span', text='bug', attributes={'class': 'label'}),
                ]),
            ])
        root = page(
            record('Plain title'),
            record(Node('span', children=[Node('span', text='Uses '), Node('code', text='inline code')])),
            record('Agents - visible hyphen'),
        )
        summary = SimpleNamespace(url='https://example.test/issues',
            dom_state=SimpleNamespace(_root=SimpleNamespace(original_node=root)))
        snapshots = HostSnapshotPair(first=summary, second=summary,
            identity={'targetId': 'tab-1', 'url': 'https://example.test/issues'})

        captured = derive_host_read(snapshots, schema, [
            {'title': 'Plain title', 'url': 'https://example.test/Plain-title', 'labels': ['bug']},
            {'title': 'Uses `inline code`', 'url': 'https://example.test/', 'labels': ['bug']},
            {'title': 'Agents - visible hyphen', 'url': 'https://example.test/Agents---visible-hyphen',
             'labels': ['bug']},
        ])

        self.assertTrue(captured.specification.fields['title'].normalizePresentation)
        self.assertEqual(captured.output, [
            {'title': 'Plain title', 'url': 'https://example.test/Plain-title', 'labels': ['bug']},
            {'title': 'Uses inline code', 'url': 'https://example.test/', 'labels': ['bug']},
            {'title': 'Agents - visible hyphen', 'url': 'https://example.test/Agents---visible-hyphen',
             'labels': ['bug']},
        ])

    def test_collector_maps_a_host_read_to_one_whole_output_path(self):
        output = [
            {'title': 'First issue', 'url': 'https://example.test/1', 'labels': ['bug']},
        ]
        specification = projection_candidates(
            page(issue('First issue', 'https://example.test/1', ['bug'])),
            SCHEMA, output, 'https://example.test/issues')[0]
        captured = CapturedHostRead(
            specification=specification, output=output, urlDigest='a' * 64,
            targetId='tab-1', containerIdsDigest='b' * 64, stable=True)
        collector = object.__new__(EvidenceCollector)
        collector.output_schema = {
            'type': 'object', 'properties': {'issues': SCHEMA},
            'required': ['issues'], 'additionalProperties': False,
        }
        collector.host_read_captures = [{
            'actionRef': 'a-0001', 'resultDigest': 'c' * 64,
            'capture': captured, 'postObservationRef': 'o-0002',
        }]
        observation = SimpleNamespace(id='o-0002', facts=[])
        collector.observations = [observation]
        collector.value_fact = lambda kind, value: SimpleNamespace(kind=kind, value=value)

        collector.attach_host_reads({'issues': output})

        self.assertEqual(len(observation.facts), 1)
        self.assertEqual(observation.facts[0].kind, 'verified_natural_read')
        self.assertEqual(observation.facts[0].value['outputPath'], ['issues'])
        self.assertEqual(observation.facts[0].value['actionRef'], 'a-0001')

    def test_collector_reuses_one_unique_read_leaf_for_another_output_field(self):
        output = [
            {'title': 'First issue', 'url': 'https://example.test/1', 'labels': ['bug']},
        ]
        specification = projection_candidates(
            page(issue('First issue', 'https://example.test/1', ['bug'])),
            SCHEMA, output, 'https://example.test/issues')[0]
        captured = CapturedHostRead(
            specification=specification, output=output, urlDigest='a' * 64,
            targetId='tab-1', containerIdsDigest='b' * 64, stable=True)
        collector = object.__new__(EvidenceCollector)
        collector.output_schema = {
            'type': 'object', 'properties': {
                'issues': SCHEMA,
                'detail': {'type': 'object', 'properties': {
                    'sourceUrl': {'type': 'string', 'maxLength': 500}},
                           'required': ['sourceUrl'], 'additionalProperties': False},
            }, 'required': ['issues', 'detail'], 'additionalProperties': False,
        }
        collector.host_read_captures = [{
            'actionRef': 'a-0001', 'resultDigest': 'c' * 64,
            'capture': captured, 'postObservationRef': 'o-0002',
        }]
        observation = SimpleNamespace(id='o-0002', facts=[])
        collector.observations = [observation]
        collector.value_fact = lambda kind, value: SimpleNamespace(kind=kind, value=value)

        collector.attach_host_reads({
            'issues': output, 'detail': {'sourceUrl': 'https://example.test/1'},
        })

        mappings = {(tuple(fact.value['outputPath']), tuple(fact.value['readPath']))
                    for fact in observation.facts}
        self.assertEqual(mappings, {
            (('issues',), ()),
            (('detail', 'sourceUrl'), (0, 'url')),
        })


if __name__ == '__main__':
    unittest.main()
