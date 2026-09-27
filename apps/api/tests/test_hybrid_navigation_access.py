"""Keep same-dispatch HTTP rejection when the native navigation already reports failure."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use_runner.hybrid_main import Runner, document_key

URL = 'https://fixture.invalid/private'
COMMAND = {'name': 'browser.workflow-step', 'version': 2, 'actionName': 'navigate',
           'args': {'url': URL, 'new_tab': False}, 'target': None,
           'postconditions': [{'kind': 'url', 'bindingArgument': 'url'}]}


class NavigationAccessTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_navigation_classifies_only_fresh_same_document_response(self):
        for old, observed, expected in (
            (None, URL, 'capture_authentication_required'),
            (None, None, 'ordinary_action_failed'),
            (401, None, 'ordinary_action_failed'),
            (None, URL + '/other', 'ordinary_action_failed'),
        ):
            with self.subTest(old=old, observed=observed):
                runner = Runner()
                runner.browser = SimpleNamespace()
                runner.allowed_sites = [{'scheme': 'https', 'domain': 'fixture.invalid',
                                         'port': None, 'includeSubdomains': False}]
                if old is not None:
                    runner.document_status[document_key(URL)] = old
                async def dispatch(*_args):
                    if observed is not None:
                        runner.record_document_response({'type': 'Document',
                            'response': {'url': observed, 'status': 401}}, None)
                    raise RuntimeError('ordinary_action_failed')
                action = AsyncMock(side_effect=dispatch)
                runner.capability = SimpleNamespace(execute_checked=action)
                with self.assertRaisesRegex(RuntimeError, '^' + expected + '$'):
                    await runner.execute(COMMAND)
                self.assertEqual(action.await_count, 1)
                self.assertEqual(runner.commands, 1)
