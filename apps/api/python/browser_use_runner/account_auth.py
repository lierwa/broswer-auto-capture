"""Scoped incremental state transfer using native CDP and Windows DPAPI."""
import base64, hashlib, hmac, json, secrets
from urllib.parse import urlsplit
from copy import deepcopy
from pathlib import Path

from browser_use_runner.account_secrets import RollbackStore


def canonical(state):
    cookies = [{k: cookie[k] for k in ('name', 'domain', 'path', 'value', 'secure', 'httpOnly', 'sameSite', 'partitionKey', 'expires')
                if k in cookie} for cookie in state['cookies']]
    cookies.sort(key=lambda item: (item['domain'], item['path'], item['name'], json.dumps(item.get('partitionKey'))))
    return json.dumps({'cookies': cookies, 'storage': state['storage']}, sort_keys=True, separators=(',', ':')).encode()


def fingerprint(state, key):
    return hmac.new(base64.b64decode(key), canonical(state), hashlib.sha256).hexdigest()


def cookie_key(cookie):
    return (cookie['domain'], cookie['path'], cookie['name'], json.dumps(cookie.get('partitionKey'), sort_keys=True))


def admissible(cookie, platform):
    domain = cookie['domain'].lstrip('.')
    return (cookie['name'] in platform.get('cookieNames', []) and
            any(domain == approved or domain.endswith('.' + approved) for approved in platform['cookieDomains']))


async def capture(platform, borrowed):
    if not platform.get('cookieNames'):
        raise ValueError('account_authentication_scope_unverified')
    cookies = [cookie for cookie in await borrowed.cookies(platform['cookieUrls']) if admissible(cookie, platform)]
    if any(cookie.get('partitionKeyOpaque') for cookie in cookies):
        raise ValueError('account_opaque_cookie_partition_unsupported')
    storage = {}
    for origin, keys in platform.get('localStorageKeys', {}).items():
        if origin not in platform['origins']:
            raise ValueError('account_storage_scope_denied')
        await storage_origin(borrowed, origin)
        values = await borrowed.page.evaluate('keys => Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]))', keys)
        storage[origin] = values
    return {'cookies': cookies, 'storage': storage}


async def storage_origin(borrowed, origin):
    def actual():
        url = urlsplit(borrowed.page.url)
        return f'{url.scheme}://{url.netloc}'
    if actual() != origin:
        await borrowed.page.goto(origin, timeout=15000, wait_until='domcontentloaded')
    if actual() != origin:
        raise ValueError('account_storage_scope_denied')


def validate_state(state, platform):
    if set(state) != {'cookies', 'storage'} or any(not admissible(cookie, platform) for cookie in state['cookies']):
        raise ValueError('account_authentication_scope_denied')
    for origin, values in state['storage'].items():
        if origin not in platform.get('localStorageKeys', {}) or any(k not in platform['localStorageKeys'][origin] for k in values):
            raise ValueError('account_storage_scope_denied')


async def prepare(platform, borrowed, store, reference, binding, expected):
    before = await capture(platform, borrowed)
    # WHY：保存前再次比较已确认的目标状态，避免read→prepare之间用户改号被当成可覆盖备份。
    if canonical(before) != canonical(expected):
        raise ValueError('account_transfer_target_changed')
    secret = base64.b64encode(secrets.token_bytes(32)).decode()
    snapshot = {'schemaVersion': 1, 'binding': binding, 'scope': deepcopy(platform), 'before': before, 'key': secret,
                'allowedDigests': [fingerprint(before, secret)], 'phase': 'rollback_ready'}
    store.save(reference, snapshot)
    if store.load(reference) != snapshot:
        raise ValueError('account_rollback_snapshot_verification_failed')
    return {'rollbackRef': reference, 'phase': 'rollback_ready'}


