"""Instance-scoped target ownership around the pinned Browser-Use session manager."""
import asyncio
import inspect
from importlib.metadata import version

from browser_use.browser.session_manager import SessionManager

from browser_use_runner.popup_resume import PopupResumeAdapter
from browser_use_runner.connection_policy import disconnected_handler


class TargetScope:
    _active = None

    def __init__(self, browser, targets, on_owned, prepare_targets=None, *, prevent_reconnect=False):
        self.browser = browser
        self.owned = set(targets)
        self.on_owned = on_owned
        self.prepare_targets = prepare_targets
        self.restorations = []
        self.popup_adapters = []
        self.managers = set()
        self.storage_watchdogs = set()
        self.original_start = None
        self.start_wrapper = None
        self.prevent_reconnect, self.connection_lost = prevent_reconnect, False

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

    def _replace(self, owner, name, replacement):
        original = getattr(owner, name)
        self.restorations.append((owner, name, original, replacement))
        setattr(owner, name, replacement)
        return original

    def accepts(self, info):
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
        self._scope_dialogs(client, manager)
        self.disable_storage_sync()
        adapter = PopupResumeAdapter(self.browser)
        self.popup_adapters.append(adapter)
        original_attached = manager._handle_target_attached

        async def attached(event):
            if self.accepts(event.get('targetInfo', {})):
                await original_attached(event)

        async def recover(_target_id):
            # WHY：个人浏览器的任务页丢失后必须失败，不能切换用户页面或创建无来源应急页。
            raise ValueError('hybrid_attached_window_target_missing')

        self._replace(manager, '_handle_target_attached', attached)
        self._replace(manager, '_recover_agent_focus', recover)

    def _scope_enumeration(self, client):
        original = client.send.Target.getTargets

        async def get_targets(*args, **kwargs):
            result = await original(*args, **kwargs)
            return {**result, 'targetInfos': self._select(result.get('targetInfos', []))}

        self._replace(client.send.Target, 'getTargets', get_targets)

    def _scope_dialogs(self, client, manager):
        original = client.register.Page.javascriptDialogOpening

        def register(callback):
            async def owned_dialog(event, session_id=None):
                target_id = manager.get_target_id_from_session_id(session_id) if session_id else None
                if target_id not in self.owned:
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

        async def skip_unconfigured_storage(path=None):
            if path is not None or self.browser.browser_profile.storage_state is not None:
                raise ValueError('hybrid_attached_window_storage_state_disallowed')

        # WHY：上游保存前先取焦点，且无保存路径仍轮询 Cookie；个人实例不导入、导出或轮询登录态。
        for name in ('_start_monitoring', '_save_storage_state', '_load_storage_state'):
            self._replace(watchdog, name, skip_unconfigured_storage)
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

    def begin_operation(self, targets, on_owned, prepare_targets):
        self.ensure_connection()
        manager = self.browser.session_manager
        if self.owned or manager is None or manager.get_all_target_ids():
            raise ValueError('hybrid_attached_window_connection_cleanup_required')
        self.owned.update(targets)
        self.on_owned, self.prepare_targets = on_owned, prepare_targets

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
        self.prepare_targets = None
        self.on_owned = lambda _target_id: None
        self.clear_operation_state()

    def clear_operation_state(self):
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
