"""Offline preparation annotation and compilation; no browser or Agent owner."""
from types import SimpleNamespace
from urllib.parse import urlsplit

from workflow_use.hybrid.__main__ import compilation_response
from workflow_use.hybrid.author import author_tools_for_result_spec
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.selection_annotation import annotate_selections
from workflow_use.hybrid.repeat_annotation import annotate_repeat_method

from browser_use_runner.ai_connect import AIConnectModel
from browser_use_runner.hybrid_commands import AnnotateRequest
from browser_use_runner.output_schema import output_model_for

REPEAT_RETRY_REASONS = frozenset({'repeat_method_evidence_invalid', 'repeat_annotation_insufficient_evidence',
                                'repeat_annotation_unavailable', 'repeat_annotation_invalid_response'})


async def annotate_offline(source, trace, model, gaps):
    repeat_advances = set()
    retry = [item for item in gaps if item.code == 'missing_control_intent'
             and item.resolution == 'collect_evidence' and item.reason in REPEAT_RETRY_REASONS]
    if retry:
        trace, repeat_gaps, repeat_advances = await annotate_repeat_method(source, trace, model)
        methods = [fact.value for observation in trace.observations for fact in observation.facts
                   if fact.kind == 'repeat_method']
        if not repeat_gaps and len(methods) == 1:
            covered = {item['readActionRef'] for item in methods[0]['iterations']}
            # WHY：只替换被同一实际读取覆盖的派生注解缺口，原source及其他故障仍不可改。
            gaps = [item for item in gaps if item not in retry or not item.actionRefs
                    or not set(item.actionRefs) <= covered]
        gaps.extend(repeat_gaps)
    trace, selection_gaps = await annotate_selections(source, trace, model, skip_action_refs=repeat_advances)
    return trace, [*gaps, *selection_gaps]


async def compile_offline(request):
    if digest(request.outputSchema) != request.request.plan.outputSchemaDigest:
        raise ValueError('hybrid_output_schema_mismatch')
    output_model, _ = output_model_for(request.outputSchema, 'HybridAgentOutput')
    registry = matching_registry(output_model, request.request)
    compilation, gaps = request.request, list(request.sourceGaps)
    if isinstance(request, AnnotateRequest):
        endpoint = urlsplit(request.model.endpoint)
        if endpoint.scheme != 'http' or endpoint.hostname != '127.0.0.1' or endpoint.username or endpoint.password:
            raise ValueError('hybrid_model_bridge_invalid')
        model = AIConnectModel(**request.model.model_dump(), purpose='semantic_annotation')
        source = SimpleNamespace(requirementText=compilation.requirement.text,
            task=compilation.requirement.taskText, requirementDigest=compilation.requirement.sourceDigest)
        trace, gaps = await annotate_offline(source, compilation.trace, model, gaps)
        compilation = compilation.model_copy(update={'trace': trace})
    response = compilation_response(compilation, registry, request.verifiedChildren, gaps,
                                    output_schema=request.outputSchema)
    if isinstance(request, AnnotateRequest):
        # WHY：沿用 Python canonical sourcePayloads，公共 request 不引入第二套数字序列化规则。
        return {'request': compilation.model_dump(mode='json', by_alias=True), 'response': response}
    return response


def matching_registry(output_model, request):
    # WHY：新工具不得使既有来源失效；仅匹配原公开 schema 的精确 digest，不扩张旧动作合同。
    for human in (True, False):
        for selection in (False, True):
            registry = ActionRegistry.from_tools(author_tools_for_result_spec(output_model, request.plan.resultSpec,
                selection_methods=selection, human_intervention=human))
            if registry.schemaDigest == request.actionRegistryVersion:
                return registry
    raise ValueError('hybrid_action_registry_mismatch')
