"""Compose existing native text/attribute projections within each selected record."""
from pydantic import Field, model_serializer
from .evidence import Contract


class ReadPart(Contract):
    selector: str = Field(min_length=1, max_length=2000)
    attribute: str | None = Field(default=None, pattern=r'^[a-zA-Z][a-zA-Z0-9_:.-]*$')

    @model_serializer(mode='wrap')
    def omit_absent(self, handler):
        return {key: value for key, value in handler(self).items() if value is not None}


# WHY：只组合选中片段，不能把整行的隐藏/原始值顺便带出；不解释图标的业务含义。
PART_PROJECTION = """
  const projectParts = (node, parts) => {
    const values = [];
    for (const part of parts) {
      let matches;
      try {
        matches = Array.from(node.querySelectorAll(part.selector));
        if (node.matches(part.selector)) matches.unshift(node);
      } catch (_) { return {error: 'read_part_selector_invalid'}; }
      if (matches.length !== 1) return {error: 'read_part_cardinality_invalid'};
      const selected = matches[0];
      if (selected.shadowRoot || Array.from(selected.querySelectorAll('*')).some((n) => n.shadowRoot)) {
        return {error: 'read_part_shadow_unsupported'};
      }
      const value = part.attribute ? selected.getAttribute(part.attribute)
        : selected.checkVisibility({checkOpacity: true, checkVisibilityCSS: true}) ? selected.innerText : null;
      if (typeof value !== 'string') return {error: 'read_part_value_missing'};
      values.push(value.trim());
    }
    return {value: values.join('\\n'), hasShadow: false};
  };
"""


def assert_text_sample(specification, sample):
    """A blank representative cannot establish where readable content comes from."""
    from .rendered_field_text import FieldReadError
    records = sample.output if isinstance(sample.output, list) else [sample.output]
    schema = specification.outputSchema
    record_schema = schema.get('items', {}) if schema.get('type') == 'array' else schema
    for name, field in specification.fields.items():
        if name in specification.inheritFields:
            continue
        if name not in record_schema.get('required', []) or record_schema.get('properties', {}).get(name, {}).get('enum') == ['']:
            continue
        if field.valueType != 'string' or field.attribute or field.valueSource or field.contentSource or field.ordinal:
            continue
        values = [record.get(name) for record in records if isinstance(record, dict) and name in record]
        leaves = [item for value in values for item in (value if isinstance(value, list) else [value])]
        if leaves and all(isinstance(value, str) and not value.strip() for value in leaves):
            raise FieldReadError('read_sample_text_empty_unproven', field_name=name)
