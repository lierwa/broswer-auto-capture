"""The real business root array owns read paths even when response serialization wraps it."""
import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from browser_use import Tools

from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.evidence import EvidenceRef, digest
from workflow_use.hybrid.method_read_tool import MethodReadToolParams, register_method_read_tool
from workflow_use.hybrid.read_sampling import ReadSample
from workflow_use.hybrid.registry import ActionRegistry


SCHEMA = {'type': 'array', 'items': {'type': 'object', 'properties': {
    '标题': {'type': 'string'}, '链接': {'type': 'string'}},
    'required': ['标题', '链接'], 'additionalProperties': False}}
PARAMS = {'outputPath': [], 'container': '.record', 'fields': {
    '标题': {'selector': '.title', 'normalizeWhitespace': True},
    '链接': {'selector': 'a', 'attribute': 'href', 'resolveUrl': True}}, 'maxItems': 80}


def setup_tool():
    model, _unwrap = output_model_for(SCHEMA, 'RootArrayResponse')
    tools = Tools(output_model=model)
    records = register_method_read_tool(tools, output_schema=SCHEMA)
    return tools, records, model


def sample_for(_browser, specification, **_kwargs):
    output = [{'标题': 'Example record', '链接': 'https://example.test/record/1'}]
    return ReadSample(specificationDigest=digest(specification), output=output, outputDigest=digest(output),
        pageIdentity={'targetId': 'tab-1', 'url': 'https://example.test/records'}, documentRootId=1,
        containerIdsDigest=digest([10]), coverage={'scope': 'current_dom_matches', 'total': 1,
            'sampled': 1, 'sampleLimit': 3, 'runtimeTruncated': False})


class MethodRootArrayPathTests(unittest.IsolatedAsyncioTestCase):
    def test_registered_schema_explains_real_root_path_despite_response_wrapper(self):
        tools, _records, response_model = setup_tool()
        self.assertIn('value', response_model.model_json_schema()['properties'])
        action = tools.registry.registry.actions['bat_read_fields']
        path = action.param_model.model_json_schema()['properties']['outputPath']
        self.assertEqual(path['examples'], [[]])
        self.assertIn('outputPath=[]', path['description'])
        self.assertIn('structured-response wrapper', path['description'])
        self.assertIn('outputPath=[]', action.description)
        self.assertEqual(MethodReadToolParams.model_validate(PARAMS).outputPath, [])

    async def test_native_tool_rejects_wrapper_with_guidance_then_captures_root_and_reference(self):
        tools, records, _model = setup_tool()
        registry, browser = ActionRegistry.from_tools(tools), SimpleNamespace(cdp_client=None)
        collector = EvidenceCollector(browser, registry,
            put_evidence=lambda _kind, value: EvidenceRef(ref='fixture', digest=digest(value)),
            redact_action=lambda value: value, output_schema=SCHEMA, field_read_records=records)
        sampler = AsyncMock(side_effect=sample_for)
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', sampler):
            for path in (['value'], ['value', 0]):
                result = await tools.registry.execute_action('bat_read_fields',
                    {**copy.deepcopy(PARAMS), 'outputPath': path}, browser_session=browser)
                self.assertTrue(result.error.startswith('natural_read_output_path_invalid: '))
                self.assertIn('outputPath=[]', result.error)
                self.assertIn('structured-response wrapper', result.error)
                self.assertEqual(records.records, [])
            sampler.assert_not_awaited()
            for index, args in enumerate((PARAMS, {'readRef': 'r1'})):
                action = registry.validate_action('bat_read_fields', args)
                wire = action.model_dump(mode='json', exclude_unset=True)
                self.assertEqual(wire, {'bat_read_fields': args})
                result = await tools.registry.execute_action('bat_read_fields', args, browser_session=browser)
                self.assertIsNone(result.error)
                self.assertEqual(json.loads(result.extracted_content)['outputPath'], [])
                collector.pending = {'action': wire, 'actionId': f'a-{index + 1:04d}', 'fieldReadStart': index}
                collector.results[(index, 0)] = EvidenceRef(ref='fixture', digest=digest(result.extracted_content))
                facts = collector.field_read_facts([result], index)
                self.assertEqual(collector.source_gaps, [])
                self.assertEqual(facts[0].value['outputPath'], [])
                self.assertEqual(facts[0].value['readRef'], f'r{index + 1}')
        self.assertEqual(sampler.await_count, 2)
        self.assertEqual(records.records[0].mapping, records.records[1].mapping)
        self.assertEqual(records.records[0].mapping.specification.maxItems, 80)
        self.assertEqual(records.output_schema, SCHEMA)


if __name__ == '__main__':
    unittest.main()
