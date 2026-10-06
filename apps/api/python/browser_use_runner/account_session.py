"""Generic account library bridge over the original released owner window."""
import asyncio, hashlib, importlib.util, json
from pathlib import Path

from browser_use_runner.account_borrow import borrow_window
from browser_use_runner.account_sources import ROOT
from browser_use_runner.account_auth import capture, prepare, write, restore
from browser_use_runner.account_secrets import RollbackStore
from browser_use_runner.site_scope import origin


async def open_page(borrowed, payload):
    # WHY：人工登录打开沿 Playwright 原 API；首页重定向不是检查失败，不使用业务链精确 URL 后置条件。
    from playwright.async_api import TimeoutError as PlaywrightTimeout
    url, origins = payload['url'], payload['origins']
    if not origins or origin(url) not in origins:
        raise ValueError('account_navigation_outside_scope')
    if borrowed.page.url != url:
        try:
            await borrowed.page.goto(url, wait_until='domcontentloaded', timeout=30000)
        except PlaywrightTimeout:
            if origin(borrowed.page.url) not in origins:
                raise ValueError('account_navigation_unavailable')
    if origin(borrowed.page.url) not in origins:
        raise ValueError('account_navigation_outside_scope')
    return {'phase':'opened'}


def catalog():
    file = ROOT / 'vendor/account-checks/platforms.json'
    data = json.loads(file.read_text(encoding='utf-8'))
    evidence = ROOT / 'vendor/account-checks/evidence.py'
    if hashlib.sha256(evidence.read_bytes()).hexdigest() != data['evidenceSha256']:
        raise ValueError('account_platform_version_changed')
    return data, evidence


def module_from(file):
    spec = importlib.util.spec_from_file_location('bat_versioned_account_evidence', file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def handle(request):
    if request.kind == 'daily' and request.cdpUrl:
        from browser_use_runner.attached_window import AttachedWindow
        AttachedWindow(request.profilePath, request.ownerId, request.cdpUrl,
                       legacy_endpoint_verified=request.legacyEndpointVerified)._load(request.leaseId)
    store = RollbackStore(Path(request.profilePath).resolve().parents[1])
    payload = request.payload or {}
    if request.action == 'open_page':
        async with asyncio.timeout(40):
            async with borrow_window(request.profilePath, request.ownerId, request.leaseId, request.kind) as borrowed:
                return await open_page(borrowed, payload)
    if request.action in ('pick_marker', 'clear_marker'):
        from browser_use_runner.account_marker import pick
        async with asyncio.timeout(60):
            async with borrow_window(request.profilePath, request.ownerId, request.leaseId, request.kind) as borrowed:
                if request.action == 'clear_marker':
                    await borrowed.cdp.send('Overlay.setInspectMode', {'mode':'none', 'highlightConfig':{}})
                    return {'phase':'cleared'}
                return await pick(borrowed, payload['url'])
    if request.action == 'auth_abandon':
        # WHY：明确放弃只删除用户自己的加密恢复材料；不连接Chrome，也不因策略升级强迫重新授权。
        try:
            snapshot = store.load(payload['rollbackRef'])
        except FileNotFoundError:
            return {'phase':'abandoned'}
        expected = {'ownerId':str(request.ownerId),'leaseId':str(request.leaseId),'kind':request.kind,'platformId':request.platformId}
        if any(snapshot['binding'].get(k) != v for k,v in expected.items()):
            raise ValueError('account_rollback_owner_changed')
        store.remove(payload['rollbackRef'])
        return {'phase':'abandoned'}
    if request.action == 'auth_restore':
        # WHY：恢复使用DPAPI中固定的旧范围；目录升级不能把已授权的恢复变成不可操作。
        snapshot = store.load(payload['rollbackRef'])
        expected = {'ownerId':str(request.ownerId),'leaseId':str(request.leaseId),'kind':request.kind,'platformId':request.platformId}
        if any(snapshot['binding'].get(k) != v for k,v in expected.items()) or not snapshot.get('scope'):
            raise ValueError('account_rollback_owner_or_scope_changed')
        async with asyncio.timeout(60):
            async with borrow_window(request.profilePath, request.ownerId, request.leaseId, request.kind) as borrowed:
                return await restore(snapshot['scope'], borrowed, store, payload['rollbackRef'], snapshot['binding'])
    data, source = catalog()
    if request.catalogVersion != data['version'] or request.evidenceSha256 != data['evidenceSha256']:
        raise ValueError('account_platform_version_changed')
    platform = next((p for p in data['platforms'] if p['id'] == request.platformId), None)
    if platform is None:
        raise ValueError('account_platform_not_found')
    binding = {'ownerId': str(request.ownerId), 'leaseId': str(request.leaseId), 'kind': request.kind,
               'platformId': request.platformId, 'catalogVersion': request.catalogVersion, 'evidenceSha256': request.evidenceSha256}
    async with asyncio.timeout(60):
        async with borrow_window(request.profilePath, request.ownerId, request.leaseId, request.kind) as borrowed:
            if request.action in ('check', 'observe'):
                return await module_from(source).check(platform, borrowed, observe=request.action == 'observe')
            if request.action == 'auth_read':
                return await capture(platform, borrowed)
            if request.action == 'auth_prepare':
                return await prepare(platform, borrowed, store, payload['rollbackRef'], binding, payload['expected'])
            if request.action == 'auth_write':
                return await write(platform, borrowed, payload['state'], store, payload['rollbackRef'], binding)
            if request.action == 'auth_restore':
                return await restore(platform, borrowed, store, payload['rollbackRef'], binding)
            raise ValueError('account_session_action_unavailable')
