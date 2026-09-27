"""Read-method arguments preserve type ownership and never expose a full authoring dataset."""
import json
import unittest
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError

from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.method_read_tool import (
    MethodReadToolParams, expand_method_read_params, register_method_read_tool,
)
from workflow_use.hybrid.natural_reads import NaturalReadFailure
from workflow_use.hybrid.read_sampling import ReadSample
from workflow_use.hybrid.rendered_field_text import FieldReadError


ITEM = {'type': 'object', 'properties': {'count': {'type': 'integer'},
        'labels': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 8}},
        'required': ['count', 'labels'], 'additionalProperties': False}
OUTPUT = {'type': 'array', 'items': ITEM, 'minItems': 1000, 'maxItems': 1000}


def parameters(**updates):
    return MethodReadToolParams.model_validate({
        'outputPath': [], 'container': '.row',
        'fields': {'count': {'selector': '.count'}, 'labels': {'selector': '.label'}},
        **updates,
    })


def sample_for(specification):
    output = [{'count': index, 'labels': ['sample']} for index in range(3)]
    return ReadSample(specificationDigest=digest(specification), output=output, outputDigest=digest(output),
        pageIdentity={'targetId': 'tab-1', 'url': 'https://example.test/items'}, documentRootId=1,
        containerIdsDigest=digest(list(range(100))),
        coverage={'scope': 'current_dom_matches', 'total': 100, 'sampled': 3, 'sampleLimit': 3,
                  'runtimeTruncated': False})


class ToolsStub:
    def __init__(self):
        self.actions = {}
        self.param_model = None

    def action(self, _description, *, param_model):
        self.param_model = param_model
        def register(callback):
            self.actions[callback.__name__] = callback
            return callback
        return register


class MethodReadMappingTests(unittest.TestCase):
    def test_runtime_budget_does_not_inherit_final_count_or_host_sample_limit(self):
        mapping = expand_method_read_params(parameters(maxItems=100), OUTPUT)
        self.assertEqual(mapping.specification.maxItems, 100)
        self.assertEqual(mapping.specification.outputSchema,
                         {'type': 'array', 'items': ITEM, 'minItems': 0, 'maxItems': 100})
        self.assertTrue(mapping.specification.requireComplete)
        self.assertEqual(mapping.specification.maxInputBytes, 128000)
        self.assertEqual(OUTPUT['minItems'], 1000)
        self.assertEqual(expand_method_read_params(parameters(), OUTPUT).specification.maxItems, 300)

    def test_parameter_round_trip_preserves_derived_numeric_and_multiple_fields(self):
        original = parameters()
        restored = MethodReadToolParams.model_validate_json(original.model_dump_json())
        first = expand_method_read_params(original, OUTPUT)
        second = expand_method_read_params(restored, OUTPUT)
        self.assertEqual(first, second)
        self.assertEqual(first.specification.fields['count'].valueType, 'integer')
        self.assertTrue(first.specification.fields['labels'].multiple)
        self.assertEqual(first.specification.fields['labels'].maxValues, 8)
        wire = json.loads(original.model_dump_json())
        self.assertFalse(set(wire['fields']['count']) & {'valueType', 'multiple', 'maxValues'})

    def test_model_cannot_supply_derived_types_or_legacy_records(self):
        for key, value in [('valueType', 'string'), ('multiple', False), ('maxValues', 3)]:
            with self.subTest(key=key), self.assertRaises(ValidationError):
                parameters(fields={'count': {'selector': '.count', key: value}})
        with self.assertRaises(ValidationError):
            parameters(records=[{'fields': {'count': {'refs': ['dom-1']}}}])
        with self.assertRaises(ValidationError):
            parameters(sample_limit=100)
        for maximum in (0, 301, True):
            with self.subTest(maximum=maximum), self.assertRaises(ValidationError):
                parameters(maxItems=maximum)

    def test_required_fields_and_real_output_path_are_checked(self):
        with self.assertRaisesRegex(NaturalReadFailure, 'natural_read_schema_mismatch'):
            expand_method_read_params(parameters(fields={'count': {'selector': '.count'}}), OUTPUT)
        with self.assertRaisesRegex(NaturalReadFailure, 'natural_read_output_path_invalid'):
            expand_method_read_params(parameters(outputPath=['missing']), OUTPUT)

    def test_scalar_array_and_object_follow_existing_read_shapes(self):
        scalar_array = {'type': 'array', 'items': {'type': 'integer'}, 'minItems': 1000, 'maxItems': 1000}
        mapping = expand_method_read_params(parameters(fields={'value': {'selector': '.value'}}), scalar_array)
        self.assertEqual(mapping.readPath, ['value'])
        self.assertEqual(mapping.specification.maxItems, 1)
        self.assertEqual(mapping.specification.fields['value'].valueType, 'integer')
        self.assertTrue(mapping.specification.fields['value'].multiple)
        self.assertEqual(mapping.specification.fields['value'].maxValues, 300)
        mapping = expand_method_read_params(parameters(), ITEM)
        self.assertEqual(mapping.readPath, [])
        self.assertEqual(mapping.specification.maxItems, 1)


class MethodReadToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_field_error_feedback_only_exposes_contract_fields_and_safe_metadata(self):
        tools = ToolsStub()
        records = register_method_read_tool(tools, output_schema=OUTPUT)
        errors = [FieldReadError('read_field_not_text', field_name='count', match_count=1,
                                 reason='selected_value_not_text'),
                  FieldReadError('read_field_projection_failed', field_name='private selector',
                                 match_count=-1, reason='private page text'),
                  FieldReadError('read_field_projection_failed', field_name='labels',
                                 match_count=True, reason=['private page text'])]
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', AsyncMock(side_effect=errors)):
            results = [await tools.actions['bat_read_fields'](parameters(), object()) for _ in errors]
        code, detail = results[0].error.split(': ', 1)
        self.assertEqual(code, 'read_field_not_text')
        self.assertEqual(json.loads(detail), {'field_name': 'count', 'match_count': 1,
                                             'reason': 'selected_value_not_text'})
        self.assertEqual(results[1].error, 'read_field_projection_failed')
        self.assertEqual(results[2].error, 'read_field_projection_failed: {"field_name":"labels"}')
        self.assertEqual(records.records, [])

    async def test_empty_sample_does_not_register_a_method_or_consume_a_read_ref(self):
        tools = ToolsStub()
        records = register_method_read_tool(tools, output_schema=OUTPUT)
        params, browser = parameters(), object()
        sample = sample_for(expand_method_read_params(params, OUTPUT).specification)
        empty = sample.model_copy(update={'output': [], 'outputDigest': digest([]),
            'coverage': sample.coverage.model_copy(update={'total': 0, 'sampled': 0})})
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields',
                   AsyncMock(side_effect=[empty, sample])):
            failure = await tools.actions['bat_read_fields'](params, browser)
            self.assertEqual(failure.error, 'read_sample_empty_unproven')
            self.assertIsNone(failure.extracted_content)
            self.assertEqual(records.records, [])
            success = await tools.actions['bat_read_fields'](params, browser)
        self.assertEqual(json.loads(success.extracted_content)['readRef'], 'r1')
        self.assertEqual(len(records.records), 1)

    async def test_success_returns_short_model_sample_and_keeps_full_host_proof(self):
        tools = ToolsStub()
        records = register_method_read_tool(tools, output_schema=OUTPUT)
        self.assertEqual(list(tools.actions), ['bat_read_fields'])
        browser, params = object(), parameters()
        sampler = AsyncMock(side_effect=lambda _browser, spec, **_kwargs: sample_for(spec))
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', sampler):
            first = await tools.actions['bat_read_fields'](params, browser)
            second = await tools.actions['bat_read_fields'](params, browser)
        payload = json.loads(first.extracted_content)
        self.assertEqual(payload['readRef'], 'r1')
        self.assertEqual(json.loads(second.extracted_content)['readRef'], 'r2')
        self.assertEqual(payload['outputPath'], [])
        self.assertEqual(len(payload['representative']), 3)
        self.assertEqual(payload['coverage']['total'], 100)
        self.assertFalse({'sample', 'pageIdentity', 'documentRootId', 'outputDigest'} & set(payload))
        self.assertIn('does not prove the full business collection', payload['coverageNote'])
        self.assertEqual(len(records.records), 2)
        self.assertEqual(records.records[0].mapping, expand_method_read_params(params, OUTPUT))
        self.assertEqual(records.records[0].sample.documentRootId, 1)
        self.assertEqual(records.records[0].sample.output, payload['representative'])
        self.assertEqual(sampler.await_args.kwargs, {'sample_limit': 3, 'read_path': []})
        self.assertEqual(sampler.await_args.args[0], browser)

    async def test_failed_read_keeps_records_and_ref_sequence_unchanged(self):
        tools = ToolsStub()
        records = register_method_read_tool(tools, output_schema=OUTPUT)
        params, browser = parameters(), object()
        sample = sample_for(expand_method_read_params(params, OUTPUT).specification)
        sampler = AsyncMock(side_effect=[NaturalReadFailure('read_collection_limit'),
                                         RuntimeError('private page contents'), sample])
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', sampler):
            limited = await tools.actions['bat_read_fields'](params, browser)
            hidden = await tools.actions['bat_read_fields'](params, browser)
            self.assertEqual(records.records, [])
            success = await tools.actions['bat_read_fields'](params, browser)
        self.assertEqual(limited.error, 'read_collection_limit')
        self.assertEqual(hidden.error, 'bat_read_fields_failed')
        self.assertEqual(json.loads(success.extracted_content)['readRef'], 'r1')
        self.assertEqual(len(records.records), 1)


if __name__ == '__main__':
    unittest.main()
