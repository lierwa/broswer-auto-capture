"""A complete native query may constrain a replayable whole-record read."""

import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.collection_completion import collection_proof_candidates
from workflow_use.hybrid.dom_evidence import DomQueryEvidence, DomScope
from workflow_use.hybrid.evidence import EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.host_read_facts import attach_host_read_facts
from workflow_use.hybrid.natural_output import (
    build_verified_output_assembly, compile_natural_output_assembly,
)
from workflow_use.hybrid.natural_reads import VerifiedNaturalRead, compile_verified_read, find_elements_read_spec
from workflow_use.hybrid.query_record_projection import query_snapshot_projection
from workflow_use.hybrid.read import ReadField, ReadSpec, read_fields
from workflow_use.hybrid.record_projection_capture import HostProjectionFailure, HostReadMapping
from workflow_use.hybrid.record_projection_snapshot import HostSnapshotPair, derive_host_read
from workflow_use.hybrid.rendered_field_text import FieldReadError

from test_record_projection_capture import Node, page


URL = 'https://example.test/issues'
ROWS = [
    {'title': 'First issue', 'url': 'https://example.test/1'},
    {'title': 'Second issue', 'url': 'https://example.test/2'},
]
SCHEMA = {'type': 'array', 'items': {'type': 'object', 'properties': {
    'title': {'type': 'string'}, 'url': {'type': 'string'},
}, 'required': ['title', 'url'], 'additionalProperties': False}}


def reference(value):
    value_digest = digest(value)
    return EvidenceRef(ref='fixture:' + value_digest, digest=value_digest)


def fact(kind, value):
    return ObservationFact(id='fact-' + digest(value), kind=kind, value=value,
                           sourceRefs=[reference(value)])


def anchors(root):
    body = root.children_nodes[0].children_nodes[0]
    main = next(node for node in body.children_nodes if node.node_name == 'main')
    return main.children_nodes


def source(*, duplicate_nav=False, hidden_second=False, titles=None, hrefs=None):
    titles = titles or ['First issue', 'Second issue']
    hrefs = hrefs or ['/1', '/2']
    links = [Node('a', text=title, attributes={'class': 'issue-link', 'href': href})
             for title, href in zip(titles, hrefs, strict=True)]
    if hidden_second:
        links[1].is_visible = False
    root = page(*links)
    if duplicate_nav:
        body = root.children_nodes[0].children_nodes[0]
        navigation = Node('nav', children=[Node('a', text=title,
            attributes={'class': 'issue-link', 'href': href})
            for title, href in zip(titles, hrefs, strict=True)])
        navigation.parent_node = body
        body.children_nodes.insert(0, navigation)
    summary = lambda node: SimpleNamespace(url=URL,
        dom_state=SimpleNamespace(_root=SimpleNamespace(original_node=node)))
    snapshots = HostSnapshotPair(first=summary(root), second=summary(deepcopy(root)),
        identity={'targetId': 'tab-1', 'url': URL})
    query = DomQueryEvidence(actionRef='a-0003',
        scope=DomScope(url=URL, urlDigest=digest(URL), tabId='tab-1',
                       targetId=None, frameId=None, document=None),
        query={'kind': 'css', 'value': 'main.issues > a.issue-link'},
        requestedAttributes=['href'], includeText=True, maxResults=10,
        total=2, showing=2, truncated=False, complete=True,
        limitations=['result_bodies_omitted'])
    native_rows = [{'text': title, 'attribute_href': 'https://example.test' + href,
                    'ordinal': index} for index, (title, href) in enumerate(
                        zip(titles, hrefs, strict=True), 1)]
    verified = VerifiedNaturalRead(actionRef=query.actionRef,
        specification=find_elements_read_spec(query), outputPath=[], readPath=[],
        output=native_rows, resultDigest=digest('native-result'), urlDigest=digest(URL),
        targetId='tab-1', containerIdsDigest=digest([node.backend_node_id for node in links]),
        stable=True)
    return snapshots, query, verified


