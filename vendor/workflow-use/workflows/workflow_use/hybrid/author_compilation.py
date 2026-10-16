"""One source checkpoint; candidate failure never controls native exploration."""
from uuid import uuid4

from .__main__ import compilation_envelope, compilation_response
from .evidence import gap
from .natural_prefix import compile_natural_prefix
from .selection_annotation import annotate_selections
from .source_response import canonical_json


class AuthorCompilationStopped(RuntimeError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


class AuthorCompilation:
    def __init__(self, request, collector, selections, exchange, redaction, selection_model=None):
        self.request, self.collector, self.selections = request, collector, selections
        self.exchange, self.redaction = exchange, redaction
        self.history_ref = 'normalized-trace:' + str(uuid4())
        self.dependencies, self.failure = [], None
        self.selection_model, self.annotated_actions = selection_model, set()

    def before_action(self, raw_action):
        if self.failure:
            raise AuthorCompilationStopped(self.failure)
        # WHY：候选缺口不参与原生动作准入；来源/保存失效才停止。

    async def after_step(self, agent):
        from .author import natural_compilation_request
        # WHY：先取得独立、合法且不可变的真实来源；来源异常不能伪装为编译异常。
        try:
            self.collector.retain_history_evidence(agent.history, history_ref=self.history_ref,
                                                   redaction_manifest=self.redaction)
            trace, gaps = self.collector.snapshot(agent.history, history_ref=self.history_ref,
                                                  redaction_manifest=self.redaction)
            trace = self.selections.attach(trace)
            request = natural_compilation_request(self.request, trace, self.collector.registry)
        except Exception:
            self.failure = 'hybrid_compilation_source_invalid'
            raise AuthorCompilationStopped(self.failure) from None
        try:
            updated = await self.annotate(trace)
        except Exception:
            candidate = candidate_error('annotation')
        else:
            # 派生facts通过当前来源合同后才进入checkpoint；不把不合法来源归为candidate error。
            request = natural_compilation_request(self.request, updated, self.collector.registry)
            gaps = list({item.id: item for item in [*gaps, *self.collector.source_gaps]}.values())
            try:
                compiled = compile_natural_prefix(request, self.collector.registry, gaps,
                                                  output_schema=self.request.outputSchema)
                self.dependencies = compiled.dependencies
                candidate = {'kind': 'result', 'response': compilation_envelope(request, compiled)}
            except Exception:
                candidate = candidate_error('compile')
        try:
            await self.save(request, candidate, 'prefix')
        except AuthorCompilationStopped as error:
            self.failure = error.code
            raise

    async def annotate(self, trace):
        if self.selection_model is None:
            return trace
        # WHY：同一稳定来源连失败也只尝试一次；下一快照只允许新增来源工作。
        previous = set(self.annotated_actions)
        self.annotated_actions.update(action.id for action in trace.actions
            if action.name in ('click', 'navigate', 'bat_inspect_action') and action.status == 'succeeded')
        updated, issues = await annotate_selections(self.request, trace, self.selection_model,
                                                    skip_action_refs=previous)
        originals = {item.id: item for item in self.collector.observations}
        for observation in updated.observations:
            original = originals[observation.id]
            known = {fact.id for fact in original.facts}
            original.facts.extend(fact for fact in observation.facts
                                  if fact.kind == 'selection_function' and fact.id not in known)
        known_gaps = {item.id for item in self.collector.source_gaps}
        self.collector.source_gaps.extend(item for item in issues if item.id not in known_gaps)
        return updated

    async def finish(self, request, gaps, *, annotation_failed=False):
        if self.failure:
            return
        if annotation_failed:
            candidate = candidate_error('annotation')
        else:
            try:
                response = compilation_response(request, self.collector.registry, source_gaps=gaps,
                                                 output_schema=self.request.outputSchema)
                candidate = {'kind': 'result', 'response': response}
            except Exception:
                candidate = candidate_error('compile')
        try:
            # WHY：原生failure或候选失败也交接final来源；只有宿主同源成功候选可以发布。
            await self.save(request, candidate, 'final')
        except AuthorCompilationStopped as error:
            self.failure = error.code
            gaps.append(gap('invalid_source', [], self.failure, 'reject_trace'))

    async def save(self, request, candidate, phase):
        payload = canonical_json({'phase': phase, 'stepId': self.request.stepId,
            'canonicalRequest': canonical_json(request.model_dump(mode='json', by_alias=True)), 'candidate': candidate})
        compilation = candidate['response']['compilation'] if candidate['kind'] == 'result' else {'segments': []}
        try:
            await self.exchange(payload, compilation)
        except Exception as error:
            allowed = {'hybrid_compilation_ack_timeout', 'hybrid_compilation_host_rejected',
                       'hybrid_compilation_payload_limit', 'hybrid_compilation_ack_conflict'}
            code = str(error) if str(error) in allowed else 'hybrid_compilation_save_failed'
            raise AuthorCompilationStopped(code) from None


def candidate_error(stage):
    return {'kind': 'error', 'stage': stage, 'code': 'hybrid_semantic_annotation_failed'
            if stage == 'annotation' else 'hybrid_native_compilation_failed'}
