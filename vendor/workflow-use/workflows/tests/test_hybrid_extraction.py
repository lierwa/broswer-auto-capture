"""Pinned native extraction envelopes must agree with independently read page fields."""
import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use.agent.views import ActionResult

from workflow_use.hybrid.capture import extraction_value
from workflow_use.hybrid.read import ReadSpec, read_fields


class ExtractionTests(unittest.IsolatedAsyncioTestCase):
    def test_native_wrapped_json_and_structured_metadata(self):
        url, query, value = 'https://fixture.invalid/', 'Read named fields', {'name': 'Example'}
        content = f'<url>\n{url}\n</url>\n<query>\n{query}\n</query>\n<result>\n{json.dumps(value)}\n</result>'
        self.assertEqual(extraction_value(ActionResult(extracted_content=content), {'query': query}, url), value)
        metadata = {'structured_extraction': True, 'extraction_result': {
            'data': value, 'schema_used': {'type': 'object'}, 'source_url': url, 'is_partial': False}}
        self.assertEqual(extraction_value(ActionResult(metadata=metadata), {'query': query}, url), value)
        for mutation in ('url', 'query', 'partial', 'structured_url'):
            wrong = copy.deepcopy(metadata)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                if mutation in ('url', 'query'):
                    extraction_value(ActionResult(extracted_content=content), {'query': 'Other' if mutation == 'query' else query},
                                     'https://other.invalid/' if mutation == 'url' else url)
                else:
                    wrong['extraction_result']['is_partial' if mutation == 'partial' else 'source_url'] = True if mutation == 'partial' else 'https://other.invalid/'
                    extraction_value(ActionResult(metadata=wrong), {'query': query}, url)

    async def test_object_read_requires_one_declared_container(self):
        schema = {'type': 'object', 'properties': {'name': {'type': 'string', 'maxLength': 100}},
                  'required': ['name'], 'additionalProperties': False}
        spec = ReadSpec(container='#record', fields={'name': {'selector': 'b'}}, maxItems=1, maxInputBytes=1000, outputSchema=schema)
        element = SimpleNamespace(evaluate=AsyncMock(return_value='<div id="record"><b>Example</b></div>'))
        page = SimpleNamespace(get_elements_by_css_selector=AsyncMock(return_value=[element]))
        browser = SimpleNamespace(get_current_page=AsyncMock(return_value=page))
        self.assertEqual(await read_fields(browser, spec), {'name': 'Example'})
        page.get_elements_by_css_selector.return_value = []
        with self.assertRaisesRegex(ValueError, 'read_single_object_required'):
            await read_fields(browser, spec)
        page.get_elements_by_css_selector.return_value = [element]
        spec.maxItems = 2
        with self.assertRaisesRegex(ValueError, 'read_single_object_required'):
            await read_fields(browser, spec)

    async def test_repeated_fields_preserve_order_and_never_truncate(self):
        schema = {'type': 'object', 'properties': {'values': {'type': 'array', 'maxItems': 2,
                  'items': {'type': 'string', 'maxLength': 100}}}, 'required': ['values'], 'additionalProperties': False}
        spec = ReadSpec(container='#record', fields={'values': {'selector': 'i', 'multiple': True, 'maxValues': 2}},
                        maxItems=1, maxInputBytes=1000, outputSchema=schema)
        element = SimpleNamespace(evaluate=AsyncMock(return_value='<main><i>Second</i><i>First</i></main>'))
        browser = SimpleNamespace(get_current_page=AsyncMock(return_value=SimpleNamespace(
                  get_elements_by_css_selector=AsyncMock(return_value=[element]))))
        self.assertEqual(await read_fields(browser, spec), {'values': ['Second', 'First']})
        element.evaluate.return_value = '<main></main>'
        self.assertEqual(await read_fields(browser, spec), {'values': []})
        element.evaluate.return_value = '<main><i>A</i><i>B</i><i>C</i></main>'
        with self.assertRaisesRegex(ValueError, 'read_field_value_limit'):
            await read_fields(browser, spec)
