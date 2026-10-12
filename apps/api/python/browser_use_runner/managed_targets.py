"""Adapt the existing TargetScope to a retained dedicated Chrome process."""
from browser_use_runner.attached_window import _client
from browser_use_runner.target_scope import TargetScope
from browser_use.browser.events import LoadStorageStateEvent
from browser_use_runner.window_lease_archive import record_target_creation


async def load_owned_storage(browser, scope):
    # WHY：新私有 Profile 聚焦后沿 SDK 原事件一次性导入；个人实例仍禁止全局存储同步。
    scope.importing_storage = True
    try:
        await browser.event_bus.dispatch(LoadStorageStateEvent()).event_result(raise_if_any=True, raise_if_none=False)
    finally:
        scope.importing_storage = False
        browser.browser_profile.storage_state = None


class ManagedTargets:
    def __init__(self, window):
        self.window = window

    def record(self, target_id):
        lease = self.window._load(self.window.owner_id)
        if target_id not in lease.ownedTargets:
            lease.ownedTargets.append(target_id)
            self.window._save(lease)

    async def prepare(self, client):
        lease = self.window._load(self.window.owner_id)
        if lease.targetId is None:
            # WHY：回执丢失不能猜新 target；先保存创建中，拿到 ID 后立即保存，才交给 SDK。
            lease.targetCreationPending = True
            self.window._save(lease)
            # WHY：无启动窗口的 headless Chrome 同样需要创建逻辑窗口；可见性由原 launcher 的 headless 控制。
            result = await client.send.Target.createTarget({'url': 'about:blank', 'newWindow': True})
            lease.targetId = result['targetId']
            lease.ownedTargets = [lease.targetId]
            lease.targetCreationPending = False
            try:
                self.window._save(lease)
            except BaseException:
                await client.send.Target.closeTarget({'targetId': lease.targetId})
                raise
        return lease.ownedTargets

    def install(self, browser, lease):
        scope = TargetScope(browser, lease.ownedTargets, self.record, self.prepare, prevent_reconnect=True,
                            allow_storage_import=browser.browser_profile.storage_state is not None,
                            on_creation=lambda pending: record_target_creation(self.window, pending))
        scope.install()
        object.__setattr__(browser, '_bat_native_range_owner', self.native_range_owner)
        return scope

    def native_range_owner(self, target_id):
        from browser_use_runner.managed_window import _owner_process
        lease = self.window._load(self.window.owner_id)
        if lease.headless: return None
        scope = self.window.scope
        accepted = target_id in lease.ownedTargets or scope is not None and scope.accepts({'type': 'iframe', 'targetId': target_id})
        if not accepted or lease.status != 'running':
            raise ValueError('native_range_target_not_owned')
        if _owner_process(lease) is None: raise ValueError('native_range_owner_closed')
        return {'pid': lease.browserPid, 'started': lease.browserStarted}

    async def end(self, lease):
        if lease.targetCreationPending:
            raise ValueError('hybrid_attached_window_create_unconfirmed')
        endpoint = f'ws://127.0.0.1:{lease.cdpPort}/devtools/browser/{lease.browserId}'
        async with _client(endpoint) as client:
            response = await client.send.Target.getTargets()
            existing = {info['targetId'] for info in response.get('targetInfos', [])}
            for target_id in lease.ownedTargets:
                if target_id in existing:
                    await client.send.Target.closeTarget({'targetId': target_id})
            response = await client.send.Target.getTargets()
            if any(info['targetId'] in lease.ownedTargets for info in response.get('targetInfos', [])):
                raise ValueError('hybrid_managed_window_end_unconfirmed')
        lease.status = 'ended'
        self.window._save(lease)  # 保留空闲 Profile 的进程身份收据；不退出含旧页面的共享进程。
        self.window.acquired = False
