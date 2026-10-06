"""A previous compiler outcome must not poison recovery or hide source corruption."""
import unittest
from types import SimpleNamespace as NS
from unittest.mock import patch

from browser_use_runner.hybrid_compile import compile_offline
from workflow_use.hybrid.evidence import digest, gap


class OfflineCompilationOutcomeTests(unittest.IsolatedAsyncioTestCase):
    async def test_recompile_rechecks_outcomes_and_preserves_source_failures(self):
        previous = gap('invalid_source', [], 'hybrid_compilation_host_rejected', 'reject_trace')
        missing = gap('missing_observation', ['a-0001'], 'observation_missing', 'collect_evidence')
        unknown = gap('invalid_source', [], 'unknown_source_failure', 'reject_trace')
        specific = gap('invalid_source', ['a-0001'], previous.reason, 'reject_trace')
        original = [previous, missing, unknown, specific]
        for completed in (True, False):
            with self.subTest(completed=completed):
                source = NS(trace=NS(completed=completed), plan=NS(outputSchemaDigest=digest({'type': 'null'})))
                request = NS(request=source, sourceGaps=list(original), outputSchema={'type': 'null'}, verifiedChildren=[])
                with patch('browser_use_runner.hybrid_compile.output_model_for', return_value=(None, None)), \
                     patch('browser_use_runner.hybrid_compile.matching_registry', return_value='registry'), \
                     patch('browser_use_runner.hybrid_compile.compilation_response', return_value='new-result') as compile:
                    self.assertEqual(await compile_offline(request), 'new-result')
                    self.assertEqual(compile.call_args.args[3], original[1:] if completed else original)
                    self.assertEqual(request.sourceGaps, original)


if __name__ == '__main__':
    unittest.main()
