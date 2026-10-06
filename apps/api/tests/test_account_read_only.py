import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from workflow_use.hybrid.author_read_only import install_read_only


class ReadOnlyAuthorTests(unittest.TestCase):
    def test_read_and_exact_navigation_reuse_callback_but_writes_and_outside_navigation_stop(self):
        for name, args, allowed in [
            ('navigate', {'url': 'https://example.test/account', 'new_tab': False}, True),
            ('navigate', {'url': 'https://example.test/logout'}, False),
            ('navigate', {'url': 'https://example.test/account', 'new_tab': True}, False),
            ('input', {'index': 1, 'text': 'secret'}, False),
            ('click', {'index': 1}, False), ('bat_inspect_dom', {}, True),
            ('bat_read_fields', {}, True), ('done', {}, True),
        ]:
            with self.subTest(name=name, allowed=allowed):
                original = Mock()
                callbacks = SimpleNamespace(normalize_action=lambda _: None, before_dispatch=original,
                                            current_action={'actionName': name})
                install_read_only(callbacks, ['https://example.test/account'])
                callbacks.normalize_action(SimpleNamespace(model_dump=lambda **_: {name: args}))
                if allowed:
                    callbacks.before_dispatch()
                    original.assert_called_once()
                else:
                    with self.assertRaisesRegex(RuntimeError, 'author_read_only_action_denied'):
                        callbacks.before_dispatch()
                    original.assert_not_called()


if __name__ == '__main__':
    unittest.main()
