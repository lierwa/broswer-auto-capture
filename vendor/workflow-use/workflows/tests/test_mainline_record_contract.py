"""Protect business selection, typed missing values and same-record input inheritance."""
import copy
import unittest
from types import SimpleNamespace

from pydantic import ValidationError
from workflow_use.hybrid.method_completion import complete_from_read_refs
from workflow_use.hybrid.method_read_tool import method_read_params_for, expand_method_read_params, MethodReadToolParams, MethodReadRecords
from workflow_use.hybrid.read import read_fields
from workflow_use.hybrid.read_sampling import sample_read_fields
from test_read_sampling import Browser, Page, Element
import json


ITEM = {'type': 'object', 'properties': {'name': {'type': 'string'}, 'rank': {'type': 'integer'},
        'price': {'type': 'number'}, '__batRecordKey': {'type': 'string', 'minLength': 1}},
        'required': ['__batRecordKey'], 'additionalProperties': False}
SCHEMA = {'type': 'array', 'items': ITEM}


class MainlineRecordContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_object_read_inherits_current_record_and_keeps_missing_price_optional(self):
        target = {'type': 'object', 'properties': {'name': {'type': 'string'}, 'rank': {'type': 'integer'},
                  'size': {'type': 'string'}, 'price': {'type': 'number'}},
                  'required': ['name', 'rank', 'size'], 'additionalProperties': False}
        params = MethodReadToolParams(outputPath=[], container='.row',
            fields={'size': {'selector': '.size'}, 'price': {'selector': '.price'}})
        guaranteed = {**ITEM, 'required': ['name', 'rank', '__batRecordKey']}
        spec = expand_method_read_params(params, target, inherit_fields=['name', 'rank'], input_schema=guaranteed).specification
        class Detail(Element):
            async def evaluate(self, _script, fields):
                return json.dumps({f['name']: {'selfMatched': False, 'values': [] if f['name'] == 'price'
                    else [{'value': 'observed-size', 'hasShadow': False}]} for f in fields})
        page = Page(1); page.elements = [Detail(10, [])]
        sample = await sample_read_fields(Browser(page), spec, inherited={'name': 'first', 'rank': 1})
        self.assertEqual(sample.output, {'name': 'first', 'rank': 1, 'size': 'observed-size'})
        output = await read_fields(Browser(page), spec, inherited={'name': 'second', 'rank': 2})
        self.assertEqual(output, {'name': 'second', 'rank': 2, 'size': 'observed-size'})
        with self.assertRaises(ValueError):
            await read_fields(Browser(page), spec, inherited={'name': 'second'})

    def mapping(self):
        model = method_read_params_for(SCHEMA)
        self.assertNotIn('maxItems', model.model_json_schema()['properties'])
        with self.assertRaises(ValidationError):
            model.model_validate({'outputPath': [], 'container': '.row', 'fields': {'name': {'selector': '.name'}}, 'maxItems': 5})
        args = model.model_validate({'outputPath': [], 'container': '.row', 'take': 5,
            'fields': {'name': {'selector': '.name'}, 'rank': {'selector': ':scope', 'ordinal': True}}})
        return expand_method_read_params(args, SCHEMA)

    async def test_30_matches_take_5_preserves_full_page_budget_and_real_ordinals(self):
        spec = self.mapping().specification
        self.assertEqual(spec.maxItems, 300)
        self.assertEqual(spec.outputSchema['maxItems'], 5)
        browser = Browser(Page(30))
        sample = await sample_read_fields(browser, spec)
        self.assertEqual((sample.coverage.matched, sample.coverage.total, sample.coverage.sampled), (30, 5, 3))
        self.assertEqual([row['rank'] for row in sample.output], [1, 4, 5])
        replay = await read_fields(Browser(Page(30)), spec)
        self.assertEqual([row['rank'] for row in replay], [1, 2, 3, 4, 5])
        self.assertEqual([row['__batRecordKey'] for row in sample.output],
                         [replay[index]['__batRecordKey'] for index in (0, 3, 4)])

    async def test_take_does_not_disable_safety_budget(self):
        with self.assertRaisesRegex(ValueError, 'read_collection_limit'):
            await sample_read_fields(Browser(Page(301)), self.mapping().specification)

    def test_same_record_input_only_completion_keeps_fields_and_omits_optional_price(self):
        schema = copy.deepcopy(ITEM)
        schema['properties'].pop('__batRecordKey')
        schema['required'] = ['name', 'rank']
        records = SimpleNamespace(records=[], input_value={'name': 'same', 'rank': 1, '__batRecordKey': 'identity'},
                                  input_schema={**ITEM, 'required': ['name', 'rank', '__batRecordKey']})
        self.assertEqual(complete_from_read_refs(records, [], schema, None), {'name': 'same', 'rank': 1})
        records.input_schema = {'type': 'object', 'properties': {'name': {'type': 'number'}}}
        with self.assertRaises(ValueError):
            complete_from_read_refs(records, [], schema, None)

    async def test_detail_only_result_still_has_distinct_real_entry_and_same_page_identity(self):
        item = {'type': 'object', 'properties': {'price': {'type': 'number'},
                '__batRecordEntry': {'type': 'string'}, '__batRecordKey': {'type': 'string'}},
                'required': ['__batRecordKey'], 'additionalProperties': False}
        params = MethodReadToolParams(outputPath=[], container='.row', fields={
            '__batRecordEntry': {'selector': 'a', 'attribute': 'href', 'resolveUrl': True}})
        spec = expand_method_read_params(params, {'type': 'array', 'items': item}).specification
        class Link(Element):
            async def evaluate(self, _script, fields):
                return json.dumps({f['name']: {'selfMatched': False, 'values': [{
                    'value': f'https://example.test/detail/{self.identifier}', 'hasShadow': False}]} for f in fields})
        page = Page(2); page.elements = [Link(i, []) for i in (10, 11)]
        output = await read_fields(Browser(page), spec)
        self.assertEqual(len({row['__batRecordKey'] for row in output}), 2)
        self.assertTrue(all('__batRecordEntry' in row and 'price' not in row for row in output))
        # No href: identical values are separate observed page positions, not silently deduplicated.
        spec = self.mapping().specification.model_copy(update={'fields': {'name': self.mapping().specification.fields['name']}})
        values = await read_fields(Browser(Page(2)), spec)
        self.assertEqual(len({row['__batRecordKey'] for row in values}), 2)

    async def test_optional_input_cannot_replace_required_output_without_verified_fallback(self):
        target = {'type': 'object', 'properties': {'name': {'type': 'string'}, 'size': {'type': 'string'}},
                  'required': ['name', 'size'], 'additionalProperties': False}
        records = MethodReadRecords(target)
        records.input_schema, records.input_value = ITEM, {'name': 'first', '__batRecordKey': '1'}
        with self.assertRaisesRegex(ValueError, 'natural_read_schema_mismatch'):
            records.resolve(MethodReadToolParams(outputPath=[], container='.row', fields={'size': {'selector': '.size'}}))
        _, mapping = records.resolve(MethodReadToolParams(outputPath=[], container='.row', fields={
            'size': {'selector': '.size'}, 'name': {'selector': '.name'}}))
        class Detail(Element):
            async def evaluate(self, _script, fields):
                return json.dumps({f['name']: {'selfMatched': False, 'values': [] if f['name'] == 'name' and self.identifier == 11
                    else [{'value': 'detail-' + f['name'], 'hasShadow': False}]} for f in fields})
        page = Page(1); page.elements = [Detail(10, [])]
        self.assertEqual((await read_fields(Browser(page), mapping.specification, inherited={'__batRecordKey': '2'}))['name'], 'detail-name')
        page.elements = [Detail(11, [])]
        self.assertEqual((await read_fields(Browser(page), mapping.specification, inherited={'name': 'third'}))['name'], 'third')
        with self.assertRaises(ValueError):
            await sample_read_fields(Browser(page), mapping.specification, inherited={'name': 'third'})
        with self.assertRaises(ValueError):
            complete_from_read_refs(records, [], target, None)
        # Reverse order: representative lacks name, a later record carries it. Inheritance is schema-based.
        records.input_value = {'__batRecordKey': 'first-without-name'}
        _, reverse = records.resolve(MethodReadToolParams(outputPath=[], container='.row', fields={
            'size': {'selector': '.size'}, 'name': {'selector': '.name'}}))
        self.assertIn('name', reverse.specification.inheritFields)
        self.assertEqual((await read_fields(Browser(page), reverse.specification, inherited={'name': 'later-input'}))['name'], 'later-input')
