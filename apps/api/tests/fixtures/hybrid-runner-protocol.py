"""The active v2 runner cannot accept a legacy definition, model handle, or unchecked command."""
import unittest
from unittest.mock import patch
from browser_use_runner.hybrid_main import Runner

ID = '11111111-1111-4111-8111-111111111111'


class ProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def test_legacy_and_extra_model_fields_rejected_before_browser(self):
        runner = Runner()
        with patch('browser_use_runner.hybrid_main.Browser') as browser:
            for request in [
                {'id': ID, 'type': 'author', 'task': 'legacy'},
                {'id': ID, 'type': 'replay', 'definition': {'steps': []}},
                {'id': ID, 'type': 'hybrid_start', 'config': {'headless': True, 'allowedOrigins': ['https://fixture.invalid'], 'model': 'hidden'}},
                {'id': ID, 'type': 'hybrid_observe', 'extra': True},
            ]:
                with self.subTest(type=request['type']), self.assertRaises(ValueError):
                    await runner.handle(request)
            browser.assert_not_called()
        self.assertIsNone(runner.browser)

    async def test_origin_is_exact_and_close_without_start_is_idempotent(self):
        runner = Runner()
        with patch('browser_use_runner.hybrid_main.Browser') as browser:
            for origin in ('file:///tmp/file', 'https://fixture.invalid/path', 'https://user:pass@fixture.invalid'):
                with self.subTest(origin=origin), self.assertRaises(ValueError):
                    await runner.handle({'id': ID, 'type': 'hybrid_start', 'config': {'headless': True, 'allowedOrigins': [origin]}})
            browser.assert_not_called()
        self.assertEqual(await runner.close(), {'closed': True})
        self.assertEqual(await runner.close(), {'closed': True})


if __name__ == '__main__':
    unittest.main()
