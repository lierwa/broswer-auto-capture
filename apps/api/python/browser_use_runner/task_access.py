"""One admission step before the existing Fetch owner continues an owned request."""
import asyncio
from collections import Counter
import inspect
import json
import logging
import os
import hashlib
import traceback
from pathlib import Path

from browser_use_runner.access_cooldown import directory, remember
from browser_use_runner.access_policy import acquire

logger = logging.getLogger(__name__)


class Admission:
    def __init__(self, send):
        self.send = send
        self.tasks = set()
        self.counts = Counter()
        self.failure = None
        self.failure_details = None
        self.delegate = None

    async def close(self):
        pending = list(self.tasks)
        for task in pending: task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)

    def paused(self, event, session_id=None):
        task = asyncio.create_task(self.decide(event, session_id))
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    async def decide(self, event, session_id):
        request = event['requestId']
        resource = event.get('resourceType', 'Other')
        self.counts['attempt:' + resource] += 1
        try:
            if self.failure: raise RuntimeError(self.failure)
            if 'responseStatusCode' in event:
                headers = {item['name']: item['value'] for item in event.get('responseHeaders', [])}
                await asyncio.to_thread(remember, event['request']['url'], event['responseStatusCode'], headers)
                result = 'observed-response'
            else: result = await asyncio.to_thread(acquire, event['request']['url'])
            self.counts[result + ':' + resource] += 1
            if self.delegate:
                pending = self.delegate(event, session_id)
                if inspect.isawaitable(pending): await pending
            else:
                await self.continue_request(request, session_id, resource)
        except asyncio.CancelledError:
            self.counts['cancelled:' + resource] += 1
            await self.fail(request, session_id)
            raise
        except Exception as error:
            limited = str(error) in ('capture_rate_limited', 'capture_server_error_503')
            self.counts[('limited:' if limited else 'error:') + resource] += 1
            if not limited:
                self.failure = 'capture_access_state_unavailable'
                # WHY：保留准入首败的固定来源/摘要，不能只留下后续的页面读取失败；不保存请求或异常原文。
                if self.failure_details is None:
                    self.failure_details = {'errorType': type(error).__name__,
                        'errorDigest': hashlib.sha256(str(error).encode()).hexdigest(),
                        'locations': [{'source': Path(frame.filename).name, 'line': frame.lineno}
                            for frame in traceback.extract_tb(error.__traceback__)
                            if Path(frame.filename).name in ('task_access.py', 'access_policy.py', 'access_cooldown.py', 'client.py')]}
                logger.warning('access_admission_unavailable type=%s', type(error).__name__)
            await self.fail(request, session_id)

    async def continue_request(self, request, session_id, resource):
        try:
            await self.send('continueRequest', {'requestId': request}, session_id)
        except RuntimeError as error:
            detail = error.args[0] if error.args else None
            # WHY：原生拦截已消失不能污染后续请求；参考Playwright1.61的取消边界，范围更窄。
            # 不重发、不退回配额；仅送达阶段识别，策略/存储错误仍在decide中失败关闭。
            if not isinstance(detail, dict) or detail.get('code') != -32602 or detail.get('message') != 'Invalid InterceptionId.':
                raise
            self.counts['interception-gone:' + resource] += 1

    async def fail(self, request, session_id):
        try:
            await asyncio.wait_for(self.send('failRequest', {'requestId': request,
                'errorReason': 'BlockedByClient'}, session_id), 5)
        except Exception:
            logger.debug('access_request_already_closed')


class RequestGate(Admission):
    def __init__(self, client):
        super().__init__(lambda method, params, sid: getattr(client.send.Fetch, method)(params=params, session_id=sid))
        self.sessions, self.targets = set(), {}
        self.browser_session = None
        self.browser_lock = asyncio.Lock()
        registration = client.register.Fetch
        self.register = registration.requestPaused
        # 固定cdp-use1.4.5只保留一个callback；组合原责任方，不再并列注册竞争处理器。
        self.delegate = client._event_registry._handlers.get('Fetch.requestPaused')
        registration.requestPaused = self.replace_delegate
        self.register(self.paused)
        original_stop = client.stop
        async def stop():
            try:
                await self.close()
                if self.browser_session:
                    await client.send.Target.detachFromTarget(params={'sessionId': self.browser_session})
            finally: await original_stop()
        client.stop = stop

    def replace_delegate(self, callback):
        self.delegate = callback
        self.register(self.paused)

    def paused(self, event, session_id=None):
        if session_id not in self.sessions:
            if self.delegate: return self.delegate(event, session_id)
            return
        super().paused(event, session_id)

    async def attach_owned_browser(self, client):
        async with self.browser_lock:
            if self.browser_session: return
            sid = (await client.send.Target.attachToBrowserTarget())['sessionId']
            self.sessions.add(sid)
            try:
                # WHY：原生browser Fetch在网络factory建立前生效，覆盖暖SW首批；仅本次owned专属Profile有此授权。
                await client.send.Fetch.enable(params={'patterns': [
                    {'urlPattern': '*', 'requestStage': stage} for stage in ('Request', 'Response')]}, session_id=sid)
                async def send(method, params=None):
                    native = getattr(client.send.Target, method.split('.')[1])
                    # 此入口已限定owned专属Profile；SDK页面枚举仍受TargetScope保护。
                    if method == 'Target.getTargets': native = inspect.unwrap(native)
                    return await native(params=params or {}, session_id=sid)
                def listen(callback):
                    key = 'Target.receivedMessageFromTarget'
                    previous = client._event_registry._handlers.get(key)
                    def dispatch(event, session_id=None):
                        callback(event, session_id)
                        if previous: return previous(event, session_id)
                    client.register.Target.receivedMessageFromTarget(dispatch)
                    def remove():
                        if previous: client.register.Target.receivedMessageFromTarget(previous)
                        else: client._event_registry._handlers.pop(key, None)
                    return remove
                await refresh_owned_factories(send, listen)
                self.browser_session = sid
            except BaseException:
                self.sessions.discard(sid)
                await client.send.Target.detachFromTarget(params={'sessionId': sid})
                raise


