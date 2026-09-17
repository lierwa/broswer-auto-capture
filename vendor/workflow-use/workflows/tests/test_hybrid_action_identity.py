"""Native callback identities never fall back to callback counts or action values."""
import unittest
from types import SimpleNamespace

from workflow_use.hybrid.action_identity import resolve_history_step


class ActionIdentityTests(unittest.TestCase):
    def test_history_position_without_native_step_metadata_is_not_guessed(self):
        history = SimpleNamespace(history=[SimpleNamespace(metadata=None)])

        with self.assertRaisesRegex(ValueError, 'captured_history_step_unavailable'):
            resolve_history_step(history, 1)


if __name__ == '__main__':
    unittest.main()
