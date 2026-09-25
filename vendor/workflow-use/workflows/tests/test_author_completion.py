"""Protect explicit completion declarations across Browser-Use public registration."""
import json
import unittest
from types import SimpleNamespace

from pydantic import ValidationError

from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.author_tools import AuthorTools
from workflow_use.hybrid.registry import ActionRegistry


class AuthorCompletionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.output_model, self.unwrap = output_model_for({'type': 'null'}, 'CompletionOutput')
        self.tools = AuthorTools(output_model=self.output_model)

    def test_initial_and_agent_public_reregistration_have_identical_schema(self):
        initial = ActionRegistry.from_tools(self.tools)
        # Agent.__init__ uses this public hook before creating its action models.
        self.tools.use_structured_output_action(self.output_model)
        rebuilt = ActionRegistry.from_tools(self.tools)
        self.assertEqual(initial.schemaDigest, rebuilt.schemaDigest)
        self.assertIs(self.tools.get_output_model(), self.output_model)

    def test_success_and_reason_are_required_and_visible_to_the_model(self):
        model = self.tools.registry.registry.actions['done'].param_model
        schema = model.model_json_schema()
        self.assertEqual(set(schema['required']), {'success', 'reason', 'data'})
        self.assertEqual(schema['properties']['success']['type'], 'boolean')
        self.assertNotIn('default', schema['properties']['success'])
        for invalid in ({'reason': 'blocked', 'data': {'value': None}},
                        {'success': False, 'data': {'value': None}},
                        {'success': 'false', 'reason': 'blocked', 'data': {'value': None}}):
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                model.model_validate(invalid)

    async def test_explicit_failure_reuses_native_done_and_preserves_reason(self):
        result = await self.tools.registry.execute_action(
            'done', {'success': False, 'reason': 'The target changed before selection.', 'data': {'value': None}},
            browser_session=SimpleNamespace(downloaded_files=['existing-download.pdf'], cdp_client=None),
            file_system=SimpleNamespace())
        self.assertTrue(result.is_done)
        self.assertIs(result.success, False)
        self.assertEqual(json.loads(result.extracted_content), {'value': None})
        self.assertEqual(result.attachments, ['existing-download.pdf'])
        self.assertEqual(result.metadata['batCompletion'], {
            'success': False, 'reason': 'The target changed before selection.'})

    async def test_business_data_keeps_its_original_null_contract(self):
        model = self.tools.registry.registry.actions['done'].param_model
        with self.assertRaises(ValidationError):
            model.model_validate({'success': True, 'reason': 'Observed.', 'data': {'value': 'not-null'}})
        result = await self.tools.registry.execute_action(
            'done', {'success': True, 'reason': 'Observed.', 'data': {'value': None}},
            browser_session=SimpleNamespace(downloaded_files=[], cdp_client=None), file_system=SimpleNamespace())
        business_output = self.output_model.model_validate_json(result.extracted_content)
        self.assertIsNone(self.unwrap(business_output))
        self.assertIs(result.success, True)


if __name__ == '__main__':
    unittest.main()
