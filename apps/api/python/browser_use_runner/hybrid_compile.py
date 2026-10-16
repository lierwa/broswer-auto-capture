"""Recompile captured current source without browser or model ownership."""
from workflow_use.hybrid.__main__ import compilation_response
from workflow_use.hybrid.author import author_tools_for_result_spec
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.registry import ActionRegistry


async def compile_offline(request):
    if digest(request.outputSchema) != request.request.plan.outputSchemaDigest:
        raise ValueError('hybrid_output_schema_mismatch')
    registry = matching_registry(request.request)
    # WHY：来源缺口保留原事实；编译恢复不补注解、重放或洗掉历史失败。
    return compilation_response(request.request, registry, request.verifiedChildren,
                                list(request.sourceGaps), output_schema=request.outputSchema)


def matching_registry(request):
    # WHY：只重建当前探索最终配置；Agent(use_vision=True)公开exclude_action排除独立截图。
    tools = author_tools_for_result_spec(request.plan.resultSpec, source_protocol=request.compilerVersion)
    tools.exclude_action('screenshot')
    registry = ActionRegistry.from_tools(tools)
    if registry.schemaDigest != request.actionRegistryVersion:
        raise ValueError('hybrid_action_registry_mismatch')
    return registry
