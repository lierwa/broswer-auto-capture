"""Protect the actual author-facing schema, completion and recorded source boundary."""
import unittest
from types import SimpleNamespace

from jsonschema import Draft202012Validator
from pydantic import ValidationError
from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.author_tools import AuthorTools
from workflow_use.hybrid.author import _business_result
from workflow_use.hybrid.author_action_helpers import normalize_author_action
from workflow_use.hybrid.method_read_tool import MethodReadToolParams, method_read_params_for, expand_method_read_params
from workflow_use.hybrid.field_read_params import bind_root_read_path
from workflow_use.hybrid.method_completion import complete_from_read_refs, unambiguous_read_refs
from workflow_use.hybrid.natural_output import _static_output_fields


STRING = {'type': 'string'}
OUTPUT = {'type': 'object', 'properties': {'site': {'type': 'string', 'enum': ['Example']},
    'status': STRING}, 'required': ['site', 'status'], 'additionalProperties': False}


def receipt(path, value, ref='r1', document=7):
    return SimpleNamespace(readRef=ref, mapping=SimpleNamespace(outputPath=path, readPath=['value'],
        specification=SimpleNamespace(outputSchema={'type': 'object', 'properties': {'value': STRING},
            'required': ['value'], 'additionalProperties': False})), sample=SimpleNamespace(
                output={'value': value}, pageIdentity={'targetId': 'owned'}, documentRootId=document))