async def borrow(cdp, *, observe_responses=False):
    if not configured(): return None
    admission = Admission(lambda method, params, _sid: cdp.send('Fetch.' + method, params))
    cdp.on('Fetch.requestPaused', admission.paused)
    try:
        stages = ['Request', 'Response'] if observe_responses else ['Request']
        await cdp.send('Fetch.enable', {'patterns': [{'urlPattern': '*', 'requestStage': stage} for stage in stages]})
        if observe_responses:
            def listen(callback):
                cdp.on('Target.receivedMessageFromTarget', callback)
                return lambda: cdp.remove_listener('Target.receivedMessageFromTarget', callback)
            await refresh_owned_factories(cdp.send, listen)
    except BaseException:
        cdp.remove_listener('Fetch.requestPaused', admission.paused)
        await admission.close()
        raise
    return admission


async def refresh_owned_factories(send, listen):
    # WHY：Chromium browser Fetch的更新callback为空；已存在的页面/worker仍持有旧factory。
    # 原Fetch空patterns只要求Chrome重建factory，不启用第二个拦截器、不重启/刷新页面。
    targets = await send('Target.getTargets')
    for target in targets['targetInfos']:
        # WHY：普通worker没有Fetch domain；Chrome由所属frame的Fetch更新其factory。
        # 直接向worker发送会以-32601中断暖恢复；共享/SW拥有独立Fetch，仍须更新。
        # 源码：Chromium 33a59a99 RenderFrameDevToolsAgentHost::UpdateResourceLoaderFactories。
        if target['type'] not in ('page', 'iframe', 'service_worker', 'shared_worker'): continue
        attached = await send('Target.attachToTarget', {'targetId': target['targetId'], 'flatten': False})
        sid, reply = attached['sessionId'], asyncio.get_running_loop().create_future()
        def received(event, _session_id=None):
            if event.get('sessionId') != sid or reply.done(): return
            message = json.loads(event['message'])
            if message.get('id') == 1: reply.set_result(message)
        remove = listen(received)
        try:
            await send('Target.sendMessageToTarget', {'sessionId': sid, 'message': json.dumps({
                'id': 1, 'method': 'Fetch.enable', 'params': {'patterns': []}})})
            result = await asyncio.wait_for(reply, 5)
            if 'error' in result: raise RuntimeError('access_worker_refresh_unavailable')
        finally:
            remove()
            await send('Target.detachFromTarget', {'sessionId': sid})


def configured():
    if directory(): return True
    if os.environ.get('BAT_ACCESS_POLICY_FILE'): raise ValueError('access_policy_state_required')
    return False


async def attach(browser, session, *, observe_responses=False):
    if not configured(): return
    client = session.cdp_client
    gate = getattr(client.send.Fetch, '_bat_access', None)
    if gate is None:
        gate = RequestGate(client)
        client.send.Fetch._bat_access = gate
    if gate.failure: raise RuntimeError(gate.failure)
    if getattr(browser, '_bat_managed_profile', False):
        await gate.attach_owned_browser(client)
        return
    if session.session_id in gate.sessions: return
    previous = gate.targets.get(session.target_id)
    active = browser.session_manager.get_all_sessions_for_target(session.target_id)
    # WHY：B-U池可能有同一target的多个原生session；Fetch会逐个暂停同一请求，只选一个准入责任方。
    if previous and any(item.session_id == previous for item in active): return
    if previous: gate.sessions.discard(previous)
    proxy = browser.browser_profile.proxy
    gate.sessions.add(session.session_id)
    gate.targets[session.target_id] = session.session_id
    try:
        stages = ['Request', 'Response'] if observe_responses else ['Request']
        await client.send.Fetch.enable(params={'patterns': [{'urlPattern': '*', 'requestStage': stage} for stage in stages],
            'handleAuthRequests': bool(proxy and proxy.username and proxy.password)}, session_id=session.session_id)
    except BaseException:
        gate.sessions.discard(session.session_id)
        gate.targets.pop(session.target_id, None)
        raise
