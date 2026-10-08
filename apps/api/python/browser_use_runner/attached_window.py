"""A lease over task-owned tabs in an existing user-owned Chrome process."""
import asyncio
import hashlib
import logging
import os
import re
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from browser_use import BrowserProfile
from browser_use_runner.task_browser import TaskBrowser as Browser
from cdp_use import CDPClient
from pydantic import Field
from workflow_use.hybrid.evidence import Contract
from browser_use_runner.target_scope import TargetScope
from browser_use_runner.startup_diagnostics import startup_causes
from browser_use_runner.attached_startup_budget import AttachedStartupBudget
from browser_use_runner.attached_cleanup_targets import targets_to_close, assert_closed_enumeration
from browser_use_runner.window_lease_archive import owner_path, archived_path, previous_boot, browser_exited


class AttachedLease(Contract):
    kind: Literal['existing-browser'] = 'existing-browser'
    leaseId: UUID
    ownerId: UUID
    profilePath: str
    cdpUrl: str = Field(repr=False)
    targetId: str | None = None
    ownedTargets: list[str] = Field(default_factory=list)
    targetCreationPending: bool = False
    sessionId: str | None = None
    status: Literal['starting', 'running', 'handoff', 'ended']


def _endpoint(value):
    parsed = urlsplit(value)
    if (parsed.scheme != 'ws' or parsed.hostname not in ('127.0.0.1', 'localhost', '::1')
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or not parsed.path.startswith('/devtools/browser/') or not parsed.path.rsplit('/', 1)[-1]):
        raise ValueError('hybrid_attached_window_endpoint_invalid')
    return value


@asynccontextmanager
async def _client(endpoint, *, timeout=15, stop_timeout=5):
    client = CDPClient(_endpoint(endpoint))
    try:
        async with asyncio.timeout(timeout):
            await client.start()
            await client.send.Browser.getVersion()
            yield client
    finally:
        await asyncio.wait_for(client.stop(), timeout=stop_timeout)


def _state(lease, active, reason=None):
    target_digest = hashlib.sha256(lease.targetId.encode('ascii')).hexdigest() if lease.targetId else None
    return {'leaseId': str(lease.leaseId), 'ownerId': str(lease.ownerId),
            'targetDigest': target_digest, 'active': active, 'reason': reason}


def _cleanup_error(stage, error):
    causes = []
    current = error
    while current is not None and len(causes) < 3:
        message = str(current)
        code = message if re.fullmatch(r'hybrid_(?:attached|managed)_window_[a-z_]+', message) else 'external_error'
        frames = [f'{Path(frame.filename).name}:{frame.lineno}:{frame.name}'
                  for frame in traceback.extract_tb(current.__traceback__)[-5:]]
        causes.append({'type': type(current).__name__, 'code': code, 'frames': frames})
        current = current.__cause__ or current.__context__
    # WHY：错误阶段不能丢失；只记录固定码、异常类型和源码位置，禁止输出 CDP 消息或私人 URL。
    logging.getLogger(__name__).error('attached_window_cleanup_failure stage=%s causes=%s', stage, causes)


