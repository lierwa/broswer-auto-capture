"""One explicit Chrome owner for a dedicated hybrid execution and its user lease."""
import asyncio
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Literal
from uuid import UUID

import psutil
from browser_use import Browser, BrowserProfile
from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog
from pydantic import Field

from workflow_use.hybrid.evidence import Contract
from browser_use_runner.connection_policy import disconnected_handler


class WindowLease(Contract):
    leaseId: UUID
    ownerId: UUID
    profilePath: str
    browserPid: int | None = None
    browserStarted: float | None = None
    browserExe: str | None = None
    cdpPort: int | None = None
    browserId: str | None = None
    sessionId: str | None = None
    targetId: str | None = None
    creatorPid: int
    status: Literal['starting', 'running', 'handoff']


def _target_digest(target_id):
    return hashlib.sha256(target_id.encode('ascii')).hexdigest()


def _same_path(left, right):
    return os.path.normcase(str(Path(left).resolve())) == os.path.normcase(str(Path(right).resolve()))


def _owner_process(lease):
    if lease.browserPid is None or lease.browserStarted is None or lease.browserExe is None:
        raise ValueError('hybrid_managed_window_owner_unknown')
    try:
        owner = psutil.Process(lease.browserPid)
        if abs(owner.create_time() - lease.browserStarted) > 0.1 or not _same_path(owner.exe(), lease.browserExe):
            raise ValueError('hybrid_managed_window_owner_changed')
        profile_args = [value.split('=', 1)[1] for value in owner.cmdline()
                        if value.startswith('--user-data-dir=')]
        if len(profile_args) != 1 or not _same_path(profile_args[0], lease.profilePath):
            raise ValueError('hybrid_managed_window_profile_changed')
        return owner
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return None


def _profile_process_present(profile_path):
    # WHY：租约文件可能在 end 后、SQLite 回写前消失；只有确认专属 Profile 无 Chrome 进程才能解锁。
    for process in psutil.process_iter(['name']):
        name = (process.info.get('name') or '').lower()
        if name not in ('chrome', 'chrome.exe', 'chromium', 'chromium.exe', 'chromium-browser'):
            continue
        try:
            arguments = process.cmdline()
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            continue
        except psutil.AccessDenied:
            raise ValueError('hybrid_managed_window_owner_verification_unavailable')
        if any(value.startswith('--user-data-dir=')
               and _same_path(value.split('=', 1)[1], profile_path) for value in arguments):
            return True
    return False


def _cdp_json(port, path):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}', timeout=2) as response:
        return json.load(response)


def _browser_id(port):
    endpoint = _cdp_json(port, '/json/version').get('webSocketDebuggerUrl', '')
    if not endpoint.startswith(f'ws://127.0.0.1:{port}/devtools/browser/'):
        raise ValueError('hybrid_managed_window_cdp_changed')
    return endpoint.rsplit('/', 1)[-1]


def _target_exists(lease):
    return any(item.get('type') == 'page' and item.get('id') == lease.targetId
               for item in _cdp_json(lease.cdpPort, '/json/list'))


def _window_api():
    api = ctypes.windll.user32
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    signatures = {
        'EnumWindows': ([callback_type, wintypes.LPARAM], wintypes.BOOL),
        'GetWindowThreadProcessId': ([wintypes.HWND, ctypes.POINTER(wintypes.DWORD)], wintypes.DWORD),
        'GetWindow': ([wintypes.HWND, wintypes.UINT], wintypes.HWND),
        'IsWindowVisible': ([wintypes.HWND], wintypes.BOOL),
        'IsIconic': ([wintypes.HWND], wintypes.BOOL),
        'ShowWindow': ([wintypes.HWND, ctypes.c_int], wintypes.BOOL),
        'SetForegroundWindow': ([wintypes.HWND], wintypes.BOOL),
        'GetForegroundWindow': ([], wintypes.HWND),
    }
    for name, (arguments, result) in signatures.items():
        function = getattr(api, name)
        function.argtypes, function.restype = arguments, result
    return api, callback_type


