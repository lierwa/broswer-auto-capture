"""Bounded scalar field schema helpers for host-generated record projections."""

MAX_RECORDS = 300


def field_schema(schema):
    if not isinstance(schema, dict):
        return False
    if schema.get('type') in ('string', 'number', 'integer', 'boolean'):
        return True
    items = schema.get('items')
    maximum = schema.get('maxItems')
    return (schema.get('type') == 'array' and isinstance(items, dict)
            and items.get('type') in ('string', 'number', 'integer', 'boolean')
            and type(maximum) is int and 0 < maximum <= MAX_RECORDS)


def value_type(schema):
    return schema['items']['type'] if schema.get('type') == 'array' else schema['type']


def field_maximum(schema):
    return schema['maxItems'] if schema.get('type') == 'array' else 1
