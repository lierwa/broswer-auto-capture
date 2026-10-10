"""Apply the existing HTTP access boundary at B-U's public end-of-step hook."""
import re

from browser_use.agent.views import ActionResult
from workflow_use.hybrid.evidence import gap
from workflow_use.hybrid.human_wait import HumanRequestParams, HumanWaitControl


class AuthorAccessControl(HumanWaitControl):
    def __init__(self, browser, allowed_url, publish, guard):
        super().__init__(browser, allowed_url, publish)
        self.guard = guard

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

    async def finish_step(self, agent, collector, after_step):
        result = await super().finish_step(agent, collector, after_step)
        page = await self.browser.get_current_page()
        if page is None:
            return result
        try:
            await self.check_access(await page.get_url(), collector)
        except RuntimeError as error:
            code = str(error)
            if not re.fullmatch(r'capture_(authentication_required|access_denied|rate_limited|server_error_5\d{2}|verification_required_[1-5]\d{2})', code):
                raise
            # WHY：保留已观察来源和HTTP失败；由原生Agent.stop停止后续决策，不另造重试循环。
            collector.source_gaps.append(gap('invalid_source', [], code, 'reject_trace'))
            agent.stop()
            raise RuntimeError(code) from None
        return result

    async def check_access(self, url, collector):
        try:
            self.guard(url)
            return
        except RuntimeError as error:
            if self.publish is None or not re.fullmatch(r'capture_verification_required_[1-5]\d{2}', str(error)):
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
