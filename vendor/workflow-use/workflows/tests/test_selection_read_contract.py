import asyncio
import json
import os
import tempfile
import unittest
from urllib.parse import quote
from unittest.mock import patch

from workflow_use.hybrid.natural_reads import find_elements_read_spec
from workflow_use.hybrid.read import ReadField, ReadSpec, read_fields
from tests.test_execution_dynamic_selection import query


class SelectionReadContractTests(unittest.TestCase):
    def test_requested_attributes_and_original_identity_survive_missing_attributes(self):
        specification = find_elements_read_spec(query().model_copy(update={'requestedAttributes': ['title', 'href']}))

        class Element:
            def __init__(self, text, title, href):
                self.values = {'text': text, 'attribute_title': title, 'attribute_href': href}

            async def evaluate(self, _script, fields):
                return json.dumps({field['name']: {'selfMatched': True,
                    'values': [{'value': self.values[field['name']], 'hasShadow': False}]} for field in fields})

        class Resolver:
            def __init__(self, browser): pass
            async def resolve_collection(self, selector, scope):
                return [Element('one', 'first', '/one'), Element('two', None, '/two'),
                        Element('three', 'third', None)]

        with patch('workflow_use.hybrid.read.TargetResolver', Resolver):
            output = asyncio.run(read_fields(object(), specification))
        self.assertEqual(output, [{'text': 'one', 'ordinal': 1, 'attribute_title': 'first', 'attribute_href': '/one'},
                                  {'text': 'two', 'ordinal': 2, 'attribute_href': '/two'},
                                  {'text': 'three', 'ordinal': 3, 'attribute_title': 'third'}])
        self.assertNotIn('attribute_title', specification.outputSchema['items']['required'])

    def test_complete_selection_read_rejects_overflow_instead_of_silently_truncating(self):
        specification = find_elements_read_spec(query().model_copy(update={'maxResults': 3}))

        class Resolver:
            def __init__(self, browser): pass
            async def resolve_collection(self, selector, scope): return [object()] * 4

        with patch('workflow_use.hybrid.read.TargetResolver', Resolver):
            with self.assertRaisesRegex(ValueError, 'read_collection_limit'):
                asyncio.run(read_fields(object(), specification))


@unittest.skipUnless(os.environ.get('BAT_REAL_BROWSER') == '1', 'explicit headless browser verification')
class SelectionReadBrowserTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_query_text_and_resolved_links_include_hidden_candidates(self):
        from browser_use import Browser

        profile = tempfile.TemporaryDirectory(prefix='bat-selection-read-')
        browser = Browser(headless=True, use_cloud=False, keep_alive=False,
            user_data_dir=profile.name, enable_default_extensions=False,
            executable_path=os.environ.get('BAT_UPSTREAM_BROWSER_EXECUTABLE'))
        try:
            await browser.start()
            page = await browser.get_current_page()
            await page.goto('data:text/html,' + quote('''<base href="https://example.invalid/catalog/">
                <a class="candidate" href="one" title="first">One <span hidden>eligible</span></a>
                <a class="candidate" style="display:none" href="two">Two</a>
                <a class="candidate">Three</a>'''))
            value = query().model_copy(update={'requestedAttributes': ['title', 'href']})
            value.query.value = '.candidate'
            output = await read_fields(browser, find_elements_read_spec(value))
            self.assertEqual(output, [
                {'text': 'One eligible', 'ordinal': 1, 'attribute_title': 'first',
                 'attribute_href': 'https://example.invalid/catalog/one'},
                {'text': 'Two', 'ordinal': 2, 'attribute_href': 'https://example.invalid/catalog/two'},
                {'text': 'Three', 'ordinal': 3},
            ])
            # WHY：修复原生候选查询不能放宽业务结果默认只读可见文本的合同。
            visible = ReadSpec(container='.candidate', fields={'text': ReadField(selector=':scope')},
                maxItems=3, outputSchema={'type': 'array', 'items': {'type': 'object'}})
            with self.assertRaisesRegex(ValueError, 'read_field_not_text'):
                await read_fields(browser, visible)
        finally:
            await browser.kill()
            profile.cleanup()
