"""Action-owned ready reads follow a dynamic result, not the exploration sample URL."""
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.postconditions import PostconditionNotMet, action_result_readiness
from workflow_use.hybrid.targets import TargetResolver

SAMPLE_URL = 'https://example.test/detail/sample'
RUNTIME_URL = 'https://example.test/detail/current'
SETTLE = {'maxMs': 150, 'maxAttempts': 4, 'intervalMs': 10}
READ = {'container': '.record', 'fields': {'title': {'selector': '.title'}}, 'maxItems': 1,
        'outputSchema': {'type': 'array', 'maxItems': 1, 'items': {'type': 'object',
            'properties': {'title': {'type': 'string', 'maxLength': 100}},
            'required': ['title'], 'additionalProperties': False}}}


def conditions(authority='ready'):
    return [{'kind': 'url_digest', 'changed': True, 'settle': SETTLE},
            {'kind': 'read_fields', authority: True, 'consumerRef': 's-consumer', 'read': READ,
             'scope': {'url': SAMPLE_URL, 'urlDigest': digest(SAMPLE_URL)}, 'settle': SETTLE}]


class Browser:
    def __init__(self):
        self.id = 'session-1'
        self.agent_focus_target_id = 'tab-1'
        self.url = 'https://example.test/list'

    async def get_current_page(self):
        return self

    async def get_url(self):
        return self.url

    async def get_target_info(self):
        return {'targetId': self.agent_focus_target_id}

    async def get_tabs(self):
        return [SimpleNamespace(target_id=target) for target in ('tab-1', 'other')]


class DynamicReadyScopeTests(unittest.IsolatedAsyncioTestCase):
    async def run_click(self, raw, *, after_dispatch=None, after_read=None):
        browser = Browser()
        capability = OrdinaryCapability.__new__(OrdinaryCapability)
        capability.browser = browser
        capability.last_event_diagnostic = None
        scopes = []

        async def dispatch(*_args, **_kwargs):
            browser.url = RUNTIME_URL
            if after_dispatch is not None:
                after_dispatch(browser)
            return SimpleNamespace(model_dump=lambda **_kwargs: {'error': None})

        async def native_read(_browser, _spec, *, scope, page, required_paths):
            # WHY：保留生产 TargetResolver 的 exact URL/digest 校验，只替换测试页的原生字段投影。
            await TargetResolver(browser).assert_scope(scope)
            scopes.append(scope)
            if after_read is not None:
                after_read(browser)
            return [{'title': 'Current result'}]

        capability.execute = AsyncMock(side_effect=dispatch)
        with patch('workflow_use.hybrid.capability.current_document_id',
                   new=AsyncMock(return_value='doc-current')), \
                patch('workflow_use.hybrid.postconditions.current_document_id',
                      new=AsyncMock(return_value='doc-current')), \
                patch('workflow_use.hybrid.postconditions.read_fields',
                      new=AsyncMock(side_effect=native_read)):
            try:
                result = await capability.execute_checked('click', {}, None, raw)
            finally:
                self.assertEqual(capability.execute.await_count, 1)
        return result, scopes

    async def test_ready_dynamic_result_uses_live_action_scope_and_dispatches_once(self):
        raw = conditions()
        original = deepcopy(raw)

        result, scopes = await self.run_click(raw)

        self.assertEqual(result, {'error': None})
        self.assertEqual(scopes, [{'url': RUNTIME_URL, 'urlDigest': digest(RUNTIME_URL)}] * 2)
        self.assertEqual(raw, original)

    async def test_existing_transition_also_keeps_same_action_scope(self):
        _, scopes = await self.run_click(conditions('transition'))

        self.assertEqual(scopes, [{'url': RUNTIME_URL, 'urlDigest': digest(RUNTIME_URL)}] * 2)

    async def test_fixed_url_is_not_parameterized_to_the_runtime_result(self):
        raw = conditions()
        raw[0] = {'kind': 'url', 'equals': SAMPLE_URL, 'settle': SETTLE}
        self.assertIsNone(action_result_readiness('click', raw))

        with self.assertRaisesRegex(PostconditionNotMet, 'ordinary_postcondition_failed_url_fact_mismatch'):
            await self.run_click(raw)

    async def test_other_session_or_target_cannot_be_adopted_after_dispatch(self):
        for field, message in [('id', 'navigation_action_owner_changed'),
                               ('agent_focus_target_id', 'navigation_tab_focus_changed')]:
            with self.subTest(field=field):
                with self.assertRaisesRegex(ValueError, message):
                    await self.run_click(conditions(), after_dispatch=lambda browser: setattr(browser, field, 'other'))

    async def test_owner_drift_during_native_read_cannot_pass_stability(self):
        for field in ('id', 'agent_focus_target_id'):
            with self.subTest(field=field):
                with self.assertRaisesRegex(PostconditionNotMet, 'ordinary_postcondition_action_page_changed'):
                    await self.run_click(conditions(), after_read=lambda browser: setattr(browser, field, 'other'))

    def test_selection_requires_one_consumer_and_proven_dynamic_navigation(self):
        rejected = []
        multiple = conditions()
        multiple.append({**deepcopy(multiple[1]), 'consumerRef': 's-other'})
        rejected.append(multiple)
        no_change = conditions()
        no_change[0] = {'kind': 'url_digest', 'unchanged': True, 'settle': SETTLE}
        rejected.append(no_change)
        fixed = conditions()
        fixed.insert(0, {'kind': 'url', 'equals': SAMPLE_URL, 'settle': SETTLE})
        rejected.append(fixed)
        bound = conditions()
        bound.insert(0, {'kind': 'url', 'bindingArgument': 'url', 'settle': SETTLE})
        rejected.append(bound)
        no_scope = conditions()
        no_scope[1].pop('scope')
        rejected.append(no_scope)

        for raw in rejected:
            with self.subTest(raw=raw):
                self.assertIsNone(action_result_readiness('click', raw))
        self.assertIsNone(action_result_readiness('input', conditions()))
        self.assertEqual(action_result_readiness('click', conditions()), 1)
        self.assertEqual(action_result_readiness('send_keys', conditions()), 1)


if __name__ == '__main__':
    unittest.main()
