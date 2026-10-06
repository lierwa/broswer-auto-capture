"""保护普通节点上下文值绑定和原生 switch 静默失败的验证边界。"""
import copy
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from browser_use import Tools
from workflow_use.hybrid.author import AuthorInput, natural_compilation_request
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.normalize import HistoryInput, HistoryRecord, ResultEvidence, normalize_history
from workflow_use.hybrid.evidence import TraceSource
from workflow_use.hybrid.natural_prefix import compile_natural_prefix
from test_author_source_boundary import source_fixture

from workflow_use.hybrid.context_bindings import prior_context_binding, native_switch_parameters, CONTEXT_SCHEMA, context_outputs
from workflow_use.hybrid.evidence import NormalizedObservation, digest
from workflow_use.hybrid.postconditions import declared_checks, check_fact
from workflow_use.hybrid.natural_media_compile import bind_action_playback
from test_method_source_compile import fact, reference


def observation(identifier, target, url):
    return NormalizedObservation(id=identifier, sequence=0, url=url, tabId=target,
        sourceRefs=[reference(identifier)], facts=[fact('url_digest', digest(url)),
            fact('browser_context', {'schemaVersion': 'bat.browser-context/v1', 'focusTargetId': target,
                 'tabs': [{'targetId': target, 'url': url, 'urlDigest': digest(url)}]})])


def delayed_context_source():
    raw, _, _ = source_fixture()
    raw.update(task='Return then navigate to a previously observed page.', input=None,
        inputSchema={'type': 'null'}, outputSchema={'type': 'null'},
        requirementText='Return then navigate to a previously observed page.',
        resultSpec={'contractVersion': 'bat-result-spec/v1', 'mode': 'execution'}, entryUrls=[])
    author_value = AuthorInput.model_validate(raw)
    registry = ActionRegistry.from_tools(Tools())
    detail, listing, tab = 'https://example.test/detail', 'https://example.test/list', 'session-full-1234'
    observations = []
    for index, url in enumerate([detail, detail, detail, listing, listing, detail]):
        post = observation(f'o-{index + 1:04d}', tab, url)
        post.sequence = index
        post.facts.append(fact('monotonic_ms', index * 100))
        if index == 5:
            post.facts.append(fact('natural_postcondition', {'actionRef': 'a-0003', 'kind': 'url',
                'bindingArgument': 'url', 'matched': True}))
        observations.append(post)
    records = []
    for index, action in enumerate([{'go_back': {}}, {'wait': {'seconds': 1}}, {'navigate': {'url': detail}}]):
        records.append(HistoryRecord(stepIndex=index, actions=[action],
            results=[ResultEvidence(errorPresent=False, ref=reference(action))],
            preObservationRef=observations[index * 2].id,
            postObservationRefs={'0': observations[index * 2 + 1].id}))
    trace, issues = normalize_history(HistoryInput(source=TraceSource(version=registry.providerVersion,
        historyRef='fixture:delayed-context-review'), completed=False, records=records,
        observations=observations, finalResultRef=None, redactionManifestRef=reference('redaction')), registry)
    if issues:
        raise AssertionError([issue.reason for issue in issues])
    return natural_compilation_request(author_value, trace, registry), registry


def immediate_navigation_source():
    raw, _, _ = source_fixture()
    url, tab = 'https://example.test/detail', 'session-full-1234'
    raw.update(task='Open a page, switch back, then revisit its observed address.', input=None,
        inputSchema={'type': 'null'}, outputSchema={'type': 'null'},
        requirementText='Open a page, switch back, then revisit its observed address.',
        resultSpec={'contractVersion': 'bat-result-spec/v1', 'mode': 'execution'}, entryUrls=[url])
    registry = ActionRegistry.from_tools(Tools())
    observations = [observation(f'o-{i + 1:04d}', tab, 'https://example.test/before' if i == 0 else url)
                    for i in range(6)]
    for index, post in enumerate(observations):
        post.sequence = index
    observations[0].facts.append(fact('natural_binding', {'actionRef': 'a-0001', 'argumentPath': 'url',
        'binding': {'source': 'constant', 'value': url}, 'provenance': 'plan_entry_url'}))
    for index in [1, 5]:
        observations[index].facts.append(fact('natural_postcondition', {'actionRef': f'a-{(index + 1) // 2:04d}',
            'kind': 'url', 'bindingArgument': 'url', 'matched': True}))
    records = [HistoryRecord(stepIndex=index, actions=[value],
        results=[ResultEvidence(errorPresent=False, ref=reference(value))],
        preObservationRef=observations[index * 2].id,
        postObservationRefs={'0': observations[index * 2 + 1].id})
        for index, value in enumerate([{'navigate': {'url': url}}, {'switch': {'tab_id': tab[-4:]}},
                                      {'navigate': {'url': url}}])]
    trace, issues = normalize_history(HistoryInput(source=TraceSource(version=registry.providerVersion,
        historyRef='fixture:immediate-navigation-context'), completed=False, records=records,
        observations=observations, finalResultRef=None, redactionManifestRef=reference('redaction')), registry)
    if issues:
        raise AssertionError([issue.reason for issue in issues])
    return natural_compilation_request(AuthorInput.model_validate(raw), trace, registry), registry


