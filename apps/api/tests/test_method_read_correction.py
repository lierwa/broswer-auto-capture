"""Field-read correction must identify the contract mismatch without leaking page data."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.method_read_tool import MethodReadToolParams, method_read_params_for, register_method_read_tool
from workflow_use.hybrid.rendered_field_text import FieldReadError

OUTPUT = {'type': 'object', 'properties': {'title': {'type': 'string'},
    'labels': {'type': 'array', 'items': {'type': 'string'}}, 'link': {'type': 'string'}},
    'required': ['title', 'labels', 'link'], 'additionalProperties': False}


class Tools:
    def action(self, description, *, param_model):
        self.description, self.param_model = description, param_model
        def register(callback):
            self.read = callback
            return callback
        return register


class MethodReadCorrectionTests(unittest.IsolatedAsyncioTestCase):
    async def failure(self, raw, schema=OUTPUT):
        tools = Tools()
        register_method_read_tool(tools, output_schema=schema)
        return await tools.read(MethodReadToolParams.model_validate(raw), SimpleNamespace())

    def test_current_field_tool_does_not_advertise_internal_content_mode(self):
        self.assertNotIn('captureContent', method_read_params_for(OUTPUT).model_json_schema()['properties'])

    async def test_container_only_identifies_missing_definition_and_exact_contract_fields(self):
        result = await self.failure({'container': 'main'})
        self.assertIn('natural_read_schema_mismatch', result.error)
        detail = json.loads(result.error.split(': ', 1)[1])['correction']
        self.assertEqual(detail['outputPath'], [])
        self.assertEqual(detail['requiredFields'], ['title', 'labels', 'link'])
        self.assertEqual(detail['missingFields'], ['title', 'labels', 'link'])
        self.assertIn('container alone', detail['instruction'])
        self.assertEqual(detail['fieldTypes']['labels'], 'array<string>')

    async def test_wrong_field_names_are_reported_without_echoing_selectors_or_values(self):
        result = await self.failure({'outputPath': [], 'container': '#private', 'fields': {
            'wrong': {'selector': '[data-secret="hidden-value"]'}}})
        detail = json.loads(result.error.split(': ', 1)[1])['correction']
        self.assertEqual(detail['unknownFieldCount'], 1)
        self.assertEqual(detail['missingFields'], ['title', 'labels', 'link'])
        self.assertNotIn('hidden-value', result.error)
        self.assertNotIn('#private', result.error)

    async def test_scalar_path_uses_value_and_ambiguous_field_keeps_exact_match_count(self):
        result = await self.failure({'outputPath': ['title'], 'container': 'main',
                                    'fields': {'title': {'selector': 'h1'}}})
        detail = json.loads(result.error.split(': ', 1)[1])['correction']
        self.assertEqual(detail['requiredFields'], ['value'])
        tools = Tools(); register_method_read_tool(tools, output_schema=OUTPUT)
        params = MethodReadToolParams.model_validate({'outputPath': [], 'container': 'main',
            'fields': {name: {'selector': ':scope'} for name in OUTPUT['properties']}})
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', AsyncMock(
                side_effect=FieldReadError('ambiguous_or_missing_read_field', field_name='link',
                                          match_count=2, reason='expected_exactly_one_match'))):
            result = await tools.read(params, SimpleNamespace())
        detail = json.loads(result.error.split(': ', 1)[1])
        self.assertEqual(detail['field_name'], 'link')
        self.assertEqual(detail['match_count'], 2)
        self.assertIn('observed', detail['correction']['instruction'])

    async def test_zero_match_reports_container_scope_without_claiming_page_absence(self):
        tools = Tools(); register_method_read_tool(tools, output_schema=OUTPUT)
        params = MethodReadToolParams.model_validate({'outputPath': [], 'container': '#private-table',
            'fields': {name: {'selector': '[data-private="private-value"]'} for name in OUTPUT['properties']}})
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', AsyncMock(
                side_effect=FieldReadError('ambiguous_or_missing_read_field', field_name='title',
                                          match_count=0, reason='expected_exactly_one_match'))):
            result = await tools.read(params, SimpleNamespace())
        detail = json.loads(result.error.split(': ', 1)[1])
        self.assertEqual(detail['match_count'], 0)
        self.assertEqual(detail['correction']['matchScope'], 'record-container')
        self.assertFalse(detail['correction']['pageWideAbsenceProven'])
        self.assertEqual(detail['correction']['repairableParameters'], ['container', 'fields'])
        self.assertNotIn('private-value', result.error)
        self.assertNotIn('#private-table', result.error)

    async def test_multiple_matches_keep_scalar_cardinality_and_allow_scope_repair(self):
        tools = Tools(); register_method_read_tool(tools, output_schema=OUTPUT)
        params = MethodReadToolParams.model_validate({'outputPath': [], 'container': 'main',
            'fields': {name: {'selector': ':scope'} for name in OUTPUT['properties']}})
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', AsyncMock(
                side_effect=FieldReadError('ambiguous_or_missing_read_field', field_name='link',
                                          match_count=2, reason='expected_exactly_one_match'))):
            result = await tools.read(params, SimpleNamespace())
        detail = json.loads(result.error.split(': ', 1)[1])
        self.assertEqual(detail['match_count'], 2)
        self.assertEqual(detail['correction']['fieldTypes']['link'], 'string')
        self.assertEqual(detail['correction']['repairableParameters'], ['container', 'fields'])