class QueryRecordProjectionTest(unittest.TestCase):
    def setUp(self):
        Node.next_backend = 1

    def project(self, snapshots, query, verified, rows=ROWS):
        return query_snapshot_projection(snapshots, [(query, verified)], SCHEMA, rows,
            [HostReadMapping(outputPath=[], readPath=[])])

    def test_full_unique_two_field_mapping_uses_same_native_cohort_in_both_snapshots(self):
        snapshots, query, verified = source(duplicate_nav=True, hidden_second=True)

        capture = self.project(snapshots, query, verified)

        self.assertEqual(capture.output, ROWS)
        self.assertEqual(capture.specification.fields['title'], verified.specification.fields['text'])
        self.assertEqual(capture.specification.fields['url'],
                         verified.specification.fields['attribute_href'])
        self.assertEqual(capture.containerIdsDigest, verified.containerIdsDigest)
        self.assertEqual(capture.targetId, verified.targetId)
        self.assertEqual(capture.urlDigest, verified.urlDigest)
        self.assertNotIn('nth-', capture.specification.container)
        self.assertIn('main.issues', capture.specification.container)
        self.assertEqual(derive_host_read(snapshots, SCHEMA, ROWS, [(query, verified)]).output, ROWS)

    def test_partial_reversed_or_different_target_is_rejected(self):
        snapshots, query, verified = source()
        for rows, candidate in (
            (ROWS[:1], verified),
            (list(reversed(ROWS)), verified),
            (ROWS, verified.model_copy(update={'targetId': 'tab-2'})),
        ):
            with self.subTest(rows=rows, target=candidate.targetId):
                with self.assertRaises(HostProjectionFailure):
                    self.project(snapshots, query, candidate, rows)

    def test_incomplete_query_or_changed_cohort_is_rejected(self):
        snapshots, query, verified = source()
        for candidate_query, candidate_read in (
            (query.model_copy(update={'complete': False}), verified),
            (query.model_copy(update={'truncated': True}), verified),
            (query, verified.model_copy(update={'stable': False})),
            (query, verified.model_copy(update={'containerIdsDigest': 'f' * 64})),
        ):
            with self.subTest(query=candidate_query.complete, stable=candidate_read.stable,
                              digest=candidate_read.containerIdsDigest):
                with self.assertRaises(HostProjectionFailure):
                    self.project(snapshots, candidate_query, candidate_read)

    def test_same_cohort_with_different_query_budgets_is_one_projection(self):
        snapshots, query, verified = source()
        wider_query = query.model_copy(update={'actionRef': 'a-0008', 'maxResults': 20})
        wider_read = verified.model_copy(update={
            'actionRef': wider_query.actionRef,
            'specification': find_elements_read_spec(wider_query),
        })

        capture = query_snapshot_projection(snapshots,
            [(query, verified), (wider_query, wider_read)], SCHEMA, ROWS,
            [HostReadMapping(outputPath=[], readPath=[])])

        self.assertEqual(capture.output, ROWS)
        self.assertEqual(capture.specification.maxItems, 300)

    def test_query_action_reference_must_match_verified_read(self):
        snapshots, query, verified = source()

        with self.assertRaises(HostProjectionFailure):
            self.project(snapshots, query,
                         verified.model_copy(update={'actionRef': 'a-0099'}))

    def test_old_read_spec_roundtrip_and_new_projection_completeness(self):
        old = ReadSpec(container='main.issues > a.issue-link',
            fields={'title': ReadField(selector=':scope')}, maxItems=2,
            outputSchema={'type': 'array', 'items': {'type': 'object',
                'properties': {'title': {'type': 'string'}},
                'required': ['title'], 'additionalProperties': False}})
        old_payload = old.model_dump(mode='json')
        self.assertNotIn('requireComplete', old_payload)
        self.assertEqual(ReadSpec.model_validate(old_payload).model_dump(mode='json'), old_payload)
        required_payload = old.model_copy(update={'requireComplete': True}).model_dump(mode='json')
        self.assertIs(required_payload['requireComplete'], True)
        self.assertIs(ReadSpec.model_validate(required_payload).requireComplete, True)

        snapshots, query, verified = source()
        self.assertIs(self.project(snapshots, query, verified).specification.requireComplete, True)

    def test_second_snapshot_value_or_backend_identity_change_is_rejected(self):
        for change in ('value', 'identity'):
            with self.subTest(change=change):
                snapshots, query, verified = source()
                second = anchors(snapshots.second.dom_state._root.original_node)[1]
                if change == 'value':
                    second.node_value = 'Changed issue'
                else:
                    second.backend_node_id += 1000
                with self.assertRaises(HostProjectionFailure):
                    self.project(snapshots, query, verified)

    def test_equal_native_columns_cannot_be_guessed_into_business_fields(self):
        urls = ['https://example.test/1', 'https://example.test/2']
        snapshots, query, verified = source(titles=urls)
        rows = [{'title': url, 'url': url} for url in urls]

        with self.assertRaises(HostProjectionFailure):
            self.project(snapshots, query, verified, rows)

    def test_host_fact_compiles_to_one_read_and_whole_array_output(self):
        snapshots, query, verified = source(duplicate_nav=True, hidden_second=True)
        pre = SimpleNamespace(id='o-0003', tabId='tab-1', url=URL,
            facts=[fact('url_digest', digest(URL))], sourceRefs=[reference('pre')])
        post = SimpleNamespace(id='o-0004', tabId='tab-1', url=URL,
            facts=[fact('url_digest', digest(URL))], sourceRefs=[reference('post')])
        result = reference('extract-result')
        collector = SimpleNamespace(output_schema=SCHEMA, completed_queries=[(query, verified)],
            host_read_captures=[{'actionRef': 'a-0002', 'resultDigest': result.digest,
                                 'snapshots': snapshots, 'postObservationRef': post.id}],
            observations=[pre, post], value_fact=fact)

        output = attach_host_read_facts(collector, ROWS)
        self.assertEqual(output, ROWS)
        self.assertEqual(collection_proof_candidates(collector, SCHEMA, ROWS)[0]
                         ['queryActionRefs'], ['a-0003'])
        action = SimpleNamespace(id='a-0002', name='extract', resultRef=result,
            postObservationRef=post.id)
        request = SimpleNamespace(plan=SimpleNamespace(outputSchemaDigest=digest(SCHEMA)))
        segment, paths, issues = compile_verified_read(request, action, pre, post, SCHEMA, [])
        self.assertEqual(issues, [])
        self.assertEqual(paths, [[]])
        self.assertEqual(segment['operation']['name'], 'browser.read-fields')
        assembly, gaps = build_verified_output_assembly(
            collector.observations, ROWS, SCHEMA, lambda _kind, value: reference(value).model_dump())
        self.assertEqual(gaps, [])
        trace = SimpleNamespace(observations=[pre, post, SimpleNamespace(id='o-done', facts=[assembly])],
            actions=[action], finalResultRef=reference(ROWS))
        compiled, gaps = compile_natural_output_assembly(trace, SCHEMA, [segment])
        self.assertEqual(gaps, [])
        self.assertEqual(compiled['fields'], [{
            'binding': {'source': 'node', 'nodeId': 'a-0002', 'path': []}, 'path': [],
        }])


class CompleteCollectionReadTest(unittest.IsolatedAsyncioTestCase):
    async def test_complete_read_rejects_overflow_before_projecting_fields(self):
        specification = ReadSpec(container='main.issues > a.issue-link',
            fields={'title': ReadField(selector=':scope')}, maxItems=2,
            requireComplete=True, outputSchema={'type': 'array', 'items': {
                'type': 'object', 'properties': {'title': {'type': 'string'}},
                'required': ['title'], 'additionalProperties': False}})
        with patch('workflow_use.hybrid.read.TargetResolver.resolve_collection',
                   new=AsyncMock(return_value=[object(), object(), object()])) as resolve:
            with patch('workflow_use.hybrid.read.project_fields', new=AsyncMock()) as project:
                with self.assertRaises(FieldReadError) as raised:
                    await read_fields(object(), specification)
        self.assertEqual(str(raised.exception), 'read_collection_limit')
        self.assertEqual(raised.exception.match_count, 3)
        resolve.assert_awaited_once()
        project.assert_not_awaited()


if __name__ == '__main__':
    unittest.main()
