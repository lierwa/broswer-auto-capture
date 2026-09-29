"""Run-scoped live identity stamps around the public BrowserStateSummary API."""
import time
from copy import copy

from .action_identity import history_action_refs, resolve_history_step
from .dom_evidence import node_tag, node_value
from .evidence import digest
from .snapshot_consistency import ObservationUrlChanged


class LiveDocumentReadError(ValueError):
    def __init__(self, stage, error):
        super().__init__('observation_document_read_failed')
        self.details = {'errorStage': stage, 'errorType': type(error).__name__,
            'errorCode': 'document_read_failed', 'errorDigest': digest(str(error))}


class ObservationRefreshRequired(RuntimeError):
    """Withhold an unusable proposal; let the native Agent observe and choose again."""

    def __init__(self, reason='page address changed after observation'):
        super().__init__('observation_refresh_required: ' + reason
                         + '; no action was sent. Re-read the current page before choosing a target')


async def live_document_sample(browser):
    target_id = browser.agent_focus_target_id
    stage = 'current_page'
    try:
        page = await browser.get_current_page()
        if page is None:
            raise ValueError('page_unavailable')
        stage = 'target_before'
        before = await page.get_target_info()
        stage = 'document_session'
        session = await browser.get_or_create_cdp_session(target_id=target_id, focus=False)
        stage = 'document_root'
        # WHY：一次原生 DOM 读取直接取得 HTML 后端身份；不创建 Actor 会话，
        # 不在 getDocument 和 querySelectorAll 间持有会随导航失效的前端 nodeId。
        document = await session.cdp_client.send.DOM.getDocument({'depth': 1}, session_id=session.session_id)
        roots = [node for node in document['root'].get('children', [])
                 if node.get('nodeType') == 1 and node.get('nodeName', '').lower() == 'html']
        backend = roots[0].get('backendNodeId') if len(roots) == 1 else None
        stage = 'target_after'
        after = await page.get_target_info()
        stage = 'target_identity'
        if not target_id or before.get('targetId') != after.get('targetId') or target_id != after.get('targetId') \
                or target_id != browser.agent_focus_target_id:
            raise ValueError('observation_tab_changed')
    except Exception as error:
        raise LiveDocumentReadError(stage, error) from None
    return {'url': after.get('url'), 'targetId': after.get('targetId'),
        'documentDigest': digest({'targetId': target_id, 'htmlBackendNodeId': backend})
        if type(backend) is int else None,
        'stable': before.get('url') == after.get('url'),
        'monotonicMs': time.monotonic_ns() // 1000000}


def summary_document_digest(summary, target_id):
    state = getattr(summary, 'dom_state', None)
    root = getattr(getattr(state, '_root', None), 'original_node', None)
    candidates = [root, *(getattr(state, 'selector_map', {}) or {}).values()]
    for candidate in candidates:
        node = candidate
        for _depth in range(64):
            if node is None:
                break
            if node_tag(node) == 'html' and node_value(node, 'target_id') == target_id:
                backend = node_value(node, 'backend_node_id')
                return digest({'targetId': target_id, 'htmlBackendNodeId': backend}) if type(backend) is int else None
            if node_tag(node) == '#document':
                node = next((child for child in node_value(node, 'children_nodes') or []
                             if node_tag(child) == 'html'), None)
            else:
                node = node_value(node, 'parent_node')
    return None


def sample_identity(sample):
    return sample.get('url'), sample.get('targetId'), sample.get('documentDigest')


def safe_sample(sample):
    if sample is None:
        return None
    return {key: sample.get(key) for key in ('targetId', 'documentDigest', 'stable', 'monotonicMs')} | {
        'urlDigest': digest(sample['url']) if isinstance(sample.get('url'), str) else None}


class SourceObservationScope:
    def __init__(self, browser, collector, callbacks):
        self.browser, self.collector, self.callbacks = browser, collector, callbacks
        self.original = browser.get_browser_state_summary
        self.stamps, self.diagnostics = [], []
        self.installed = False
        self.had_instance_method = 'get_browser_state_summary' in vars(browser)
        self.instance_method = vars(browser).get('get_browser_state_summary')
        self.had_instance_url = 'get_current_page_url' in vars(browser)
        self.instance_url = vars(browser).get('get_current_page_url')
        collector.observation_scope = self

    def start(self):
        # WHY：只适配本次 Browser 实例的公开查询，不能改上游全局类或浏览器所有权。
        object.__setattr__(self.browser, 'get_browser_state_summary', self.capture)
        object.__setattr__(self.browser, 'get_current_page_url', self.live_page_url)
        self.installed = True

    def close(self):
        if not self.installed:
            return
        if self.had_instance_method:
            object.__setattr__(self.browser, 'get_browser_state_summary', self.instance_method)
        else:
            object.__delattr__(self.browser, 'get_browser_state_summary')
        if self.had_instance_url:
            object.__setattr__(self.browser, 'get_current_page_url', self.instance_url)
        else:
            object.__delattr__(self.browser, 'get_current_page_url')
        self.stamps.clear()
        self.installed = False

    async def live_page_url(self):
        session_id, tab_id = self.browser.id, self.browser.agent_focus_target_id
        page = await self.browser.get_current_page()
        if page is None or not tab_id:
            raise ValueError('observation_tab_identity_unavailable')
        # WHY：SDK 的 URL 缓存可在新 tab 保持空串，使原生 watchdog 永久跳过 DOM 构建。
        # 复用公开 Page.get_url 读取同一 target；不修改缓存、不生成替代 DOM、不放宽前后文档校验。
        url = await page.get_url()
        if self.browser.id != session_id or self.browser.agent_focus_target_id != tab_id:
            raise ValueError('observation_tab_changed')
        if not isinstance(url, str) or not url:
            raise ValueError('observation_url_unavailable')
        return url

    async def capture(self, include_screenshot=True, cached=False, include_recent_events=False):
        return await self._capture(include_screenshot, include_recent_events, allow_transition=False)

    async def capture_post(self, include_screenshot=False, cached=False, include_recent_events=False):
        return await self._capture(include_screenshot, include_recent_events, allow_transition=True)

    async def _capture(self, include_screenshot, include_recent_events, *, allow_transition):
        before = after = None
        summary = None
        outcome = 'capture_unavailable'
        phase = 'sample_before'
        pending = self.collector.pending
        step = pending.get('nativeStep') if allow_transition and isinstance(pending, dict) else None
        session_id = self.browser.id
        try:
            before = await live_document_sample(self.browser)
            phase = 'native_summary'
            summary = copy(await self.original(include_screenshot=include_screenshot, cached=False,
                                               include_recent_events=include_recent_events))
            phase = 'sample_after'
            after = await live_document_sample(self.browser)
            if (self.browser.id != session_id or not before['stable'] or not after['stable']
                    or sample_identity(before) != sample_identity(after)):
                outcome = 'changed_during_capture'
                raise ValueError('observation_changed_during_capture')
            original_url = getattr(summary, 'url', None)
            document = summary_document_digest(summary, after['targetId'])
            url_changed = original_url != after['url']
            has_targets = bool(getattr(getattr(summary, 'dom_state', None), 'selector_map', {}))
            if (document is not None or url_changed or has_targets) and (
                    document is None or document != after['documentDigest']):
                outcome = 'snapshot_document_mismatch'
                raise ValueError('observation_snapshot_document_mismatch')
            outcome = 'cache_url_corrected' if url_changed else 'consistent'
            self.record('state_capture', outcome, original_url, before, after, document, native_step=step)
            if url_changed:
                summary.url = after['url']
            # 当前 tab 的 URL 也来自同一缓存；只更新返回副本中已核验的 target，其余 tab 保持原事实。
            summary.tabs = [_updated_tab(tab, after) for tab in summary.tabs]
            self.stamps.append((summary, after))
            self.stamps = self.stamps[-8:]
            return summary
        except Exception as error:
            self.record('state_capture', outcome, getattr(summary, 'url', None), before, after,
                        native_step=step, error=error, error_phase=phase)
            if (outcome in ('changed_during_capture', 'snapshot_document_mismatch')
                    and self.browser.id == session_id and _same_owned_tab(before, after)
                    and after['targetId'] == self.browser.agent_focus_target_id):
                # WHY：同一受控 tab 的页面过渡不是来源损坏；不交付混合快照，
                # 动作后沿用 snapshot settle，模型观察交回原生 step 重试，不增设循环。
                if allow_transition:
                    raise ObservationUrlChanged() from None
                raise ObservationRefreshRequired('page changed during observation') from None
            self.callbacks.abort('observation', error)

    async def verify_before_action(self, summary, native_step, selector_index=None, action_name=None):
        baseline = next((sample for candidate, sample in reversed(self.stamps) if candidate is summary), None)
        try:
            current = await live_document_sample(self.browser)
        except LiveDocumentReadError as error:
            stage = {
                'current_page': 'live_current_page', 'target_before': 'live_target_before',
                'document_session': 'live_document_session', 'document_root': 'live_document_root',
                'target_after': 'live_target_after',
            }.get(error.details.get('errorStage'), 'live_document_other')
            self.callbacks.record_before_action_detail(stage, error.__context__ or error)
            self.record('before_action', 'capture_unavailable', getattr(summary, 'url', None), baseline, None,
                        native_step=native_step, error=error, error_phase='sample_before_action')
            raise
        outcome = 'consistent' if (baseline is not None and current['stable']
            and sample_identity(baseline) == sample_identity(current)) else 'changed_after_capture'
        self.record('before_action', outcome, getattr(summary, 'url', None), baseline, current,
                    native_step=native_step)
        if baseline is None:
            raise ValueError('observation_baseline_unavailable')
        if outcome != 'consistent':
            if _can_refresh_read(action_name, selector_index, baseline, current):
                return await self.refresh_read(summary, native_step, baseline, current)
            if _same_owned_tab(baseline, current):
                # WHY：同一 tab 的导航可更换文档；旧提议不能派发，交回原生 Agent 重观察。
                raise ObservationRefreshRequired()
            raise ValueError('observation_changed_after_capture')
        mapping = getattr(getattr(summary, 'dom_state', None), 'selector_map', {}) or {}
        if type(selector_index) is int and selector_index not in mapping and str(selector_index) not in mapping:
            # WHY：同文档的无效模型索引是原生可纠错输出，不是来源身份损坏；不派发也不 stop。
            raise ObservationRefreshRequired('target index is not present in the current browser state')
        return summary

    async def refresh_read(self, summary, native_step, baseline, current):
        # WHY：无索引只读查询绑定当前文档；新观察只供 callback 采集，不能冒充模型已见过它。
        refreshed = await self.capture(include_screenshot=False)
        fresh_sample = next(sample for candidate, sample in reversed(self.stamps) if candidate is refreshed)
        outcome = ('readonly_observation_refreshed' if sample_identity(current) == sample_identity(fresh_sample)
                   else 'changed_during_read_refresh')
        self.record('before_action_read_refresh', outcome, getattr(summary, 'url', None), baseline, fresh_sample,
                    native_step=native_step)
        if outcome != 'readonly_observation_refreshed':
            if _same_owned_tab(current, fresh_sample):
                raise ObservationRefreshRequired('page changed during read refresh')
            raise ValueError('observation_changed_during_capture')
        return refreshed

    def record(self, phase, outcome, summary_url, baseline, current, document=None, native_step=None,
               error=None, error_phase=None):
        agent = self.callbacks.agent
        step = native_step if native_step is not None else getattr(getattr(agent, 'state', None), 'n_steps', None)
        self.diagnostics.append({'schemaVersion': 'bat.observation-diagnostic/v1', 'phase': phase,
            'outcome': outcome, 'nativeStepNumber': step,
            'summaryUrlDigest': digest(summary_url) if isinstance(summary_url, str) else None,
            'summaryDocumentDigest': document, 'baseline': safe_sample(baseline), 'current': safe_sample(current),
            **_error_diagnostic(error, error_phase)})

    def record_live_url(self, summary, tab_id, live_url):
        baseline = next((sample for candidate, sample in reversed(self.stamps) if candidate is summary), None)
        pending = self.collector.pending
        step = pending.get('nativeStep') if isinstance(pending, dict) else None
        current = {'url': live_url, 'targetId': tab_id, 'monotonicMs': time.monotonic_ns() // 1000000}
        outcome = 'consistent' if getattr(summary, 'url', None) == live_url else 'url_changed_before_observe'
        self.record('observation_url_guard', outcome, getattr(summary, 'url', None), baseline, current, native_step=step)

    def document_identity(self, summary):
        sample = next((value for candidate, value in reversed(self.stamps) if candidate is summary), None)
        if sample is None or not sample['stable'] or not sample['documentDigest'] or not sample['targetId']:
            return None
        return {'targetId': sample['targetId'], 'documentDigest': sample['documentDigest']}

    def attach(self, imported, history):
        references = history_action_refs(history)
        for diagnostic in self.diagnostics:
            step = None
            try:
                step = resolve_history_step(history, diagnostic['nativeStepNumber'])
            except ValueError:
                pass
            action_ref = references.get((step, 0))
            pre = imported.records[step].preObservationRef if step is not None else None
            observation = next((item for item in imported.observations if item.id == pre), None)
            if observation is None and imported.observations:
                observation = imported.observations[-1]
            if observation is not None:
                fact = self.collector.value_fact('observation_diagnostic', {**diagnostic, 'actionRef': action_ref})
                # WHY：在线 retain/snapshot 多次投影同一诊断；事实只能保存一次，不能随步数重复膨胀。
                existing = [item for item in observation.facts if item.id == fact.id]
                if existing and existing != [fact]:
                    raise ValueError('observation_diagnostic_conflict')
                if not existing:
                    observation.facts.append(fact)


def _updated_tab(tab, sample):
    if getattr(tab, 'target_id', None) != sample['targetId']:
        return tab
    result = copy(tab)
    result.url = sample['url']
    return result


def _can_refresh_read(action_name, selector_index, baseline, current):
    return (action_name in ('find_elements', 'search_page') and selector_index is None
        and baseline['stable'] and current['stable'] and baseline['url'] != current['url']
        and baseline['targetId'] == current['targetId']
        and baseline['documentDigest'] is not None and baseline['documentDigest'] == current['documentDigest'])


def _same_owned_tab(baseline, current):
    return (baseline is not None and current is not None
        and isinstance(baseline['url'], str) and isinstance(current['url'], str)
        and baseline['targetId'] is not None and baseline['targetId'] == current['targetId']
        and baseline['documentDigest'] is not None
        and current['documentDigest'] is not None)


def _error_diagnostic(error, phase):
    if error is None:
        return {}
    details = error.details if isinstance(error, LiveDocumentReadError) else {
        'errorStage': phase, 'errorType': type(error).__name__, 'errorCode': 'observation_capture_failed',
        'errorDigest': digest(str(error))}
    return {**details, 'errorPhase': phase}
