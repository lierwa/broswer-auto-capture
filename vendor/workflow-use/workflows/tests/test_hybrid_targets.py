"""DOM targets bind redacted URL identity to the complete live URL digest."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.targets import TargetResolver


class TargetScopeTests(unittest.IsolatedAsyncioTestCase):
    def page(self, url):
        element = SimpleNamespace(get_basic_info=AsyncMock(return_value={'backendNodeId': 10}))
        return SimpleNamespace(
            get_target_info=AsyncMock(return_value={'targetId': 'target-1'}),
            get_url=AsyncMock(return_value=url),
            get_elements_by_css_selector=AsyncMock(return_value=[element]),
        )

    async def resolve(self, page, scope):
        browser = SimpleNamespace(get_current_page=AsyncMock(return_value=page))
        mapping = {7: {'backend_node_id': 10, 'target_id': 'target-1', 'frame_id': None}}
        target = {'strategy': 'css', 'value': '#control', 'scope': scope}
        return await TargetResolver(browser).resolve_action_index_from_snapshot(target, mapping, 'target-1')

    async def test_same_path_with_different_query_digest_rejects_before_dom_query(self):
        live_url = 'https://fixture.invalid/list?filter=closed'
        page = self.page(live_url)
        scope = {'url': 'https://fixture.invalid/list',
                 'urlDigest': digest('https://fixture.invalid/list?filter=open')}

        with self.assertRaisesRegex(ValueError, 'target_scope_mismatch'):
            await self.resolve(page, scope)

        page.get_elements_by_css_selector.assert_not_awaited()

    async def test_matching_complete_url_digest_resolves_target(self):
        live_url = 'https://fixture.invalid/list?filter=open'
        page = self.page(live_url)
        scope = {'url': 'https://fixture.invalid/list', 'urlDigest': digest(live_url)}

        self.assertEqual(await self.resolve(page, scope), 7)
        page.get_elements_by_css_selector.assert_awaited_once_with('#control')

    async def test_legacy_scope_without_digest_keeps_exact_url_behavior(self):
        live_url = 'https://fixture.invalid/list?filter=open'
        self.assertEqual(await self.resolve(self.page(live_url), {'url': live_url}), 7)

        path_only = self.page(live_url)
        with self.assertRaisesRegex(ValueError, 'target_scope_mismatch'):
            await self.resolve(path_only, {'url': 'https://fixture.invalid/list'})
        path_only.get_elements_by_css_selector.assert_not_awaited()

    async def test_public_scope_assertion_reuses_full_url_and_target_identity(self):
        live_url = 'https://fixture.invalid/list?filter=open'
        page = self.page(live_url)
        resolver = TargetResolver(SimpleNamespace(get_current_page=AsyncMock(return_value=page)))
        scope = {'url': 'https://fixture.invalid/list', 'urlDigest': digest(live_url)}

        target_id = await resolver.assert_scope(scope)
        self.assertEqual(target_id, 'target-1')
        self.assertEqual(await resolver.assert_scope(scope, target_id), 'target-1')

        page.get_url.return_value = 'https://fixture.invalid/list?filter=closed'
        with self.assertRaisesRegex(ValueError, 'target_scope_mismatch'):
            await resolver.assert_scope(scope, target_id)


if __name__ == '__main__':
    unittest.main()
