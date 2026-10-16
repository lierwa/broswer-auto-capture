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
from workflow_use.hybrid.author import author_tools_for_result_spec
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.method_receipt import attach_method_receipt
from workflow_use.hybrid.natural_facts import binding_facts
from workflow_use.hybrid.natural_binding_compile import natural_bindings
from browser_use.agent.views import ActionResult
from test_natural_read_liveness import sequence_stopped_fixture
from workflow_use.hybrid.native_sequence_stop import sequence_stop_coverage


def native_file_source():
    """Current file-source identity and native receipts, consumed by Python and TS together."""
    raw, _, _ = source_fixture()
    schema = {'type': 'object', 'properties': {'name': {'type': 'string'}},
              'required': ['name'], 'additionalProperties': False}
    raw.update(task='Write the supplied filename, then read its content.', input={'name': 'note.txt'},
        inputSchema=schema, outputSchema={'type': 'null'}, requirementText='Write then read the file.',
        resultSpec={'contractVersion': 'bat-result-spec/v1', 'mode': 'execution'}, sourceProtocol='bat-hybrid/3')
    author = AuthorInput.model_validate(raw)
    tools = author_tools_for_result_spec(author.resultSpec, source_protocol=author.sourceProtocol)
    tools.exclude_action('screenshot')
    registry = ActionRegistry.from_tools(tools)
    path = '/source-owner/note.txt'
    identity = {'fileName': 'note.txt', 'pathDigest': digest(path), 'contentDigest': 'c' * 64, 'byteLength': 7}
    actions = [{'write_file': {'file_name': 'note.txt', 'content': 'content', 'trailing_newline': False}},
               {'read_file': {'file_name': path}}, {'done': {'text': 'Finished.', 'success': True}}]
    observations, records = [], []
    for index, raw_action in enumerate(actions):
        name, args = next(iter(raw_action.items()))
        action_ref = f'a-{index + 1:04d}'
        result = ActionResult(extracted_content='content', is_done=name == 'done',
                              success=True if name == 'done' else None).model_dump(mode='json')
        result_ref = reference(result)
        pre = observation(f'o-{index * 2 + 1:04d}', 'owned-0001', 'https://fixture.invalid/')
        post = observation(f'o-{index * 2 + 2:04d}', 'owned-0001', 'https://fixture.invalid/')
        pre.sequence, post.sequence = index * 2, index * 2 + 1
        pre.facts.extend(fact('natural_binding', item.model_dump(mode='json')) for item in binding_facts(
            action_ref, name, args, raw['input'], schema, raw['requirementText']))
        pre.facts.extend([fact('native_action_dispatch', {'schemaVersion': 'bat.native-action-dispatch/v3',
            'nativeStepNumber': index + 1, 'nativeActionIndex': 0, 'actionRef': action_ref, 'actionName': name,
            'intentTarget': None, 'resultRef': result_ref.model_dump(mode='json'), 'entered': True,
            'resultReceived': True, 'eventCapture': {'status': 'not_applicable', 'eventExpectation': 'none',
                'eventCount': 0, 'limitations': []}}), fact('native_action_result', {
            'schemaVersion': 'bat.native-action-result/v1', 'actionRef': action_ref,
            'resultRef': result_ref.model_dump(mode='json'), 'receivedFromToolsAct': True, 'result': result})])
        if name in {'write_file', 'read_file'}:
            value = {'schemaVersion': 'bat.native-file-output/v1', 'actionRef': action_ref,
                     'resultDigest': result_ref.digest, 'text': result['extracted_content'], 'files': []}
            if name == 'write_file':
                value['ownedFile'] = identity
            else:
                pre.facts.append(fact('native_file_input', {'actionRef': action_ref,
                    'argumentDigest': digest(path), **identity}))
            post.facts.append(fact('native_file_output', value))
        observations.extend([pre, post])
        records.append(HistoryRecord(stepIndex=index, actions=[raw_action], results=[ResultEvidence(
            errorPresent=False, is_done=name == 'done', success=True if name == 'done' else None, ref=result_ref)],
            preObservationRef=pre.id, postObservationRefs={'0': post.id}))
    trace, issues = normalize_history(HistoryInput(source=TraceSource(version=registry.providerVersion,
        historyRef='fixture:owned-native-file'), completed=True, records=records, observations=observations,
        finalResultRef=reference(None), redactionManifestRef=reference('redaction')), registry)
    if issues:
        raise AssertionError([item.reason for item in issues])
    return natural_compilation_request(author, attach_method_receipt(trace, author), registry), registry


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
    def test_native_file_producer_crosses_only_a_strict_unentered_write_and_rejects_raw_path_mismatch(self):
        request, registry = native_file_source()
        producer = compile_natural_prefix(request, registry, output_schema={'type': 'null'}).segments[0]
        stopped, _, _ = sequence_stopped_fixture()
        tail = stopped.actions[4]
        tail.name, tail.args = 'write_file', {'file_name': 'note.txt', 'content': 'not entered'}
        dispatch = next(f for o in stopped.observations for f in o.facts
                        if f.kind == 'native_action_dispatch' and f.value['actionRef'] == tail.id)
        dispatch.value['actionName'] = tail.name
        dispatch.sourceRefs[0].digest = digest(dispatch.value)
        proof = sequence_stop_coverage(stopped, tail)
        self.assertIsNotNone(proof)
        action, pre = request.trace.actions[1], request.trace.observations[2]
        joined = SimpleNamespace(trace=SimpleNamespace(actions=[request.trace.actions[0], *stopped.actions[2:5], action],
            observations=[*request.trace.observations[:4], *stopped.observations]), runtimeInputSchema=request.runtimeInputSchema)
        decisions, issues = natural_bindings(joined, action, pre, False, [producer])
        self.assertEqual(issues, [])
        self.assertTrue(set((ref.ref, ref.digest) for ref in proof.evidenceRefs).issubset(
            {(ref['ref'], ref['digest']) for ref in decisions[0]['proofRefs']}))
        dispatch.value['entered'] = True
        dispatch.sourceRefs[0].digest = digest(dispatch.value)
        self.assertEqual(natural_bindings(joined, action, pre, False, [producer])[0], [])
        action.args['file_name'] = '/source-owner/different.txt'
        input_fact = next(item for item in pre.facts if item.kind == 'native_file_input')
        input_fact.value['argumentDigest'] = digest(action.args['file_name'])
        self.assertEqual(natural_bindings(request, action, pre, False, [producer])[0], [])

    def test_native_file_paths_compile_from_the_current_producer_without_freezing_source_owner(self):
        request, registry = native_file_source()
        original = copy.deepcopy(request)
        prefix = compile_natural_prefix(request, registry, output_schema={'type': 'null'})
        final = compile_request(request, registry, output_schema={'type': 'null'})
        self.assertEqual((prefix.gaps, final.gaps), ([], []))
        read = next(item for item in final.segments if item['id'] == 's-a-0002')
        self.assertEqual(read['bindings'][0]['binding'], {'source': 'input', 'path': ['name']})
        self.assertEqual(read['bindings'][0]['derivation'], 'owned_native_file')
        self.assertNotIn('/source-owner', str(final.segments))
        self.assertEqual(request, original)
        action, pre = request.trace.actions[1], request.trace.observations[2]
        producer = prefix.segments[0]
        for name, key, value in [('read_file', 'file_name', 'note.txt'),
                                 ('upload_file', 'path', request.trace.actions[1].args['file_name'])]:
            action.name, action.args = name, {key: value}
            input_fact = next(item for item in pre.facts if item.kind == 'native_file_input')
            input_fact.value['argumentDigest'] = digest(value)
            decisions, issues = natural_bindings(request, action, pre, False, [producer])
            self.assertEqual(issues, [])
            self.assertEqual(decisions[0]['binding'], {'source': 'input', 'path': ['name']})
        request.trace.actions[0].status = 'failed'
        self.assertEqual(natural_bindings(request, action, pre, False, [producer])[1][0].reason,
                         'native_file_producer_required')
        request.trace.actions[0].status = 'succeeded'
        input_fact.value['contentDigest'] = 'e' * 64
        self.assertEqual(natural_bindings(request, action, pre, False, [producer])[0], [])
        input_fact.value['fileName'] = 'todo.md'
        self.assertEqual(natural_bindings(request, action, pre, False, [producer])[0], [])

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
        targets = AsyncMock(return_value={'targetInfos': [{'targetId': 'run-full-1234', 'type': 'page',
                                                         'url': 'https://fixture.invalid/'}]})
        browser.cdp_client = SimpleNamespace(send=SimpleNamespace(Target=SimpleNamespace(getTargets=targets)))
        self.assertEqual(await native_switch_parameters(browser, {'tab_id': 'run-full-1234'}), {'tab_id': '1234'})
        self.assertEqual(await native_switch_parameters(browser, {'tab_id': '1234'}), {'tab_id': '1234'})
        for invalid in ['123', 'other-full-9999']:
            with self.assertRaises(ValueError):
                await native_switch_parameters(browser, {'tab_id': invalid})
        browser.get_tabs.return_value.append(SimpleNamespace(target_id='another-full-1234'))
        targets.return_value['targetInfos'].append({'targetId': 'another-full-1234', 'type': 'page',
                                                   'url': 'https://fixture.invalid/'})
        with self.assertRaises(ValueError):
            await native_switch_parameters(browser, {'tab_id': 'run-full-1234'})
        targets.return_value['targetInfos'] = []
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
