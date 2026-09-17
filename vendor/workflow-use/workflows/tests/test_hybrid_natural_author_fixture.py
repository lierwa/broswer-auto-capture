"""The cross-language natural author fixture uses real collector/compiler serialization."""
import json
import unittest

from natural_author_fixture import QUERY, fixture, fixture_state, source


def facts(result, kind):
    return [fact for observation in result['request']['trace']['observations']
            for fact in observation['facts'] if fact['kind'] == kind]


class NaturalAuthorFixtureTests(unittest.IsolatedAsyncioTestCase):
    async def test_binding_fixture_preserves_null_and_string_provenance(self):
        result = await fixture('bindings-gap', source('bindings-gap'))
        bindings = {(item['value']['provenance'], item['value']['argumentPath']): item['value']
                    for item in facts(result, 'natural_binding')}

        self.assertIsNone(bindings['runtime_input', 'url']['taskQuote'])
        self.assertIsNone(bindings['native_parameter', 'new_tab']['taskQuote'])
        pages = bindings['native_parameter', 'pages']['binding']['value']
        self.assertEqual(pages, 1.0)
        self.assertIs(type(pages), float)
        self.assertEqual(bindings['task_literal', 'query']['taskQuote'], QUERY)
        self.assertIn('"pages":1.0', result['response']['sourcePayloads'][2])
        self.assertIn('natural_read_annotation_model_unavailable',
                      [item['reason'] for item in result['response']['compilation']['gaps']])
        self.assertIsNone(result['response']['compilation']['outputAssembly'])
        self.assertEqual(len(result['response']['sourcePayloads']), 5)
        round_trip = json.loads(json.dumps(result, allow_nan=False))
        self.assertIsNone(next(item['value']['taskQuote'] for item in facts(round_trip, 'natural_binding')
                               if item['value']['provenance'] == 'runtime_input'))

    async def test_verified_output_fixture_uses_live_read_and_dynamic_assembly(self):
        result = await fixture('verified-output', source('verified-output'))
        compilation = result['response']['compilation']

        self.assertEqual(result['output'], {'records': [{'name': 'Example', 'weight': 1.0}]})
        self.assertEqual(compilation['gaps'], [])
        self.assertEqual([item['operation']['name'] for item in compilation['segments']],
                         ['browser.read-fields'])
        reads = facts(result, 'verified_natural_read')
        self.assertEqual(len(reads), 1)
        self.assertEqual(reads[0]['value']['output'][0]['weight'], 1.0)
        self.assertIs(type(reads[0]['value']['output'][0]['weight']), float)
        self.assertIsNotNone(compilation['outputAssembly'])
        self.assertEqual(compilation['outputAssembly']['fields'][0]['path'], ['records'])
        self.assertEqual(len(fixture_state['semantic'].calls), 1)
        selectors = [call.args[0] for call in fixture_state['page'].get_elements_by_css_selector.call_args_list]
        self.assertGreaterEqual(selectors.count('.record'), 5)


if __name__ == '__main__':
    unittest.main()
