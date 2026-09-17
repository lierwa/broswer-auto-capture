import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use_runner.hybrid_main import ReadCommand
from hybrid_fixture import fixture

from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.read import ReadSpec, read_fields


class ReadTests(unittest.IsolatedAsyncioTestCase):
    async def test_scoped_read_uses_upstream_property_and_mature_selector_parser(self):
        raw = fixture('semantic')
        self.assertEqual(raw['response']['compilation']['gaps'], [])
        segments = raw['response']['compilation']['segments']
        self.assertEqual([s['kind'] for s in segments], ['deterministic', 'explicit_llm'])
        specification = ReadSpec.model_validate(segments[0]['operation']['specification'])
        element = SimpleNamespace(evaluate=AsyncMock(return_value='<div class="entry"><b class="name">Example</b></div>'))
        page = SimpleNamespace(get_elements_by_css_selector=AsyncMock(return_value=[element]))
        browser = SimpleNamespace(get_current_page=AsyncMock(return_value=page))
        self.assertEqual(await read_fields(browser, specification), [{'name': 'Example'}])
        page.get_elements_by_css_selector.assert_awaited_once_with('.entry')
        element.evaluate.assert_awaited_once()

    async def test_ambiguous_fields_and_input_limits_fail(self):
        raw = fixture('semantic')
        specification = ReadSpec.model_validate(raw['response']['compilation']['segments'][0]['operation']['specification'])
        element = SimpleNamespace(evaluate=AsyncMock(return_value='<div><b class="name">A</b><b class="name">B</b></div>'))
        browser = SimpleNamespace(get_current_page=AsyncMock(return_value=SimpleNamespace(
                                  get_elements_by_css_selector=AsyncMock(return_value=[element]))))
        with self.assertRaisesRegex(ValueError, 'ambiguous_or_missing'):
            await read_fields(browser, specification)
        specification.maxInputBytes = 1
        with self.assertRaisesRegex(ValueError, 'read_input_limit'):
            await read_fields(browser, specification)

    async def test_scope_rejects_different_query_and_navigation_during_read(self):
        schema = {'type': 'object', 'properties': {'name': {'type': 'string', 'maxLength': 20}},
                  'required': ['name'], 'additionalProperties': False}
        specification = ReadSpec(container='.entry', fields={'name': {'selector': '.name'}},
                                 maxItems=1, maxInputBytes=1000, outputSchema=schema)
        expected = 'https://fixture.invalid/list?filter=one'
        current = {'url': 'https://fixture.invalid/list?filter=two'}
        element = SimpleNamespace(evaluate=AsyncMock(return_value='<div><b class="name">Example</b></div>'))
        page = SimpleNamespace(get_target_info=AsyncMock(return_value={'targetId': 'tab-1'}),
            get_url=AsyncMock(side_effect=lambda: current['url']),
            get_elements_by_css_selector=AsyncMock(return_value=[element]))
        browser = SimpleNamespace(get_current_page=AsyncMock(return_value=page))
        scope = {'url': 'https://fixture.invalid/list', 'urlDigest': digest(expected)}

        with self.assertRaisesRegex(ValueError, 'target_scope_mismatch'):
            await read_fields(browser, specification, scope=scope)

        command = ReadCommand.model_validate({'name': 'browser.read-fields', 'version': 2,
                                               'specification': specification.model_dump(), 'scope': scope})
        self.assertEqual(command.scope.urlDigest, digest(expected))
        with self.assertRaises(ValueError):
            ReadCommand.model_validate({'name': 'browser.read-fields', 'version': 2,
                                        'specification': specification.model_dump(),
                                        'scope': {**scope, 'unexpected': True}})
        page.get_elements_by_css_selector.assert_not_awaited()

        current['url'] = expected
        async def navigate_while_reading(_script):
            current['url'] = 'https://fixture.invalid/list?filter=two'
            return '<div><b class="name">Example</b></div>'
        element.evaluate.side_effect = navigate_while_reading
        with self.assertRaisesRegex(ValueError, 'target_scope_mismatch'):
            await read_fields(browser, specification, scope=scope)


if __name__ == '__main__':
    unittest.main()
