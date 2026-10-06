"""The real Python wire boundary admits explicit empty supplemental checks."""
import unittest
from pydantic import ValidationError
from browser_use_runner.hybrid_commands import COMMAND


class NativeActionProtocolTests(unittest.TestCase):
    def test_empty_checks_are_explicit_not_missing_or_invalid(self):
        command = {'name': 'browser.workflow-step', 'version': 2, 'actionName': 'click',
                   'args': {}, 'target': {'strategy': 'xpath', 'value': '//button'}, 'postconditions': []}
        self.assertEqual(COMMAND.validate_python(command).postconditions, [])
        for invalid in (None, [None]):
            with self.assertRaises(ValidationError):
                COMMAND.validate_python({**command, 'postconditions': invalid})
        del command['postconditions']
        with self.assertRaises(ValidationError):
            COMMAND.validate_python(command)


if __name__ == '__main__':
    unittest.main()
