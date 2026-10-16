"""Stop native exploration when its capture contract fails; retain the source evidence."""
from types import SimpleNamespace
from .action_dispatch import dispatch_target
from .evidence import digest
from .native_sequence_stop import record_sequence_stop
from .dom_evidence import CollectionReadRequired
from .evidence import gap
from .lifecycle_diagnostics import action_metadata, emit_lifecycle, observe_lifecycle
from .observation_scope import ObservationRefreshRequired
from .author_compilation import AuthorCompilationStopped

CAPTURE_ERROR_CODES = frozenset({
    'author_read_only_action_denied',
    'ambiguous_new_navigation_tab', 'new_navigation_tab_not_ready',
    'new_navigation_tab_disappeared', 'new_navigation_tab_identity_changed', 'navigation_tab_focus_changed',
    'observation_url_changed', 'observation_tab_changed', 'observation_tab_identity_unavailable',
    'observation_url_unavailable', 'observation_state_transition_pending',
    'hybrid_navigation_outside_authorized_scope', 'unpaired_capture_callback',
    'captured_action_missing', 'captured_action_mismatch', 'captured_pre_observation_missing',
    'single_action_capture_required',
    'observation_changed_during_capture', 'observation_changed_after_capture',
    'observation_snapshot_document_mismatch', 'observation_baseline_unavailable',
})


class AuthorCaptureStopped(RuntimeError):
    pass


