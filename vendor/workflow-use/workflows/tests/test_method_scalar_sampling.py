"""Exercise the real projection script, tool receipt and compiler proof for scalar collections."""
import json
import subprocess
import unittest

from browser_use import Tools

from workflow_use.hybrid.evidence import EvidenceRef, digest
from workflow_use.hybrid.method_completion import complete_from_read_refs
from workflow_use.hybrid.method_read_evidence import verified_method_read, validate_method_read_mapping
from workflow_use.hybrid.method_read_tool import MethodReadToolParams, register_method_read_tool
from workflow_use.hybrid.read import read_fields
from workflow_use.hybrid.read_sampling import sample_read_fields


# WHY：执行生产投影脚本并记录属性 getter 次数，避免用“返回三条”的 mock 掩盖先读一百条再 slice。
SCRIPT_HOST = r"""const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
let reads = 0;
const nodes = Array.from({length: input.count}, (_, i) => ({
  get innerText() { reads++; return `item-${i}`; },
  get textContent() { reads++; return `item-${i}`; },
  shadowRoot: null,
  checkVisibility: () => true,
  querySelectorAll: () => [],
}));
const container = {matches: () => false, querySelectorAll: () => nodes};
const project = new Function('fields', 'return (' + input.script + ')(fields)');
const output = project.call(container, input.fields);
process.stdout.write(JSON.stringify({output, reads}));
"""

SCHEMA = {'type': 'array', 'items': {'type': 'string'}, 'minItems': 50, 'maxItems': 200}


class Element:
    def __init__(self, counts=(100,)):
        self.counts, self.calls, self.reads = counts, 0, []

    async def get_basic_info(self):
        return {'backendNodeId': 10}

    async def evaluate(self, script, fields):
        count = self.counts[min(self.calls, len(self.counts) - 1)]
        self.calls += 1
        result = subprocess.run(['node', '-e', SCRIPT_HOST], check=True, capture_output=True, text=True,
                                input=json.dumps({'count': count, 'script': script, 'fields': fields}))
        payload = json.loads(result.stdout)
        self.reads.append(payload['reads'])
        return json.dumps(payload['output'])


class Page:
    def __init__(self, element):
        self.element = element

    async def get_target_info(self):
        return {'targetId': 'sample-target'}

    async def get_url(self):
        return 'https://example.test/records'

    async def get_elements_by_css_selector(self, _selector):
        return [self.element]


class Browser:
    def __init__(self, element):
        self.page = Page(element)

    async def get_current_page(self):
        return self.page


def params(maximum=300):
    return MethodReadToolParams(outputPath=[], container='.records',
                               fields={'value': {'selector': '.title'}}, maxItems=maximum)


async def tool_case(element, maximum=300):
    tools = Tools()
    records = register_method_read_tool(tools, output_schema=SCHEMA)
    arguments = params(maximum)
    result = await tools.registry.registry.actions['bat_read_fields'].function(
        params=arguments, browser_session=Browser(element))
    return records, arguments, result


