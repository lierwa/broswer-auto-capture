"""Real target/read binding with a controlled model: no generated schemas or retry loop."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from workflow_use.hybrid.author_compilation import AuthorCompilation
from workflow_use.hybrid.selection_annotation import SelectionProgram, annotate_selections, validate_selection_source
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.natural_selection import bind_selection_function
from workflow_use.hybrid.natural_binding_compile import natural_bindings
from workflow_use.hybrid.natural_reads import runtime_read_specification
from test_prepared_selection_dispatch import fixture

SOURCE = 'function main({candidates}) { return candidates[0].ordinal; }'


class SelectionAnnotationTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_program_keeps_safe_validator_reason_without_guest_data(self):
        model = SimpleNamespace(endpoint='http://127.0.0.1:1', token='fixture')
        read = SimpleNamespace(output=[{'ordinal': 1}],
                               specification=SimpleNamespace(outputSchema={'type': 'array'}, maxItems=1))
        for reason, expected in (
            ('function_source_invalid', 'selection_annotation_program_invalid:function_source_invalid'),
            ('selection_function_url_invalid',
             'selection_annotation_program_invalid:selection_function_url_invalid'),
            ('function_input_invalid', 'selection_annotation_program_invalid:function_input_invalid'),
            ('guest error with private page content', 'selection_annotation_program_invalid')):
            with self.subTest(reason=reason):
                response = SimpleNamespace(status=200,
                    json=AsyncMock(return_value={'valid': False, 'reason': reason, 'detail': 'private data'}))
                client = MagicMock()
                client.post.return_value.__aenter__ = AsyncMock(return_value=response)
                session = MagicMock()
                session.__aenter__ = AsyncMock(return_value=client)
                with patch('workflow_use.hybrid.selection_annotation.aiohttp.ClientSession',
                           return_value=session):
                    self.assertEqual(await validate_selection_source(model, SOURCE, read, 1), expected)
                self.assertEqual(client.post.call_count, 1)

    async def test_duplicate_destination_uses_one_program_and_original_navigation(self):
        prepared, trace, segment = fixture(3)
        action = trace.actions[-1]
        action.name, action.effect = 'navigate', 'navigation'
        action.args = {'url': 'https://example.test/list?page=2'}
        source = next(f for f in trace.observations[0].facts if f.kind == 'verified_natural_read')
        read = source.value
        for index, row in enumerate(read['output']):
            row['text'] = ['1', '2', 'Next'][index]
            row['attribute_href'] = 'https://example.test/list?page=' + ('1' if index == 0 else '2')
        spec = read['specification']
        spec['fields']['attribute_href'] = {'selector': ':scope', 'attribute': 'href', 'resolveUrl': True,
                                           'valueType': 'string'}
        spec['outputSchema']['items']['properties']['attribute_href'] = {'type': 'string'}
        source.sourceRefs = [source.sourceRefs[0].model_copy(update={'digest': digest(read)})]
        from workflow_use.hybrid.read import ReadSpec
        segment['operation']['specification'] = runtime_read_specification(ReadSpec.model_validate(spec))
        code = 'function main({candidates}) { return candidates.find(c => c.text === "2").attribute_href; }'
        model = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(completion={'source': code})))
        with patch('workflow_use.hybrid.selection_annotation.validate_selection_source',
                   new=AsyncMock(return_value=None)):
            updated, gaps = await annotate_selections(prepared.request, trace, model)
        self.assertEqual(gaps, [])
        model.ainvoke.assert_awaited_once()
        request = SimpleNamespace(trace=updated, runtimeInputSchema={'type': 'null'},
            requirement=SimpleNamespace(sourceDigest=prepared.request.requirementDigest))
        functions, navigation, issues = bind_selection_function(request, action, [segment],
            {'id': 's-a-0002', 'target': None})
        self.assertEqual(issues, [])
        self.assertEqual(functions[0]['draft']['outputSchema'], {'type': 'string'})
        self.assertEqual(functions[0]['draft']['examples'][0]['output'], action.args['url'])
        decisions, issues = natural_bindings(request, action, updated.observations[-1], False, [segment])
        self.assertEqual(issues, [])
        self.assertEqual(decisions[0]['binding'], {'source': 'node', 'nodeId': 'selection-a-0002', 'path': []})
        self.assertIsNone(navigation['target'])

    def test_guidance_requires_equivalent_navigation_presentations_to_be_interchangeable(self):
        from workflow_use.hybrid.selection_annotation import SELECTION_GUIDANCE
        self.assertIn('deduplicate by the exact href', SELECTION_GUIDANCE)
        self.assertIn('equivalent presentation disappears', SELECTION_GUIDANCE)

    async def test_host_builds_actual_sample_and_only_source_is_requested(self):
        prepared, trace, _ = fixture(3)
        original = trace.model_dump()
        model = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(
            completion=SelectionProgram(source=SOURCE))))
        with patch('workflow_use.hybrid.selection_annotation.validate_selection_source',
                   new=AsyncMock(return_value=None)) as validator:
            updated, gaps = await annotate_selections(prepared.request, trace, model)
        self.assertEqual(gaps, [])
        self.assertEqual(trace.model_dump(), original)
        facts = [f for o in updated.observations for f in o.facts if f.kind == 'selection_function']
        self.assertEqual(len(facts), 1)
        draft = facts[0].value['draft']
        self.assertEqual(draft['examples'], [{'input': {'candidates': [
            {'text': 'chosen', 'ordinal': 1}, {'text': 'other', 'ordinal': 2},
            {'text': 'other', 'ordinal': 3}]}, 'output': 1}])
        self.assertEqual(set(SelectionProgram.model_fields), {'source'})
        self.assertIs(model.ainvoke.call_args.kwargs['output_format'], SelectionProgram)
        validator.assert_awaited_once()
        self.assertEqual(validator.call_args.args[3], 1)
        self.assertEqual(updated.digest, digest(updated.model_dump(mode='json', exclude={'digest'})))

    async def test_existing_fact_is_immutable_and_does_not_request_model(self):
        prepared, trace, _ = fixture()
        prepared.before_dispatch()
        trace = prepared.attach(trace)
        model = SimpleNamespace(ainvoke=AsyncMock())
        updated, gaps = await annotate_selections(prepared.request, trace, model)
        self.assertEqual(updated, trace)
        self.assertEqual(gaps, [])
        model.ainvoke.assert_not_awaited()

    async def test_failed_generation_or_validation_is_remembered_without_stopping_exploration(self):
        for completion, validation, reason in (
            ({}, None, 'selection_annotation_invalid_response'),
            ({'source': None}, None, 'selection_annotation_insufficient_evidence'),
            ({'source': SOURCE}, 'selection_annotation_observed_choice_mismatch',
             'selection_annotation_observed_choice_mismatch')):
            with self.subTest(reason=reason):
                prepared, trace, _ = fixture(3)
                prepared.collector.source_gaps = []
                model = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(completion=completion)))
                live = AuthorCompilation(prepared.request, prepared.collector, prepared,
                    AsyncMock(), None, model)
                with patch('workflow_use.hybrid.selection_annotation.validate_selection_source',
                           new=AsyncMock(return_value=validation)):
                    first = await live.annotate(trace)
                    await live.annotate(first)
                self.assertEqual(model.ainvoke.await_count, 1)
                self.assertEqual([g.reason for g in prepared.collector.source_gaps], [reason])
                self.assertFalse(any(f.kind == 'selection_function' for o in first.observations for f in o.facts))
                self.assertIsNone(live.failure)
                live.before_action({'click': {'index': 42}})

    async def test_success_is_retained_in_collector_and_never_repeated(self):
        prepared, trace, _ = fixture(3)
        prepared.collector.source_gaps = []
        model = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(completion={'source': SOURCE})))
        live = AuthorCompilation(prepared.request, prepared.collector, prepared, AsyncMock(), None, model)
        with patch('workflow_use.hybrid.selection_annotation.validate_selection_source',
                   new=AsyncMock(return_value=None)):
            updated = await live.annotate(trace)
            await live.annotate(updated)
        self.assertEqual(model.ainvoke.await_count, 1)
        facts = [f for o in prepared.collector.observations for f in o.facts if f.kind == 'selection_function']
        self.assertEqual(len(facts), 1)


if __name__ == '__main__':
    unittest.main()
