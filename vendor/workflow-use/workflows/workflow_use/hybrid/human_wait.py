"""One native authoring human wait; Agent.run continues to own the browser loop."""
import asyncio
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4

from browser_use.agent.views import ActionResult
from pydantic import Field, field_validator

from .evidence import Contract, digest


class HumanRequestParams(Contract):
    reason: Literal['login', 'captcha', 'confirmation', 'access']
    prompt: str = Field(min_length=1, max_length=500)


class HumanWaitParams(HumanRequestParams):
    """Legacy v1 evidence; existing compiled chains keep their original condition."""
    resumeUrl: str = Field(min_length=1, max_length=2048)

    @field_validator('resumeUrl')
    @classmethod
    def safe_url(cls, value):
        url = urlsplit(value)
        if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password:
            raise ValueError('human_resume_url_invalid')
        return value


class HumanWaitControl:
    def __init__(self, browser, allowed_url, publish):
        self.browser, self.allowed_url, self.publish = browser, allowed_url, publish
        self.pending = None

    async def identity(self):
        session, tab = self.browser.id, self.browser.agent_focus_target_id
        page = await self.browser.get_current_page()
        url = await page.get_url() if page is not None else None
        if (not tab or not url or self.browser.id != session
                or self.browser.agent_focus_target_id != tab or not self.allowed_url(url)):
            raise ValueError('hybrid_human_browser_identity_unavailable')
        return {'sessionId': session, 'tabId': str(tab), 'url': url}

    async def request(self, params):
        if self.pending is not None:
            raise ValueError('hybrid_human_wait_already_pending')
        if isinstance(params, HumanWaitParams) and not self.allowed_url(params.resumeUrl):
            raise ValueError('hybrid_human_resume_origin_denied')
        before = await self.identity()
        result = ActionResult(extracted_content='Human request registered. Continue only after host confirmation.',
                              long_term_memory='Human intervention requested through the host.')
        self.pending = {'id': str(uuid4()), 'params': params, 'before': before, 'after': None,
                        'event': asyncio.Event(), 'resultDigest': digest(result.model_dump(mode='json'))}
        return result

    async def resume(self, waitpoint_id):
        pending = self.pending
        if pending is None or pending['id'] != str(waitpoint_id) or pending['event'].is_set():
            raise ValueError('hybrid_human_wait_not_pending')
        current = await self.identity()
        if (current['sessionId'] != pending['before']['sessionId']
                or current['tabId'] != pending['before']['tabId']
                or (isinstance(pending['params'], HumanWaitParams)
                    and current['url'] != pending['params'].resumeUrl)):
            raise ValueError('hybrid_human_resume_state_mismatch')
        pending['after'] = current
        return {'resumed': True}

    def release(self, waitpoint_id):
        pending = self.pending
        if pending is None or pending['id'] != str(waitpoint_id) or pending['after'] is None:
            raise ValueError('hybrid_human_resume_not_confirmed')
        pending['event'].set()

    async def wait_for_confirmation(self, collector):
        pending = self.pending
        if pending is None:
            raise ValueError('hybrid_human_wait_not_pending')
        audit = getattr(collector, 'dispatch_audit', None)
        if audit is not None and audit.event_capture is not None:
            # WHY：人工事件不能混入自动动作；恢复仍用原控制会话和宿主确认，不新增等待引擎。
            await audit.event_capture.close()
        params = pending['params'].model_dump(mode='json')
        url = urlsplit(pending['before']['url'])
        self.publish({'id': pending['id'], 'reason': params['reason'], 'prompt': params['prompt'],
                      'origin': url.scheme + '://' + url.netloc})
        # 等待仍位于原Agent on_step_end中，在原生step_timeout之外。
        await pending['event'].wait()
        current = await self.identity()
        if (current['sessionId'] != pending['after']['sessionId']
                or current['tabId'] != pending['after']['tabId']
                or (isinstance(pending['params'], HumanWaitParams) and current != pending['after'])):
            raise ValueError('hybrid_human_resume_state_changed')
        return current

    async def finish_step(self, agent, collector, after_step):
        pending = self.pending
        if pending is None:
            return await after_step(agent)
        try:
            captured = collector.pending
            params = pending['params'].model_dump(mode='json')
            if captured is None or captured['action'] != {'bat_request_human': params}:
                raise ValueError('hybrid_human_capture_mismatch')
            collector.align_pending(agent.history)
            action_ref = collector.pending['actionId']
            current = await self.wait_for_confirmation(collector)
            legacy = isinstance(pending['params'], HumanWaitParams)
            await after_step(agent)
            if not collector.observations:
                raise ValueError('hybrid_human_post_observation_missing')
            post = collector.observations[-1]
            if not legacy:
                # WHY：确认后的授权内跳转可以继续；证据使用采集层实际稳定观察，不使用ACK时的旧URL。
                if (self.browser.id != current['sessionId'] or self.browser.agent_focus_target_id != current['tabId']
                        or post.tabId != current['tabId'] or not self.allowed_url(post.url)):
                    raise ValueError('hybrid_human_resume_state_changed')
                current = {**current, 'url': post.url}
            collector.observations[-1].facts.append(collector.value_fact('verified_human_resume', {
                'schemaVersion': ('bat.human-resume/v1' if isinstance(pending['params'], HumanWaitParams)
                                  else 'bat.human-resume/v2'), 'actionRef': action_ref,
                'waitpointId': pending['id'], 'params': params, 'argsDigest': digest(params),
                'before': pending['before'], 'after': current, 'resumed': True,
                'resultDigest': pending['resultDigest']}))
        finally:
            self.pending = None

    def cancel(self):
        self.pending = None


def register_human_wait_tool(tools):
    tools._bat_human_wait = None

    @tools.registry.action('Request the user to handle login, CAPTCHA, confirmation or access in this same '
        'browser tab. Give a short safe prompt. After confirmation, observe the actual page and continue. '
        'Never request passwords, cookies or CAPTCHA values. The host waits for explicit user confirmation.',
        param_model=HumanRequestParams)
    async def bat_request_human(params: HumanRequestParams):
        if tools._bat_human_wait is None:
            return ActionResult(error='hybrid_human_wait_unavailable')
        return await tools._bat_human_wait.request(params)


def human_step_callback(control, collector, after_step):
    if control is None:
        return after_step

    async def callback(agent):
        return await control.finish_step(agent, collector, after_step)
    return callback
