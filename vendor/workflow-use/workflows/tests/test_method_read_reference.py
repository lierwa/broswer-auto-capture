"""A method reference preserves the exact owned method through capture and natural compilation."""
import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from browser_use import Tools
from pydantic import ValidationError

from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.author import AuthorInput, author_tools_for_result_spec, natural_compilation_request
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.evidence import NormalizedObservation, TraceSource, digest
from workflow_use.hybrid.field_read_evidence import FieldReadEvidenceFailure
from workflow_use.hybrid.method_completion import complete_from_read_refs
from workflow_use.hybrid.method_read_evidence import verified_method_read
from workflow_use.hybrid.method_read_tool import MethodReadToolParams, register_method_read_tool
from workflow_use.hybrid.natural_output import build_verified_output_assembly
from workflow_use.hybrid.natural_reads import VerifiedNaturalRead
from workflow_use.hybrid.normalize import HistoryInput, HistoryRecord, ResultEvidence, normalize_history
from workflow_use.hybrid.registry import ActionRegistry
from test_author_source_boundary import source_fixture
from test_method_read_tool import ITEM, ToolsStub, parameters, sample_for
from test_method_source_compile import fact, reference


SCHEMA = {'type': 'array', 'items': copy.deepcopy(ITEM)}


def compilation_source(records, arguments, results, verified):
    raw, _request, _trace = source_fixture()
    raw.update(task='Read records.', input=None, inputSchema={'type': 'null'}, outputSchema=SCHEMA,
        requirementText='Read records.', resultSpec={'contractVersion': 'bat-result-spec/v1',
        'mode': 'data', 'schema': SCHEMA, 'fields': [
            {'path': [], 'description': 'Visible records', 'producerRef': 'records'}], 'edgeCases': []})
    author_input = AuthorInput.model_validate(raw)
    model, _unwrap = output_model_for(SCHEMA, 'ReferenceCompileOutput')
    tools = author_tools_for_result_spec(model, author_input.resultSpec)
    registry = ActionRegistry.from_tools(tools)
    observations, history = [], []
    output = complete_from_read_refs(records, [records.records[-1].readRef], SCHEMA, None)
    for index, value in enumerate(verified):
        pair = [NormalizedObservation(id=f'o-{index * 2 + offset + 1:04d}',
            sequence=index * 2 + offset, url=records.records[index].sample.pageIdentity['url'],
            tabId=value.targetId, sourceRefs=[reference(index)], facts=[fact('url_digest', value.urlDigest)])
                for offset in range(2)]
        pair[1].facts.append(fact('verified_natural_read', value.model_dump(mode='json')))
        observations.extend(pair)
        history.append(HistoryRecord(stepIndex=index, actions=[{'bat_read_fields': arguments[index]}],
            results=[ResultEvidence(errorPresent=False, ref=reference(results[index].extracted_content))],
            preObservationRef=pair[0].id, postObservationRefs={'0': pair[1].id}))
    done_index = len(history)
    pair = [observations[-1].model_copy(deep=True, update={
        'id': f'o-{done_index * 2 + offset + 1:04d}', 'sequence': done_index * 2 + offset,
        'facts': [fact('url_digest', verified[-1].urlDigest)]}) for offset in range(2)]
    assembly, issues = build_verified_output_assembly(observations, output, SCHEMA,
        lambda _kind, value: reference(value), selected_read_refs=[records.records[-1].readRef])
    if issues:
        raise AssertionError(issues)
    pair[1].facts.append(assembly)
    observations.extend(pair)
    history.append(HistoryRecord(stepIndex=done_index, actions=[{'done': {'success': True,
        'reason': 'Observed method.', 'readRefs': [records.records[-1].readRef]}}],
        results=[ResultEvidence(errorPresent=False, is_done=True, success=True, ref=reference(output))],
        preObservationRef=pair[0].id, postObservationRefs={'0': pair[1].id}))
    trace, issues = normalize_history(HistoryInput(source=TraceSource(version=registry.providerVersion,
        historyRef='fixture:method-reference'), completed=True, records=history, observations=observations,
        finalResultRef=reference(output), redactionManifestRef=reference('redaction')), registry)
    if issues:
        raise AssertionError(issues)
    return natural_compilation_request(author_input, trace, registry), registry


async def captured_reads(count=2):
    tools = Tools()
    records = register_method_read_tool(tools, output_schema=SCHEMA)
    registry = ActionRegistry.from_tools(tools)
    browser = SimpleNamespace(cdp_client=None)
    collector = EvidenceCollector(browser, registry, put_evidence=lambda _kind, value: reference(value),
        redact_action=lambda value: value, output_schema=SCHEMA, field_read_records=records)
    results, arguments, verified = [], [], []
    first = parameters(maxItems=120, fields={'count': {'selector': '.count', 'normalizeWhitespace': True},
                                            'labels': {'selector': '.label'}})
    for index in range(count):
        params = first if index == 0 else MethodReadToolParams(readRef='r' + str(index))
        action = registry.validate_action('bat_read_fields', params.model_dump(mode='json', exclude_unset=True))
        wire = action.model_dump(mode='json', exclude_unset=True)
        arguments.append(wire['bat_read_fields'])
        result = await tools.registry.execute_action('bat_read_fields', arguments[-1], browser_session=browser)
        results.append(result)
        collector.pending = {'fieldReadStart': index, 'action': wire, 'actionId': f'a-{index + 1:04d}'}
        collector.results[(index, 0)] = reference(result.extracted_content)
        facts = collector.field_read_facts([result], index)
        if collector.source_gaps or len(facts) != 1:
            raise AssertionError(collector.source_gaps)
        verified.append(VerifiedNaturalRead.model_validate(facts[0].value))
    return records, arguments, results, verified


