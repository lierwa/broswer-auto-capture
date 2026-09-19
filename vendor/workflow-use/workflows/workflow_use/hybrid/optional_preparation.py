"""Evidence-gated, single-dispatch preparation for an already compiled downstream consumer."""
from dataclasses import dataclass


@dataclass(frozen=True)
class OptionalPreparationResult:
    status: str
    dispatches: int
    before: dict
    after: dict


async def execute_optional_preparation(readiness, dispatch):
    before = _readiness(await readiness())
    if before['status'] == 'ready':
        return OptionalPreparationResult('skipped_ready', 0, before, before)
    if before['status'] == 'ambiguous':
        raise ValueError('optional_preparation_ambiguous')
    if before['status'] not in ('missing', 'blocked'):
        raise ValueError('optional_preparation_readiness_invalid')
    try:
        await dispatch()
    except ValueError as error:
        if str(error) in ('ordinary_target_missing', 'missing_stable_target'):
            raise ValueError('optional_preparation_missing') from error
        if str(error) in ('ambiguous_history_target', 'ambiguous_item_target',
                          'ambiguous_stable_target', 'ambiguous_structure_container'):
            raise ValueError('optional_preparation_ambiguous') from error
        raise
    after = _readiness(await readiness())
    if after['status'] != 'ready':
        raise ValueError('optional_preparation_ineffective')
    if before.get('documentId') != after.get('documentId'):
        raise ValueError('optional_preparation_document_changed')
    return OptionalPreparationResult('prepared', 1, before, after)


def _readiness(value):
    if not isinstance(value, dict) or value.get('status') not in ('ready', 'missing', 'blocked', 'ambiguous'):
        raise ValueError('optional_preparation_readiness_invalid')
    if not isinstance(value.get('documentId'), str) or not value['documentId']:
        raise ValueError('optional_preparation_readiness_invalid')
    return dict(value)
