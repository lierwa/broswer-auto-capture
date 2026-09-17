"""Native browser-use tool registration for scoped deterministic field reads."""
import json

from browser_use.agent.views import ActionResult
from browser_use.browser.session import BrowserSession
from jsonschema import Draft202012Validator
from pydantic import Field, JsonValue

from .evidence import Contract
from .field_read_params import (
    FieldReadMapping,
    FieldReadToolParams,
    expand_field_read_params,
    field_read_contract_fields,
)
from .natural_reads import (
    NaturalReadFailure,
    current_page,
    page_identity,
    read_fields_with_proof,
    schema_at_path,
    validate_proposal,
    value_at_path,
)
from .rendered_field_text import FieldReadError


class FieldReadPageIdentity(Contract):
    targetId: str = Field(min_length=1)
    url: str = Field(min_length=1)


class FieldReadRecord(Contract):
    parameters: FieldReadToolParams
    mapping: FieldReadMapping
    output: JsonValue
    pageIdentity: FieldReadPageIdentity
    containerDigest: str = Field(pattern=r'^[a-f0-9]{64}$')


class FieldReadRecords:
    def __init__(self):
        self.records: list[FieldReadRecord] = []

    @property
    def output_paths(self):
        return [record.mapping.outputPath for record in self.records]


def register_field_read_tool(tools, *, output_schema):
    Draft202012Validator.check_schema(output_schema)
    successful = FieldReadRecords()

    @tools.action(
        'Read one real final output-contract path from a scoped DOM container, not an arbitrary temporary variable. '
        'Provide only outputPath, container, and fields; each field contains selector and optional attribute. Object '
        'and object-array targets need every required field; scalar and scalar-array targets use the field name value. '
        'When the container matches more records than contract maxItems, its DOM-order prefix is selected. Output schema, '
        'types, cardinality, budgets, and read path are derived. A zero-match collection cannot validate an authoring '
        'sample and fails even when the output contract allows an empty runtime result.',
        param_model=FieldReadToolParams,
    )
    async def bat_read_fields(params: FieldReadToolParams, browser_session: BrowserSession) -> ActionResult:
        target_schema = None
        try:
            try:
                target_schema = schema_at_path(output_schema, params.outputPath)
            except Exception as error:
                raise NaturalReadFailure(_output_path_error(output_schema)) from error
            mapping = expand_field_read_params(params, target_schema)
            target_schema = validate_proposal(mapping, output_schema, successful.output_paths)
            page = await current_page(browser_session)
            identity = await page_identity(page)
            focused = getattr(browser_session, 'agent_focus_target_id', identity['targetId'])
            if focused != identity['targetId']:
                raise NaturalReadFailure('natural_read_page_identity_changed')
            output, container_digest = await read_fields_with_proof(
                browser_session, mapping.specification, identity)
            actual = value_at_path(output, mapping.readPath)
            require_authoring_sample(actual, target_schema)
            Draft202012Validator(target_schema).validate(actual)
            record = FieldReadRecord(
                parameters=params,
                mapping=mapping,
                output=output,
                pageIdentity=identity,
                containerDigest=container_digest,
            )
        except NaturalReadFailure as error:
            return ActionResult(error=error.reason)
        except ValueError as error:
            return ActionResult(error=_fixed_read_error(error, target_schema))
        except Exception:
            return ActionResult(error='bat_read_fields_failed')
        successful.records.append(record)
        return ActionResult(extracted_content=json.dumps(
            actual, ensure_ascii=False, separators=(',', ':'), allow_nan=False))

    return successful


def require_authoring_sample(actual, target_schema):
    # WHY：minItems=0 只表示复跑结果允许为空；首次探索没有真实样本就无法证明 selector 可复跑。
    if isinstance(target_schema, dict) and target_schema.get('type') == 'array' and actual == []:
        raise NaturalReadFailure('natural_read_empty_sample_unproven')


_READ_ERRORS = frozenset({
    'ambiguous_or_missing_read_field',
    'read_boolean_invalid',
    'read_field_not_text',
    'read_field_projection_failed',
    'read_field_projection_invalid',
    'read_field_value_limit',
    'read_field_native_projection_failed',
    'read_container_resolution_failed',
    'read_input_limit',
    'read_number_not_finite',
    'read_single_object_required',
    'natural_read_schema_mismatch',
    'natural_read_schema_unsupported',
})


def _output_path_error(output_schema):
    properties = output_schema.get('properties') if isinstance(output_schema, dict) else None
    root_fields = list(properties) if isinstance(properties, dict) else []
    guidance = ('choose a real final path inside the output contract using property names and in-range '
                'array indexes')
    if root_fields:
        guidance += '; root fields=' + json.dumps(root_fields, ensure_ascii=False, separators=(',', ':'))
    return 'natural_read_output_path_invalid: ' + guidance


def _fixed_read_error(error, target_schema=None):
    reason = str(error)
    if reason not in _READ_ERRORS:
        return 'bat_read_fields_failed'
    if isinstance(error, FieldReadError):
        details = []
        if error.field_name is not None:
            details.append('field=' + json.dumps(error.field_name, ensure_ascii=False, separators=(',', ':')))
        if error.match_count is not None:
            details.append('matchCount=' + str(error.match_count))
        if error.reason is not None:
            details.append('reason=' + error.reason)
        return reason + (': ' + '; '.join(details) if details else '')
    if reason == 'natural_read_schema_mismatch' and target_schema is not None:
        try:
            required, allowed = field_read_contract_fields(target_schema)
        except ValueError:
            return reason
        return (reason + ': fields must include required='
                + json.dumps(required, ensure_ascii=False, separators=(',', ':'))
                + ' and use only allowed='
                + json.dumps(allowed, ensure_ascii=False, separators=(',', ':')))
    return reason