async def write(platform, borrowed, state, store, reference, binding):
    validate_state(state, platform)
    snapshot = store.load(reference)
    if snapshot['binding'] != binding or snapshot['phase'] != 'rollback_ready':
        raise ValueError('account_rollback_owner_or_phase_changed')
    before = await capture(platform, borrowed)
    if canonical(before) != canonical(snapshot['before']):
        raise ValueError('account_transfer_target_changed')
    secret = snapshot['key']
    current = deepcopy(before)
    desired = {cookie_key(cookie): cookie for cookie in state['cookies']}
    mutations = [('remove', cookie) for cookie in before['cookies'] if cookie_key(cookie) not in desired]
    mutations += [('put', cookie) for cookie in state['cookies']]
    for action, cookie in mutations:
        intended = deepcopy(current)
        intended['cookies'] = [c for c in intended['cookies'] if cookie_key(c) != cookie_key(cookie)]
        if action == 'put':
            intended['cookies'].append(cookie)
        # WHY：写前存允许的前/后摘要；崩溃窗口里没有源令牌备份，重启仍能拒绝用户改号后的覆盖。
        snapshot.update(phase='write_started', allowedDigests=[fingerprint(current, secret), fingerprint(intended, secret)])
        store.save(reference, snapshot)
        await (borrowed.remove_cookie(cookie) if action == 'remove' else borrowed.put_cookies([cookie]))
        current = await capture(platform, borrowed)
        if canonical(current) != canonical(intended):
            raise ValueError('account_transfer_target_changed')
        snapshot['allowedDigests'] = [fingerprint(current, secret)]
        store.save(reference, snapshot)
    for origin, values in state['storage'].items():
        await storage_origin(borrowed, origin)
        for name, value in values.items():
            intended = deepcopy(current)
            intended['storage'].setdefault(origin, {})[name] = value
            snapshot.update(phase='write_started', allowedDigests=[fingerprint(current, secret), fingerprint(intended, secret)])
            store.save(reference, snapshot)
            await borrowed.page.evaluate('({name,value}) => { if(value===null) localStorage.removeItem(name); else localStorage.setItem(name,value) }',
                                         {'name': name, 'value': value})
            current = await capture(platform, borrowed)
            if canonical(current) != canonical(intended):
                raise ValueError('account_transfer_target_changed')
            snapshot['allowedDigests'] = [fingerprint(current, secret)]
            store.save(reference, snapshot)
    snapshot['phase'] = 'written'
    store.save(reference, snapshot)
    return {'rollbackRef': reference, 'phase': 'written'}


async def restore(platform, borrowed, store, reference, binding):
    snapshot = store.load(reference)
    if snapshot.get('schemaVersion') != 1 or snapshot['binding'] != binding:
        raise ValueError('account_rollback_owner_or_version_changed')
    current = await capture(platform, borrowed)
    if fingerprint(current, snapshot['key']) not in snapshot['allowedDigests']:
        raise ValueError('account_rollback_target_changed')
    before = snapshot['before']
    validate_state(before, platform)
    # 原快照在恢复期间仍保留。逐项逆操作与写入同样记录安全前/后摘要。
    desired = {cookie_key(cookie): cookie for cookie in before['cookies']}
    mutations = [('remove', cookie) for cookie in current['cookies'] if cookie_key(cookie) not in desired]
    mutations += [('put', cookie) for cookie in before['cookies']]
    for action, cookie in mutations:
        intended = deepcopy(current)
        intended['cookies'] = [c for c in intended['cookies'] if cookie_key(c) != cookie_key(cookie)]
        if action == 'put':
            intended['cookies'].append(cookie)
        snapshot.update(phase='rolling_back', allowedDigests=[fingerprint(current, snapshot['key']), fingerprint(intended, snapshot['key'])])
        store.save(reference, snapshot)
        await (borrowed.remove_cookie(cookie) if action == 'remove' else borrowed.put_cookies([cookie]))
        current = await capture(platform, borrowed)
        if canonical(current) != canonical(intended):
            raise ValueError('account_rollback_target_changed')
        snapshot['allowedDigests'] = [fingerprint(current, snapshot['key'])]
        store.save(reference, snapshot)
    for origin, values in before['storage'].items():
        await storage_origin(borrowed, origin)
        for name, value in values.items():
            intended = deepcopy(current)
            intended['storage'].setdefault(origin, {})[name] = value
            snapshot.update(phase='rolling_back', allowedDigests=[fingerprint(current, snapshot['key']), fingerprint(intended, snapshot['key'])])
            store.save(reference, snapshot)
            await borrowed.page.evaluate('({name,value}) => { if(value===null) localStorage.removeItem(name); else localStorage.setItem(name,value) }',
                                         {'name': name, 'value': value})
            current = await capture(platform, borrowed)
            if canonical(current) != canonical(intended):
                raise ValueError('account_rollback_target_changed')
            snapshot['allowedDigests'] = [fingerprint(current, snapshot['key'])]
            store.save(reference, snapshot)
    if canonical(current) != canonical(before):
        raise ValueError('account_rollback_verification_failed')
    store.remove(reference)
    return {'phase': 'rolled_back'}