class ScalarMethodSamplingTests(unittest.IsolatedAsyncioTestCase):
    async def test_actual_projection_reads_three_values_twice_and_runtime_reads_all(self):
        element = Element()
        records, arguments, result = await tool_case(element)
        self.assertIsNone(result.error)
        self.assertEqual(element.reads, [3, 3])
        record = records.records[0]
        self.assertEqual(record.sample.output, {'value': ['item-0', 'item-1', 'item-2']})
        self.assertEqual(record.sample.coverage.total, 100)
        self.assertEqual(record.sample.coverage.sampled, 3)
        self.assertEqual(record.mapping.specification.maxItems, 1)
        self.assertEqual(record.mapping.specification.fields['value'].maxValues, 300)
        proof = verified_method_read(records=records, start=0, arguments=arguments.model_dump(mode='json'),
            results=[result], result_ref=EvidenceRef(ref='result', digest=digest(result.extracted_content)),
            action_ref='a-0001')
        from types import SimpleNamespace
        validate_method_read_mapping(proof, SCHEMA,
            SimpleNamespace(name='bat_read_fields', args=arguments.model_dump(mode='json')))
        self.assertEqual(complete_from_read_refs(records, ['r1'], SCHEMA, None),
                         ['item-0', 'item-1', 'item-2'])
        original = record.mapping.specification.model_dump(mode='json')
        runtime = await read_fields(Browser(element), record.mapping.specification)
        self.assertEqual(len(runtime['value']), 100)
        self.assertEqual(element.reads, [3, 3, 100])
        self.assertEqual(record.mapping.specification.model_dump(mode='json'), original)

    async def test_changed_field_count_rejects_even_when_sample_values_match(self):
        element = Element((100, 101))
        records, _arguments, result = await tool_case(element)
        self.assertEqual(result.error, 'natural_read_output_changed')
        self.assertEqual(element.reads, [3, 3])
        self.assertEqual(records.records, [])

    async def test_real_tool_receipt_reaches_complete_source_compilation(self):
        from test_method_source_compile import method_source
        from workflow_use.hybrid.compiler import compile_request
        records, arguments, result = await tool_case(Element())
        self.assertIsNone(result.error)
        case = {'records': records, 'start': 0, 'arguments': arguments.model_dump(mode='json'),
                'results': [result], 'action_ref': 'a-0001',
                'result_ref': EvidenceRef(ref='result', digest=digest(result.extracted_content))}
        request, registry, schema, verified = method_source(case=case, schema=SCHEMA)
        compiled = compile_request(request, registry, output_schema=schema)
        self.assertEqual(compiled.gaps, [])
        self.assertEqual(verified.coverage.total, 100)
        self.assertEqual(verified.coverage.sampled, 3)
        self.assertEqual(compiled.outputAssembly['fields'][0]['binding']['path'], ['value'])
        self.assertEqual(compiled.segments[0]['operation']['specification']['fields']['value']['maxValues'], 300)
        self.assertEqual(compiled.resultBinding['schema'], SCHEMA)

    async def test_runtime_field_budget_overflow_is_reported_without_reading_full_values(self):
        element = Element((301,))
        records, _arguments, result = await tool_case(element)
        self.assertEqual(result.error, 'read_field_value_limit')
        self.assertEqual(element.reads, [3])
        self.assertEqual(records.records, [])

    async def test_false_container_based_coverage_is_rejected(self):
        records, arguments, result = await tool_case(Element())
        records.records[0].sample.coverage.sampled = 1
        records.records[0].sample.coverage.total = 1
        # Keep the returned payload consistent so the evidence check must reject the wrong coverage itself.
        payload = json.loads(result.extracted_content)
        payload['coverage']['sampled'] = 1
        payload['coverage']['total'] = 1
        result.extracted_content = json.dumps(payload)
        with self.assertRaisesRegex(ValueError, 'sample_coverage_mismatch'):
            verified_method_read(records=records, start=0, arguments=arguments.model_dump(mode='json'),
                results=[result], result_ref=EvidenceRef(ref='result', digest=digest(result.extracted_content)),
                action_ref='a-0001')

    async def test_record_array_still_limits_records_and_formal_read_has_no_sampling_flag(self):
        from test_read_sampling import Page as RecordPage, Browser as RecordBrowser, specification
        page = RecordPage(10)
        method = specification(maximum=100)
        sample = await sample_read_fields(RecordBrowser(page), method)
        self.assertEqual(page.reads, [10, 11, 12, 10, 11, 12])
        self.assertEqual(sample.coverage.sampled, 3)
        self.assertEqual(sample.coverage.total, 10)
        page.reads.clear()
        self.assertEqual(len(await read_fields(RecordBrowser(page), method)), 10)
        self.assertEqual(page.reads, list(range(10, 20)))


if __name__ == '__main__':
    unittest.main()
