"""Each missing selection owns one annotation call; existing evidence is immutable."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.evidence import (
    EvidenceRef,
    NormalizedAction,
    NormalizedObservation,
    NormalizedTrace,
    ObservationFact,
    digest,
)
from workflow_use.hybrid.selection_annotation import (
    SelectionProgram,
    annotate_selections,
    bounded_selection_program,
    selection_action_context,
)

REF = EvidenceRef(ref='fixture', digest='1' * 64)
CONTEXT = SimpleNamespace(requirementText='Choose the eligible item.', task='Choose it.', requirementDigest='2' * 64)
PROGRAM = {'source': 'function main({candidates}) { return candidates[0].ordinal; }', 'examples': [
    {'candidates': [{'text': 'changed', 'ordinal': 2}], 'ordinal': 2},
    {'candidates': [{'text': 'another', 'ordinal': 3}], 'ordinal': 3}]}
READ = SimpleNamespace(output=[{'text': 'sample', 'ordinal': 1}],
    specification=SimpleNamespace(outputSchema={'type': 'array'}, maxItems=10))


def trace_with_clicks(count=2, existing=False):
    actions, observations = [], []
    for index in range(count):
        action_id, observation_id = f'a-{index + 1:04d}', f'o-{index + 1:04d}'
        facts = []
        if existing and index == 0:
            value = {'actionRef': action_id, 'draft': {'source': 'original'}, 'number': 1.0}
            facts.append(ObservationFact(id='selection-' + action_id, kind='selection_function', value=value,
                sourceRefs=[EvidenceRef(ref='existing', digest=digest(value))]))
        observations.append(NormalizedObservation(id=observation_id, sequence=index,
            url='https://fixture.invalid/', tabId='tab-1', facts=facts, sourceRefs=[REF]).model_dump(mode='json'))
        actions.append(NormalizedAction(id=action_id, stepIndex=index, actionIndex=0, name='click', args={},
            status='succeeded', preObservationRef=observation_id, effect='ui_state').model_dump(mode='json'))
    body = {'mediaType': 'application/vnd.bat.browser-use-trace+json;version=2',
        'source': {'provider': 'browser-use', 'version': '0.13.8', 'historyRef': 'fixture'},
        'completed': True, 'actions': actions, 'observations': observations,
        'finalResultRef': None, 'redactionManifestRef': REF.model_dump()}
    return NormalizedTrace.model_validate({**body, 'digest': digest(body)})


def annotation_dependencies():
    return (patch('workflow_use.hybrid.selection_annotation.natural_target',
                  return_value=({'ordinal': 1}, [], [])),
            patch('workflow_use.hybrid.selection_annotation.selection_read',
                  return_value=(SimpleNamespace(id='read-fact'), READ)))


class SelectionAnnotationTests(unittest.IsolatedAsyncioTestCase):
    async def test_existing_fact_is_never_rewritten_and_only_missing_action_is_annotated(self):
        trace = trace_with_clicks(existing=True)
        original = trace.model_dump(mode='json')
        model = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(completion=PROGRAM)))
        target, read = annotation_dependencies()
        with target, read:
            updated, gaps = await annotate_selections(CONTEXT, trace, model)
        self.assertEqual(gaps, [])
        self.assertEqual(trace.model_dump(mode='json'), original)
        self.assertEqual(updated.observations[0], trace.observations[0])
        self.assertEqual(updated.observations[1].facts[0].value['actionRef'], 'a-0002')
        self.assertEqual(model.ainvoke.await_count, 1)
        self.assertIs(model.ainvoke.call_args.kwargs['output_format'], bounded_selection_program(10))
        self.assertNotIn('actionRef', SelectionProgram.model_fields)
        self.assertEqual(bounded_selection_program(50).model_json_schema()['$defs'][
            'SelectionExampleBounded50']['properties']['ordinal']['maximum'], 50)
        content = json.loads(model.ainvoke.call_args.args[0][1].content)
        self.assertEqual(content['candidateSchema'], READ.specification.outputSchema)
        self.assertEqual(content['actionContext']['selectedCandidate'], READ.output[0])
        self.assertEqual(updated.digest, digest(updated.model_dump(mode='json', exclude={'digest'})))

    async def test_changed_example_cannot_exceed_current_read_schema(self):
        specification = SimpleNamespace(maxItems=3, outputSchema={
            'type': 'array', 'maxItems': 3, 'items': {'type': 'object',
                'properties': {'text': {'type': 'string'},
                               'ordinal': {'type': 'integer', 'minimum': 1, 'maximum': 3}},
                'required': ['text', 'ordinal'], 'additionalProperties': False}})
        read = SimpleNamespace(output=[{'text': 'sample', 'ordinal': 1}],
                               specification=specification, actionRef='prior')
        program = {'source': PROGRAM['source'], 'examples': [
            {'candidates': [{'text': 'changed', 'ordinal': 4}], 'ordinal': 4},
            {'candidates': [{'text': 'another', 'ordinal': 2}], 'ordinal': 2}]}
        model = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(completion=program)))
        trace = trace_with_clicks(count=1)
        with patch('workflow_use.hybrid.selection_annotation.natural_target',
                   return_value=({'ordinal': 1}, [], [])), patch(
                       'workflow_use.hybrid.selection_annotation.selection_read',
                       return_value=(SimpleNamespace(id='read-fact'), read)):
            updated, gaps = await annotate_selections(CONTEXT, trace, model)
        self.assertEqual([item.reason for item in gaps], ['selection_annotation_example_schema_invalid'])
        self.assertEqual(updated.observations[0].facts, [])
        self.assertEqual(trace.observations[0].facts, [])
        self.assertEqual(model.ainvoke.await_count, 1)

    async def test_bounded_model_instance_is_accepted_by_base_program(self):
        # WHY：真实结构化模型返回 Pydantic 实例；不同基类会把有效输出误判为不可用。
        completion = bounded_selection_program(10).model_validate(PROGRAM)
        model = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(completion=completion)))
        target, read = annotation_dependencies()
        with target, read:
            updated, gaps = await annotate_selections(CONTEXT, trace_with_clicks(count=1), model)
        self.assertEqual(gaps, [])
        self.assertEqual(updated.observations[0].facts[0].kind, 'selection_function')

    async def test_changed_example_output_must_be_present_once_in_candidates(self):
        program = {'source': PROGRAM['source'], 'examples': [
            {'candidates': [{'text': 'changed', 'ordinal': 2}], 'ordinal': 3},
            {'candidates': [{'text': 'another', 'ordinal': 4}], 'ordinal': 4}]}
        model = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(completion=program)))
        target, read = annotation_dependencies()
        with target, read:
            updated, gaps = await annotate_selections(CONTEXT, trace_with_clicks(count=1), model)
        self.assertEqual([item.reason for item in gaps], ['selection_annotation_example_ordinal_invalid'])
        self.assertEqual(updated.observations[0].facts, [])
        self.assertEqual(model.ainvoke.await_count, 1)

    def test_action_context_uses_current_click_and_nearest_singleton_read(self):
        url, next_url = 'https://example.test/search', 'https://example.test/work'
        prior = SimpleNamespace(id='prior', name='find_elements', postObservationRef='prior-post')
        click = SimpleNamespace(id='click', name='click', preObservationRef='click-pre',
                                postObservationRef='click-post')
        read_fact = ObservationFact(id='prior-read', kind='verified_natural_read', value={
            'actionRef': 'prior', 'stable': True, 'specification': {'container': 'a.title'},
            'output': [{'text': 'one work', 'ordinal': 1}]}, sourceRefs=[REF])
        before_title = ObservationFact(id='before-title', kind='title', value='Search', sourceRefs=[REF])
        after_title = ObservationFact(id='after-title', kind='title', value='Work', sourceRefs=[REF])
        observations = [
            SimpleNamespace(id='prior-post', tabId='tab', url=url, facts=[read_fact]),
            SimpleNamespace(id='click-pre', tabId='tab', url=url, facts=[before_title]),
            SimpleNamespace(id='click-post', tabId='new-tab', url=next_url, facts=[after_title])]
        trace = SimpleNamespace(actions=[prior, click], observations=observations)
        read = SimpleNamespace(actionRef='current-read', output=[{'text': 'Watch', 'ordinal': 17}])
        context = selection_action_context(trace, click, {'ordinal': 17}, read)
        self.assertEqual(context['selectedCandidate'], {'text': 'Watch', 'ordinal': 17})
        self.assertEqual(context['pageBefore'], {'url': url, 'title': 'Search'})
        self.assertEqual(context['pageAfter'], {'url': next_url, 'title': 'Work'})
        self.assertEqual(context['previousUniqueRead']['candidate']['text'], 'one work')

    async def test_failed_or_omitted_program_retains_gap_without_retrying_that_action(self):
        model = SimpleNamespace(ainvoke=AsyncMock(side_effect=[
            SimpleNamespace(completion={}), SimpleNamespace(completion=PROGRAM)]))
        target, read = annotation_dependencies()
        with target, read:
            updated, gaps = await annotate_selections(CONTEXT, trace_with_clicks(), model)
        self.assertEqual(model.ainvoke.await_count, 2)
        self.assertEqual([(item.actionRefs, item.reason) for item in gaps],
                         [(['a-0001'], 'selection_annotation_unavailable')])
        self.assertEqual(updated.observations[0].facts, [])
        self.assertEqual(updated.observations[1].facts[0].value['actionRef'], 'a-0002')

    async def test_missing_selection_count_is_bounded_before_model_work(self):
        model = SimpleNamespace(ainvoke=AsyncMock())
        target, read = annotation_dependencies()
        with target, read:
            original = trace_with_clicks(41)
            updated, gaps = await annotate_selections(CONTEXT, original, model)
        self.assertIs(updated, original)
        self.assertEqual(gaps[0].reason, 'selection_annotation_count_limit')
        model.ainvoke.assert_not_awaited()


if __name__ == '__main__':
    unittest.main()
