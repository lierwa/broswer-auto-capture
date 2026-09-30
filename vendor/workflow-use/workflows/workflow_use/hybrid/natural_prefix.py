"""Compile a bounded captured prefix; it has no runnable entry or final-result authority."""
from typing import Literal

from .compiler import NaturalHybridCompilation
from .coverage import validate_coverage
from .evidence import digest
from .natural_compile_actions import classify_natural_prefix
from .natural_prefix_dependency import PrefixDependency, expired_dependencies
from .natural_readiness import validate_consumer_readiness
from .request import NaturalCompilationRequest


class NaturalPrefixCompilation(NaturalHybridCompilation):
    mode: Literal['prefix'] = 'prefix'
    dependencies: list[PrefixDependency]


def compile_natural_prefix(request, registry, source_gaps=(), *, output_schema=None):
    # WHY：不改 completed/finalResultRef，不调用终态读取裁剪或结果装配；局部与 final 共用动作分类。
    request = NaturalCompilationRequest.model_validate(request.model_dump(mode='python', by_alias=True))
    if len(request.trace.actions) > 500 or len(request.trace.observations) > 2000:
        raise ValueError('prefix_source_limit')
    dependencies = []
    segments, ledger, issues, _repeat = classify_natural_prefix(
        request, registry, source_gaps, output_schema=output_schema, dependencies=dependencies)
    pending = {row.actionRef for row in ledger if row.disposition == 'not_compilable'}
    dependencies = [item for item in dependencies if item.actionRef in pending]
    issues.extend(expired_dependencies(request.trace, dependencies, ledger))
    issues.extend(validate_consumer_readiness(segments))
    issues.extend(validate_coverage(request.trace, ledger, {item['id'] for item in segments},
        registry=registry, result_spec=request.plan.resultSpec, output_schema=output_schema,
        compiled_segments=segments))
    issues = sorted({item.id: item for item in issues}.values(), key=lambda item: item.id)
    body = dict(mediaType='application/vnd.bat.hybrid-compilation+json;version=1',
        compilerVersion=request.compilerVersion, mode='prefix',
        sourceDigests=[request.requirement.digest, request.plan.digest, request.trace.digest,
                       digest(request.runtimeInputSchema), digest([]), registry.schemaDigest],
        segments=segments, coverage=[item.model_dump(mode='json') for item in ledger],
        gaps=[item.model_dump(mode='json') for item in issues],
        dependencies=[item.model_dump(mode='json') for item in dependencies],
        controlGraph={'entry': '', 'edges': prefix_edges(segments, ledger), 'terminals': []},
        outputAssembly=None, resultBinding=None, resultBranches=[], repeatMethods=[])
    return NaturalPrefixCompilation.model_validate({**body, 'canonicalDigest': digest(body)})


def prefix_edges(segments, ledger):
    """Only consecutive proven fragments connect; a missing action is never bridged."""
    owners = {row.ownerSegmentId: index for index, row in enumerate(ledger)
              if row.disposition == 'compiled'}
    barriers = {index for index, row in enumerate(ledger) if row.disposition == 'not_compilable'}
    positions = {}
    following = None
    for segment in reversed(segments):
        following = owners.get(segment['id'], following)
        positions[segment['id']] = following
    edges = []
    for left, right in zip(segments, segments[1:]):
        start, end = positions[left['id']], positions[right['id']]
        if start is not None and end is not None and not any(start < index <= end for index in barriers):
            edges.append({'from': left['id'], 'outcome': 'success', 'to': right['id']})
    return edges