class MethodReadReferenceTests(unittest.IsolatedAsyncioTestCase):
    def test_only_reference_is_accepted_and_roundtrips_without_default_overrides(self):
        params = MethodReadToolParams(readRef='r1')
        self.assertEqual(params.model_dump(mode='json'), {'readRef': 'r1'})
        self.assertEqual(MethodReadToolParams.model_validate_json(params.model_dump_json()), params)
        for extra in ({'maxItems': 300}, {'container': '.row'}, {'fields': {}}, {'outputPath': []},
                      {'outputPath': None}, {'unexpected': True}):
            with self.subTest(extra=extra), self.assertRaises(ValidationError):
                MethodReadToolParams.model_validate({'readRef': 'r1', **extra})
        for value in ('', ' ', None, 'r0', 'r01', 1):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                MethodReadToolParams(readRef=value)

    async def test_tool_capture_and_full_natural_compiler_preserve_reference_chain(self):
        sampler = AsyncMock(side_effect=lambda _browser, spec, **_kwargs: sample_for(spec))
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', sampler):
            records, arguments, results, verified = await captured_reads(count=3)
        self.assertEqual(arguments[1:], [{'readRef': 'r1'}, {'readRef': 'r2'}])
        self.assertEqual([json.loads(result.extracted_content)['readRef'] for result in results], ['r1', 'r2', 'r3'])
        for record in records.records[1:]:
            self.assertEqual(record.mapping, records.records[0].mapping)
            self.assertEqual(record.parameters, records.records[0].parameters)
            self.assertIsNot(record.mapping, records.records[0].mapping)
        self.assertTrue(records.records[-1].mapping.specification.fields['count'].normalizeWhitespace)
        self.assertEqual([call.args[1].maxItems for call in sampler.await_args_list], [120] * 3)
        request, registry = compilation_source(records, arguments, results, verified)
        before = request.trace.model_dump(mode='json')
        compiled = compile_request(request, registry, output_schema=SCHEMA)
        self.assertEqual(compiled.gaps, [])
        self.assertEqual(len(compiled.segments), 3)
        self.assertTrue(all(segment['operation']['specification'] ==
                            records.records[0].mapping.specification.model_dump(mode='json')
                            for segment in compiled.segments))
        self.assertEqual(request.trace.model_dump(mode='json'), before)

    async def test_missing_foreign_and_unsuccessful_references_never_read_or_register(self):
        owner_tools, other_tools = ToolsStub(), ToolsStub()
        owner = register_method_read_tool(owner_tools, output_schema=SCHEMA)
        other = register_method_read_tool(other_tools, output_schema=SCHEMA)
        sampler = AsyncMock(side_effect=lambda _browser, spec, **_kwargs: sample_for(spec))
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', sampler):
            missing = await owner_tools.actions['bat_read_fields'](MethodReadToolParams(readRef='r1'), object())
            self.assertEqual(missing.error, 'method_read_reference_missing')
            sampler.assert_not_awaited()
            await owner_tools.actions['bat_read_fields'](parameters(), object())
            other.records.append(owner.records[0])
            foreign = await other_tools.actions['bat_read_fields'](MethodReadToolParams(readRef='r1'), object())
            self.assertEqual(foreign.error, 'method_read_reference_missing')
            self.assertEqual(sampler.await_count, 1)
        failing_tools = ToolsStub()
        failing = register_method_read_tool(failing_tools, output_schema=SCHEMA)
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', AsyncMock(side_effect=ValueError('failed'))):
            await failing_tools.actions['bat_read_fields'](parameters(), object())
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', sampler):
            result = await failing_tools.actions['bat_read_fields'](MethodReadToolParams(readRef='r1'), object())
        self.assertEqual(result.error, 'method_read_reference_missing')
        self.assertEqual(failing.records, [])
        self.assertEqual(sampler.await_count, 1)

    async def test_capture_requires_exact_mapping_and_same_record_owner(self):
        sampler = AsyncMock(side_effect=lambda _browser, spec, **_kwargs: sample_for(spec))
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', sampler):
            records, arguments, results, _verified = await captured_reads()
        records.records[1].mapping.specification.fields['count'].normalizeWhitespace = False
        with self.assertRaisesRegex(FieldReadEvidenceFailure, 'mapping_mismatch'):
            verified_method_read(records=records, start=1, arguments=arguments[1], results=[results[1]],
                result_ref=reference(results[1].extracted_content), action_ref='a-0002')

    async def test_compiler_rejects_missing_forward_mixed_and_changed_references(self):
        sampler = AsyncMock(side_effect=lambda _browser, spec, **_kwargs: sample_for(spec))
        with patch('workflow_use.hybrid.method_read_tool.sample_read_fields', sampler):
            records, arguments, results, verified = await captured_reads()
        original, registry = compilation_source(records, arguments, results, verified)
        mutations = [
            lambda request: request.trace.actions[1].args.update(readRef='r99'),
            lambda request: request.trace.actions[0].args.clear(),
            lambda request: request.trace.actions[0].args.update(readRef='r2'),
            lambda request: request.trace.actions[1].args.update(maxItems=300),
            lambda request: request.trace.observations[3].facts[-1].value['specification']['fields']['count']
                .update(normalizeWhitespace=False),
            lambda request: setattr(request.trace.actions[0], 'status', 'failed'),
            lambda request: request.trace.observations[1].facts[-1].value.update(readRef='r9'),
        ]
        for mutate in mutations:
            request = original.model_copy(deep=True)
            mutate(request)
            compiled = compile_request(request, registry, output_schema=SCHEMA)
            with self.subTest(mutation=mutate):
                self.assertTrue(compiled.gaps)
                self.assertEqual(compiled.controlGraph['entry'], '')


if __name__ == '__main__':
    unittest.main()
