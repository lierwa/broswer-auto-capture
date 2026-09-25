"""Ordinary observations must refresh DOM without waiting for unused screenshots."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from browser_use_runner.hybrid_main import Runner
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.targets import TargetResolver


class OrdinaryObservationTests(unittest.IsolatedAsyncioTestCase):
    async def test_resolver_and_runner_refresh_dom_without_requesting_screenshots(self):
        url, target_id = 'https://fixture.invalid/', 'tab-1'
        page = SimpleNamespace(
            get_target_info=AsyncMock(return_value={'targetId': target_id}),
            get_url=AsyncMock(return_value=url))
        mapping = {}
        captures = []

        async def capture(*, include_screenshot=True, cached=False):
            self.assertFalse(include_screenshot)
            self.assertFalse(cached)
            captures.append(len(captures) + 1)
            mapping.clear()
            mapping[captures[-1]] = object()
            return SimpleNamespace(
                title='Fixture', tabs=[SimpleNamespace(target_id=target_id)],
                dom_state=SimpleNamespace(llm_representation=lambda: f'fresh-dom-{captures[-1]}'))

        browser = SimpleNamespace(id='session-1', agent_focus_target_id=target_id,
            get_current_page=AsyncMock(return_value=page),
            get_browser_state_summary=AsyncMock(side_effect=capture),
            get_selector_map=AsyncMock(side_effect=lambda: dict(mapping)))
        resolver = TargetResolver(browser)
        _, first, identity = await resolver._snapshot({'url': url})
        _, second = await resolver._refresh_snapshot(identity, {'url': url})
        self.assertEqual(set(first), {1})
        self.assertEqual(set(second), {2})

        runner = Runner()
        runner.browser = browser
        with patch('browser_use_runner.hybrid_main.current_document_id',
                   AsyncMock(side_effect=[ValueError('target_document_identity_unavailable'), 'document-1'])) as identity:
            observed = await runner.observe()
        self.assertEqual(captures, [1, 2, 3, 4])
        self.assertEqual(identity.await_count, 2)
        self.assertEqual(observed['documentId'], 'document-1')
        self.assertEqual(observed['observationDigest'], digest({
            'url': url, 'title': 'Fixture', 'documentDigest': digest('fresh-dom-4')}))
        self.assertNotIn('screenshot', observed)

        async def change_tab(_browser):
            browser.agent_focus_target_id = 'tab-2'
            return 'document-2'

        with patch('browser_use_runner.hybrid_main.current_document_id', AsyncMock(side_effect=change_tab)):
            with self.assertRaisesRegex(ValueError, 'hybrid_observation_identity_changed'):
                await runner.observe()
        self.assertEqual(captures, [1, 2, 3, 4, 5])


if __name__ == '__main__':
    unittest.main()
