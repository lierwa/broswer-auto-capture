"""Instance-scoped target ownership around the pinned Browser-Use session manager."""
import asyncio
import inspect
from contextvars import ContextVar
from functools import partial, wraps
from importlib.metadata import version

from browser_use.browser.session_manager import SessionManager

from browser_use_runner.popup_resume import PopupResumeAdapter
from browser_use_runner.connection_policy import disconnected_handler
from browser_use_runner.target_events import TargetEvents
from browser_use_runner.task_access import attach as attach_access, configured as access_configured


class TargetScope:
    _active = None

    def __init__(self, browser, targets, on_owned, prepare_targets=None, *, prevent_reconnect=False, allow_storage_import=False,
                 on_creation=None):
        self.browser = browser
        self.owned = set(targets)
        self.on_owned = on_owned
        self.on_creation = on_creation or (lambda _pending: None)
        self.prepare_targets = prepare_targets
        self.restorations = []
        self.popup_adapters = []
        self.managers = set()
        self.storage_watchdogs = set()
        self.related_sessions = {}
        self.worker_passthrough = {}
        self.creating_pages = 0
        self.pending_page_attaches = []
        self.original_start = None
        self.start_wrapper = None
        self.prevent_reconnect, self.connection_lost = prevent_reconnect, False
        self.allow_storage_import, self.importing_storage = allow_storage_import, False
        self.target_events = TargetEvents(browser)
        self.previous_events = getattr(browser, '_bat_target_events', None)
        self.recovering_focus = ContextVar('bat_owned_focus_recovery', default=False)
        object.__setattr__(browser, '_bat_target_events', self.target_events.events)

    def install(self):
        if version('browser-use') != '0.13.8' or version('cdp-use') != '1.4.5':
            raise ValueError('hybrid_attached_window_sdk_mismatch')
        if TargetScope._active is not None:
            raise ValueError('hybrid_attached_window_scope_busy')
        self.original_start = SessionManager.start_monitoring

        async def start_monitoring(manager):
            if manager.browser_session is self.browser:
                if self.prepare_targets is not None:
                    self.owned.update(await self.prepare_targets(self.browser._cdp_client_root))
                self._bind_manager(manager)
            return await self.original_start(manager)

        # WHY：SDK 在 connect 内新建 manager；按 Browser 身份拦截其初始化，重连仍复用原实现。
        self.start_wrapper = start_monitoring
        SessionManager.start_monitoring = start_monitoring
        TargetScope._active = self
        if self.prevent_reconnect:
            self._replace(self.browser, '_auto_reconnect', disconnected_handler(
                lambda: setattr(self, 'connection_lost', True)))
        original_create = self.browser._cdp_create_new_page

        async def create_page(*args, **kwargs):
            # WHY：只禁止原生恢复补造应急页；任务自身明确的新标签动作继续复用原能力。
            if self.recovering_focus.get():
                raise ValueError('hybrid_attached_window_target_missing')
            self.creating_pages += 1
            try:
                self.on_creation(True)
                target_id = await original_create(*args, **kwargs)
                await self._admit_created_page(target_id)
                self.on_creation(False)
                return target_id
            finally:
                self.creating_pages -= 1
                if not self.creating_pages:
                    self.pending_page_attaches.clear()

        self._replace(self.browser, '_cdp_create_new_page', create_page)

    async def _admit_created_page(self, target_id):
        # WHY：CDP主动创建的标签没有openerId；用本次创建回执登记，不能靠全局枚举认领。
        # 先持久化归属再交给SDK切换；登记失败仅关闭这个明确属于本次创建的目标。
        try:
            self.on_owned(target_id)
            self.owned.add(target_id)
            # WHY：autoAttach事件可先于createTarget回执。只重交已被回执证明归属的原事件；
            # 不再attach、不重放动作、不把同时出现的个人页面交给SDK。
            pending = [item for item in self.pending_page_attaches if item[2]['targetInfo']['targetId'] == target_id]
            self.pending_page_attaches = [item for item in self.pending_page_attaches if item not in pending]
            for manager, original, event in pending:
                await self._attach_owned(manager, original, event)
        except BaseException:
            await self.browser._cdp_client_root.send.Target.closeTarget({'targetId': target_id})
            raise

    def _replace(self, owner, name, replacement):
        original = getattr(owner, name)
        self.restorations.append((owner, name, original, replacement))
        setattr(owner, name, replacement)
        return original

    def accepts(self, info):
        if info.get('type') == 'iframe':
            return any(target == info.get('targetId') and owner in self.owned
                       for target, owner, _parent in self.related_sessions.values())
        if info.get('type') not in ('page', 'tab'):
            return False
        target_id = info.get('targetId')
        if target_id in self.owned:
            return True
        if not target_id or info.get('openerId') not in self.owned:
            return False
        # WHY：只有明确由本任务页面打开的 popup 可以扩展所有权；先持久化再交给 SDK。
        self.on_owned(target_id)
        self.owned.add(target_id)
        return True

    def _select(self, targets):
        selected = []
        pending = list(targets)
        while pending:
            accepted = [info for info in pending if self.accepts(info)]
            if not accepted:
                break
            selected.extend(accepted)
            accepted_ids = {info['targetId'] for info in accepted}
            pending = [info for info in pending if info.get('targetId') not in accepted_ids]
        return selected

    def _bind_manager(self, manager):
        if id(manager) in self.managers:
            return
        self.managers.add(id(manager))
        client = self.browser._cdp_client_root
        if client is None:
            raise ValueError('hybrid_attached_window_cdp_unavailable')
        self._scope_enumeration(client)
        self._scope_frames(client)
        self._scope_frame_start(client)
        self._scope_dialogs(client, manager)
        self.disable_storage_sync()
        adapter = PopupResumeAdapter(self.browser)
        self.popup_adapters.append(adapter)
        original_attached = manager._handle_target_attached

        async def attached(event):
            await self._attach_owned(manager, original_attached, event)

        original_pages, original_recover = manager.get_all_page_targets, manager._recover_agent_focus

        def owned_pages():
            pages = [target for target in original_pages() if target.target_id in self.owned]
            if not self.recovering_focus.get():
                return pages
            # WHY：失效目标仍可能留在原生_targets；恢复只选已存在于原session池的任务页。
            return [target for target in pages if manager.get_all_sessions_for_target(target.target_id)]

        async def recover(crashed_target_id):
            self.ensure_connection()
            token = self.recovering_focus.set(True)
            try:
                if not owned_pages():
                    raise ValueError('hybrid_attached_window_target_missing')
                # WHY：复用SDK原恢复锁/事件和现存任务页，不能把个人标签作为兜底。
                await original_recover(crashed_target_id)
                self.require_focus()
            finally:
                self.recovering_focus.reset(token)

        self._replace(manager, '_handle_target_attached', attached)
        self._replace(manager, '_recover_agent_focus', recover)
        self._replace(manager, 'get_all_page_targets', owned_pages)
        # WHY：保留原生失效事件与focus清除事实；不在诊断层恢复或重放动作。
        self._replace(manager, '_handle_target_detached', self.target_events.detached(manager))
        self._replace(manager, '_get_session_for_target', self.target_events.session_lookup(manager))

    async def _attach_owned(self, manager, original, event):
        info = event.get('targetInfo', {})
        if self.creating_pages and info.get('type') == 'page' and not self.accepts(info):
            self.pending_page_attaches.append((manager, original, event))
            return
        sid = event.get('sessionId')
        worker = self.worker_passthrough.get(sid)
        if info.get('type') == 'worker' and worker and worker[0] == info.get('targetId'):
            client = self.browser._cdp_client_root
            try:
                if event.get('waitingForDebugger'):
                    await client.send.Runtime.runIfWaitingForDebugger(session_id=sid)
            finally:
                await client.send.Target.detachFromTarget(params={'sessionId': sid})
                self.worker_passthrough.pop(sid, None)
            return
        if not self.accepts(info) or info.get('type') == 'iframe' and event.get('sessionId') not in self.related_sessions:
            return
        admit = info.get('type') == 'iframe' and self._frame_admission_required()
        await original({**event, 'waitingForDebugger': False} if admit else event)
        if not admit: return
        session = next(item for item in manager.get_all_sessions_for_target(info['targetId'])
                       if item.session_id == event['sessionId'])
        client = self.browser._cdp_client_root
        try:
            # WHY：原SDK仅对顶层页开启Network监控；iframe响应仍交原持久退避器，不漏429/503。
            await attach_access(self.browser, session, observe_responses=True)
        except BaseException:
            gate = getattr(client.send.Fetch, '_bat_access', None)
            if gate: gate.failure = 'capture_access_state_unavailable'
            raise
        if event.get('waitingForDebugger'):
            await client.send.Runtime.runIfWaitingForDebugger(session_id=session.session_id)

    def _scope_frames(self, client):
        for name, handler in [('attachedToTarget', self._frame_attached), ('detachedFromTarget', self._frame_detached)]:
            original = getattr(client.register.Target, name)
            def register(callback, native=original, dispatch=handler):
                return native(partial(dispatch, callback))
            self._replace(client.register.Target, name, register)

    def _frame_admission_required(self):
        return not getattr(self.browser, '_bat_managed_profile', False) and access_configured()

    def _scope_frame_start(self, client):
        original = client.send.Target.setAutoAttach
        async def auto_attach(params=None, session_id=None, **kwargs):
            if (params and params.get('autoAttach') and session_id in self.related_sessions
                    and self._frame_admission_required()):
                # WHY：Chromium先通知renderer暂停普通Worker，再做filter；排除Worker会无session可恢复。
                # 显式接收本任务普通worker后立即resume/detach；不纳入SDK或共享SW归属，iframe仍等准入。
                params = {**params, 'waitForDebuggerOnStart': True,
                          'filter': [{'type': 'iframe'}, {'type': 'worker'}, {'exclude': True}]}
            return await original(params=params, session_id=session_id, **kwargs)
        self._replace(client.send.Target, 'setAutoAttach', auto_attach)

    def _frame_attached(self, callback, event, session_id=None):
        info, sid = event.get('targetInfo', {}), event.get('sessionId')
        target, owner = info.get('targetId'), None
        parent = self.related_sessions.get(session_id)
        if (info.get('type') == 'worker' and sid and target and parent and parent[1] in self.owned
                and self._frame_admission_required()):
            self.worker_passthrough[sid] = (target, session_id)
        if info.get('type') == 'iframe':
            if parent: owner = parent[1]
        elif self.accepts(info):
            owner = target
        # WHY：父CDP session才是任务内框架的归属证据；URL/同Profile或共享worker关联不能授予所有权。
        if sid and target and owner in self.owned:
            self.related_sessions[sid] = (target, owner, session_id)
        return callback(event, session_id)

    def _frame_detached(self, callback, event, session_id=None):
        removed = {event.get('sessionId')}
        while True:
            descendants = {sid for sid, (_target, _owner, parent) in self.related_sessions.items()
                           if parent in removed and sid not in removed}
            if not descendants: break
            removed.update(descendants)
        for sid in removed: self.related_sessions.pop(sid, None)
        for sid, (_target, parent) in list(self.worker_passthrough.items()):
            if sid in removed or parent in removed: self.worker_passthrough.pop(sid, None)
        return callback(event, session_id)

    def _scope_enumeration(self, client):
        original = client.send.Target.getTargets

        @wraps(original)
        async def get_targets(*args, **kwargs):
            result = await original(*args, **kwargs)
            return {**result, 'targetInfos': self._select(result.get('targetInfos', []))}

        self._replace(client.send.Target, 'getTargets', get_targets)

    def _scope_dialogs(self, client, manager):
        original = client.register.Page.javascriptDialogOpening

        def register(callback):
            async def owned_dialog(event, session_id=None):
                target_id = manager.get_target_id_from_session_id(session_id) if session_id else None
                if target_id not in self.owned and session_id not in self.related_sessions:
                    return
                result = callback(event, session_id)
                if inspect.isawaitable(result):
                    await result

            return original(owned_dialog)

        # WHY：上游 popup handler 在 root 上接受所有 dialog；所有权必须在其读取正文前校验。
        self._replace(client.register.Page, 'javascriptDialogOpening', register)

    def disable_storage_sync(self):
        watchdog = self.browser._storage_state_watchdog
        if watchdog is None or id(watchdog) in self.storage_watchdogs:
            return
        original_load = watchdog._load_storage_state

        async def skip_unconfigured_storage(path=None):
            if self.allow_storage_import:
                return
            if path is not None or self.browser.browser_profile.storage_state is not None:
                raise ValueError('hybrid_attached_window_storage_state_disallowed')

        async def load_owned_storage(path=None):
            if self.allow_storage_import and self.importing_storage:
                return await original_load(path)
            return await skip_unconfigured_storage(path)

        # WHY：上游保存前先取焦点，且无保存路径仍轮询 Cookie；个人实例不导入、导出或轮询登录态。
        for name in ('_start_monitoring', '_save_storage_state'):
            self._replace(watchdog, name, skip_unconfigured_storage)
        self._replace(watchdog, '_load_storage_state', load_owned_storage)
        self.storage_watchdogs.add(id(watchdog))

    def require_focus(self):
        self.ensure_connection()
        target_id = self.browser.agent_focus_target_id
        manager = self.browser.session_manager
        if target_id not in self.owned or manager is None or manager.get_target(target_id) is None:
            raise ValueError('hybrid_attached_window_target_missing')
        return target_id

    def ensure_connection(self):
        if self.prevent_reconnect and (self.connection_lost or not self.browser.is_cdp_connected):
            raise ValueError('hybrid_attached_window_connection_lost')

    def begin_operation(self, targets, on_owned, prepare_targets, on_creation=None):
        self.ensure_connection()
        manager = self.browser.session_manager
        if self.owned or manager is None or manager.get_all_target_ids():
            raise ValueError('hybrid_attached_window_connection_cleanup_required')
        self.owned.update(targets)
        self.on_owned, self.prepare_targets = on_owned, prepare_targets
        self.on_creation = on_creation or (lambda _pending: None)

    async def release_operation(self):
        self.ensure_connection()
        # WHY：closeTarget ACK 可早于 detach；只等待 SDK 原事件池释放，不重发浏览器动作。
        try:
            async with asyncio.timeout(3):
                while self.browser.session_manager.get_all_target_ids():
                    await asyncio.sleep(0.05)
        except TimeoutError as error:
            raise ValueError('hybrid_attached_window_connection_cleanup_required') from error
        self.owned.clear()
        self.related_sessions.clear()
        self.worker_passthrough.clear()
        self.prepare_targets = None
        self.on_owned = lambda _target_id: None
        self.clear_operation_state()

    def clear_operation_state(self):
        self.target_events.events.clear()
        if self.browser._dom_watchdog is not None:
            self.browser._dom_watchdog.clear_cache()
        # WHY：同一 SDK 连接借给下一独立运行时，不能继承上一运行的 DOM、选择器或下载产物。
        self.browser._cached_browser_state_summary = None
        self.browser._cached_selector_map.clear()
        self.browser._cached_selector_indices.clear()
        self.browser._downloaded_files.clear()

    def prepare_close(self):
        # WHY：关闭最后一个任务标签时，不让 SDK 恢复焦点或补建 about:blank；同一连接完成清理。
        self.browser.agent_focus_target_id = None
        watchdog = self.browser._aboutblank_watchdog
        if watchdog is not None:
            watchdog._stopping = True

    def close(self):
        self.related_sessions.clear()
        self.worker_passthrough.clear()
        if getattr(self.browser, '_bat_target_events', None) is self.target_events.events:
            if self.previous_events is None:
                object.__delattr__(self.browser, '_bat_target_events')
            else:
                object.__setattr__(self.browser, '_bat_target_events', self.previous_events)
        for owner, name, original, replacement in reversed(self.restorations):
            if getattr(owner, name) is replacement:
                setattr(owner, name, original)
        self.restorations.clear()
        for adapter in reversed(self.popup_adapters):
            adapter.close()
        self.popup_adapters.clear()
        if SessionManager.start_monitoring is self.start_wrapper:
            SessionManager.start_monitoring = self.original_start
        if TargetScope._active is self:
            TargetScope._active = None
