"""Navigation follows its bound argument; a website's landing URL is not that argument."""
import unittest
from copy import deepcopy
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch

from browser_use.agent.views import ActionResult
from workflow_use.hybrid.action_dispatch import ActionDispatchAudit
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.evidence import EvidenceRef, digest
from workflow_use.hybrid.natural_compile import natural_postconditions
from workflow_use.hybrid.natural_binding_compile import natural_bindings
from workflow_use.hybrid.postconditions import action_result_readiness, PostconditionNotMet
from tests.test_dynamic_ready_scope import Browser, conditions


def fact(kind, value):
    checksum = digest(value)
    return NS(id='fact-' + kind, kind=kind, value=value,
              sourceRefs=[EvidenceRef(ref='sha256:' + checksum, digest=checksum)])


def fixture(landed, *, error=None, entered=True):
    raw = ActionResult(error=error).model_dump(mode='json')
    reference = EvidenceRef(ref='sha256:' + digest(raw), digest=digest(raw))
    action = NS(id='a-0001', name='navigate', status='succeeded', actionIndex=0,
                args={'url': 'https://entry.example.test/start'}, resultRef=reference)
    sent = {'actionRef': action.id, 'schemaVersion': 'bat.native-action-dispatch/v3',
            'actionName': action.name, 'entered': entered, 'resultReceived': True,
            'nativeActionIndex': 0, 'resultRef': reference.model_dump(), 'intentTarget': None,
            'eventCapture': {'status': 'not_applicable', 'eventExpectation': 'none',
                             'eventCount': 0, 'limitations': []}}
    received = {'actionRef': action.id, 'schemaVersion': 'bat.native-action-result/v1',
                'receivedFromToolsAct': True, 'resultRef': reference.model_dump(), 'result': raw}
    pre = NS(id='pre', tabId='tab-1', url=action.args['url'], sourceRefs=[],
             facts=[fact('native_action_dispatch', sent), fact('native_action_result', received)])
    post = NS(id='post', tabId='tab-1', url=landed, sourceRefs=[], facts=[fact('natural_postcondition',
        {'actionRef': action.id, 'kind': 'url', 'bindingArgument': 'url',
         'matched': landed == action.args['url']})])
    return action, pre, post


