"""Repeated-method annotation owns no browser actions and cannot bypass source validation."""
import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError

from workflow_use.hybrid.evidence import (
    EvidenceRef, NormalizedAction, NormalizedObservation, NormalizedTrace, ObservationFact, digest,
)
from workflow_use.hybrid.repeat_annotation import RepeatAnnotation, annotate_repeat_method


REF = EvidenceRef(ref='fixture', digest='1' * 64)
REQUEST = SimpleNamespace(requirementDigest='2' * 64, requirementText='Collect records across all pages.',
                          task='Collect records across all pages.')
METHOD = {'outputPath': ['records'], 'stableKeyPath': ['id'], 'iterations': [
    {'readActionRef': 'a-0001', 'continuationActionRef': 'a-0002', 'advanceActionRef': 'a-0003'},
    {'readActionRef': 'a-0004', 'continuationActionRef': 'a-0005', 'advanceActionRef': None}]}
READ_SPEC = {'source': 'dom', 'container': {'kind': 'css', 'value': '.record'}, 'maxItems': 300,
             'fields': {'id': {'selector': {'kind': 'css', 'value': 'a'}, 'attribute': 'href'}},
             'outputSchema': {'type': 'array', 'items': {'type': 'object'}}}


def fact(kind, value):
    return ObservationFact(id=kind + '-' + digest(value), kind=kind, value=value,
        sourceRefs=[EvidenceRef(ref='sha256:' + digest(value), digest=digest(value))]).model_dump(mode='json')


def fixture(single_read=False, existing=False, different_path=False):
    actions, observations = [], []
    names = ['bat_read_fields', 'find_elements', 'navigate', 'bat_read_fields', 'find_elements']
    for index, name in enumerate(names):
        action_id = f'a-{index + 1:04d}'
        pre, post = f'o-{index * 2 + 1:04d}', f'o-{index * 2 + 2:04d}'
        before_url = 'https://example.test/page/' + ('1' if index <= 2 else '2')
        after_url = 'https://example.test/page/' + ('1' if index < 2 else '2')
        facts = [fact('native_action_dispatch', {'actionRef': action_id, 'entered': True,
            'resultReceived': True, 'eventCapture': {'status': 'captured', 'eventCount': 1}})]
        if name == 'bat_read_fields' and not (single_read and index == 3):
            path = ['other'] if different_path and index == 3 else ['records']
            facts.append(fact('verified_natural_read', {'actionRef': action_id, 'outputPath': path,
                'readPath': [], 'specification': READ_SPEC, 'stable': True,
                'output': [{'id': f'item-{index}-{row}'} for row in range(3)], 'coverage': {'total': 20}}))
        if name == 'find_elements':
            candidates = [{'ordinal': 1, 'text': 'Next', 'attribute_href': 'https://example.test/page/2'}] if index == 1 else []
            facts.append(fact('verified_natural_read', {'actionRef': action_id, 'specification': READ_SPEC,
                'output': candidates, 'stable': True}))
            facts.append(fact('dom_query', {'actionRef': action_id, 'query': {'kind': 'css', 'value': 'a.next'},
                'requestedAttributes': ['href'], 'includeText': True, 'total': len(candidates),
                'showing': len(candidates), 'truncated': False, 'complete': True}))
        if existing and index == 0:
            facts.append(fact('repeat_method', {'requirementDigest': REQUEST.requirementDigest, **METHOD}))
        for identity, url, values in [(pre, before_url, []), (post, after_url, facts)]:
            observations.append({'id': identity, 'sequence': len(observations), 'url': url,
                                 'tabId': 'tab-1', 'facts': values, 'sourceRefs': [REF.model_dump()]})
        actions.append({'id': action_id, 'stepIndex': index, 'actionIndex': 0, 'name': name,
            'args': {}, 'status': 'succeeded', 'preObservationRef': pre, 'postObservationRef': post,
            'effect': 'navigation' if name == 'navigate' else 'read'})
    body = {'mediaType': 'application/vnd.bat.browser-use-trace+json;version=2',
        'source': {'provider': 'browser-use', 'version': '0.13.8', 'historyRef': 'fixture'},
        'completed': True,
        'actions': [NormalizedAction.model_validate(item).model_dump(mode='json') for item in actions],
        'observations': [NormalizedObservation.model_validate(item).model_dump(mode='json') for item in observations],
        'finalResultRef': None, 'redactionManifestRef': REF.model_dump()}
    return NormalizedTrace.model_validate({**body, 'digest': digest(body)})


def response(value):
    return SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(completion=value)))


def method_response():
    return response({'outcome': 'method', 'method': copy.deepcopy(METHOD), 'reason': None})


