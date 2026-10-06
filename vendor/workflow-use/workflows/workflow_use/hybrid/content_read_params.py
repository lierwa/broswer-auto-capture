"""Select related content regions without asking the model to derive their parent."""
from pydantic import Field, model_serializer, model_validator
from pydantic.json_schema import SkipJsonSchema
from .evidence import Contract


class ContentReadToolParams(Contract):
    regions: str | None = Field(default=None, min_length=1, max_length=2000,
        description=('CSS selecting one or more observed related content regions. The host locates their shared '
                     'parent; do not guess its CSS. Include requested text/tables and images, not only a gallery. '
                     'Omit to capture the current page body. No individual business fields.'))
    container: SkipJsonSchema[str | None] = Field(default=None, min_length=1, max_length=2000)
    readRef: str | None = Field(default=None, pattern=r'^r[1-9][0-9]*$')

    @model_validator(mode='after')
    def one_method(self):
        count = sum(value is not None for value in (self.regions, self.container, self.readRef))
        if count > 1:
            raise ValueError('method_read_container_or_reference_required')
        if count == 0:
            self.regions = 'body'
        return self

    @model_serializer(mode='wrap')
    def omit_absent(self, handler):
        return {key: value for key, value in handler(self).items() if value is not None}