class AuthorContractBoundaryTests(unittest.IsolatedAsyncioTestCase):
    def test_projection_modes_and_contract_field_names_agree_before_dom_access(self):
        model = method_read_params_for(STRING)
        fields = [({'selector': 'a', 'attribute': 'aria-label', 'textPrefix': 'Example'}, False),
                  ({'selector': 'a', 'resolveUrl': True}, False),
                  ({'selector': 'a', 'valueSource': 'page-url'}, False),
                  ({'selector': 'a', 'attribute': 'href', 'resolveUrl': True}, True),
                  ({'selector': ':scope', 'valueSource': 'page-url'}, True),
                  ({'selector': 'p', 'textPrefix': 'Result: '}, True)]
        for field, valid in fields:
            raw = {'container': 'main', 'fields': {'value': field}}
            self.assertEqual(Draft202012Validator(model.model_json_schema()).is_valid(raw), valid)
            if not valid:
                with self.assertRaises(ValidationError):
                    model.model_validate(raw)
                continue
            internal = MethodReadToolParams.model_validate(bind_root_read_path(model.model_validate(raw).model_dump(), STRING))
            expand_method_read_params(internal, STRING)
        for schema, field in [({'type': 'boolean'}, {'selector': 'p', 'textPrefix': 'Result: '}),
                              ({'type': 'array', 'items': STRING}, {'selector': ':scope', 'valueSource': 'page-url'})]:
            other = method_read_params_for(schema)
            self.assertFalse(Draft202012Validator(other.model_json_schema()).is_valid(
                {'container': 'main', 'fields': {'value': field}}))
        wrong_name = {'container': 'main', 'fields': {'site': {'selector': 'h1'}}, 'outputPath': ['site']}
        self.assertFalse(Draft202012Validator(method_read_params_for(OUTPUT).model_json_schema()).is_valid(wrong_name))

    def test_scalar_rows_normalize_before_capture_without_changing_record_or_scalar_reads(self):
        schemas = [{'type': 'array', 'items': STRING}, STRING,
                   {'type': 'array', 'items': {'type': 'object', 'properties': {'value': STRING}, 'required': ['value']}}]
        for index, schema in enumerate(schemas):
            params = method_read_params_for(schema).model_validate({'container': '.row, .other',
                'fields': {'value': {'selector': ':scope'}}})
            action = SimpleNamespace(bat_read_fields=params)
            normalize_author_action(action, SimpleNamespace(output_schema=schema))
            self.assertEqual(params.container, ':root' if index == 0 else '.row, .other')
            self.assertEqual(params.fields['value'].selector, '.row, .other' if index == 0 else ':scope')
            saved = params.model_dump(mode='json', exclude_unset=True)
            normalize_author_action(action, SimpleNamespace(output_schema=schema))
            self.assertEqual(params.model_dump(mode='json', exclude_unset=True), saved)

    def test_exported_schema_and_real_parser_agree_on_modes_and_host_owned_fields(self):
        for schema in [STRING, OUTPUT, {'type': 'array', 'maxItems': 300, 'items': STRING}]:
            model = method_read_params_for(schema)
            exported = model.model_json_schema()
            raw = {'container': 'main', 'fields': {'value': {'selector': ':scope'}}}
            if schema == OUTPUT:
                raw['outputPath'] = ['status']
            Draft202012Validator(exported).validate(raw)
            internal = MethodReadToolParams.model_validate(bind_root_read_path(
                model.model_validate(raw).model_dump(mode='json'), schema))
            self.assertFalse(internal.captureContent)
            self.assertEqual(set(exported['properties']) & {'take', 'maxItems', 'captureContent', 'indices'}, set())
            for bad in ({'container': 'main'}, {**raw, 'take': 1}, {**raw, 'readRef': 'r1'}):
                self.assertFalse(Draft202012Validator(exported).is_valid(bad))
                with self.assertRaises(ValidationError):
                    model.model_validate(bad)
            self.assertEqual(model.model_validate({'readRef': 'r1'}).model_dump(), {'readRef': 'r1'})

    def test_only_confirmed_single_value_contract_is_a_constant_source(self):
        records = SimpleNamespace(records=[receipt(['status'], 'Ready')])
        result = complete_from_read_refs(records, ['r1'], OUTPUT, None)
        self.assertEqual(result, {'site': 'Example', 'status': 'Ready'})
        fields = _static_output_fields(result, OUTPUT, [['status']], None, {}, '')
        self.assertEqual(fields[0]['binding'], {'source': 'constant', 'value': 'Example'})
        changing = {**OUTPUT, 'properties': {**OUTPUT['properties'], 'site': STRING}}
        with self.assertRaisesRegex(ValueError, 'natural_output_leaf_uncovered'):
            complete_from_read_refs(records, ['r1'], changing, None)

    def test_joined_projection_requires_only_real_parts_and_rejects_mixed_modes(self):
        model = method_read_params_for({'type': 'array', 'items': STRING})
        raw = {'container': 'main', 'fields': {'value': {'selector': '.row',
            'parts': [{'selector': 'h3'}, {'selector': 'svg use', 'attribute': 'xlink:href'}]}}}
        exported = model.model_json_schema()
        self.assertTrue(Draft202012Validator(exported).is_valid(raw))
        parsed = model.model_validate(raw).model_dump(mode='json', exclude_unset=True)
        self.assertEqual(parsed, raw)
        for addition in ({'attribute': 'title'}, {'valueSource': 'page-url'}, {'parts': None}):
            invalid = {**raw, 'fields': {'value': {**raw['fields']['value'], **addition}}}
            self.assertFalse(Draft202012Validator(exported).is_valid(invalid))
            with self.assertRaises(ValidationError):
                model.model_validate(invalid)

    def test_same_sample_input_cannot_replace_a_parent_of_live_read_fields(self):
        schema = {'type': 'object', 'properties': {'site': STRING, 'status': STRING},
                  'required': ['site', 'status'], 'additionalProperties': False}
        value = {'site': 'Example', 'status': 'Ready'}
        fields = _static_output_fields(value, schema, [['status']], value, schema, '')
        self.assertEqual(fields, [{'binding': {'source': 'input', 'path': ['site']},
                                  'path': ['site'], 'sampleValue': 'Example'}])
        nested = {'type': 'object', 'properties': {'report': schema},
                  'required': ['report'], 'additionalProperties': False}
        fields = _static_output_fields({'report': value}, nested, [['report', 'status']],
                                      {'report': value}, nested, '')
        self.assertEqual([f['binding']['path'] for f in fields], [['report', 'site']])

    def test_host_references_are_bound_before_source_capture_and_never_choose_latest_conflict(self):
        records = SimpleNamespace(records=[receipt(['status'], 'Ready')])
        action = SimpleNamespace(done=SimpleNamespace(success=True, text='Finished.'))
        normalize_author_action(action, records)
        self.assertEqual(vars(action.done), {'success': True, 'text': 'Finished.'})
        self.assertEqual(unambiguous_read_refs(records), ['r1'])
        records.records.append(receipt(['status'], 'Later', 'r2'))
        with self.assertRaisesRegex(ValueError, 'completion_read_path_conflict'):
            unambiguous_read_refs(records)
        records.records[-1].mapping.outputPath = ['site']
        records.records[-1].sample.documentRootId = 8
        with self.assertRaisesRegex(ValueError, 'completion_read_document_conflict'):
            unambiguous_read_refs(records)

    async def test_real_done_registry_accepts_minimal_request_and_uses_host_values(self):
        output, _ = output_model_for(OUTPUT, 'ContractOutput')
        tools = AuthorTools()
        tools._bat_field_read_records = SimpleNamespace(records=[receipt(['status'], 'Ready')])
        schema = tools.registry.registry.actions['done'].param_model.model_json_schema()
        self.assertEqual(schema['required'], ['text'])
        self.assertNotIn('methodOutcome', schema['properties'])
        result = await tools.registry.execute_action('done', {'success': True, 'text': 'Finished.'},
            browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
        self.assertTrue(result.success, result.error)
        history = SimpleNamespace(is_done=lambda: result.is_done, is_successful=lambda: result.success)
        completed, value, gaps = _business_result(history, False, OUTPUT, tools._bat_field_read_records)
        self.assertTrue(completed)
        self.assertEqual(gaps, [])
        self.assertEqual(value, {'site': 'Example', 'status': 'Ready'})
        self.assertEqual(result.extracted_content, 'Finished.')
        self.assertEqual(tools._bat_field_read_records.selected_refs, ('r1',))
