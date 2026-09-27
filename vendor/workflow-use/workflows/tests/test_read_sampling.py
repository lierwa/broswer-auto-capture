"""Representative reads retain the runtime method and only project bounded samples."""
import json
import unittest
from copy import deepcopy

from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.read import ReadSpec, read_fields
from workflow_use.hybrid.read_sampling import sample_read_fields


def specification(*, maximum=100, minimum=0, complete=False, ordinal=False, byte_limit=None):
    properties = {'name': {'type': 'string', 'minLength': 2}}
    if ordinal:
        properties['ordinal'] = {'type': 'integer', 'minimum': 1}
    return ReadSpec(container='.row', fields={'name': {'selector': '.name'}},
        maxItems=maximum, requireComplete=complete, includeOrdinal=ordinal,
        maxInputBytes=byte_limit, outputSchema={'type': 'array', 'minItems': minimum,
        'maxItems': maximum, 'items': {'type': 'object', 'properties': properties,
        'required': list(properties), 'additionalProperties': False}})


class Element:
    def __init__(self, identifier, reads, values=('ok',)):
        self.identifier, self.reads, self.values = identifier, reads, values
        self.calls = 0

    async def get_basic_info(self):
        return {'backendNodeId': self.identifier}

    async def evaluate(self, _script, fields):
        self.reads.append(self.identifier)
        value = self.values[min(self.calls, len(self.values) - 1)]
        self.calls += 1
        return json.dumps({field['name']: {'selfMatched': False,
            'values': [{'value': value, 'hasShadow': False}]} for field in fields})


class Page:
    def __init__(self, count, *, roots=(1,), mutate=None, values=('ok',)):
        self.reads, self.queries, self.snapshot = [], [], -1
        self.elements = [Element(index + 10, self.reads, values) for index in range(count)]
        self.roots, self.mutate = roots, mutate
        self.url, self.target_id = 'https://example.test/list', 'target-1'

    async def get_target_info(self):
        return {'targetId': self.target_id}

    async def get_url(self):
        return self.url

    async def get_elements_by_css_selector(self, selector):
        self.queries.append(selector)
        if selector == ':root':
            self.snapshot += 1
            if self.mutate is not None:
                self.mutate(self)
            return [Element(self.roots[min(self.snapshot, len(self.roots) - 1)], self.reads)]
        return self.elements


class Browser:
    def __init__(self, page):
        self.page = page

    async def get_current_page(self):
        return self.page