class AuthorCaptureCallbacks:
    def __init__(self, collector, registry_provider, *, diagnostic=None, normalize_action,
                 action_outcomes, reject_navigation_scope, before_dispatch=None, compilation=None):
        self.collector, self.registry_provider = collector, registry_provider
        self.diagnostic, self.normalize_action = diagnostic, normalize_action
        self.action_outcomes, self.reject_navigation_scope = action_outcomes, reject_navigation_scope
        self.before_dispatch = before_dispatch
        self.compilation = compilation
        self.agent, self.current_action, self.reason = None, {}, None
        self.before_action_active = False
        self.batch = None
        self.current_raw_action = None

    @property
    def failed(self):
        return self.reason is not None

    def bind(self, agent):
        self.agent = agent

    async def before_action(self, summary, model_output, step):
        # WHY：回调只登记提议；Tools.act 的实际串行入口决定哪些动作真正派发。
        if self.collector.pending is not None:
            self.abort('before_action', ValueError('unpaired_capture_callback'))
        actions = model_output.action
        for action in actions:
            self.normalize_action(action)
        history = self.agent.history.history
        self.batch = {'summary': summary, 'modelOutput': model_output, 'nativeStep': step,
            'historyIndex': len(history), 'actionBase': sum(len(item.model_output.action)
                if item.model_output else 0 for item in history), 'cursor': 0, 'results': []}
        scope = self.collector.observation_scope
        if scope is not None:
            scope.begin_batch(summary, step)
        audit = self.collector.dispatch_audit
        for index, action in enumerate(actions):
            raw = action.model_dump(exclude_unset=True)
            if not isinstance(raw, dict) or len(raw) != 1:
                self.abort('before_action', ValueError('captured_action_mismatch'))
            if audit is not None:
                arguments = next(iter(raw.values()))
                audit.propose(step, index, raw, dispatch_target(summary, arguments.get('index')), activate=False)

    async def before_dispatch_action(self, action):
        batch = self.batch
        if batch is None or batch['cursor'] >= len(batch['modelOutput'].action):
            self.abort('before_action', ValueError('captured_action_missing'))
        index = batch['cursor']
        raw_action = action.model_dump(exclude_unset=True)
        if raw_action != batch['modelOutput'].action[index].model_dump(exclude_unset=True):
            self.abort('before_action', ValueError('captured_action_mismatch'))
        batch['cursor'] += 1
        self.current_raw_action = raw_action
        scope = self.collector.observation_scope
        native_before = dict(scope.last_native_identity) if scope is not None and scope.last_native_identity else None
        step = batch['nativeStep']
        metadata = action_metadata(self.registry_provider(), raw_action, step)
        self.current_action.clear()
        self.current_action.update(metadata)
        self.before_action_active = True
        try:
            async def capture_and_validate():
                audit = self.collector.dispatch_audit
                if audit is not None:
                    audit.activate((step, index), raw_action)
                if self.compilation is not None:
                    self.compilation.before_action(raw_action)
                if self.before_dispatch is not None:
                    self.before_dispatch()
                summary = batch['summary']
                output = SimpleNamespace(action=[action], next_goal=getattr(batch['modelOutput'], 'next_goal', ''))
                await self.collector.before_action(summary, output, step, action_index=index,
                    action_ref=f"a-{batch['actionBase'] + index + 1:04d}", propose=False)
                batch['before'] = native_before
            return await self.observe('before_action', capture_and_validate, metadata)
        finally:
            self.before_action_active = False

    async def after_dispatch_action(self, result):
        batch, agent = self.batch, self.agent
        index = batch['cursor'] - 1
        batch['results'].append(result)
        # WHY：原生 pause/stop 在下一派发前抛 InterruptedError；仅保留真实前缀，
        # 让原 _finalize 仍保存该轮历史，不补尾部结果或执行任何额外动作。
        agent.state.last_result = list(batch['results'])
        explicit_human = set(self.current_raw_action) == {'bat_request_human'} and not result.error
        if not explicit_human:
            metadata = dict(self.current_action)
            async def capture():
                await self.collector.after_dispatch(result, batch['historyIndex'])
                # WHY：诊断绑定当前实际返回值，不能把多动作历史误判为查询/读取不可用。
                outcome = self.action_outcomes.get(metadata.get('actionName'))
                if outcome is not None:
                    metadata.update(outcome(result))
            await self.observe('after_step', capture, metadata)
        control = getattr(agent.tools, '_bat_human_wait', None)
        if control is not None and hasattr(control, 'after_action'):
            await control.after_action(agent, self.collector)


    def record_batch_stop(self, result, index):
        batch, agent = self.batch, self.agent
        if index + 1 >= len(batch['modelOutput'].action):
            return
        name = next(iter(self.current_raw_action))
        registered = agent.tools.registry.registry.actions.get(name)
        before = batch['before']
        scope = self.collector.observation_scope
        post = scope.last_native_identity if scope is not None else None
        reason, proof = None, {}
        if result.error:
            reason = 'action_error'
        elif result.is_done:
            reason = 'action_done'
        elif registered and registered.terminates_sequence:
            reason, proof = 'tool_terminates_sequence', {'actionName': name, 'terminatesSequence': True}
        elif before and post and (before['url'] != post['url'] or before['targetId'] != post['targetId']):
            reason, proof = 'page_changed', {'beforeUrlDigest': digest(before['url']),
                'afterUrlDigest': digest(post['url']), 'beforeTargetId': before['targetId'], 'afterTargetId': post['targetId']}
        elif agent.state.stopped:
            reason, proof = 'native_stop', {'stopped': True}
        elif agent.state.paused:
            reason, proof = 'native_pause', {'paused': True}
        if reason and self.collector.dispatch_audit is not None:
            record_sequence_stop(self.collector.dispatch_audit, batch['nativeStep'], index, reason=reason, proof=proof)

    def record_before_action_detail(self, stage, error):
        # WHY：只在本次动作前观察中记录固定读取阶段和异常类，页面值及异常原文留在本地。
        if not self.before_action_active or self.diagnostic is None:
            return
        kind = ('timeout_error' if isinstance(error, TimeoutError) else
                'os_error' if isinstance(error, OSError) else
                'runtime_error' if isinstance(error, RuntimeError) else
                'value_error' if isinstance(error, ValueError) else 'other_error')
        action = {key: self.current_action[key] for key in ('actionName', 'stepNumber')
                  if key in self.current_action}
        emit_lifecycle(self.diagnostic, 'before_action_detail', 'failed',
                       {**action, 'stage': stage, 'errorKind': kind})

    async def after_step(self, agent):
        metadata = dict(self.current_action)
        async def collect():
            result = await self.collector.after_step(agent)
            batch, audit = self.batch, self.collector.dispatch_audit
            if batch is not None and audit is not None and batch['cursor'] and batch['results']:
                self.record_batch_stop(batch['results'][-1], batch['cursor'] - 1)
                tail = batch['cursor']
                actions = batch['modelOutput'].action
                if (tail < len(actions) and 'done' in actions[tail].model_dump(exclude_unset=True)
                        and not audit.entries.get((batch['nativeStep'], tail), {}).get('sequenceStop')):
                    record_sequence_stop(audit, batch['nativeStep'], tail - 1,
                        reason='done_requires_single_action', proof={'blockedActionIndex': tail})
            self.reject_navigation_scope(agent)
            if self.compilation is not None:
                await self.compilation.after_step(agent)
            return result
        try:
            return await self.observe('after_step', collect, metadata)
        finally:
            scope = self.collector.observation_scope
            if scope is not None:
                scope.end_batch()
            self.batch = None
            self.current_action.clear()

    async def observe(self, phase, operation, metadata):
        if self.failed:
            raise AuthorCaptureStopped(self.reason)
        try:
            return await observe_lifecycle(self.diagnostic, phase, operation, metadata)
        except (CollectionReadRequired, ObservationRefreshRequired):
            # WHY：可纠正的未派发动作交给 Browser-Use 下一轮重新观察，来源捕获仍继续。
            raise
        except Exception as error:
            self.abort(phase, error)

    def abort(self, phase, error):
        if not self.failed:
            code = str(error)
            self.reason = error.code if isinstance(error, AuthorCompilationStopped) else code if code in CAPTURE_ERROR_CODES else (
                'author_' + phase + '_capture_timeout' if isinstance(error, TimeoutError)
                else 'author_' + phase + '_capture_failed')
            pending = self.collector.pending
            refs = [pending['actionId']] if isinstance(pending, dict) and pending.get('actionId') else []
            self.collector.source_gaps.append(gap('invalid_source', refs, self.reason, 'reject_trace'))
            audit = self.collector.dispatch_audit
            if audit is not None:
                audit.close()
            # WHY：before_action 异常会被原生 step 捕获并继续；必须使用公开 stop
            # 停止下一次模型决策，同时保留 pending/history 供 finish 记录未完成证据。
            if self.agent is not None:
                self.agent.stop()
        raise AuthorCaptureStopped(self.reason) from None
