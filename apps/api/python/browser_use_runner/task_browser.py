"""Use native actor APIs on the BrowserSession's already managed target session."""
from browser_use import Browser
from browser_use.actor.page import Page


class TaskBrowser(Browser):
    async def get_current_page(self):
        target = await self.get_current_target_info()
        if not target:
            return None
        return await self._managed_page(target['targetId'])

    async def get_pages(self):
        # WHY：目标发现仍由原 SessionManager 决定；这里仅补上 Page 已公开支持的 session 参数。
        pages = await super().get_pages()
        return [await self._managed_page((await page.get_target_info())['targetId']) for page in pages]

    async def _managed_page(self, target_id):
        session = await self.get_or_create_cdp_session(target_id=target_id, focus=False)
        # WHY：默认 Actor 会额外 attach 并开启 Runtime 订阅；复用已验证会话保留原生动作/查询实现。
        # 来源：B-U eb4126921bea3373f91afc49fb4b59d6eda7fed6 actor/page.py Page.__init__。
        return Page(self, target_id, session_id=session.session_id)
