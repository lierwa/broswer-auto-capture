"""Native serialization must preserve arbitrary JSON names and optional nested fields."""
import unittest
from browser_use_runner.output_schema import output_model_for


class OutputSchemaContractTests(unittest.TestCase):
    def test_nested_record_key_and_missing_numeric_fields_survive_native_done_round_trip(self):
        item = {'type': 'object', 'properties': {'__batRecordKey': {'type': 'string'},
                'model_dump': {'type': 'string'}, 'price': {'type': 'number'}, 'empty': {'type': 'null'}},
                'required': ['__batRecordKey', 'model_dump', 'empty'], 'additionalProperties': False}
        model, unwrap = output_model_for({'type': 'array', 'items': item}, 'AliasProof')
        value = {'value': [{'__batRecordKey': 'identity', 'model_dump': 'real name', 'empty': None}]}
        native = model.model_validate(value).model_dump_json()
        self.assertEqual(unwrap(model.model_validate_json(native)), value['value'])
        self.assertIn('__batRecordKey', model.model_json_schema()['$defs']['AliasProofValueItem']['properties'])
