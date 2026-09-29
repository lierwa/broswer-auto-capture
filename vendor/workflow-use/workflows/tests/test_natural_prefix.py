"""Prefix-only invariants: method dependencies, causal barriers, immutable final semantics."""
import copy
import unittest
from types import SimpleNamespace

from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.natural_compile import natural_postconditions
from workflow_use.hybrid.natural_prefix import compile_natural_prefix, prefix_edges
from test_consumer_readiness import observation, readiness_trace
from test_natural_repeat import repeat_source


def prefix_of(request, count):
    copied = request.model_copy(deep=True)
    body = copied.trace.model_dump(mode='json', exclude={'digest'})
    body.update(completed=False, finalResultRef=None, actions=body['actions'][:count],
                observations=body['observations'][:count * 2])
    for item in body['observations']:
        item['facts'] = [fact for fact in item['facts'] if fact['kind'] not in ('repeat_method', 'verified_output_assembly')]
    copied.trace = type(copied.trace).model_validate({**body, 'digest': digest(body)})
    return copied


class NaturalPrefixTests(unittest.TestCase):
    def test_equivalent_href_waits_for_proven_repeat_not_a_fixed_sample(self):
        request, registry, schema = repeat_source(duplicate_links=2)
        original = copy.deepcopy(request)
        early = compile_natural_prefix(prefix_of(request, 3), registry, output_schema=schema)
        self.assertEqual(early.gaps, [])
        self.assertEqual([(item.actionRef, item.kind) for item in early.dependencies], [('a-0003', 'repeat_method')])
        self.assertEqual([item['id'] for item in early.segments], ['s-a-0001', 's-a-0002'])
        later = compile_natural_prefix(prefix_of(request, 5), registry, output_schema=schema)
        self.assertEqual(later.gaps, [])
        self.assertEqual(len(later.dependencies), 1)
        final = compile_request(request, registry, output_schema=schema)
        self.assertEqual(final.gaps, [])
        self.assertEqual(len(final.repeatMethods), 1)
        self.assertEqual(request, original)

    def test_unproven_destination_is_not_deferred(self):
        request, registry, schema = repeat_source(duplicate_links=2)
        prefix = prefix_of(request, 3)
        body = prefix.trace.model_dump(mode='json', exclude={'digest'})
        body['actions'][2]['args']['url'] = 'https://example.test/unobserved'
        prefix.trace = type(prefix.trace).model_validate({**body, 'digest': digest(body)})
        compiled = compile_natural_prefix(prefix, registry, output_schema=schema)
        self.assertEqual(compiled.dependencies, [])
        self.assertTrue(any(item['code'] == 'missing_binding' for item in compiled.gaps))

    def test_missing_consumer_proof_is_a_compilation_dependency_not_a_native_action_gate(self):
        trace = readiness_trace('ui_state')
        action = trace.actions[0]
        action.name, action.resultRef = 'click', trace.actions[1].resultRef
        dependencies = []
        conditions, _refs, issues = natural_postconditions(action, trace.observations[0],
            trace.observations[1], None, [], dependencies=dependencies)
        self.assertEqual((conditions, issues), ([], []))
        self.assertEqual(dependencies[0].kind, 'consumer_readiness')
        _conditions, _refs, final_issues = natural_postconditions(action,
            trace.observations[0], trace.observations[1], None, [])
        self.assertTrue(final_issues)

    def test_fragment_edges_do_not_skip_a_missing_action(self):
        segments = [{'id': 's-a-0001'}, {'id': 's-a-0003'}]
        ledger = [SimpleNamespace(disposition='compiled', ownerSegmentId='s-a-0001'),
                  SimpleNamespace(disposition='not_compilable', ownerSegmentId=None),
                  SimpleNamespace(disposition='compiled', ownerSegmentId='s-a-0003')]
        self.assertEqual(prefix_edges(segments, ledger), [])


if __name__ == '__main__':
    unittest.main()
