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
from workflow_use.hybrid.method_completion import complete_from_read_refs, content_read_refs
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
    def test_content_scope_refinement_uses_last_owned_document_read(self):
        case = fixture()
        second = case['records'].records[0].model_copy(deep=True)
        second.readRef, second.parameters.container = 'r2', '#combined-region'
        case['records'].records.append(second)
        with self.assertRaisesRegex(ValueError, 'completion_read_path_conflict'):
            content_read_refs(case['records'])
        second.sample.documentRootId += 1
        with self.assertRaisesRegex(ValueError, 'completion_content_scope_ambiguous'):
            content_read_refs(case['records'])
        second.sample.documentRootId -= 1
        second.sample.pageIdentity['targetId'] = 'another-tab'
        with self.assertRaisesRegex(ValueError, 'completion_content_scope_ambiguous'):
            content_read_refs(case['records'])

    async def test_native_done_ends_but_host_rejects_conflicting_page_samples(self):
        case = fixture()
        second = case['records'].records[0].model_copy(deep=True); second.readRef = 'r2'
        case['records'].records.append(second)
        model, unwrap = output_model_for(SCHEMA, 'ConflictOutput')
        tools = AuthorTools()
        result = await tools.registry.execute_action('done', {'text': 'Observed both pages.', 'success': True},
            browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
        self.assertTrue(result.is_done)
        history = SimpleNamespace(is_done=lambda: result.is_done, is_successful=lambda: result.success)
        completed, output, gaps = _business_result(history, False, SCHEMA, case['records'])
        self.assertTrue(completed)
        self.assertIsNone(output)
        self.assertEqual([item.reason for item in gaps], ['completion_read_path_conflict'])
        self.assertEqual(getattr(case['records'], 'selected_refs', ()), ())

    def test_host_failure_codes_do_not_include_page_values(self):
        model, unwrap = output_model_for(SCHEMA, 'FailureOutput')
        history = SimpleNamespace(is_done=lambda: True, is_successful=lambda: True)
        cases = [('completion_read_schema_mismatch', 'completion_read_schema_mismatch'),
                 ('completion_derivation_source_missing', 'completion_derivation_source_missing'),
                 ('completion_read_path_conflict SECRET_PAGE_VALUE', 'business_output_schema_not_proven')]
        for failure, expected in cases:
            with self.subTest(failure=failure), patch(
                    'workflow_use.hybrid.author.complete_from_read_refs', side_effect=ValueError(failure)):
                completed, output, gaps = _business_result(history, False, SCHEMA)
                self.assertTrue(completed)
                self.assertIsNone(output)
                self.assertEqual([item.reason for item in gaps], [expected])

    async def test_native_done_text_never_substitutes_for_host_read_sample(self):
        case = fixture(); model, unwrap = output_model_for(SCHEMA, 'MethodOutput')
        tools = AuthorTools()
        properties = tools.registry.registry.actions['done'].param_model.model_json_schema()['properties']
        self.assertNotIn('readRefs', properties)
        self.assertNotIn('data', properties)
        result = await tools.registry.execute_action('done', {'text': 'A model-written summary.', 'success': True},
            browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
        history = SimpleNamespace(is_done=lambda: result.is_done, is_successful=lambda: result.success)
        completed, output, gaps = _business_result(history, False, SCHEMA, case['records'])
        self.assertTrue(completed)
        self.assertEqual(gaps, [])
        self.assertEqual(output, case['records'].records[0].sample.output)
        self.assertNotEqual(output, result.extracted_content)

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
            actions=[action, SimpleNamespace(name='done', args={'text': 'Observed.', 'success': True})],
            finalResultRef=reference(output))
        compiled, issues = compile_natural_output_assembly(trace, SCHEMA, [segment])
        self.assertIsNone(compiled)
        self.assertEqual([issue.reason for issue in issues], ['natural_output_cardinality_disjoint'])
        self.assertEqual(SCHEMA, original_schema)

    def test_source_output_relaxes_cardinality_only_with_selected_receipts(self):
        case = fixture()
        output_model, unwrap = output_model_for(SCHEMA, 'MethodSourceOutput')
        sample = complete_from_read_refs(case['records'], ['r1'], SCHEMA, None)
        history = SimpleNamespace(is_done=lambda: True, is_successful=lambda: True,
            get_structured_output=lambda model: model.model_validate({'value': sample}))
        completed, output, gaps = _business_result(history, False, SCHEMA, case['records'])
        self.assertTrue(completed)
        self.assertEqual(gaps, [])
        self.assertEqual(output, sample)
        self.assertTrue(_business_result(history, False, SCHEMA)[2])


if __name__ == '__main__':
    unittest.main()
