"""Actual Runner/author serialization fixtures with mocked browser and provider boundaries."""
import asyncio
import json
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import UUID

from browser_use.agent.views import ActionResult
from browser_use_runner.hybrid_main import Runner

from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.natural_reads import NaturalReadProposal
from workflow_use.hybrid.registry import ActionRegistry

QUERY = 'Read visible records'
URL = 'https://fixture.invalid/records?view=current'
ITEM_SCHEMA = {'type': 'object',
               'properties': {'name': {'type': 'string', 'maxLength': 40}, 'weight': {'type': 'number'}},
               'required': ['name', 'weight'], 'additionalProperties': False}
LIST_SCHEMA = {'type': 'array', 'maxItems': 1, 'items': ITEM_SCHEMA}
OUTPUT_SCHEMA = {'type': 'object', 'properties': {'records': LIST_SCHEMA},
                 'required': ['records'], 'additionalProperties': False}
READ_SPEC = {'container': '.record', 'fields': {
                 'name': {'selector': '.name'},
                 'weight': {'selector': '.weight', 'valueType': 'number'}},
             'maxItems': 1, 'maxInputBytes': 4000, 'outputSchema': LIST_SCHEMA}
FINAL_OUTPUT = {'records': [{'name': 'Example', 'weight': 1.0}]}
fixture_state = {}


class FakeSemanticModel:
    def __init__(self):
        self.calls = []

    async def ainvoke(self, messages, output_format=None):
        self.calls.append((messages, output_format))
        proposal = {'specification': READ_SPEC, 'outputPath': ['records'], 'readPath': [],
                    'expected': FINAL_OUTPUT['records']}
        return SimpleNamespace(completion=NaturalReadProposal.model_validate(proposal))


class FakeHistory:
    def __init__(self, final_output):
        self.history = []
        self.final_output = final_output

    def is_successful(self):
        return True

    def is_done(self):
        return True

    def is_validated(self):
        return True

    def get_structured_output(self, model):
        return model(**self.final_output) if isinstance(self.final_output, dict) else model(value=self.final_output)


class FakeAgent:
    def __init__(self, scenario, source, **options):
        self.scenario, self.source, self.options = scenario, source, options
        self.history = FakeHistory(FINAL_OUTPUT if scenario == 'verified-output' else None)

    async def run(self, max_steps, on_step_end):
        registry = ActionRegistry.from_tools(self.options['tools'])
        actions = self.actions()
        if max_steps < len(actions):
            raise ValueError('fixture_max_steps_too_small')
        for index, (name, arguments) in enumerate(actions):
            output = SimpleNamespace(action=[registry.validate_action(name, arguments)])
            await self.options['register_new_step_callback'](self.options['browser'].summary, output, index + 1)
            if name == 'navigate':
                self.options['browser'].summary.url = arguments['url']
            result = ActionResult(is_done=name == 'done', success=True if name == 'done' else None,
                                  extracted_content=self.result_content(name))
            self.history.history.append(SimpleNamespace(model_output=output, result=[result]))
            await on_step_end(self)
        return self.history

    def actions(self):
        extract = ('extract', {'query': QUERY})
        final = FINAL_OUTPUT if self.scenario == 'verified-output' else {'value': None}
        done = ('done', {'success': True, 'data': final})
        if self.scenario == 'verified-output':
            return [extract, done]
        scroll = ('scroll', {'down': True, 'pages': 1.0})
        return [('navigate', {'url': self.source['input']['url'], 'new_tab': False}), scroll, extract, done]

    def result_content(self, name):
        if name == 'extract':
            return 'Example'
        if name == 'done':
            return json.dumps(self.history.final_output)
        return 'navigated'


def element(backend_id, markup):
    async def evaluate(expression):
        if expression != '() => this.outerHTML':
            raise AssertionError('unexpected_fixture_evaluate')
        return markup
    return SimpleNamespace(get_basic_info=AsyncMock(return_value={'backendNodeId': backend_id}), evaluate=evaluate)


