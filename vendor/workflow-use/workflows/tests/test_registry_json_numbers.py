"""Preserve JSON numeric values across JavaScript serialization and native Pydantic normalization."""
import unittest
from types import SimpleNamespace

from browser_use import Tools
from jsonschema.exceptions import ValidationError

from workflow_use.hybrid.registry import ActionRegistry


class RegistryJsonNumberTests(unittest.TestCase):
    def test_native_scroll_accepts_equal_integer_float_and_rejects_coercion(self):
        registry = ActionRegistry.from_tools(Tools())
        for pages in (4, 4.5):
            result = registry.validate_action('scroll', {'down': True, 'pages': pages})
            self.assertEqual(result.model_dump(mode='json', exclude_unset=True)['scroll']['pages'], pages)
        for pages in (True, '4'):
            with self.assertRaises(ValidationError):
                registry.validate_action('scroll', {'down': True, 'pages': pages})

    def test_post_validation_value_change_is_still_refused(self):
        registry = ActionRegistry.from_tools(Tools())
        registry._action_model = SimpleNamespace(model_validate=lambda _value: SimpleNamespace(
            model_dump=lambda **_kwargs: {'scroll': {'down': True, 'pages': 5.0}}))
        with self.assertRaisesRegex(ValueError, '^action_arguments_changed_by_validation$'):
            registry.validate_action('scroll', {'down': True, 'pages': 4})
