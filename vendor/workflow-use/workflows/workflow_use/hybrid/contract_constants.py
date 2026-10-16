"""Values uniquely determined by a confirmed contract, never guessed from prose."""
from jsonschema import Draft202012Validator


def contract_constants(schema, path=()):
    kind = schema.get('type')
    if kind == 'object':
        return [item for name in schema.get('required', [])
                for item in contract_constants(schema['properties'][name], (*path, name))]
    enums = schema.get('enum')
    fixed = kind == 'null' or isinstance(enums, list) and len(enums) == 1
    value = enums[0] if isinstance(enums, list) and len(enums) == 1 else None
    if kind in ('integer', 'number') and schema.get('minimum') is not None \
            and schema.get('minimum') == schema.get('maximum'):
        fixed, value = True, schema['minimum']
    if fixed:
        Draft202012Validator(schema).validate(value)
        return [({'path': list(path), 'binding': {'source': 'constant', 'value': value},
                  'sampleValue': value}, value)]
    return []