def browser_fixture(scenario, source):
    markup = '<div class="record"><span class="name">Example</span><span class="weight">1</span></div>'
    main = element(1, '<main>' + markup + '</main>')
    record = element(10, markup)
    async def query(selector):
        if selector in ('main', '[role="main"]', 'body'):
            return [main]
        if selector == '.record':
            return [record]
        raise AssertionError('unexpected_fixture_selector:' + selector)
    initial_url = source['input']['url'] if scenario == 'verified-output' else 'about:blank'
    page = SimpleNamespace(get_target_info=AsyncMock(return_value={'targetId': 'real-tab'}),
                           get_title=AsyncMock(return_value='Records'),
                           get_url=AsyncMock(side_effect=lambda: summary.url),
                           get_elements_by_css_selector=AsyncMock(side_effect=query))
    summary = SimpleNamespace(url=initial_url, title='Records', tabs=[SimpleNamespace(target_id='real-tab')],
                              dom_state=SimpleNamespace(selector_map={}), screenshot='DO_NOT_SAVE')
    browser = SimpleNamespace(summary=summary, agent_focus_target_id='real-tab',
        browser_profile=SimpleNamespace(keep_alive=False),
        get_browser_state_summary=AsyncMock(side_effect=lambda: summary),
        get_current_page=AsyncMock(return_value=page))
    fixture_state['page'] = page
    return browser


def validate_source(scenario, source):
    if scenario not in ('bindings-gap', 'verified-output'):
        raise ValueError('unknown_natural_author_fixture')
    if source.get('input', {}).get('url') != URL or QUERY not in source.get('requirementText', ''):
        raise ValueError('natural_author_fixture_source_mismatch')
    expected = OUTPUT_SCHEMA if scenario == 'verified-output' else {'type': 'null'}
    if source.get('outputSchema') != expected:
        raise ValueError('natural_author_fixture_output_schema_mismatch')


async def fixture(scenario, source):
    validate_source(scenario, source)
    browser = browser_fixture(scenario, source)
    runner = Runner()
    runner.browser = browser
    semantic = FakeSemanticModel() if scenario == 'verified-output' else None
    fixture_state['semantic'] = semantic
    def model(**options):
        return semantic if options['purpose'] == 'semantic_annotation' else None
    def agent(**options):
        return FakeAgent(scenario, source, **options)
    command = {'id': str(UUID('11111111-1111-4111-8111-111111111111')), 'type': 'hybrid_author',
               'source': source,
               'model': {'model': 'fixture', 'endpoint': 'http://127.0.0.1:43123', 'token': 'private'}}
    with patch('browser_use_runner.hybrid_main.AIConnectModel', side_effect=model), \
            patch('workflow_use.hybrid.author.Agent', side_effect=agent):
        return await runner.handle(command)


def source(scenario):
    output_schema = OUTPUT_SCHEMA if scenario == 'verified-output' else {'type': 'null'}
    input_schema = {'type': 'object', 'properties': {'url': {'type': 'string'}},
                    'required': ['url'], 'additionalProperties': False}
    requirement = {'fixture': 'requirement', 'scenario': scenario}
    plan = {'fixture': 'plan', 'scenario': scenario}
    return {'task': 'Open the input URL and read visible records.', 'input': {'url': URL},
            'inputSchema': input_schema, 'outputSchema': output_schema,
            'requirementId': '10000000-0000-4000-8000-000000000001', 'requirementVersion': 1,
            'requirementText': 'Open the input URL. ' + QUERY + '.', 'requirementDigest': digest(requirement),
            'planId': '10000000-0000-4000-8000-000000000002', 'planVersion': 1,
            'planDigest': digest(plan), 'stepId': 'perform', 'callMode': 'once', 'maxSteps': 4,
            'verifiedChildren': []}


if __name__ == '__main__':
    raw = json.load(sys.stdin)
    print(json.dumps(asyncio.run(fixture(sys.argv[1], raw)), ensure_ascii=False, allow_nan=False))
