"""Finalize a natural compilation after every source action has been classified."""

from .coverage import validate_coverage
from .evidence import digest, gap
from .natural_output import compile_natural_output_assembly
from .natural_read_liveness import prune_unused_queries, rebind_consumer_readiness
from .natural_readiness import validate_consumer_readiness
from .natural_result_binding import (
    compile_empty_list_branches,
    compile_result_binding,
    compile_result_derivation_segments,
    wire_empty_list_branches,
)


def finalize_natural_compilation(request, registry, compilation_type, linear_graph, output_schema,
                                 segments, ledger, issues):
    segments, ledger, consumed, pruning_issues = prune_unused_queries(request, registry, segments, ledger)
    issues.extend(pruning_issues)
    issues.extend(rebind_consumer_readiness(request.trace, segments, ledger))
    issues.extend(validate_consumer_readiness(segments))
    segments, derivation_issues = compile_result_derivation_segments(
        request.plan.resultSpec, request.trace, segments, output_schema)
    issues.extend(derivation_issues)
    seen = set()
    for segment in segments:
        signature = _reuse_digest(segment)
        if signature in seen:
            issues.append(gap('unsupported_capability', [segment['id'][2:]],
                              'repeated_operation_reuse_unproven', 'collect_evidence'))
        seen.add(signature)
    assembly = _compile_output(request, output_schema, segments, issues)
    result_binding, binding_issues = compile_result_binding(request.plan.resultSpec, assembly, output_schema)
    issues.extend(binding_issues)
    result_branches, branch_issues = compile_empty_list_branches(request.plan.resultSpec, result_binding, segments)
    issues.extend(branch_issues)
    issues.extend(validate_coverage(
        request.trace, ledger, {segment['id'] for segment in segments}, registry=registry,
        result_spec=request.plan.resultSpec, output_schema=output_schema,
        consumed_query_ids=consumed))
    issues = sorted({item.id: item for item in issues}.values(), key=lambda item: item.id)
    graph = linear_graph(segments) if not issues else {'entry': '', 'edges': [], 'terminals': []}
    if not issues:
        try:
            graph = wire_empty_list_branches(graph, result_branches)
        except ValueError:
            issues.append(gap('invalid_source', [], 'natural_empty_list_control_invalid', 'reject_trace'))
            graph = {'entry': '', 'edges': [], 'terminals': []}
    body = {'mediaType': 'application/vnd.bat.hybrid-compilation+json;version=1',
            'compilerVersion': request.compilerVersion,
            'sourceDigests': [request.requirement.digest, request.plan.digest, request.trace.digest,
                              digest(request.runtimeInputSchema), digest([]), registry.schemaDigest],
            'segments': segments, 'controlGraph': graph, 'outputAssembly': assembly,
            'resultBinding': result_binding,
            'resultBranches': result_branches,
            'coverage': [item.model_dump(mode='json') for item in ledger],
            'gaps': [item.model_dump(mode='json') for item in issues]}
    return compilation_type.model_validate({**body, 'canonicalDigest': digest(body)})


def _compile_output(request, output_schema, segments, issues):
    if request.plan.outputSchemaDigest == digest({'type': 'null'}):
        return None
    if not isinstance(output_schema, dict) or digest(output_schema) != request.plan.outputSchemaDigest:
        issues.append(gap('missing_effect_proof', [],
                          'natural_output_schema_required', 'collect_evidence'))
        return None
    assembly, assembly_issues = compile_natural_output_assembly(
        request.trace, output_schema, segments,
        request.runtimeInputSchema, request.requirement.text)
    issues.extend(assembly_issues)
    return assembly


def _reuse_digest(segment):
    if segment['kind'] in ('explicit_llm', 'function'):
        return digest({key: value for key, value in segment.items() if key != 'id'})
    return digest({'operation': segment['operation'], 'target': segment['target'],
        'bindings': [{'argumentPath': item['argumentPath'], 'kind': item['kind'], 'binding': item['binding']}
                     for item in segment['bindings']],
        'postconditions': [{key: value for key, value in item.items() if key != 'clauseRef'}
                           for item in segment['postconditions']], 'outputs': segment['outputs']})
