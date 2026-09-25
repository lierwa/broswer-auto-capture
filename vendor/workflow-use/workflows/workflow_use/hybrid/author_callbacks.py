"""Stop native exploration when its capture contract fails; retain the source evidence."""
from .evidence import gap
from .dom_evidence import CollectionReadRequired
from .lifecycle_diagnostics import action_metadata, observe_lifecycle


CAPTURE_ERROR_CODES = frozenset({
    'ambiguous_new_navigation_tab', 'new_navigation_tab_not_ready',
    'new_navigation_tab_disappeared', 'new_navigation_tab_identity_changed', 'navigation_tab_focus_changed',
    'observation_url_changed', 'observation_tab_changed', 'observation_tab_identity_unavailable',
    'observation_url_unavailable', 'observation_state_transition_pending',
    'hybrid_navigation_outside_authorized_scope', 'unpaired_capture_callback',
    'captured_action_missing', 'captured_action_mismatch', 'captured_pre_observation_missing',
    'single_action_capture_required',
    'observation_changed_during_capture', 'observation_changed_after_capture',
    'observation_snapshot_document_mismatch', 'observation_baseline_unavailable',
    'observation_target_index_unavailable',
})


class AuthorCaptureStopped(RuntimeError):
    pass


class AuthorCaptureCallbacks:
    def __init__(self, collector, registry_provider, *, diagnostic=None, normalize_action,
                 action_outcomes, reject_navigation_scope):
        self.collector, self.registry_provider = collector, registry_provider
        self.diagnostic, self.normalize_action = diagnostic, normalize_action
        self.action_outcomes, self.reject_navigation_scope = action_outcomes, reject_navigation_scope
        self.agent, self.current_action, self.reason = None, {}, None

    @property
    def failed(self):
        return self.reason is not None

    def bind(self, agent):
        self.agent = agent

    async def before_action(self, summary, model_output, step):
        try:
            actions = model_output.action
            for action in actions:
                self.normalize_action(action)
            raw_action = actions[0].model_dump(exclude_unset=True) if len(actions) == 1 else None
        except Exception:
            raw_action = None
        metadata = action_metadata(self.registry_provider(), raw_action, step)
        self.current_action.clear()
        self.current_action.update(metadata)
        return await self.observe('before_action',
            lambda: self.collector.before_action(summary, model_output, step), metadata)

    async def after_step(self, agent):
        metadata = dict(self.current_action)
        async def collect():
            result = await self.collector.after_step(agent)
            outcome = self.action_outcomes.get(metadata.get('actionName'))
            if outcome is not None:
                metadata.update(outcome(agent))
            self.reject_navigation_scope(agent)
            return result
        try:
            return await self.observe('after_step', collect, metadata)
        finally:
            self.current_action.clear()

    async def observe(self, phase, operation, metadata):
        if self.failed:
            raise AuthorCaptureStopped(self.reason)
        try:
            return await observe_lifecycle(self.diagnostic, phase, operation, metadata)
        except CollectionReadRequired:
            # WHY：这是可纠正的未派发动作；Browser-Use 下一轮收到读取提示，来源捕获仍继续。
            raise
        except Exception as error:
            self.abort(phase, error)

    def abort(self, phase, error):
        if not self.failed:
            code = str(error)
            self.reason = code if code in CAPTURE_ERROR_CODES else (
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
