"""Protect read-only inspection, receipt, and real compiler boundaries (no website/model calls)."""
import copy
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.author import AuthorInput, author_tools_for_result_spec, natural_compilation_request
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.evidence import TraceSource, digest
from workflow_use.hybrid.method_receipt import attach_method_receipt
from workflow_use.hybrid.normalize import HistoryInput, normalize_history
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.selection_annotation import annotate_selections
from test_author_source_boundary import source_fixture
from test_method_source_compile import fact, reference
from test_natural_repeat import add_action, query_facts

PAGE = 'https://example.test/items'
SOURCE = '''function main({candidates}) {
 const eligible = candidates.map(row => ({row, match: /^release (\\d+)$/.exec(row.text)}))
   .filter(x => x.match).sort((a,b) => Number(b.match[1]) - Number(a.match[1]));
 if (!eligible.length) throw new Error('no_candidate');
 return eligible[0].row.attribute_href;
}'''


async def method_fixture(*, playback=False, actual_navigation=False, protocol='bat-hybrid/3', overrides=None):
    raw, _, _ = source_fixture()
    raw.update(sourceProtocol=protocol, task='Open the latest available release.', input=None,
        inputSchema={'type': 'null'}, outputSchema={'type': 'null'}, entryUrls=[PAGE],
        requirementText='Open the latest available release.',
        resultSpec={'contractVersion': 'bat-result-spec/v1', 'mode': 'execution'})
    raw.update(overrides or {})
    author = AuthorInput.model_validate(raw)
    model, _ = output_model_for({'type': 'null'}, 'MethodOutput')
    tools = author_tools_for_result_spec(model, author.resultSpec, source_protocol=protocol)
    registry = ActionRegistry.from_tools(tools)
    args = {'selector': 'a.item', 'max_results': 10, 'include_text': True, 'attributes': ['href']}
    facts, result = query_facts('a-0001', PAGE, True, args, duplicates=3, destination=PAGE + '/7')
    read = next(f for f in facts if f.kind == 'verified_natural_read')
    for row, number, text in zip(read.value['output'], [4, 9, 7], ['release 4', 'preview 9', 'release 7']):
        row.update(text=text, attribute_href=PAGE + '/' + str(number))
    read.value['output'][1].pop('attribute_href')  # 不可用候选合法地没有链接。
    facts = [fact(f.kind, f.value) for f in facts]
    read = next(f for f in facts if f.kind == 'verified_natural_read')
    records, observations = [], []
    add_action(records, observations, 'find_elements', args, PAGE, PAGE, facts=facts, result_ref=result)
    inspected = {'navigate': {'url': PAGE + '/7'}}
    add_action(records, observations, 'bat_inspect_action', {'action': inspected}, PAGE, PAGE)
    observations[-2].facts.append(fact('inspected_method', {'actionRef': 'a-0002',
        'readFactRef': read.id, 'requirementDigest': author.requirementDigest,
        'registryDigest': registry.schemaDigest, 'action': inspected, 'dispatch': False,
        'intent': 'Retain the method for the latest available release.'}))
    end = PAGE
    if actual_navigation:
        end = PAGE + '/7'
        add_action(records, observations, 'navigate', {'url': end}, PAGE, end)
        observations[-1].facts.append(fact('natural_postcondition', {'actionRef': 'a-0003',
            'kind': 'url', 'bindingArgument': 'url', 'matched': True}))
        observations[-2].facts.append(fact('natural_binding', {'actionRef': 'a-0003', 'argumentPath': 'url',
            'binding': {'source': 'node', 'nodeId': 'a-0001', 'path': [2, 'attribute_href']},
            'provenance': 'node_output', 'sourceReadRef': read.id}))
    if playback:
        add_action(records, observations, 'wait', {'seconds': 1}, end, end)
        observations[-2].facts.append(fact('natural_binding', {'actionRef': f'a-{len(records):04d}',
            'argumentPath': 'seconds', 'binding': {'source': 'constant', 'value': 1},
            'provenance': 'native_parameter'}))
    add_action(records, observations, 'done', {'success': True, 'reason': 'Method retained.',
        'methodOutcome': 'recorded'}, end, end, done=True)
    for observation in observations:
        observation.facts.append(fact('document_identity', {'targetId': 'tab-1',
            'documentDigest': digest({'document': observation.url})}))
        if playback:
            observation.facts.append(fact('media_playback', 'playing'))
    trace, issues = normalize_history(HistoryInput(source=TraceSource(version=registry.providerVersion,
        historyRef='fixture:inspected-method'), completed=True, records=records, observations=observations,
        finalResultRef=reference(None), redactionManifestRef=reference('redaction')), registry)
    if issues:
        raise AssertionError(issues)
    annotation = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(completion={'source': SOURCE})))
    with patch('workflow_use.hybrid.selection_annotation.validate_selection_source', AsyncMock(return_value=None)):
        trace, issues = await annotate_selections(author, trace, annotation)
    if issues:
        raise AssertionError(issues)
    trace = attach_method_receipt(trace, author)
    return natural_compilation_request(author, trace, registry), registry, tools, annotation


