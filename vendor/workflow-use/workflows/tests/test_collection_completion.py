"""A list result needs the same stable paired records as a complete source query."""

import unittest
from types import SimpleNamespace

from workflow_use.hybrid.author import CompletionReview, _review_completion
from workflow_use.hybrid.collection_completion import collection_proof_candidates, review_collection_refs
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.read import ReadField, ReadSpec


ROWS = [{'title': 'First', 'url': 'https://example.test/1'},
        {'title': 'Second', 'url': 'https://example.test/2'}]
SCHEMA = {'type': 'array', 'maxItems': 5, 'items': {'type': 'object',
          'properties': {'title': {'type': 'string'}, 'url': {'type': 'string'}},
          'required': ['title', 'url'], 'additionalProperties': False}}


def source(count=2, *, identity=None, complete=True):
    specification = ReadSpec(container='main > article.row',
        fields={'title': ReadField(selector=':scope > a'),
                'url': ReadField(selector=':scope > a', attribute='href')},
        maxItems=5, outputSchema=SCHEMA)
    ids = digest([11, 22])
    capture = SimpleNamespace(specification=specification, output=ROWS,
        mappings=[{'outputPath': [], 'readPath': []}], stable=True,
        targetId='tab-1', urlDigest='a' * 64, containerIdsDigest=ids)
    query = SimpleNamespace(actionRef='a-query', complete=complete,
        truncated=False, total=count)
    verified = SimpleNamespace(stable=True, targetId='tab-1', urlDigest='a' * 64,
        containerIdsDigest=identity or ids)
    return SimpleNamespace(host_read_captures=[{'capture': capture}],
                           completed_queries=[(query, verified)])


class CollectionCompletionTest(unittest.TestCase):
    def test_same_stable_paired_dom_group_is_citable(self):
        candidates = collection_proof_candidates(source(), SCHEMA, ROWS)
        self.assertEqual(candidates, [{'path': [], 'count': 2,
                                       'queryActionRefs': ['a-query']}])
        self.assertTrue(review_collection_refs(
            SimpleNamespace(collectionActionRefs=['a-query']), candidates))
        self.assertFalse(review_collection_refs(
            SimpleNamespace(collectionActionRefs=[]), candidates))

    def test_zero_broad_or_different_dom_query_cannot_prove_full_list(self):
        for collector in (source(0), source(3), source(identity='b' * 64), source(complete=False)):
            with self.subTest(collector=collector.completed_queries[0][0].total):
                self.assertEqual(collection_proof_candidates(collector, SCHEMA, ROWS)[0]
                                 ['queryActionRefs'], [])

    def test_nested_record_list_keeps_its_output_path(self):
        schema = {'type': 'object', 'properties': {'records': SCHEMA},
                  'required': ['records'], 'additionalProperties': False}
        collector = source()
        collector.host_read_captures[0]['capture'].mappings = [
            {'outputPath': ['records'], 'readPath': []}]
        self.assertEqual(collection_proof_candidates(collector, schema, {'records': ROWS}), [
            {'path': ['records'], 'count': 2, 'queryActionRefs': ['a-query']}])

    def test_scalar_and_execution_results_keep_prior_review_path(self):
        self.assertEqual(collection_proof_candidates(source(), {'type': 'string'}, 'Ready'), [])
        self.assertEqual(collection_proof_candidates(source(), {'type': 'null'}, None), [])


class CollectionReviewTest(unittest.IsolatedAsyncioTestCase):
    async def test_supported_review_must_cite_the_stable_query(self):
        collector = source()
        collector.observations = []
        request = SimpleNamespace(outputSchema=SCHEMA, task='List records.',
            requirementText='List every record.', entryUrls=['https://example.test/'], input=None)
        history = SimpleNamespace(agent_steps=lambda: ['read', 'done'],
                                  urls=lambda: ['https://example.test/'])

        class Browser:
            async def get_browser_state_summary(self, *, include_screenshot):
                return SimpleNamespace(url='https://example.test/', title='Records',
                    dom_state=SimpleNamespace(llm_representation=lambda: 'Two record rows'))

        class Model:
            async def ainvoke(self, _messages, output_format):
                return SimpleNamespace(completion=CompletionReview(
                    status='supported', reason='Seen all rows.'))

        review, reason = await _review_completion(Browser(), collector, request, history, Model(), ROWS)
        self.assertIsNone(reason)
        self.assertEqual(review.status, 'investigate')
        self.assertEqual(review.reason, 'collection_scope_reference_missing')


if __name__ == '__main__':
    unittest.main()
