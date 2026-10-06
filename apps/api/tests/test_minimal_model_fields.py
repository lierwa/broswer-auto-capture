"""Protect source recovery against model-facing field reductions; hashes come from the pre-change registry."""
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

from browser_use_runner.output_schema import output_model_for
from browser_use_runner.hybrid_compile import matching_registry
from pydantic import TypeAdapter
from workflow_use.hybrid.request import ResultSpec


class MinimalModelFieldsCompatibilityTests(unittest.TestCase):
    def test_exact_prechange_registries_remain_readable(self):
        snapshots = json.loads((Path(__file__).parent / 'fixtures/legacy-model-registry-20261006.json').read_text())
        for snapshot in snapshots:
            mode = snapshot['mode']
            schema = {'type': 'null'} if mode == 'execution' else {'type': 'array', 'items': {'type': 'string'}}
            spec = {'contractVersion': 'bat-result-spec/v1', 'mode': mode}
            if mode == 'data':
                spec.update(schema=schema, fields=[{'path': [], 'description': 'records', 'producerRef': 'records'}], edgeCases=[])
            output_model, _ = output_model_for(schema, 'LegacyProof')
            request = SimpleNamespace(plan=SimpleNamespace(resultSpec=TypeAdapter(ResultSpec).validate_python(spec)),
                actionRegistryVersion=snapshot['exactLegacyDigest'])
            with self.subTest(mode=mode, human=snapshot['human'], selection=snapshot['selection']):
                registry = matching_registry(output_model, request)
                self.assertEqual(registry.schemaDigest, snapshot['exactLegacyDigest'])
                if mode == 'execution':
                    registry.validate_action('done', {'success': True, 'reason': 'Observed.', 'readRefs': []})


if __name__ == '__main__':
    unittest.main()