class AttachedWindow:
    def __init__(self, profile_path, owner_id, cdp_url=None, *, diagnostic=None, released_owners=(), legacy_endpoint_verified=False):
        path = Path(profile_path)
        if not path.is_absolute():
            raise ValueError('hybrid_profile_path_absolute_required')
        self.profile_path = path.resolve()
        self.base_path = self.lease_path(self.profile_path)
        self.path = owner_path(self.base_path, owner_id)
        self.released_owners = {UUID(str(value)) for value in released_owners}
        self.owner_id = UUID(str(owner_id))
        self.cdp_url = _endpoint(cdp_url) if cdp_url is not None else None
        self.legacy_endpoint_verified = legacy_endpoint_verified
        self.scope = None
        self.acquired = False
        self.transferred = False
        self.creation_attempted = False
        self.cleanup_stage = 'lease_load'
        self.diagnostic = diagnostic or (lambda _event: None)
        self.retain_connection, self.last_browser = False, None

    def _startup_event(self, stage, status, error=None):
        try:
            self.diagnostic({'phase': 'attached_startup', 'status': status, 'stage': stage,
                             **({'causes': startup_causes(error)} if error is not None else {})})
        except Exception:
            # WHY：诊断不可改变连接、失败传播或资源所有权；仍由原启动与清理路径负责结果。
            pass

    @staticmethod
    def lease_path(profile_path):
        return Path(profile_path).resolve().parent / 'attached-window-lease.json'

    def _load(self, lease_id=None):
        try:
            lease = AttachedLease.model_validate_json(self.path.read_text(encoding='utf-8'))
        except FileNotFoundError as error:
            raise ValueError('hybrid_attached_window_lease_missing') from error
        if lease.ownerId != self.owner_id or (lease_id is not None and lease.leaseId != UUID(str(lease_id))):
            raise ValueError('hybrid_attached_window_owner_mismatch')
        if os.path.normcase(lease.profilePath) != os.path.normcase(str(self.profile_path)):
            raise ValueError('hybrid_attached_window_profile_changed')
        _endpoint(lease.cdpUrl)
        if 'targetCreationPending' not in lease.model_fields_set and lease.status == 'starting' and not lease.ownedTargets:
            raise ValueError('hybrid_attached_window_create_unconfirmed')
        if self.cdp_url is not None and lease.cdpUrl != self.cdp_url and not previous_boot(self.path):
            # WHY：地址变化不是登录/owner 变化；不同授权身份仍拒绝，旧收据只能由宿主核验账号 Profile 后迁移。
            if (urlsplit(lease.cdpUrl).path != urlsplit(self.cdp_url).path
                    and not self.legacy_endpoint_verified):
                raise ValueError('hybrid_attached_window_endpoint_changed')
            lease.cdpUrl = self.cdp_url
            self._save(lease)
        return lease

    def _save(self, lease):
        temporary = self.path.with_name(f'{self.path.name}.{os.getpid()}.tmp')
        try:
            temporary.write_text(lease.model_dump_json(), encoding='utf-8')
            os.chmod(temporary, 0o600)
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    def _reserve(self):
        if self.cdp_url is None:
            raise ValueError('hybrid_attached_window_endpoint_required')
        # WHY：每次运行独占自己的收据；其它 owner 的交付页、失败或清理状态不构成全局锁。
        self.path = archived_path(self.base_path, self.owner_id)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        lease = AttachedLease(leaseId=self.owner_id, ownerId=self.owner_id,
                              profilePath=str(self.profile_path), cdpUrl=self.cdp_url, status='starting')
        try:
            with self.path.open('x', encoding='utf-8') as stream:
                stream.write(lease.model_dump_json())
        except FileExistsError as error:
            raise ValueError('hybrid_attached_window_busy') from error
        self.acquired = True
        return lease

    @classmethod
    def has_lease(cls, profile_path, owner_id):
        path = owner_path(cls.lease_path(profile_path), owner_id)
        if not path.exists():
            return False
        lease = AttachedLease.model_validate_json(path.read_text(encoding='utf-8'))
        return lease.ownerId == UUID(str(owner_id))

    async def _create(self, lease, client):
        self.creation_attempted = True
        lease.targetCreationPending = True
        self._save(lease)
        result = await client.send.Target.createTarget({'url': 'about:blank', 'newWindow': True})
        lease.targetId = result['targetId']
        lease.ownedTargets = [lease.targetId]
        lease.targetCreationPending = False
        try:
            self._save(lease)
        except BaseException:
            await client.send.Target.closeTarget({'targetId': lease.targetId})
            raise

    async def _prepare_targets(self, client):
        self._startup_event('task_target_prepare', 'started')
        try:
            lease = self._load(self.owner_id)
            if lease.status == 'starting' and lease.targetId is None:
                await self._create(lease, client)
            if lease.targetId not in await self._existing(lease, client):
                raise ValueError('hybrid_attached_window_target_missing')
            self._startup_event('task_target_prepare', 'completed')
            return lease.ownedTargets
        except BaseException as error:
            self._startup_event('task_target_prepare', 'failed', error)
            raise

    async def _existing(self, lease, client):
        response = await client.send.Target.getTargets()
        return {info['targetId'] for info in response.get('targetInfos', [])
                if info.get('type') in ('page', 'tab') and info.get('targetId') in lease.ownedTargets}

    async def inspect(self, lease_id):
        if not self.has_lease(self.profile_path, self.owner_id):
            return await self.verify_closed(lease_id)
        lease = self._load(lease_id)
        if browser_exited(self.path):
            return self._confirm_ended(lease_id, lease, boot_ended=True)
        if lease.status == 'ended':
            return _state(lease, False, 'hybrid_attached_window_ended_verified')
        if lease.status != 'handoff':
            raise ValueError('hybrid_managed_window_controlled')
        async with _client(lease.cdpUrl) as client:
            existing = await self._existing(lease, client)
            await assert_closed_enumeration(lease, client, existing)
        if not existing:
            return self._confirm_ended(lease_id, lease)
        reason = None if lease.targetId in existing else 'hybrid_attached_window_target_missing'
        return _state(lease, bool(existing), reason)

    async def verify_closed(self, lease_id):
        # WHY：宿主先证明 execution 控制器已退出；恢复只读取其已记录目标，不取得新的关闭权限。
        if UUID(str(lease_id)) != self.owner_id:
            raise ValueError('hybrid_attached_window_owner_mismatch')
        # 租约在创建目标之前持久化；同 owner 的当前/归档收据均不存在时，没有取得目标创建权限。
        if not self.has_lease(self.profile_path, self.owner_id):
            return {'leaseId': str(self.owner_id), 'ownerId': str(self.owner_id), 'targetDigest': None,
                    'active': False, 'reason': 'hybrid_attached_window_lease_missing_verified'}
        lease = self._load(lease_id)
        if browser_exited(self.path):
            return self._confirm_ended(lease_id, lease, boot_ended=True)
        if lease.targetCreationPending:
            raise ValueError('hybrid_attached_window_create_unconfirmed')
        if lease.status == 'ended':
            return _state(lease, False, 'hybrid_attached_window_ended_verified')
        if not lease.ownedTargets and lease.targetCreationPending is False:
            return self._confirm_ended(lease_id, lease)
        async with _client(lease.cdpUrl) as client:
            existing = await self._existing(lease, client)
            await assert_closed_enumeration(lease, client, existing)
        if existing:
            return _state(lease, True, 'hybrid_attached_window_handoff_verified' if lease.status == 'handoff'
                          else 'hybrid_attached_window_targets_active')
        return self._confirm_ended(lease_id, lease)

    def _confirm_ended(self, lease_id, lease, boot_ended=False):
        # WHY：宿主的 closed 必须与原生收据一致；只更新已核验无目标且未并发变化的同 owner 收据。
        latest = self._load(lease_id)
        if latest != lease or latest.targetCreationPending and not boot_ended:
            raise ValueError('hybrid_attached_window_lease_changed')
        latest.targetCreationPending = False
        latest.status = 'ended'
        self._save(latest)
        self.acquired = False
        return _state(latest, False, 'hybrid_attached_window_closed_verified')

    async def page(self, lease_id):
        lease = self._load(lease_id)
        if lease.status != 'handoff':
            raise ValueError('hybrid_managed_window_controlled')
        async with _client(lease.cdpUrl) as client:
            response = await client.send.Target.getTargets()
        # WHY：只读原 owner 的交付标签元数据；不读取其它私人标签、正文或输入框。
        page = next((item for item in response.get('targetInfos', [])
                     if item.get('targetId') == lease.targetId and lease.targetId in lease.ownedTargets
                     and item.get('type') == 'page'), None)
        if page is None:
            raise ValueError('hybrid_attached_window_target_missing')
        return {**_state(lease, True), 'page': {'url': page.get('url', '')}}

    async def focus(self, lease_id):
        lease = self._load(lease_id)
        if lease.status != 'handoff':
            raise ValueError('hybrid_managed_window_controlled')
        async with _client(lease.cdpUrl) as client:
            if lease.targetId not in await self._existing(lease, client):
                raise ValueError('hybrid_attached_window_target_missing')
            await client.send.Target.activateTarget({'targetId': lease.targetId})
        return _state(lease, True)

    async def end(self, lease_id, *, allow_controlled=False, controller_released=False):
        lease = self._load(lease_id)
        if lease.status == 'ended':
            return _state(lease, False)
        # WHY：离线关闭仅接受宿主已核验同owner的child_exit事实；原关闭实现及目标范围不变。
        if lease.status != 'handoff' and not (allow_controlled and self.acquired) and not controller_released:
            raise ValueError('hybrid_managed_window_controlled')
        # WHY：租约只拥有记录的标签，不拥有用户 Chrome 进程；清理不能使用 Browser.close 或 PID。
        async with _client(lease.cdpUrl) as client:
            await self._end_connected(lease, client)
        return _state(lease, False)

    async def _end_connected(self, lease, client):
        if lease.targetCreationPending:
            raise ValueError('hybrid_attached_window_create_unconfirmed')
        self.cleanup_stage = 'owned_targets_enumerate'
        targets = await targets_to_close(self, lease, client)
        self.cleanup_stage = 'owned_targets_close'
        # WHY：debugger已断开时CDP枚举可为空；必须清理原租约的物理页面，不能把空枚举当关闭证明。
        for target_id in targets:
            result = await client.send.Target.closeTarget({'targetId': target_id})
            if result.get('success') is not True:
                raise ValueError('hybrid_attached_window_end_unconfirmed')
        self.cleanup_stage = 'owned_targets_verify'
        latest = self._load(self.owner_id)
        if latest.ownedTargets != lease.ownedTargets:
            raise ValueError('hybrid_attached_window_end_unconfirmed')
        lease = latest
        await self._wait_owned_closed(lease, client)
        if self._load(self.owner_id).ownedTargets != lease.ownedTargets:
            raise ValueError('hybrid_attached_window_end_unconfirmed')
        self.cleanup_stage = 'ended_lease_persist'
        lease.status = 'ended'
        self._save(lease)
        self.acquired = False

    async def _wait_owned_closed(self, lease, client):
        try:
            # WHY：closeTarget 回执先于目标消失；只等待所有权范围内的关闭事实，不重复浏览器动作。
            async with asyncio.timeout(3):
                while await self._existing(lease, client):
                    await asyncio.sleep(0.1)
        except TimeoutError as error:
            raise ValueError('hybrid_attached_window_end_unconfirmed') from error

    def _record_owned(self, target_id):
        lease = self._load(self.owner_id)
        if target_id not in lease.ownedTargets:
            lease.ownedTargets.append(target_id)
            self._save(lease)

    def _browser(self, lease, allowed_domains):
        profile = BrowserProfile(cdp_url=lease.cdpUrl, is_local=False, use_cloud=False,
                                 headless=False, keep_alive=True, enable_default_extensions=False,
                                 cross_origin_iframes=False, allowed_domains=allowed_domains,
                                 no_viewport=True, storage_state=None)
        # WHY：个人实例直接使用现有站点存储；不配置个人 user_data_dir，也不导出 storage_state。
        return Browser(browser_profile=profile, cdp_url=lease.cdpUrl, is_local=False,
                       **({'id': lease.sessionId} if lease.sessionId else {}))

    async def start(self, *, resume, allowed_domains, retain_connection=False):
        self.retain_connection = retain_connection
        self._startup_event('reserve', 'started')
        try:
            lease = self._load(self.owner_id) if resume else self._reserve()
            if resume and lease.status != 'handoff':
                raise ValueError('hybrid_managed_window_resume_unavailable')
        except BaseException as error:
            self._startup_event('reserve', 'failed', error)
            raise
        self._startup_event('reserve', 'completed')
        self.transferred = resume
        browser = None
        stage = 'sdk_connect'
        self._startup_event(stage, 'started')
        try:
            browser = self._browser(lease, allowed_domains)
            self.last_browser = browser
            # WHY：SDK 已连通但尚未枚举目标时建页/验证，整个执行只使用它的原有 CDP 连接。
            self.scope = TargetScope(browser, lease.ownedTargets, self._record_owned, self._prepare_targets,
                                     prevent_reconnect=True)
            self.scope.install()
            with AttachedStartupBudget(browser, lease.cdpUrl):
                await browser.start()
            self._startup_event(stage, 'completed')
            stage = 'task_target_focus'
            self._startup_event(stage, 'started')
            lease = self._load(self.owner_id)
            await browser.get_or_create_cdp_session(lease.targetId, focus=True)
            # WHY：B-U focus 只切换内部目标；扩展的新窗口可仍为 hidden，须激活已登记的任务页。
            await browser.cdp_client.send.Target.activateTarget({'targetId': self.scope.require_focus()})
            lease = self._load(self.owner_id)
            lease.sessionId, lease.status = browser.id, 'running'
            self._save(lease)
            self.acquired, self.transferred = True, False
            self._startup_event(stage, 'completed')
            return browser
        except BaseException as error:
            self._startup_event(stage, 'failed', error)
            if resume:
                await self._stop(browser)
            else:
                await self.close(browser)
            raise

    async def _stop(self, browser):
        try:
            if browser is not None:
                if self.scope is not None:
                    self.scope.disable_storage_sync()
                await browser.stop()
        finally:
            if self.scope is not None and (browser is None or getattr(browser, '_cdp_client_root', None) is None):
                self.scope.close()
                self.scope = None

    async def start_connected(self, browser, scope):
        self.retain_connection, self.last_browser, self.scope = True, browser, scope
        stage = 'reserve'
        self._startup_event(stage, 'started')
        try:
            lease = self._reserve()
            self._startup_event(stage, 'completed')
            stage = 'task_target_prepare'
            self._startup_event(stage, 'started')
            scope.begin_operation([], self._record_owned, self._prepare_targets)
            await self._create(lease, browser.cdp_client)
            scope.owned.update(lease.ownedTargets)
            # WHY：autoAttach 可先于 createTarget 回执，先拒绝未知页；保存 owner 后显式再 attach。
            await browser.cdp_client.send.Target.attachToTarget(params={'targetId': lease.targetId, 'flatten': True})
            if lease.targetId not in await self._existing(lease, browser.cdp_client):
                raise ValueError('hybrid_attached_window_target_missing')
            self._startup_event(stage, 'completed')
            stage = 'task_target_focus'
            self._startup_event(stage, 'started')
            await browser.get_or_create_cdp_session(lease.targetId, focus=True)
            # WHY：复用父连接仍会创建新任务窗口；同一连接的显式激活只作用于本 operation 目标。
            await browser.cdp_client.send.Target.activateTarget({'targetId': scope.require_focus()})
            scope.clear_operation_state()
            lease.sessionId, lease.status = browser.id, 'running'
            self._save(lease)
            self._startup_event(stage, 'completed')
            return browser
        except BaseException as error:
            self._startup_event(stage, 'failed', error)
            await asyncio.shield(self.release(browser))
            raise

    async def handoff(self, browser):
        try:
            return await self._handoff(browser)
        except Exception as error:
            _cleanup_error('handoff', error)
            raise

    async def _handoff(self, browser):
        lease = self._load(self.owner_id)
        if lease.status != 'running' or browser.id != lease.sessionId or self.scope is None:
            raise ValueError('hybrid_managed_window_session_changed')
        lease.targetId = self.scope.require_focus()
        self._save(lease)
        if lease.targetId not in await self._existing(lease, browser.cdp_client):
            raise ValueError('hybrid_attached_window_target_missing')
        # WHY：在现有连接中验证交付页后 detach，避免为 post-stop 验证再次弹出原生连接授权。
        await self._stop(browser)
        # WHY：stop 等待期间仍可能登记本任务 popup，交付不能用旧快照覆盖其所有权证据。
        lease = self._load(self.owner_id)
        lease.status = 'handoff'
        self._save(lease)
        self.transferred = True
        return _state(lease, True)

    async def _close_owned(self, browser):
        self.cleanup_stage = 'lease_load'
        lease = self._load(self.owner_id)
        client = browser._cdp_client_root if browser is not None else None
        if lease.targetCreationPending:
            # WHY：createTarget 被取消但回执丢失时不能猜目标，更不能把未知新页伪报已清理。
            raise ValueError('hybrid_attached_window_create_unconfirmed')
        if not lease.ownedTargets:
            lease.status = 'ended'
            self._save(lease)
            self.acquired = False
        elif client is not None:
            self.cleanup_stage = 'owned_targets_prepare'
            if self.scope is not None:
                self.scope.prepare_close()
            await self._end_connected(lease, client)
        else:
            if self.retain_connection:
                raise ValueError('hybrid_attached_window_connection_lost')
            await self.end(self.owner_id, allow_controlled=True)

    async def release(self, browser):
        if self.transferred or not self.acquired:
            return {'stage': 'browser_close', 'status': 'not_required', 'code': None}
        try:
            await self._close_owned(browser)
            if self.retain_connection and self.scope is not None:
                await self.scope.release_operation()
        except Exception as error:
            _cleanup_error(self.cleanup_stage, error)
            return {'stage': 'browser_close', 'status': 'unconfirmed', 'code': 'cleanup_browser_close_failed'}
        return {'stage': 'browser_close', 'status': 'confirmed', 'code': None}

    async def close(self, browser):
        if self.transferred or not self.acquired:
            return {'stage': 'browser_close', 'status': 'not_required', 'code': None}
        failed = False
        try:
            try:
                await self._close_owned(browser)
            except Exception as error:
                _cleanup_error(self.cleanup_stage, error)
                failed = True
        finally:
            try:
                await self._stop(browser)
            except Exception as error:
                _cleanup_error('browser_detach', error)
                failed = True
        if failed:
            return {'stage': 'browser_close', 'status': 'unconfirmed', 'code': 'cleanup_browser_close_failed'}
        return {'stage': 'browser_close', 'status': 'confirmed', 'code': None}