class RepeatAnnotationTests(unittest.IsolatedAsyncioTestCase):
    async def test_non_repeated_or_different_output_reads_make_no_model_call(self):
        for trace in [fixture(single_read=True), fixture(different_path=True)]:
            model = method_response()
            updated, gaps, advances = await annotate_repeat_method(REQUEST, trace, model)
            self.assertIs(updated, trace)
            self.assertEqual(gaps, [])
            self.assertEqual(advances, set())
            model.ainvoke.assert_not_called()

    async def test_only_validated_method_is_attached_with_host_identity_and_bounded_input(self):
        trace, model = fixture(), method_response()
        original = trace.model_dump(mode='json')
        with patch('workflow_use.hybrid.repeat_annotation._validate_method', side_effect=lambda _trace, value, _digest: value) as validate:
            updated, gaps, advances = await annotate_repeat_method(REQUEST, trace, model)
        self.assertEqual(gaps, [])
        self.assertEqual(advances, {'a-0003'})
        self.assertEqual(model.ainvoke.await_count, 1)
        validate.assert_called_once_with(trace, {'requirementDigest': REQUEST.requirementDigest, **METHOD}, REQUEST.requirementDigest)
        saved = [item for item in updated.observations[1].facts if item.kind == 'repeat_method']
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0].value, {'requirementDigest': REQUEST.requirementDigest, **METHOD})
        self.assertEqual(saved[0].sourceRefs[0].digest, digest(saved[0].value))
        self.assertEqual(updated.digest, digest(updated.model_dump(mode='json', exclude={'digest'})))
        self.assertEqual(trace.model_dump(mode='json'), original)
        content = json.loads(model.ainvoke.call_args.args[0][1].content)
        self.assertNotIn('trace', content)
        self.assertEqual(len(content['readMethods'][0]['sample']), 3)
        self.assertEqual(content['readMethods'][0]['total'], 20)
        self.assertEqual(content['actions'][1]['candidateReads'][0]['candidates'][0]['attribute_href'],
                         'https://example.test/page/2')
        self.assertEqual(content['actions'][-1]['candidateReads'][0]['candidates'], [])
        self.assertTrue(content['actions'][2]['dispatch'][0]['entered'])
        self.assertEqual(content['actions'][2]['after']['url'], 'https://example.test/page/2')

    async def test_refusal_and_not_applicable_remain_explicit_gaps(self):
        for outcome in ['insufficient_evidence', 'not_applicable']:
            with self.subTest(outcome=outcome):
                trace = fixture()
                model = response({'outcome': outcome, 'method': None, 'reason': 'UNTRUSTED_PAGE_TEXT'})
                updated, gaps, advances = await annotate_repeat_method(REQUEST, trace, model)
                self.assertIs(updated, trace)
                self.assertEqual([item.reason for item in gaps], ['repeat_annotation_' + outcome])
                self.assertEqual(advances, set())
                self.assertEqual(model.ainvoke.await_count, 1)
                self.assertNotIn('UNTRUSTED_PAGE_TEXT', str(gaps))

    async def test_source_validator_rejection_preserves_trace_and_no_selection_skip(self):
        trace, model = fixture(), method_response()
        with patch('workflow_use.hybrid.repeat_annotation._validate_method', side_effect=ValueError('sensitive details')):
            updated, gaps, advances = await annotate_repeat_method(REQUEST, trace, model)
        self.assertIs(updated, trace)
        self.assertEqual([item.reason for item in gaps], ['repeat_method_evidence_invalid'])
        self.assertEqual(advances, set())

    async def test_service_and_response_failures_have_distinct_safe_codes(self):
        models = [(SimpleNamespace(ainvoke=AsyncMock(side_effect=RuntimeError('SECRET'))), 'repeat_annotation_unavailable'),
                  (response({'outcome': 'method', 'method': {**METHOD, 'selector': 'a.next'}}), 'repeat_annotation_invalid_response'),
                  (response({'outcome': 'method', 'method': {**METHOD, 'requirementDigest': '3' * 64}}), 'repeat_annotation_invalid_response')]
        for model, code in models:
            with self.subTest(code=code):
                trace = fixture()
                updated, gaps, advances = await annotate_repeat_method(REQUEST, trace, model)
                self.assertIs(updated, trace)
                self.assertEqual([item.reason for item in gaps], [code])
                self.assertEqual(advances, set())
                self.assertEqual(model.ainvoke.await_count, 1)

    async def test_existing_method_is_validated_without_rewriting_or_model_call(self):
        trace, model = fixture(existing=True), method_response()
        with patch('workflow_use.hybrid.repeat_annotation._validate_method', side_effect=lambda _trace, value, _digest: value):
            updated, gaps, advances = await annotate_repeat_method(REQUEST, trace, model)
        self.assertIs(updated, trace)
        self.assertEqual(gaps, [])
        self.assertEqual(advances, {'a-0003'})
        model.ainvoke.assert_not_called()

    async def test_excessive_input_does_not_spend_model_call(self):
        trace, model = fixture(), method_response()
        request = SimpleNamespace(**{**vars(REQUEST), 'task': 'x' * 128000})
        updated, gaps, advances = await annotate_repeat_method(request, trace, model)
        self.assertIs(updated, trace)
        self.assertEqual([item.reason for item in gaps], ['repeat_annotation_input_limit'])
        self.assertEqual(advances, set())
        model.ainvoke.assert_not_called()

    def test_annotation_cannot_add_executable_fields_or_unbounded_payload(self):
        for method in [{**METHOD, 'iterations': METHOD['iterations'][:1]},
                       {**METHOD, 'iterations': METHOD['iterations'] * 5},
                       {**METHOD, 'stableKeyPath': ['id'] * 41}, {**METHOD, 'code': 'anything'}]:
            with self.subTest(method=method), self.assertRaises(ValidationError):
                RepeatAnnotation.model_validate({'outcome': 'method', 'method': method, 'reason': None})
        with self.assertRaises(ValidationError):
            RepeatAnnotation.model_validate({'outcome': 'insufficient_evidence', 'method': None, 'reason': 'x' * 1001})


if __name__ == '__main__':
    unittest.main()
