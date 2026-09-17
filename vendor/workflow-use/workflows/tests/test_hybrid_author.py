"""Natural author entry: task text drives Agent and authority JSON is rejected."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from browser_use.agent.views import ActionResult
from browser_use_runner.hybrid_main import Runner
from browser_use_runner.output_schema import output_model_for

from workflow_use.hybrid.author import AuthorInput, author_step
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.registry import ActionRegistry

TASK = 'Open the supplied URL and finish the step.'
AUTHOR_RESULT_KEYS = {'output', 'request', 'response', 'history', 'sourceSuccess', 'sourceValidated',
                      'browserCommands'}


def natural_source():
    input_schema = {'type': 'object', 'properties': {'url': {'type': 'string'}},
                    'required': ['url'], 'additionalProperties': False}
    return {'task': TASK, 'input': {'url': 'https://fixture.invalid/next'},
            'inputSchema': input_schema, 'outputSchema': {'type': 'null'},
            'requirementId': 'req', 'requirementVersion': 1, 'requirementText': TASK,
            'requirementDigest': digest({'id': 'req-source'}),
            'planId': 'plan', 'planVersion': 1, 'planDigest': digest({'id': 'plan-source'}),
            'stepId': 'step', 'callMode': 'once', 'maxSteps': 3, 'verifiedChildren': []}


class FakeAgent:
    last_options = None

    def __init__(self, **options):
        FakeAgent.last_options = options
        self.options = options
        self.history = SimpleNamespace(history=[], is_successful=lambda: True, is_done=lambda: True,
            is_validated=lambda: True, get_structured_output=lambda model: model(value=None))

    async def run(self, max_steps, on_step_end):
        registry = ActionRegistry.from_tools(self.options['tools'])
        actions = [('navigate', {'url': 'https://fixture.invalid/next', 'new_tab': False}),
                   ('done', {'success': True, 'data': {'value': None}})]
        for index, (name, args) in enumerate(actions):
            output = SimpleNamespace(action=[registry.validate_action(name, args)])
            summary = self.options['browser'].summary
            await self.options['register_new_step_callback'](summary, output, index + 1)
            summary.url = 'https://fixture.invalid/next'
            self.history.history.append(SimpleNamespace(model_output=output,
                result=[ActionResult(is_done=name == 'done', success=True if name == 'done' else None,
                                     extracted_content='null')]))
            await on_step_end(self)
        return self.history


class RaisingAgent(FakeAgent):
    async def run(self, max_steps, on_step_end):
        registry = ActionRegistry.from_tools(self.options['tools'])
        output = SimpleNamespace(action=[registry.validate_action(
            'navigate', {'url': 'https://fixture.invalid/next', 'new_tab': False})])
        await self.options['register_new_step_callback'](self.options['browser'].summary, output, 1)
        self.history.history.append(SimpleNamespace(model_output=output, result=[]))
        raise ValueError('PRIVATE_NATIVE_FAILURE')


def browser_fixture():
    summary = SimpleNamespace(url='about:blank', title='', tabs=[SimpleNamespace(target_id='real-tab')],
                              dom_state=SimpleNamespace(selector_map={}), screenshot='DO_NOT_SAVE')
    browser = SimpleNamespace(summary=summary, agent_focus_target_id='real-tab',
        browser_profile=SimpleNamespace(keep_alive=False),
        get_browser_state_summary=AsyncMock(return_value=summary),
        get_current_page=AsyncMock(return_value=SimpleNamespace(get_title=AsyncMock(return_value=''),
                                                               get_url=AsyncMock(side_effect=lambda: summary.url))))
    return browser


class AuthorTests(unittest.IsolatedAsyncioTestCase):
    async def test_natural_task_enters_agent_and_compiles_only_proven_navigation(self):
        source, browser = natural_source(), browser_fixture()
        with patch('workflow_use.hybrid.author.Agent', FakeAgent):
            result = await author_step(browser, source, {'agent': None, 'judge': None, 'extract': None}, output_model_for)

        self.assertEqual(set(result), AUTHOR_RESULT_KEYS)
        self.assertEqual(result['browserCommands'], 1)
        self.assertEqual(FakeAgent.last_options['task'], TASK)
        self.assertEqual(result['request']['compilerVersion'], 'bat-hybrid/2')
        self.assertEqual(result['request']['requirement']['taskText'], TASK)
        self.assertNotIn('authority', result['request'])
        compilation = result['response']['compilation']
        self.assertEqual(len(compilation['segments']), 1)
        self.assertEqual(compilation['controlGraph']['entry'], 's-a-0001')
        self.assertEqual([row['disposition'] for row in compilation['coverage']],
                         ['compiled', 'agent_internal'])
        self.assertEqual(compilation['gaps'], [])
        binding = next(item for item in compilation['segments'][0]['bindings'] if item['argumentPath'] == 'url')
        self.assertEqual(binding['binding'], {'source': 'input', 'path': ['url']})
        self.assertTrue(binding['sourceRef'].startswith('fact-'))
        self.assertEqual(len(result['response']['sourcePayloads']), 5)
        self.assertNotIn('DO_NOT_SAVE', str(result))

        command = {'id': str(uuid4()), 'type': 'hybrid_compile', 'request': result['request'],
                   'outputSchema': {'type': 'null'}, 'verifiedChildren': []}
        runner = Runner()
        with patch('browser_use_runner.hybrid_main.Browser', side_effect=AssertionError('offline_opened_browser')):
            self.assertEqual(await runner.handle(command), result['response'])
        self.assertIsNone(runner.browser)

        with self.assertRaisesRegex(ValueError, 'extra_forbidden'):
            AuthorInput.model_validate({**source, 'authority': {}})

    async def test_runner_author_transport_preserves_strict_result_contract(self):
        runner = Runner()
        runner.browser = browser_fixture()
        command = {'id': str(uuid4()), 'type': 'hybrid_author', 'source': natural_source(),
                   'model': {'model': 'fixture', 'endpoint': 'http://127.0.0.1:43123', 'token': 'private'}}
        with (patch('workflow_use.hybrid.author.Agent', FakeAgent),
              patch('browser_use_runner.hybrid_main.AIConnectModel', return_value=None)):
            result = await runner.handle(command)

        self.assertEqual(set(result), AUTHOR_RESULT_KEYS)
        self.assertEqual(result['browserCommands'], 1)
        self.assertEqual(result['request']['compilerVersion'], 'bat-hybrid/2')
        self.assertEqual(len(result['response']['sourcePayloads']), 5)
        self.assertTrue(result['sourceSuccess'])
        self.assertTrue(result['sourceValidated'])
        self.assertFalse(runner.browser.browser_profile.keep_alive)

    async def test_native_failure_keeps_sanitized_partial_v2_trace(self):
        with patch('workflow_use.hybrid.author.Agent', RaisingAgent):
            result = await author_step(browser_fixture(), natural_source(),
                {'agent': None, 'judge': None, 'extract': None}, output_model_for)

        self.assertFalse(result['sourceSuccess'])
        self.assertFalse(result['sourceValidated'])
        self.assertFalse(result['request']['trace']['completed'])
        self.assertEqual(result['request']['trace']['actions'][0]['status'], 'proposed')
        reasons = [item['reason'] for item in result['response']['compilation']['gaps']]
        self.assertIn('native_agent_run_failed', reasons)
        self.assertIn('capture_callback_incomplete', reasons)
        self.assertNotIn('PRIVATE_NATIVE_FAILURE', str(result))


if __name__ == '__main__':
    unittest.main()