class InspectedMethodTests(unittest.IsolatedAsyncioTestCase):
    async def test_all_registered_actions_enter_capture_audit_in_both_protocol_versions(self):
        from workflow_use.hybrid.action_dispatch import ActionDispatchAudit
        from workflow_use.hybrid.action_capture_policy import action_capture_policy
        from workflow_use.hybrid.request import ResultSpec
        from pydantic import TypeAdapter
        model, _ = output_model_for({'type': 'null'}, 'CaptureOutput')
        for protocol in ('bat-hybrid/2', 'bat-hybrid/3'):
            tools = author_tools_for_result_spec(model,
                TypeAdapter(ResultSpec).validate_python({'contractVersion': 'bat-result-spec/v1', 'mode': 'execution'}),
                source_protocol=protocol)
            audit = ActionDispatchAudit()
            for step, name in enumerate(tools.registry.registry.actions, 1):
                audit.propose(step, 0, {name: {}})
                audit.close()
        self.assertEqual(action_capture_policy('bat_inspect_action').boundary, 'read')
        self.assertEqual(action_capture_policy('bat_inspect_action').event_expectation, 'none')

    async def test_registered_tool_rereads_without_dispatch_and_rejects_changed_or_unscoped_target(self):
        request, registry, tools, _ = await method_fixture()
        read = next(f for f in request.trace.observations[1].facts if f.kind == 'verified_natural_read')
        tools._bat_method_requirement = request.requirement.sourceDigest
        guard = SimpleNamespace(_is_url_allowed=lambda _: True)
        browser = SimpleNamespace(_security_watchdog=guard)
        tools._bat_method_collector = SimpleNamespace(browser=browser, registry=registry,
            observations=request.trace.observations, pending={'pre': 'o-0003', 'actionId': 'a-0002'},
            value_fact=fact)
        args = {'action': {'navigate': {'url': PAGE + '/7'}}}
        with patch('workflow_use.hybrid.method_inspection.read_fields_with_proof',
                   AsyncMock(return_value=(read.value['output'], read.value['containerIdsDigest']))) as capture:
            result = await tools.registry.execute_action('bat_inspect_action', args)
            self.assertIsNone(result.error)
            capture.assert_awaited_once()
        self.assertEqual(set(vars(browser)), {'_security_watchdog'})
        with patch('workflow_use.hybrid.method_inspection.read_fields_with_proof',
                   AsyncMock(return_value=([], 'different'))):
            result = await tools.registry.execute_action('bat_inspect_action', args)
            self.assertTrue(result.error.startswith('inspected_navigation_current_evidence_required:'))
        guard._is_url_allowed = lambda _: False
        with patch('workflow_use.hybrid.method_inspection.read_fields_with_proof', AsyncMock()) as capture:
            result = await tools.registry.execute_action('bat_inspect_action', args)
            self.assertEqual(result.error, 'inspected_navigation_outside_authorized_scope')
            capture.assert_not_awaited()

    async def test_proposal_compiles_as_pending_navigation_and_preserves_read(self):
        request, registry, _, model = await method_fixture()
        original = copy.deepcopy(request)
        compiled = compile_request(request, registry, output_schema={'type': 'null'})
        self.assertEqual(compiled.gaps, [])
        self.assertEqual([s['id'] for s in compiled.segments], ['s-a-0001', 'selection-a-0002', 's-a-0002'])
        navigation = compiled.segments[-1]
        self.assertEqual(navigation['operation']['actionName'], 'navigate')
        self.assertEqual(navigation['postconditions'], [])
        self.assertEqual(navigation['bindings'][0]['argumentPath'], 'url')
        self.assertEqual(navigation['bindings'][0]['binding'], {
            'source': 'node', 'nodeId': 'selection-a-0002', 'path': []})
        self.assertEqual(request, original)
        model.ainvoke.assert_awaited_once()

    async def test_wait_after_inspection_is_a_separate_runtime_playback_check(self):
        request, registry, _, _ = await method_fixture(playback=True)
        compiled = compile_request(request, registry, output_schema={'type': 'null'})
        self.assertEqual(compiled.gaps, [])
        waits = [s for s in compiled.segments if s.get('operation', {}).get('actionName') == 'wait']
        self.assertEqual(len(waits), 1)
        self.assertTrue(any(p.get('kind') == 'media_playback' and p.get('equals') == 'playing'
                            for p in waits[0]['postconditions']))
        navigation = next(s for s in compiled.segments if s['id'] == 's-a-0002')
        self.assertFalse(any(p.get('kind') == 'media_playback' for p in navigation['postconditions']))

    async def test_equivalent_actual_navigation_uses_one_function_and_one_navigation(self):
        request, registry, _, model = await method_fixture(actual_navigation=True)
        compiled = compile_request(request, registry, output_schema={'type': 'null'})
        self.assertEqual(compiled.gaps, [])
        self.assertEqual(len([s for s in compiled.segments if s['kind'] == 'function']), 1)
        self.assertEqual(len([s for s in compiled.segments if s.get('operation', {}).get('actionName') == 'navigate']), 1)
        model.ainvoke.assert_awaited_once()

    async def test_wait_between_inspection_and_navigation_does_not_prove_new_page_playback(self):
        request, registry, _, _ = await method_fixture(actual_navigation=True, playback=True)
        trace = request.trace
        trace.actions[2], trace.actions[3] = trace.actions[3], trace.actions[2]
        # 即使这些来源事实都曾为真，旧页 wait 也不能归给之后的导航。
        from workflow_use.hybrid.inspected_compile import coalesced_navigation
        self.assertIsNone(coalesced_navigation(trace, trace.actions[1]))
        compiled = compile_request(request, registry, output_schema={'type': 'null'})
        self.assertIn('inspected_navigation_continuation_unsupported', [g['reason'] for g in compiled.gaps])

    async def test_missing_receipt_changed_document_and_post_inspection_dom_action_cannot_publish(self):
        baseline, registry, _, _ = await method_fixture()
        for mutation in ('receipt', 'document', 'following'):
            request = baseline.model_copy(deep=True)
            if mutation == 'receipt':
                request.trace.observations[-1].facts = []
            elif mutation == 'document':
                request.trace.observations[2].facts = [f for f in request.trace.observations[2].facts
                    if f.kind != 'document_identity']
            else:
                request.trace.actions[-1].name = 'click'
            compiled = compile_request(request, registry, output_schema={'type': 'null'})
            self.assertTrue(compiled.gaps, mutation)

    async def test_feedback_is_once_per_tools_request_even_after_public_reregistration(self):
        model, _ = output_model_for({'type': 'null'}, 'DoneOutput')
        from workflow_use.hybrid.author_tools import AuthorTools
        tools = AuthorTools(output_model=model, source_protocol='bat-hybrid/3')
        tools._bat_method_can_continue = lambda: True
        done = tools.registry.registry.actions['done']
        params = done.param_model(success=True, reason='Already satisfied.', methodOutcome='state_only')
        browser, files = SimpleNamespace(downloaded_files=[], cdp_client=None), SimpleNamespace()
        first = await done.function(params=params, file_system=files, browser_session=browser)
        self.assertFalse(first.is_done)
        self.assertIn('preparation_method_required', first.error)
        tools.use_structured_output_action(model)
        self.assertTrue(tools._bat_method_feedback_sent)
        done = tools.registry.registry.actions['done']
        second = await done.function(params=done.param_model.model_validate(params.model_dump()),
                                     file_system=files, browser_session=browser)
        self.assertTrue(second.is_done)
        self.assertTrue(second.success)
        self.assertEqual(set(done.param_model.model_json_schema()['properties']), {'success', 'reason', 'methodOutcome'})


if __name__ == '__main__':
    unittest.main()
