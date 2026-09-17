"""Offline, structure-only evidence report; this cannot mark a trace or chain as verified."""
import contextlib
import io

from workflow_use.healing.deterministic_converter import DeterministicWorkflowConverter

from .evidence import ActionCoverage
from .normalize import normalize_history, structure_fixture_input


def audit_structure(fixture, redaction_ref, registry):
    source = structure_fixture_input(fixture, redaction_ref, registry.providerVersion)
    trace, gaps = normalize_history(source, registry)
    converter = DeterministicWorkflowConverter()
    comparison = []
    for action in trace.actions:
        with contextlib.redirect_stdout(io.StringIO()):
            try:
                step = converter._convert_action_to_step(action.name, action.args, None, {})
                code = 'produced_step' if step else 'omitted'
            except Exception:
                step, code = None, 'conversion_error'
        comparison.append({'actionRef': action.id, 'name': action.name, 'status': action.status,
                           'deterministic': {'result': code, 'stepType': step.get('type') if step else None},
                           'hybrid': 'not_compilable'})
    ledger = [ActionCoverage(actionRef=action.id, disposition='not_compilable',
              evidenceRefs=[action.resultRef] if action.resultRef else []) for action in trace.actions]
    return {'scope': 'redacted structure only; actual imported converter methods; no LLM conversion run',
            'sourceDigest': fixture['sourceDigest'], 'traceDigest': trace.digest,
            'registry': registry.model_dump(), 'comparison': comparison,
            'coverage': [row.model_dump() for row in ledger], 'gaps': [item.model_dump() for item in gaps],
            'candidate': False, 'browserSessions': 0, 'modelCalls': 0,
            'llmConversion': {'execution': 'not_run', 'reason': 'upstream full-graph generation is outside the accepted model boundary'}}
