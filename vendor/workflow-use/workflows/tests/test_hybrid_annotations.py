"""Proposal has data-only authority; control fields and unknown evidence are rejected."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from workflow_use.hybrid.annotations import Proposal, propose_semantics
from workflow_use.hybrid.author import AuthorAuthority
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.request import CompilationRequest
from workflow_use.hybrid.registry import ActionRegistry
from browser_use.tools.service import Tools
from hybrid_fixture import fixture


class AnnotationTests(unittest.IsolatedAsyncioTestCase):
    async def test_one_bounded_proposal_completes_semantic_alignment_without_control_authority(self):
        raw = fixture('semantic')['request']
        expected = raw['acceptedAnnotations']
        raw['acceptedAnnotations'] = []
        request = CompilationRequest.model_validate(raw)
        model = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(completion=Proposal.model_validate({'annotations': expected}))))
        source = SimpleNamespace(authority=AuthorAuthority(clauses=request.requirement.clauses, control=request.control.model_dump(), acceptedAnnotations=[]))
        annotations = await propose_semantics(source, request.trace, model)
        request.acceptedAnnotations = annotations
        compiled = compile_request(request, ActionRegistry.from_tools(Tools()))
        self.assertFalse(compiled.gaps)
        self.assertEqual(model.ainvoke.await_count, 1)
        self.assertEqual(compiled.segments[-1]['kind'], 'explicit_llm')
        with self.assertRaises(ValueError):
            Proposal.model_validate({'annotations': expected, 'nodes': []})
        with self.assertRaises(ValueError):
            Proposal.model_validate({'annotations': [{'kind': 'control_intent', 'confirmedBy': 'user'}]})

    def test_unknown_reference_and_unconsumed_clause_never_become_candidate(self):
        raw = fixture('semantic')['request']
        raw['acceptedAnnotations'][0]['segmentEvidenceRefs'][0]['digest'] = 'f' * 64
        with self.assertRaisesRegex(ValueError, 'unknown_annotation_evidence'):
            CompilationRequest.model_validate(raw)
        from test_hybrid_compiler import rehash
        raw = fixture()['request']
        raw['requirement']['clauses'].append({'id': 'unproved', 'kind': 'constraint', 'expression': {'unimplemented': True}})
        rehash(raw, 'requirement')
        compiled = compile_request(CompilationRequest.model_validate(raw), ActionRegistry.from_tools(Tools()))
        self.assertTrue(any(item['reason'] == 'unconsumed_requirement_clause' for item in compiled.gaps))