class ReadSamplingTests(unittest.IsolatedAsyncioTestCase):
    async def test_bounded_sample_preserves_method_and_ignores_collection_minimum(self):
        method = specification(maximum=100, minimum=100)
        before = deepcopy(method.model_dump(mode='json'))
        page = Page(100)
        sample = await sample_read_fields(Browser(page), method)
        self.assertEqual(page.reads, [10, 11, 12, 10, 11, 12])
        self.assertEqual(sample.output, [{'name': 'ok'}] * 3)
        self.assertEqual(sample.specificationDigest, digest(before))
        self.assertEqual(sample.outputDigest, digest(sample.output))
        self.assertEqual(sample.coverage.model_dump(), {'scope': 'current_dom_matches',
            'total': 100, 'sampled': 3, 'sampleLimit': 3, 'runtimeTruncated': False})
        self.assertEqual(method.model_dump(mode='json'), before)
        self.assertEqual(sample.documentRootId, 1)
        self.assertEqual(sample.containerIdsDigest, digest(list(range(10, 110))))

    async def test_runtime_read_still_projects_and_validates_original_full_output(self):
        method = specification(maximum=8, minimum=8)
        page = Page(8)
        await sample_read_fields(Browser(page), method)
        page.reads.clear()
        output = await read_fields(Browser(page), method)
        self.assertEqual(len(output), 8)
        self.assertEqual(page.reads, list(range(10, 18)))
        with self.assertRaisesRegex(ValueError, 'read_output_schema_mismatch'):
            await read_fields(Browser(Page(3)), method)

    async def test_runtime_prefix_budget_is_explicit_without_claiming_completeness(self):
        page = Page(7)
        sample = await sample_read_fields(Browser(page), specification(maximum=2))
        self.assertEqual(page.reads, [10, 11, 10, 11])
        self.assertEqual(sample.coverage.total, 7)
        self.assertEqual(sample.coverage.sampled, 2)
        self.assertTrue(sample.coverage.runtimeTruncated)

    async def test_complete_and_ordinal_reads_still_reject_runtime_overflow(self):
        for flags in ({'complete': True}, {'ordinal': True}):
            with self.subTest(flags=flags):
                page = Page(4)
                with self.assertRaisesRegex(ValueError, 'read_collection_limit'):
                    await sample_read_fields(Browser(page), specification(maximum=3, **flags))
                self.assertEqual(page.reads, [])

    async def test_item_constraints_and_byte_budget_remain_enforced(self):
        for method, values, message in ((specification(), ('x',), 'read_output_schema_mismatch'),
                (specification(byte_limit=1), ('ok',), 'read_input_limit')):
            with self.subTest(message=message):
                with self.assertRaisesRegex(ValueError, message):
                    await sample_read_fields(Browser(Page(10, values=values)), method)

    async def test_same_url_reload_is_rejected_even_when_values_and_container_ids_match(self):
        with self.assertRaisesRegex(ValueError, 'read_sample_document_changed'):
            await sample_read_fields(Browser(Page(4, roots=(1, 2))), specification())

    async def test_identity_change_outside_sample_is_detected(self):
        def change_last(page):
            if page.snapshot == 1:
                page.elements[-1] = Element(500, page.reads)
        page = Page(10, mutate=change_last)
        with self.assertRaisesRegex(ValueError, 'natural_read_container_identity_changed'):
            await sample_read_fields(Browser(page), specification())
        self.assertEqual(page.reads, [10, 11, 12])

    async def test_value_change_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'natural_read_output_changed'):
            await sample_read_fields(Browser(Page(4, values=('before', 'after'))), specification())

    async def test_target_change_during_snapshot_is_rejected(self):
        def change_target(page):
            if page.snapshot == 1:
                page.target_id = 'target-2'
        with self.assertRaisesRegex(ValueError, 'natural_read_page_identity_changed'):
            await sample_read_fields(Browser(Page(4, mutate=change_target)), specification())

    async def test_expected_page_identity_is_enforced_before_projection(self):
        page = Page(4)
        with self.assertRaisesRegex(ValueError, 'natural_read_page_identity_changed'):
            await sample_read_fields(Browser(page), specification(),
                                    expected_identity={'targetId': 'other', 'url': page.url})
        self.assertEqual(page.reads, [])

    async def test_object_and_ordinal_shapes_use_the_existing_projection(self):
        method = specification(maximum=1)
        method.outputSchema = method.outputSchema['items']
        sample = await sample_read_fields(Browser(Page(1)), method)
        self.assertEqual(sample.output, {'name': 'ok'})
        ordinal_sample = await sample_read_fields(Browser(Page(4)), specification(ordinal=True))
        self.assertEqual([item['ordinal'] for item in ordinal_sample.output], [1, 2, 3])

    async def test_empty_collection_is_explicitly_an_empty_observation(self):
        page = Page(0)
        sample = await sample_read_fields(Browser(page), specification(minimum=5))
        self.assertEqual(sample.output, [])
        self.assertEqual(sample.coverage.total, 0)
        self.assertEqual(sample.coverage.sampled, 0)
        self.assertEqual(page.reads, [])

    async def test_invalid_sample_limit_is_rejected_before_browser_access(self):
        for value in (0, -1, True, 301, 1.5):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, 'read_sample_limit_invalid'):
                    await sample_read_fields(None, specification(), sample_limit=value)


if __name__ == '__main__':
    unittest.main()
