"""Apply the existing HTTP access boundary between real native actions."""
import re

from browser_use.agent.views import ActionResult
from workflow_use.hybrid.evidence import gap
from workflow_use.hybrid.human_wait import HumanRequestParams, HumanWaitControl

ACCESS_ERROR = r'capture_(authentication_required|access_denied|rate_limited|server_error_5\d{2}|verification_required_[1-5]\d{2})'
VERIFICATION_ERROR = r'capture_verification_required_[1-5]\d{2}'


class AuthorAccessControl(HumanWaitControl):
    def __init__(self, browser, allowed_url, publish, guard):
        super().__init__(browser, allowed_url, publish)
        self.guard = guard
        self.access_failure = None
        self.access_paused_agent = None

    async def request(self, params):
        if self.publish is None:
            return ActionResult(error='hybrid_human_wait_unavailable')
        return await super().request(params)

    async def resume(self, waitpoint_id):
        pending = self.pending
        if pending and pending['id'] == str(waitpoint_id) and pending.get('accessBoundary'):
            # WHY：在宿主确认前拒绝未解除挑战，保留同一等待供用户继续处理，不能先切running再失败。
            self.guard((await self.identity())['url'])
        return await super().resume(waitpoint_id)

    async def after_action(self, agent, collector):
        """Settle observed access before native multi_act can dispatch its next action."""
        if self.pending is not None or self.access_failure is not None:
            return
        page = await self.browser.get_current_page()
        if page is None:
            return
        try:
            self.guard(await page.get_url())
        except RuntimeError as error:
            code = str(error)
            if not re.fullmatch(ACCESS_ERROR, code):
                raise
            if self.publish is not None and re.fullmatch(VERIFICATION_ERROR, code):
                await self.request(HumanRequestParams(reason='captcha', prompt='请在当前任务浏览器完成验证，再点击继续。'))
                self.pending['accessBoundary'] = True
                # WHY：只暂停原生批次；真人等待留在on_step_end，不能消耗step_timeout或另造动作循环。
                if not getattr(getattr(agent, 'state', None), 'paused', False):
                    agent.pause()
                    self.access_paused_agent = agent
            else:
                self.reject_access(agent, collector, code)

    def reject_access(self, agent, collector, code):
        if self.access_failure is None:
            collector.source_gaps.append(gap('invalid_source', [], code, 'reject_trace'))
            self.access_failure = code
        # WHY：不抛入Tools.act、不替换真实ActionResult；公开stop只阻断剩余派发及后续决策。
        agent.stop()

    async def finish_step(self, agent, collector, after_step):
        if self.pending is not None and self.pending.get('accessBoundary'):
            result = await after_step(agent)
            try:
                current = await self.wait_for_confirmation(collector)
                self.guard(current['url'])
                if self.access_paused_agent is agent and not getattr(getattr(agent, 'state', None), 'stopped', False):
                    agent.resume()
                return result
            except RuntimeError as error:
                code = str(error)
                if re.fullmatch(ACCESS_ERROR, code):
                    self.reject_access(agent, collector, code)
                raise
            finally:
                self.pending, self.access_paused_agent = None, None
        result = await super().finish_step(agent, collector, after_step)
        if self.access_failure is not None:
            raise RuntimeError(self.access_failure)
        page = await self.browser.get_current_page()
        if page is None:
            return result
        try:
            await self.check_access(await page.get_url(), collector)
        except RuntimeError as error:
            code = str(error)
            if not re.fullmatch(ACCESS_ERROR, code):
                raise
            # WHY：保留已观察来源和HTTP失败；由原生Agent.stop停止后续决策，不另造重试循环。
            self.reject_access(agent, collector, code)
            raise RuntimeError(code) from None
        return result

    async def check_access(self, url, collector):
        try:
            self.guard(url)
            return
        except RuntimeError as error:
            if self.publish is None or not re.fullmatch(VERIFICATION_ERROR, str(error)):
                raise
        # WHY：明确挑战复用宿主等待；这是访问状态，不伪造模型动作或显式人工节点的编译证据。
        await self.request(HumanRequestParams(reason='captcha', prompt='请在当前任务浏览器完成验证，再点击继续。'))
        self.pending['accessBoundary'] = True
        try:
            current = await self.wait_for_confirmation(collector)
            # 点击继续不是解除证据；仍带挑战标记/拒绝/退避时必须保留失败。
            self.guard(current['url'])
        finally:
            self.pending = None