class BrowserContextContractTests(unittest.IsolatedAsyncioTestCase):
    def test_successful_navigation_and_switch_publish_their_verified_immediate_context(self):
        request, registry = immediate_navigation_source()
        compiled = compile_natural_prefix(request, registry, output_schema={'type': 'null'})
        self.assertEqual(compiled.gaps, [])
        self.assertEqual(len(compiled.segments), 3)
        self.assertEqual(compiled.segments[0]['outputs'], context_outputs(request.trace.observations[1]))
        self.assertEqual(compiled.segments[1]['outputs'], context_outputs(request.trace.observations[3]))

    def test_production_prefix_rejects_delayed_context_instead_of_silently_changing_destination(self):
        request, registry = delayed_context_source()
        compiled = compile_natural_prefix(request, registry, output_schema={'type': 'null'})
        self.assertTrue(any(issue['reason'] == 'natural_binding_evidence_missing:url' for issue in compiled.gaps))
        self.assertEqual(compiled.segments[0]['outputs'], [])
        self.assertFalse(any(segment['id'] == 's-a-0003' for segment in compiled.segments))
        producer = compiled.segments[0]
        post = request.trace.observations[1]
        for reference in [post.facts[0].id, post.facts[1].id]:
            producer['postconditions'][0]['clauseRef'] = reference
            self.assertIsNone(prior_context_binding(request, request.trace.actions[2], 'url', post.url, [producer]))
            self.assertEqual(producer['outputs'], [])

    def test_delayed_completion_cannot_publish_an_earlier_context_value(self):
        source = SimpleNamespace(id='a-0001', preObservationRef=None, postObservationRef='o-0002')
        target = SimpleNamespace(id='a-0003', name='navigate')
        post = observation('o-0002', 'source-full-1234', 'https://example.test/detail')
        request = SimpleNamespace(trace=SimpleNamespace(actions=[source, target], observations=[post]))
        segment = {'id': 's-a-0001', 'operation': {'name': 'browser.workflow-step'}, 'outputs': [],
                   'postconditions': [{'kind': 'url_digest', 'changed': True, 'clauseRef': 'later-list-fact'}]}
        for reference in ['later-list-fact', None, 'missing', post.facts[1].id, post.facts[0].id]:
            with self.subTest(reference=reference):
                condition = {'kind': 'url_digest', 'changed': True}
                if reference != 'missing':
                    condition['clauseRef'] = reference
                segment['postconditions'] = [condition]
                self.assertIsNone(prior_context_binding(request, target, 'url', post.url, [segment]))
                self.assertEqual(segment['outputs'], [])

    def test_navigation_autoplay_is_not_promoted_to_a_playback_requirement(self):
        before = observation('o-0001', 'source-full-1234', 'https://example.test/list')
        after = observation('o-0002', 'detail-full-5678', 'https://example.test/detail')
        before.facts.append(fact('media_playback', 'not_playing'))
        after.facts.append(fact('media_playback', 'playing'))
        action = SimpleNamespace(id='a-0001', name='click', status='succeeded', args={},
            resultRef=reference({}), preObservationRef=before.id, postObservationRef=after.id)
        self.assertEqual(bind_action_playback(action, {before.id: before, after.id: after}, {}), [])

        after.tabId, after.url = before.tabId, before.url
        self.assertEqual(bind_action_playback(action, {before.id: before, after.id: after}, {})[0].reason,
                         'media_playback_postcondition_missing')

    def test_same_url_new_document_autoplay_is_not_promoted_to_a_playback_requirement(self):
        before = observation('o-0001', 'source-full-1234', 'https://example.test/detail')
        after = observation('o-0002', before.tabId, before.url)
        before.facts.extend([fact('media_playback', 'not_playing'), fact('document_identity', {
            'targetId': before.tabId, 'documentDigest': digest('old document')})])
        after.facts.extend([fact('media_playback', 'playing'), fact('document_identity', {
            'targetId': after.tabId, 'documentDigest': digest('new document')})])
        action = SimpleNamespace(id='a-0001', name='click', status='succeeded', args={},
            resultRef=reference({}), preObservationRef=before.id, postObservationRef=after.id)
        self.assertEqual(bind_action_playback(action, {before.id: before, after.id: after}, {}), [])

        after.facts[-1] = fact('document_identity', {
            'targetId': before.tabId, 'documentDigest': digest('old document'), 'extra': 'unrelated'})
        self.assertEqual(bind_action_playback(action, {before.id: before, after.id: after}, {})[0].reason,
                         'media_playback_postcondition_missing')

    def test_prior_context_is_a_node_output_and_never_a_recorded_tab_constant(self):
        source = SimpleNamespace(id='a-0001', preObservationRef=None, postObservationRef='o-0002')
        target = SimpleNamespace(id='a-0003', name='switch')
        post = observation('o-0002', 'source-full-1234', 'https://example.test/list?runtime=1')
        request = SimpleNamespace(trace=SimpleNamespace(actions=[source, target], observations=[post]))
        segment = {'id': 's-a-0001', 'operation': {'name': 'browser.workflow-step'}, 'outputs': [],
                   'postconditions': [{'kind': 'url_digest', 'equals': digest(post.url), 'clauseRef': post.facts[0].id}]}
        original = copy.deepcopy(post.model_dump())
        binding = prior_context_binding(request, target, 'tab_id', '1234', [segment])
        self.assertEqual(binding['binding'], {'source': 'node', 'nodeId': source.id, 'path': ['tabId']})
        self.assertEqual(segment['outputs'], [{'schema': CONTEXT_SCHEMA, 'sourceRef': post.id}])
        target.name = 'navigate'
        self.assertEqual(prior_context_binding(request, target, 'url', post.url, [segment])['binding']['path'], ['url'])
        self.assertIsNone(prior_context_binding(request, target, 'url', 'https://other.test', [segment]))
        self.assertEqual(post.model_dump(), original)
        post.facts[0].value = digest('https://other.test')
        self.assertIsNone(prior_context_binding(request, target, 'url', post.url, [segment]))

    async def test_switch_rejects_missing_ambiguous_and_recorded_short_id_before_dispatch(self):
        browser = SimpleNamespace(get_tabs=AsyncMock(return_value=[SimpleNamespace(target_id='run-full-1234')]),
                                  get_target_id_from_tab_id=AsyncMock(return_value='run-full-1234'))
        self.assertEqual(await native_switch_parameters(browser, {'tab_id': 'run-full-1234'}), {'tab_id': '1234'})
        for invalid in ['1234', 'other-full-9999']:
            with self.assertRaises(ValueError):
                await native_switch_parameters(browser, {'tab_id': invalid})
        browser.get_tabs.return_value.append(SimpleNamespace(target_id='another-full-1234'))
        with self.assertRaises(ValueError):
            await native_switch_parameters(browser, {'tab_id': 'run-full-1234'})

    async def test_success_receipt_without_actual_focus_change_fails_postcondition(self):
        browser = SimpleNamespace(agent_focus_target_id='detail-full-9876')
        check = declared_checks([{'kind': 'active_tab', 'bindingArgument': 'tab_id'}],
                                {'tab_id': 'list-full-1234'}, None)[0]
        self.assertFalse((await check_fact(check.parameters, browser))[0])
        browser.agent_focus_target_id = 'list-full-1234'
        self.assertTrue((await check_fact(check.parameters, browser))[0])


if __name__ == '__main__':
    unittest.main()
