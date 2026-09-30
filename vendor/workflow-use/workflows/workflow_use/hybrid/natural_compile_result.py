"""Finalize a natural compilation after every source action has been classified."""

from .coverage import validate_coverage
from .evidence import digest, gap
from .natural_output import compile_natural_output_assembly
from .natural_read_liveness import prune_unused_queries, rebind_consumer_readiness, retire_unused_discovery
from .natural_readiness import validate_consumer_readiness
from .natural_repeat import fold_repeat, wire_repeat_graph, repeat_assembly_issues
from .natural_result_binding import (
    compile_empty_list_branches,
    compile_result_binding,
    compile_result_derivation_segments,
    wire_empty_list_branches,
)


def finalize_natural_compilation(request, registry, compilation_type, linear_graph, output_schema,
                                 segments, ledger, issues, *, repeat=None):
    # WHY：已验正的重复探查先保留到 readiness 校验，再由 fold 删除执行节点并保留支持证据。
    segments, ledger, consumed, pruning_issues = prune_unused_queries(request, registry, segments, ledger,
        repeat_lookup_ids=repeat['lookupRefs'] if repeat else frozenset())
    issues.extend(pruning_issues)
    ledger, issues = retire_unused_discovery(request, registry, ledger, issues, consumed)
    issues.extend(rebind_consumer_readiness(request.trace, segments, ledger))
    issues.extend(validate_consumer_readiness(segments))
    segments, derivation_issues = compile_result_derivation_segments(
        request.plan.resultSpec, request.trace, segments, output_schema)
    issues.extend(derivation_issues)
    segments, ledger, repeat_methods, repeat_issues = fold_repeat(request, repeat, segments, ledger)
    issues.extend(repeat_issues)
    # WHY：相同原生操作不证明业务循环；重复方法由已有 repeat 证据负责，不能猜测并阻断正常序列。
    assembly = _compile_output(request, output_schema, segments, issues)
    issues.extend(repeat_assembly_issues(assembly, repeat_methods))
    result_binding, binding_issues = compile_result_binding(request.plan.resultSpec, assembly, output_schema)
    issues.extend(binding_issues)
    result_branches, branch_issues = ([], []) if repeat_methods else \
        compile_empty_list_branches(request.plan.resultSpec, result_binding, segments)
    issues.extend(branch_issues)
    issues.extend(validate_coverage(
        request.trace, ledger, {segment['id'] for segment in segments}, registry=registry,
        result_spec=request.plan.resultSpec, output_schema=output_schema,
        consumed_query_ids=consumed, compiled_segments=segments))
    issues = sorted({item.id: item for item in issues}.values(), key=lambda item: item.id)
    graph = linear_graph(segments) if not issues else {'entry': '', 'edges': [], 'terminals': []}
    if not issues:
        try:
            graph = wire_empty_list_branches(graph, result_branches)
            graph = wire_repeat_graph(graph, repeat_methods)
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
            'repeatMethods': repeat_methods,
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
        request.runtimeInputSchema, request.requirement.text, request.plan.resultSpec)
    issues.extend(assembly_issues)
    return assembly