class NavigationDispatchContract(unittest.IsolatedAsyncioTestCase):
    def test_native_success_does_not_require_landing_url_equality_or_change(self):
        for landed in ('https://entry.example.test/start', 'https://run-123.example.test/start',
                       'https://entry.example.test/result?id=456', 'https://entry.example.test/start#ready'):
            with self.subTest(landed=landed):
                action, pre, post = fixture(landed)
                checks, refs, issues = natural_postconditions(action, pre, post, None, [])
                self.assertEqual(issues, [])
                self.assertEqual(checks, [])
                self.assertTrue(refs)

    def test_failed_or_missing_dispatch_cannot_be_replaced_by_matching_landing_url(self):
        for options in ({'error': 'native_failed'}, {'entered': False}):
            with self.subTest(options=options):
                action, pre, post = fixture('https://entry.example.test/start', **options)
                _, _, issues = natural_postconditions(action, pre, post, None, [])
                self.assertTrue(issues)

    async def test_different_dispatched_argument_invalidates_native_audit(self):
        audit = ActionDispatchAudit()
        intended = {'navigate': {'url': 'https://entry.example.test/start'}}
        audit.propose(1, 0, intended)
        await audit.enter({'navigate': {'url': 'https://unplanned.example.test/'}})
        self.assertFalse(audit.entries[(1, 0)]['entered'])
        self.assertFalse(audit.entries[(1, 0)]['identityValid'])

    def test_plan_url_binding_rejects_a_different_observed_argument(self):
        action, pre, _ = fixture('https://run.example.test/result')
        expected = action.args['url']
        pre.facts.append(fact('natural_binding', {'actionRef': action.id, 'argumentPath': 'url',
            'binding': {'source': 'constant', 'value': expected}, 'provenance': 'plan_entry_url'}))
        request = NS(runtimeInputSchema={'type': 'null'}, plan=NS(entryUrls=[expected]))
        bindings, issues = natural_bindings(request, action, pre, False)
        self.assertEqual(issues, [])
        self.assertEqual(bindings[0]['binding']['value'], expected)
        action.args['url'] = 'https://wrong.example.test/'
        bindings, issues = natural_bindings(request, action, pre, False)
        self.assertEqual(bindings, [])
        self.assertEqual(issues[0].reason, 'natural_binding_provenance_mismatch:url')

    async def test_navigation_native_error_and_foreign_target_do_not_pass(self):
        for failure in ('native', 'target'):
            with self.subTest(failure=failure):
                browser = Browser()
                capability = OrdinaryCapability.__new__(OrdinaryCapability)
                capability.browser = browser

                async def execute(*_args, **_kwargs):
                    if failure == 'native':
                        raise RuntimeError('ordinary_action_failed')
                    browser.agent_focus_target_id = 'other'
                    return ActionResult()

                capability.execute = AsyncMock(side_effect=execute)
                with self.assertRaisesRegex((RuntimeError, ValueError),
                        'ordinary_action_failed|navigation_tab_focus_changed'):
                    await capability.execute_checked('navigate', {'url': 'https://example.test/start'},
                                                     None, conditions()[1:])
                self.assertEqual(capability.execute.await_count, 1)

    async def test_navigation_consumer_reads_current_owned_page_once(self):
        from workflow_use.hybrid.targets import TargetResolver
        raw = conditions()[1:]
        before = deepcopy(raw)
        for landed in ('https://run-1.example.test/result', 'https://run-2.example.test/result',
                       'https://example.test/list'):
            with self.subTest(landed=landed):
                browser = Browser()
                capability = OrdinaryCapability.__new__(OrdinaryCapability)
                capability.browser = browser
                scopes = []

                async def execute(_name, args, *_args, **_kwargs):
                    self.assertEqual(args, {'url': 'https://example.test/start'})
                    browser.url = landed
                    return ActionResult()

                async def read(_browser, _spec, *, scope, **kwargs):
                    await TargetResolver(browser).assert_scope(scope)
                    scopes.append(scope)
                    return [{'title': 'Current result'}]

                capability.execute = AsyncMock(side_effect=execute)
                with (patch('workflow_use.hybrid.capability.current_document_id', AsyncMock(return_value='doc')),
                     patch('workflow_use.hybrid.postconditions.current_document_id', AsyncMock(return_value='doc')),
                     patch('workflow_use.hybrid.postconditions.read_fields', AsyncMock(side_effect=read))):
                    await capability.execute_checked('navigate', {'url': 'https://example.test/start'}, None, raw)
                self.assertEqual(capability.execute.await_count, 1)
                self.assertTrue(scopes)
                self.assertTrue(all(scope['url'] == landed for scope in scopes))
        self.assertEqual(raw, before)

    def test_explicit_url_condition_is_never_rebound_to_any_landing_page(self):
        raw = conditions()[1:]
        raw.insert(0, {'kind': 'url', 'equals': 'https://example.test/required'})
        self.assertIsNone(action_result_readiness('navigate', raw))

    def test_retired_consumer_does_not_erase_proven_native_navigation(self):
        from workflow_use.hybrid.natural_read_liveness import rebind_consumer_readiness
        action, pre, post = fixture('https://run.example.test/result')
        action.effect, action.preObservationRef, action.postObservationRef = 'navigation', pre.id, post.id
        trace = NS(actions=[action], observations=[pre, post])
        segments = [{'id': 's-' + action.id, 'operation': {'name': 'browser.workflow-step'},
                     'postconditions': conditions()[1:], 'proofRefs': []}]
        self.assertEqual(rebind_consumer_readiness(trace, segments, []), [])
        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0]['postconditions'], [])


if __name__ == '__main__':
    unittest.main()