def _visible_window(pid):
    if sys.platform != 'win32':
        return True
    api, callback_type = _window_api()
    windows = []

    def callback(hwnd, _unused):
        owner_pid = wintypes.DWORD()
        api.GetWindowThreadProcessId(hwnd, ctypes.byref(owner_pid))
        if owner_pid.value == pid and api.IsWindowVisible(hwnd) and not api.GetWindow(hwnd, 4):  # GW_OWNER
            windows.append(hwnd)
        return True

    api.EnumWindows(callback_type(callback), 0)
    for hwnd in windows:
        if api.IsIconic(hwnd):
            api.ShowWindow(hwnd, 9)  # SW_RESTORE
        requested = api.SetForegroundWindow(hwnd)
        # WHY：Windows 可拒绝后台进程抢焦点；可见/激活请求回执均不能替代实际前台 HWND。
        if requested and api.GetForegroundWindow() == hwnd:
            return True
    if windows:
        raise ValueError('hybrid_managed_window_foreground_denied')
    return False


def _state(lease, active, reason=None):
    return {'leaseId': str(lease.leaseId), 'ownerId': str(lease.ownerId),
            'targetDigest': _target_digest(lease.targetId) if lease.targetId else None,
            'active': active, 'reason': reason}


class ManagedWindow:
    def __init__(self, profile_path, owner_id, *, headless=False):
        path = Path(profile_path)
        if not path.is_absolute():
            raise ValueError('hybrid_profile_path_absolute_required')
        self.profile_path = path.resolve()
        self.path = self.profile_path.parent / 'managed-window-lease.json'
        self.owner_id = UUID(str(owner_id))
        self.transferred = False
        self.acquired = False
        self.headless = headless
        self.connection_lost = False

    def _load(self, lease_id=None):
        try:
            lease = WindowLease.model_validate_json(self.path.read_text(encoding='utf-8'))
        except FileNotFoundError as error:
            raise ValueError('hybrid_managed_window_lease_missing') from error
        if lease.ownerId != self.owner_id or (lease_id is not None and lease.leaseId != UUID(str(lease_id))):
            raise ValueError('hybrid_managed_window_owner_mismatch')
        if not _same_path(lease.profilePath, self.profile_path):
            raise ValueError('hybrid_managed_window_profile_changed')
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
        self.profile_path.parent.mkdir(parents=True, exist_ok=True)
        lease = WindowLease(leaseId=self.owner_id, ownerId=self.owner_id,
                            profilePath=str(self.profile_path), creatorPid=os.getpid(), status='starting')
        try:
            with self.path.open('x', encoding='utf-8') as stream:
                stream.write(lease.model_dump_json())
        except FileExistsError as error:
            raise ValueError('hybrid_managed_window_busy') from error
        self.acquired = True
        return lease

    def _verify(self, lease, require_target=True):
        owner = _owner_process(lease)
        if owner is None:
            return False, 'hybrid_managed_window_owner_closed'
        try:
            if lease.cdpPort is None or lease.browserId != _browser_id(lease.cdpPort):
                return False, 'hybrid_managed_window_cdp_changed'
            if require_target and not _target_exists(lease):
                return False, 'hybrid_managed_window_target_missing'
        except Exception:
            return False, 'hybrid_managed_window_cdp_unavailable'
        return True, None

    def inspect(self, lease_id):
        try:
            lease = self._load(lease_id)
        except ValueError as error:
            if str(error) != 'hybrid_managed_window_lease_missing':
                raise
            if _profile_process_present(self.profile_path):
                raise ValueError('hybrid_managed_window_owner_unknown') from error
            return {'leaseId': str(UUID(str(lease_id))), 'ownerId': str(self.owner_id),
                    'targetDigest': None, 'active': False,
                    'reason': 'hybrid_managed_window_lease_missing_verified'}
        active, reason = self._verify(lease)
        if active and lease.status == 'handoff':
            return _state(lease, True)
        if _profile_process_present(self.profile_path):
            raise ValueError('hybrid_managed_window_controlled' if lease.status != 'handoff'
                             else reason or 'hybrid_managed_window_owner_unknown')
        self.path.unlink(missing_ok=True)
        self.acquired = False
        return _state(lease, False, reason or 'hybrid_managed_window_lease_inactive_verified')

    def focus(self, lease_id):
        lease = self._load(lease_id)
        active, _reason = self._verify(lease)
        if not active or lease.status != 'handoff':
            raise ValueError('hybrid_managed_window_unavailable')
        with urllib.request.urlopen(f'http://127.0.0.1:{lease.cdpPort}/json/activate/{lease.targetId}', timeout=2):
            pass
        if not _visible_window(lease.browserPid):
            raise ValueError('hybrid_managed_window_not_visible')
        return _state(lease, True)

    def end(self, lease_id, *, allow_controlled=False):
        lease = self._load(lease_id)
        if lease.status != 'handoff' and not allow_controlled:
            raise ValueError('hybrid_managed_window_controlled')
        if lease.browserPid is None and lease.status == 'starting' and lease.creatorPid == os.getpid():
            self.path.unlink()
            self.acquired = False
            return _state(lease, False)
        owner = _owner_process(lease)
        if owner is not None:
            processes = owner.children(recursive=True) + [owner]
            for process in reversed(processes):
                try:
                    process.terminate()
                except psutil.NoSuchProcess:
                    pass
            _gone, alive = psutil.wait_procs(processes, timeout=5)
            for process in alive:
                try:
                    process.kill()
                except psutil.NoSuchProcess:
                    pass
            psutil.wait_procs(alive, timeout=5)
            if _owner_process(lease) is not None:
                raise ValueError('hybrid_managed_window_end_unconfirmed')
        self.path.unlink()
        self.acquired = False
        return _state(lease, False)

    async def start(self, *, resume, allowed_domains):
        if resume and self.headless:
            raise ValueError('hybrid_managed_window_headless_handoff_unsupported')
        if resume:
            lease = self._load(self.owner_id)
            if lease.status != 'handoff' or not self._verify(lease)[0]:
                raise ValueError('hybrid_managed_window_resume_unavailable')
            self.transferred = True  # A failed attach must leave the existing user lease intact.
        else:
            lease = self._reserve()
            try:
                lease = await self._launch(lease)
            except Exception:
                self.end(lease.leaseId, allow_controlled=True)
                raise
        profile = BrowserProfile(headless=self.headless, use_cloud=False, keep_alive=False,
                                 user_data_dir=str(self.profile_path), enable_default_extensions=False,
                                 allowed_domains=allowed_domains, cdp_url=f'http://127.0.0.1:{lease.cdpPort}',
                                 is_local=False)
        browser = Browser(browser_profile=profile, cdp_url=profile.cdp_url, is_local=False,
                          **({'id': lease.sessionId} if lease.sessionId else {}))
        browser._auto_reconnect = disconnected_handler(lambda: setattr(self, 'connection_lost', True))
        try:
            await browser.start()
            if resume:
                await browser.get_or_create_cdp_session(lease.targetId, focus=True)
                if browser.agent_focus_target_id != lease.targetId:
                    raise ValueError('hybrid_managed_window_target_changed')
            else:
                lease.sessionId = browser.id
                lease.targetId = browser.agent_focus_target_id
                self._save(lease)
            lease.status = 'running'
            self._save(lease)
            self.transferred = False
            self.acquired = True
            return browser
        except Exception:
            try:
                await browser.stop()
            finally:
                if not resume:
                    self.end(lease.leaseId, allow_controlled=True)
            raise

    async def _launch(self, lease):
        # WHY：进程发现沿用固定 browser-use 的已验证定位器；B-A-T 只分离 owner 生命周期。
        executable = LocalBrowserWatchdog._find_installed_browser_path('chrome')
        if not executable:
            raise ValueError('hybrid_managed_window_browser_missing')
        self.profile_path.mkdir(parents=True, exist_ok=True)
        for process in psutil.process_iter(['cmdline']):
            try:
                arguments = process.info['cmdline'] or []
                if any(value.startswith('--user-data-dir=') and _same_path(value.split('=', 1)[1], self.profile_path)
                       for value in arguments):
                    raise ValueError('hybrid_managed_window_profile_busy')
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        (self.profile_path / 'DevToolsActivePort').unlink(missing_ok=True)
        args = [str(executable), f'--user-data-dir={self.profile_path}', '--remote-debugging-port=0',
                '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', 'about:blank']
        # WHY：两个专属模式复用同一 Profile 和既有进程 owner；不要经 SDK 的 Chrome Profile 复制分支。
        if self.headless:
            args.insert(-1, '--headless=new')
        browser_temp = self.profile_path / 'browser-temp'
        browser_temp.mkdir(exist_ok=True)
        environment = os.environ.copy()
        # WHY：Runner 的临时目录必须能在控制进程退出时清理；交付后的 Chrome 不得继续占用它。
        environment.update({'TMP': str(browser_temp), 'TEMP': str(browser_temp), 'TMPDIR': str(browser_temp)})
        environment.pop('PLAYWRIGHT_BROWSERS_PATH', None)
        options = {'stdin': subprocess.DEVNULL, 'stdout': subprocess.DEVNULL,
                   'stderr': subprocess.DEVNULL, 'env': environment}
        if sys.platform == 'win32':
            options['creationflags'] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            options['start_new_session'] = True
        owner = subprocess.Popen(args, **options)
        lease.browserPid = owner.pid
        lease.browserStarted = psutil.Process(owner.pid).create_time()
        lease.browserExe = str(Path(executable).resolve())
        self._save(lease)
        for _attempt in range(80):
            if owner.poll() is not None:
                raise ValueError('hybrid_managed_window_launch_failed')
            try:
                lines = (self.profile_path / 'DevToolsActivePort').read_text(encoding='ascii').splitlines()
                lease.cdpPort = int(lines[0])
                lease.browserId = _browser_id(lease.cdpPort)
                self._save(lease)
                return lease
            except (FileNotFoundError, IndexError, ValueError, OSError):
                await asyncio.sleep(0.25)
        raise ValueError('hybrid_managed_window_cdp_unavailable')

    async def handoff(self, browser):
        if self.headless:
            raise ValueError('hybrid_managed_window_headless_handoff_unsupported')
        lease = self._load(self.owner_id)
        if lease.status != 'running' or browser.id != lease.sessionId:
            raise ValueError('hybrid_managed_window_session_changed')
        target_id = browser.agent_focus_target_id
        if not target_id:
            raise ValueError('hybrid_managed_window_target_missing')
        lease.targetId = target_id
        if not self._verify(lease)[0]:
            raise ValueError('hybrid_managed_window_unavailable')
        await browser.stop()
        if not self._verify(lease)[0]:
            raise ValueError('hybrid_managed_window_unavailable')
        lease.status = 'handoff'
        self._save(lease)
        self.transferred = True
        # WHY：交付证明原现场仍存活；系统前台权限属于用户显式 focus，不能覆盖完成结果或租约。
        return _state(lease, True)

    async def close(self, browser):
        if self.transferred or not self.acquired:
            return {'stage': 'browser_close', 'status': 'not_required', 'code': None}
        try:
            if browser is not None:
                await browser.stop()
            if self.path.exists():
                await self.end_gracefully(self.owner_id, allow_controlled=True)
        except Exception:
            return {'stage': 'browser_close', 'status': 'unconfirmed', 'code': 'cleanup_browser_close_failed'}
        return {'stage': 'browser_close', 'status': 'confirmed', 'code': None}

    async def end_gracefully(self, lease_id, *, allow_controlled=False):
        from browser_use_runner.attached_window import _client
        lease = self._load(lease_id)
        if lease.status != 'handoff' and not allow_controlled:
            raise ValueError('hybrid_managed_window_controlled')
        owner = _owner_process(lease)
        if owner is not None:
            # WHY：整浏览器关闭只用于已核验的专属进程；日常 Chrome 的 AttachedWindow 不调用此入口。
            if not self._verify(lease, require_target=False)[0]:
                raise ValueError('hybrid_managed_window_cdp_changed')
            try:
                async with _client(f'ws://127.0.0.1:{lease.cdpPort}/devtools/browser/{lease.browserId}',
                                   timeout=1.5, stop_timeout=0.3) as client:
                    await client.send.Browser.close()
            except Exception:
                pass  # 连接退出不能算清理证明，仍由原 owner/end 核验并清理。
            await asyncio.to_thread(psutil.wait_procs, [owner], timeout=0.5)
        return self.end(lease_id, allow_controlled=allow_controlled)

    def ensure_connection(self):
        if self.connection_lost:
            raise ValueError('hybrid_managed_window_connection_lost')
