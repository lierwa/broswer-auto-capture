"""A representative read compiles its method; done cannot rewrite the observed values."""
import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from pydantic import ValidationError

from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.author import _business_result
from workflow_use.hybrid.author_tools import AuthorTools
from workflow_use.hybrid.evidence import EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.method_completion import complete_from_read_refs
from workflow_use.hybrid.method_read_evidence import verified_method_read
from workflow_use.hybrid.natural_output import build_verified_output_assembly, compile_natural_output_assembly
from workflow_use.hybrid.natural_reads import compile_verified_read
from test_method_read_evidence import SCHEMA, fixture


def reference(value):
    fingerprint = digest(value)
    return EvidenceRef(ref='fixture:' + fingerprint, digest=fingerprint)


def fact(kind, value):
    return ObservationFact(id=kind + '-' + digest(value), kind=kind, value=value, sourceRefs=[reference(value)])


class MethodCompletionTests(unittest.IsolatedAsyncioTestCase):
    async def test_done_preserves_path_conflict_without_merging_page_samples(self):
        case = fixture()
        second = case['records'].records[0].model_copy(deep=True)
        second.readRef = 'r2'
        case['records'].records.append(second)
        output_model, _unwrap = output_model_for(SCHEMA, 'ConflictOutput')
        tools = AuthorTools(output_model=output_model, output_schema=SCHEMA)
        tools._bat_field_read_records = case['records']
        result = await tools.registry.execute_action('done',
            {'success': True, 'reason': 'Observed both pages.', 'readRefs': ['r1', 'r2']},
            browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
        self.assertTrue(result.error.startswith('completion_read_path_conflict:'))
        self.assertIn('one representative readRef per output path', result.error)
        self.assertFalse(result.is_done)
        self.assertIsNone(result.extracted_content)
        self.assertEqual(getattr(case['records'], 'selected_refs', ()), ())

    async def test_done_preserves_only_known_safe_failure_codes(self):
        output_model, _unwrap = output_model_for(SCHEMA, 'FailureOutput')
        tools = AuthorTools(output_model=output_model, output_schema=SCHEMA)
        cases = [('completion_read_schema_mismatch', 'completion_read_schema_mismatch'),
                 ('completion_derivation_source_missing', 'completion_derivation_source_missing'),
                 ('completion_derivation_source_invalid', 'completion_derivation_source_invalid'),
                 ('completion_read_path_conflict SECRET_PAGE_VALUE', 'completion_read_reference_invalid'),
                 ('credentials=SECRET_PAGE_VALUE', 'completion_read_reference_invalid')]
        for failure, expected in cases:
            with self.subTest(failure=failure), patch(
                    'workflow_use.hybrid.author_tools.complete_from_read_refs', side_effect=ValueError(failure)):
                result = await tools.registry.execute_action('done',
                    {'success': True, 'reason': 'Observed.', 'readRefs': ['r1']},
                    browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
                self.assertEqual(result.error, expected)
                self.assertFalse(result.is_done)
                self.assertIsNone(result.extracted_content)

    async def test_done_only_accepts_refs_and_serializes_host_sample(self):
        case = fixture()
        output_model, unwrap = output_model_for(SCHEMA, 'MethodOutput')
        tools = AuthorTools(output_model=output_model, output_schema=SCHEMA)
        tools._bat_field_read_records = case['records']
        model = tools.registry.registry.actions['done'].param_model
        self.assertEqual(set(model.model_json_schema()['required']), {'success', 'reason', 'readRefs'})
        with self.assertRaises(ValidationError):
            model.model_validate({'success': True, 'reason': 'observed', 'readRefs': ['r1'],
                                  'data': [{'title': 'rewritten'}]})
        result = await tools.registry.execute_action('done',
            {'success': True, 'reason': 'Observed the record method.', 'readRefs': ['r1']},
            browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
        self.assertTrue(result.is_done)
        self.assertTrue(result.success)
        self.assertEqual(unwrap(output_model.model_validate_json(result.extracted_content)),
                         case['records'].records[0].sample.output)

    def test_unknown_duplicate_and_overlapping_refs_are_rejected(self):
        case = fixture()
        for refs in ([], ['missing'], ['r1', 'r1']):
            with self.subTest(refs=refs), self.assertRaises(ValueError):
                complete_from_read_refs(case['records'], refs, SCHEMA, None)
        second = case['records'].records[0].model_copy(deep=True)
        second.readRef = 'r2'
        case['records'].records.append(second)
        with self.assertRaisesRegex(ValueError, 'path_conflict'):
            complete_from_read_refs(case['records'], ['r1', 'r2'], SCHEMA, None)

    def test_reference_assembly_keeps_method_but_rejects_impossible_direct_result(self):
        case = fixture()
        original_schema = copy.deepcopy(SCHEMA)
        output = complete_from_read_refs(case['records'], ['r1'], SCHEMA, None)
        verified = verified_method_read(**case)
        read_fact = fact('verified_natural_read', verified.model_dump(mode='json'))
        url = fact('url_digest', verified.urlDigest)
        pre = SimpleNamespace(id='o-pre', tabId=verified.targetId, url='https://example.test/list',
                              facts=[url], sourceRefs=[reference('pre')])
        post = SimpleNamespace(id='o-post', tabId=verified.targetId, facts=[url, read_fact],
                               sourceRefs=[reference('post')])
        action = SimpleNamespace(id=case['action_ref'], name='bat_read_fields', args=case['arguments'],
                                 resultRef=case['result_ref'], postObservationRef=post.id)
        request = SimpleNamespace(plan=SimpleNamespace(outputSchemaDigest=digest(SCHEMA)))
        segment, _paths, issues = compile_verified_read(request, action, pre, post, SCHEMA, [])
        self.assertEqual(issues, [])
        self.assertEqual(segment['operation']['specification']['maxItems'], 300)
        self.assertEqual(len(output), 3)
        assembly, issues = build_verified_output_assembly([post], output, SCHEMA,
            lambda _kind, value: reference(value), selected_read_refs=['r1'])
        self.assertEqual(issues, [])
        trace = SimpleNamespace(observations=[post, SimpleNamespace(id='o-done', facts=[assembly])],
            actions=[action, SimpleNamespace(name='done', args={'readRefs': ['r1']})],
            finalResultRef=reference(output))
        compiled, issues = compile_natural_output_assembly(trace, SCHEMA, [segment])
        self.assertIsNone(compiled)
        self.assertEqual([issue.reason for issue in issues], ['natural_output_cardinality_disjoint'])
        self.assertEqual(SCHEMA, original_schema)
        trace.actions[-1].args['readRefs'] = []
        self.assertTrue(compile_natural_output_assembly(trace, SCHEMA, [segment])[1])

    def test_source_output_relaxes_cardinality_only_with_selected_receipts(self):
        case = fixture()
        output_model, unwrap = output_model_for(SCHEMA, 'MethodSourceOutput')
        sample = complete_from_read_refs(case['records'], ['r1'], SCHEMA, None)
        history = SimpleNamespace(is_done=lambda: True, is_successful=lambda: True,
            get_structured_output=lambda model: model.model_validate({'value': sample}))
        completed, output, gaps = _business_result(history, False, output_model, unwrap, SCHEMA, case['records'])
        self.assertTrue(completed)
        self.assertEqual(gaps, [])
        self.assertEqual(output, sample)
        self.assertTrue(_business_result(history, False, output_model, unwrap, SCHEMA)[2])


if __name__ == '__main__':
    unittest.main()
