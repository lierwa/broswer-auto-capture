"""Only the current public tool registry can recompile a source."""
import unittest
from types import SimpleNamespace
from pydantic import TypeAdapter
from browser_use_runner.hybrid_compile import matching_registry
from workflow_use.hybrid.author import author_tools_for_result_spec
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.request import ResultSpec


class MinimalModelFieldsTests(unittest.TestCase):
    def test_current_registry_exact_digest_and_tampered_digest_refusal(self):
        for mode in ('execution', 'data'):
            raw = {'contractVersion': 'bat-result-spec/v1', 'mode': mode}
            if mode == 'data':
                raw.update(schema={'type': 'array', 'items': {'type': 'string'}},
                    fields=[{'path': [], 'description': 'records', 'producerRef': 'records'}], edgeCases=[])
            spec = TypeAdapter(ResultSpec).validate_python(raw)
            tools = author_tools_for_result_spec(spec, source_protocol='bat-hybrid/3')
            tools.exclude_action('screenshot')
            current = ActionRegistry.from_tools(tools)
            request = SimpleNamespace(plan=SimpleNamespace(resultSpec=spec), compilerVersion='bat-hybrid/3',
                actionRegistryVersion=current.schemaDigest)
            self.assertEqual(matching_registry(request).schemaDigest, current.schemaDigest)
            current.validate_action('done', {'success': True, 'text': 'Observed.'})
            request.actionRegistryVersion = '0' * 64
            with self.assertRaisesRegex(ValueError, 'hybrid_action_registry_mismatch'):
                matching_registry(request)


if __name__ == '__main__':
    unittest.main()
