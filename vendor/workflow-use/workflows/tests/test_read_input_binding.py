"""Selection quantities preserve provenance and the observed reader budget."""
import unittest
from types import SimpleNamespace

from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.natural_facts import binding_facts
from workflow_use.hybrid.read import ReadSpec
from workflow_use.hybrid.read_input_binding import bind_read_take


class ReadInputBindingTests(unittest.TestCase):
    def test_ambiguous_count_never_becomes_a_constant_and_budget_is_preserved(self):
        scalar = {'type': 'integer', 'minimum': 1, 'maximum': 3}
        output = {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 3}
        spec = ReadSpec(container='.row', take=2, maxItems=2,
            fields={'value': {'selector': ':scope', 'valueType': 'string'}}, outputSchema=output)
        for values, reason in (({'amount': 2, 'page': 2}, 'ambiguous'), ({'amount': 2}, 'invalid')):
            schema = {'type': 'object', 'properties': {key: scalar for key in values},
                'required': list(values), 'additionalProperties': False}
            bindings = binding_facts('a-0001', 'bat_read_fields', {'take': 2}, values, schema, '')
            facts = [SimpleNamespace(id=f'b{i}', kind='natural_binding', value=value.model_dump(mode='json'),
                sourceRefs=[SimpleNamespace(digest=digest(value.model_dump(mode='json')))]) for i, value in enumerate(bindings)]
            with self.assertRaisesRegex(ValueError, 'read_take_binding_' + reason):
                bind_read_take(SimpleNamespace(runtimeInputSchema=schema),
                    SimpleNamespace(id='a-0001', args={'take': 2}), SimpleNamespace(facts=facts), spec, output, [])
