"""Offline preparation annotation and compilation; no browser or Agent owner."""
from types import SimpleNamespace
from urllib.parse import urlsplit

from workflow_use.hybrid.__main__ import compilation_response
from workflow_use.hybrid.author import author_tools_for_result_spec
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.selection_annotation import annotate_selections

from browser_use_runner.ai_connect import AIConnectModel
from browser_use_runner.hybrid_commands import AnnotateRequest
from browser_use_runner.output_schema import output_model_for


async def compile_offline(request):
    if digest(request.outputSchema) != request.request.plan.outputSchemaDigest:
        raise ValueError('hybrid_output_schema_mismatch')
    output_model, _ = output_model_for(request.outputSchema, 'HybridAgentOutput')
    registry = ActionRegistry.from_tools(author_tools_for_result_spec(output_model, request.request.plan.resultSpec))
    if registry.schemaDigest != request.request.actionRegistryVersion:
        raise ValueError('hybrid_action_registry_mismatch')
    compilation, gaps = request.request, []
    if isinstance(request, AnnotateRequest):
        endpoint = urlsplit(request.model.endpoint)
        if endpoint.scheme != 'http' or endpoint.hostname != '127.0.0.1' or endpoint.username or endpoint.password:
            raise ValueError('hybrid_model_bridge_invalid')
        model = AIConnectModel(**request.model.model_dump(), purpose='semantic_annotation')
        source = SimpleNamespace(requirementText=compilation.requirement.text,
            task=compilation.requirement.taskText, requirementDigest=compilation.requirement.sourceDigest)
        trace, gaps = await annotate_selections(source, compilation.trace, model)
        compilation = compilation.model_copy(update={'trace': trace})
    response = compilation_response(compilation, registry, request.verifiedChildren, gaps,
                                    output_schema=request.outputSchema)
    if isinstance(request, AnnotateRequest):
        # WHY：沿用 Python canonical sourcePayloads，公共 request 不引入第二套数字序列化规则。
        return {'request': compilation.model_dump(mode='json', by_alias=True), 'response': response}
    return response
