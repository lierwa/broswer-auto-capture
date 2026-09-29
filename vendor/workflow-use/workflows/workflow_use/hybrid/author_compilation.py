"""Await one durable host snapshot per native step; never execute or retry an action."""
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
        # WHY：编译依赖不是原生动作准入；不能把缺口转换成 B-U 错误或阻止它继续观察。

    async def after_step(self, agent):
        from .author import natural_compilation_request
        try:
            self.collector.retain_history_evidence(agent.history, history_ref=self.history_ref,
                                                   redaction_manifest=self.redaction)
            trace, gaps = self.collector.snapshot(agent.history, history_ref=self.history_ref,
                                                  redaction_manifest=self.redaction)
            trace = await self.annotate(self.selections.attach(trace))
            gaps = list({item.id: item for item in [*gaps, *self.collector.source_gaps]}.values())
            request = natural_compilation_request(self.request, trace, self.collector.registry)
            compiled = compile_natural_prefix(request, self.collector.registry, gaps,
                                              output_schema=self.request.outputSchema)
            self.dependencies = compiled.dependencies
            await self.save(request, compilation_envelope(request, compiled), 'prefix')
            # WHY：保存缺口但继续探索；最终编译门仍拒绝缺口，不把部分节点冒充完整链路。
        except AuthorCompilationStopped as error:
            self.failure = error.code
            raise
        except Exception:
            self.failure = 'hybrid_compilation_prefix_failed'
            raise AuthorCompilationStopped(self.failure) from None

    async def annotate(self, trace):
        if self.selection_model is None:
            return trace
        updated, issues = await annotate_selections(self.request, trace, self.selection_model,
                                                    skip_action_refs=self.annotated_actions)
        self.annotated_actions.update(action.id for action in trace.actions
                                      if action.name in ('click', 'navigate') and action.status == 'succeeded')
        # WHY：同一来源键连失败也只尝试一次；结果进入原 collector，不另建队列或重复终态注解。
        originals = {item.id: item for item in self.collector.observations}
        for observation in updated.observations:
            original = originals[observation.id]
            known = {fact.id for fact in original.facts}
            original.facts.extend(fact for fact in observation.facts
                                  if fact.kind == 'selection_function' and fact.id not in known)
        known_gaps = {item.id for item in self.collector.source_gaps}
        self.collector.source_gaps.extend(item for item in issues if item.id not in known_gaps)
        return updated

    async def finish(self, request, gaps):
        if self.failure or not request.trace.completed:
            return
        try:
            response = compilation_response(request, self.collector.registry, source_gaps=gaps,
                                             output_schema=self.request.outputSchema)
            await self.save(request, response, 'final')
            if response['compilation']['gaps']:
                raise AuthorCompilationStopped('hybrid_compilation_final_gaps')
        except Exception as error:
            self.failure = error.code if isinstance(error, AuthorCompilationStopped) else 'hybrid_compilation_final_failed'
            # WHY：终态拒绝仍交接原始来源；不让保存/物化错误消灭来源，也不调用离线补救。
            gaps.append(gap('invalid_source', [], self.failure, 'reject_trace'))

    async def save(self, request, response, phase):
        payload = canonical_json({'phase': phase, 'stepId': self.request.stepId,
            'canonicalRequest': canonical_json(request.model_dump(mode='json', by_alias=True)), 'response': response})
        try:
            await self.exchange(payload, response['compilation'])
        except Exception as error:
            allowed = {'hybrid_compilation_ack_timeout', 'hybrid_compilation_host_rejected',
                       'hybrid_compilation_payload_limit', 'hybrid_compilation_ack_conflict'}
            code = str(error) if str(error) in allowed else 'hybrid_compilation_save_failed'
            raise AuthorCompilationStopped(code) from None
