"""Persist server cooldowns and transient-failure backoff; never retry an action."""
import hashlib
from collections import deque
import json
import math
import os
from pathlib import Path
import time
from urllib.parse import urlsplit

from diskcache import Cache
from urllib3.exceptions import InvalidHeader
from urllib3.util import Retry
from urllib3.util.retry import RequestHistory


class DocumentResponses(dict):
    """One HTTP response may be observed on multiple existing CDP sessions."""
    def __init__(self):
        super().__init__()
        self.seen = deque(maxlen=1024)
        self.verification = set()

    def record(self, event, *, persist_cooldown=True):
        response = event['response']
        identity = (event.get('requestId'), event.get('loaderId'), response['url'])
        if identity[0] is not None:
            if identity in self.seen:
                return
            self.seen.append(identity)
        status = response.get('status')
        # WHY：用原requestId/loader/URL去重；不同CDP会话的接收时间可不同，不能当请求身份。
        if persist_cooldown:
            remember(response['url'], status, response.get('headers'))
        if event.get('type') == 'Document' and type(status) in (int, float):
            target = document_key(response['url'])
            self[target] = int(status)
            self.verification.discard(target)
            # WHY：复用公开挑战响应协议，只标记主文档；普通403和PAT子请求不能变成人工验证。
            headers = response.get('headers') or {}
            if isinstance(headers, dict) and any(str(name).lower() == 'cf-mitigated' and value == 'challenge'
                                                  for name, value in headers.items()):
                self.verification.add(target)

    def pop(self, target, default=None):
        self.verification.discard(target)
        return super().pop(target, default)

    def error_for(self, url):
        target = document_key(url)
        status = self.get(target)
        if target in self.verification and type(status) is int and 100 <= status <= 599:
            return f'capture_verification_required_{status}'
        return external_document_error(status)


def external_document_error(status):
    if status == 401: return 'capture_authentication_required'
    if status == 403: return 'capture_access_denied'
    if status == 429: return 'capture_rate_limited'
    if isinstance(status, int) and 500 <= status <= 599: return f'capture_server_error_{status}'
    return None


def document_key(url):
    return urlsplit(url)._replace(fragment='').geturl()


def key(url):
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        return None
    host = parsed.hostname.encode('idna').decode().lower()
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    return hashlib.sha256(f'{parsed.scheme}://{host}:{port}'.encode()).hexdigest()


def directory():
    value = os.environ.get('BAT_ACCESS_STATE_DIR')
    if value and not Path(value).is_absolute():
        raise ValueError('access_state_absolute_path_required')
    return value


def guard(url):
    target, storage = key(url), directory()
    if not target or not storage:
        return
    with Cache(storage, eviction_policy='none') as cache:
        raw = cache.get(target)
    if raw is None:
        return
    record = json.loads(raw)
    if record['until'] > time.time():
        raise RuntimeError('capture_rate_limited' if record['status'] == 429 else 'capture_server_error_503')


def restrict_by_policy(url, seconds):
    target, storage = key(url), directory()
    if not target or not storage: raise ValueError('access_policy_state_required')
    until = time.time() + seconds
    with Cache(storage, eviction_policy='none') as cache, cache.transact():
        raw = cache.get(target)
        current = json.loads(raw) if raw is not None else {}
        if current.get('until', 0) > until: return
        # WHY：复用已验证的到期/恢复通路；来源明确为本地策略，不伪造HTTP响应记录。
        cache.set(target, json.dumps(dict(until=until, status=429, source='declared-policy',
                  failures=current.get('failures', 0))), expire=max(seconds, 3600))


def remember(url, status, headers):
    target, storage = key(url), directory()
    if not target or not storage or type(status) not in (int, float):
        return
    if status not in (429, 503) and not 200 <= status < 400:
        return
    now = time.time()
    # WHY：次数与截止时间在同一原生事务内保存；成功的旁路请求不能消除尚未结束的冷却。
    with Cache(storage, eviction_policy='none') as cache, cache.transact():
        raw = cache.get(target)
        current = json.loads(raw) if raw is not None else {}
        if status not in (429, 503):
            if current.get('until', 0) <= now:
                cache.delete(target)
            return
        failures = min(current.get('failures', 0) + 1, 4)
        seconds = retry_after(headers)
        if seconds is None:
            # TRADE-OFF：站点未给期限时从30秒退避，复用urllib3指数算法/抖动/120秒上限；
            # 这只是下次访问准入，不睡眠重试、不调用模型、不推导网站的小时/日配额。
            history = (RequestHistory(None, None, None, int(status), None),) * failures
            seconds = max(30, Retry(total=False, backoff_factor=30, backoff_jitter=1,
                                   history=history).get_backoff_time())
        until = now + seconds
        if current.get('until', 0) > until:
            until, status = current['until'], current['status']
        cache.set(target, json.dumps({'until': until, 'status': int(status), 'failures': failures}),
                  expire=max(until - now, 3600))


def retry_after(headers):
    value = next((v for k, v in headers.items() if isinstance(k, str) and k.lower() == 'retry-after'), None) \
        if isinstance(headers, dict) else None
    if not isinstance(value, str) or not value or len(value) > 128:
        return None
    try:
        # WHY：只复用原HTTP日期/秒数解析；不使用Retry的网络重试，不把其默认6小时上限缩短站点冷却。
        seconds = Retry(total=False, retry_after_max=math.inf).parse_retry_after(value)
    except (InvalidHeader, ValueError, OverflowError):
        return None
    return seconds if math.isfinite(seconds) and seconds >= 0 else None
