"""Protect native content-tool defaults at the source evidence boundary."""
import unittest
import json
from unittest.mock import patch
from browser_use.agent.views import ActionResult
from workflow_use.hybrid.author import author_tools_for_result_spec
from workflow_use.hybrid.evidence import EvidenceRef
from workflow_use.hybrid.method_read_tool import method_read_model_result
from workflow_use.hybrid.natural_compile import classify_natural_action
from test_method_source_compile import method_source
from workflow_use.hybrid.content_read_params import ContentReadToolParams
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.method_read_tool import MethodReadRecords, MethodReadRecord, MethodReadToolParams
from workflow_use.hybrid.method_read_evidence import _validated_record
from workflow_use.hybrid.field_read_evidence import FieldReadEvidenceFailure
from workflow_use.hybrid.page_content import CONTENT_SCHEMA


class ContentReadEvidenceDefaults(unittest.TestCase):
    def captured(self, arguments):
        records = MethodReadRecords(CONTENT_SCHEMA, capture_content=True)
        native = ContentReadToolParams.model_validate(arguments)
        params = MethodReadToolParams.model_validate(native.model_dump(mode='json'))
        parameters, mapping = records.resolve(params)
        output = {'content': json.dumps({'url': 'https://example.org', 'format': 'markdown',
            'coverage': {'complete': True}, 'markdown': 'sample'})}
        record = MethodReadRecord(readRef='r1', parameters=parameters, mapping=mapping,
            sample=dict(specificationDigest=digest(mapping.specification), output=output,
                outputDigest=digest(output), pageIdentity={'targetId': 'owned', 'url': 'https://example.org'},
                documentRootId=1, containerIdsDigest='a'*64,
                coverage=dict(total=1, sampled=1, sampleLimit=3, runtimeTruncated=False)))
        records.append_verified(record)
        return records, record

    def test_selected_regions_use_the_same_native_default_during_evidence_validation(self):
        records, record = self.captured({'regions': '#result'})
        checked = _validated_record(record, {'regions': '#result'}, records, 0)
        self.assertEqual(checked.mapping.specification.contentRegion, 'selected-regions')

    def test_omitted_regions_bind_native_body_default(self):
        records, record = self.captured({})
        checked = _validated_record(record, {}, records, 0)
        self.assertEqual(checked.mapping.specification.container, 'body')
        self.assertEqual(checked.mapping.specification.contentRegion, 'selected-regions')

    def test_changed_regions_still_reject_and_legacy_container_keeps_its_semantics(self):
        records, record = self.captured({'regions': '#result'})
        with self.assertRaises(FieldReadEvidenceFailure):
            _validated_record(record, {'regions': '#other'}, records, 0)
        records, record = self.captured({'container': 'main'})
        checked = _validated_record(record, {'container': 'main'}, records, 0)
        self.assertIsNone(checked.mapping.specification.contentRegion)

    def compiled(self, arguments):
        records, record = self.captured(arguments)
        case = dict(records=records, start=0, arguments=arguments,
            results=[ActionResult(extracted_content=json.dumps(method_read_model_result(record)))],
            result_ref=EvidenceRef(ref='fixture:result', digest='d'*64), action_ref='a-0001')

        def content_tools(model, result_spec):
            result_spec.fields[0].producerRef = 'page-content'
            return author_tools_for_result_spec(result_spec)

        with patch('test_method_source_compile.author_tools_for_result_spec', content_tools):
            return method_source(case, CONTENT_SCHEMA)

    def test_native_defaults_survive_source_compilation_and_changed_scope_rejects(self):
        arguments = {'regions': '#result'}
        request, registry, schema, _ = self.compiled(arguments)
        action = request.trace.actions[0]
        self.assertEqual(action.args, {'regions': '#result', 'regionMode': 'selected-regions'})
        self.assertEqual(arguments, {'regions': '#result'})
        before, after = request.trace.observations[:2]
        original = action.model_dump(mode='json')
        segment, _, issues = classify_natural_action(request, registry, action, before, after, schema)
        self.assertEqual(issues, [])
        self.assertEqual(segment['operation']['specification']['contentRegion'], 'selected-regions')
        self.assertEqual(action.model_dump(mode='json'), original)
        changed = action.model_copy(update={'args': {'regions': '#other'}})
        _, _, issues = classify_natural_action(request, registry, changed, before, after, schema)
        self.assertIn('verified_natural_read_invalid', [issue.reason for issue in issues])

    def test_native_empty_region_default_is_explicit_and_other_region_modes_are_rejected(self):
        request, registry, schema, _ = self.compiled({})
        action = request.trace.actions[0]
        self.assertEqual(action.args, {'regions': 'body', 'regionMode': 'selected-regions'})
        segment, _, issues = classify_natural_action(request, registry, action,
            *request.trace.observations[:2], schema)
        self.assertEqual(issues, [])
        self.assertEqual(segment['operation']['specification']['container'], 'body')
        with self.assertRaises(ValueError):
            registry.validate_action('bat_read_fields', {'regions': 'body', 'regionMode': 'common-ancestor'})


if __name__ == '__main__':
    unittest.main()
