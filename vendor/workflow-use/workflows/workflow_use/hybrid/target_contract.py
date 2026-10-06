"""Strict replay target contracts; browser queries remain in TargetResolver."""
import re
from copy import deepcopy
from .history_target import HistoryTargetIdentity

TARGET_ORDINAL_ARGUMENT = 'targetOrdinal'


def validate_target(raw, allow_binding=False):
    if not isinstance(raw, dict):
        raise ValueError('stable_target_required')
    strategy = raw.get('strategy')
    if strategy == 'css':
        _exact_keys(raw, {'strategy', 'value'}, {'scope'})
        _nonempty(raw.get('value'), 'target_query_required')
    elif strategy == 'ordinal':
        _exact_keys(raw, {'strategy', 'container', 'ordinal'}, {'scope'})
        _nonempty(raw.get('container'), 'target_query_required')
        _ordinal(raw.get('ordinal'))
    elif strategy == 'xpath':
        _exact_keys(raw, {'strategy', 'value'}, {'scope'})
        _nonempty(raw.get('value'), 'target_query_required')
    elif strategy == 'title':
        _exact_keys(raw, {'strategy', 'role', 'name'})
        _nonempty(raw.get('role'), 'target_role_required')
        _nonempty(raw.get('name'), 'target_name_required')
    elif strategy == 'structure':
        _validate_structure(raw)
    elif strategy == 'history':
        _exact_keys(raw, {'strategy', 'identity', 'scope'})
        HistoryTargetIdentity.model_validate(raw.get('identity'))
    elif strategy == 'entry':
        from .element_entry import ElementEntry
        _exact_keys(raw, {'strategy'}, {'entry', 'entryBinding', 'withinEntry'})
        if 'withinEntry' in raw and (not isinstance(raw['withinEntry'], str)
                or not raw['withinEntry'].startswith(':scope > ') or len(raw['withinEntry']) > 2000
                or ',' in raw['withinEntry']):
            raise ValueError('invalid_entry_descendant')
        if 'entryBinding' in raw:
            if not allow_binding:
                raise ValueError('unresolved_target_binding')
        else:
            ElementEntry.model_validate(raw.get('entry'))
    else:
        raise ValueError('unsupported_stable_target')
    if raw.get('ordinalBinding') is not None and not allow_binding:
        raise ValueError('unresolved_target_binding')
    _validate_scope(raw.get('scope'))
    return raw


def materialize_target(raw, arguments=None, allow_unresolved=False):
    """Resolve the compiler-only ordinal binding through the capability's normal input map."""
    target, values = deepcopy(raw), arguments if arguments is not None else {}
    if not isinstance(target, dict):
        return validate_target(target)
    if target.get('strategy') == 'entry' and 'entryBinding' in target:
        if 'targetEntry' not in values:
            if allow_unresolved:
                return validate_target(target, allow_binding=True)
            raise ValueError('unresolved_target_binding')
        target['entry'] = values.pop('targetEntry')
        target.pop('entryBinding')
    if target.get('ordinalBinding') is not None:
        if TARGET_ORDINAL_ARGUMENT not in values:
            if allow_unresolved:
                validate_target(target, allow_binding=True)
                return target
            raise ValueError('unresolved_target_binding')
        target['ordinal'] = values.pop(TARGET_ORDINAL_ARGUMENT)
        target.pop('ordinalBinding')
    elif TARGET_ORDINAL_ARGUMENT in values:
        raise ValueError('unexpected_target_binding')
    return validate_target(target)


def _validate_structure(raw):
    required = {'strategy', 'scope', 'container', 'items', 'ordinal', 'withinItem'}
    _exact_keys(raw, required, {'ordinalBinding'})
    _query(raw.get('container'))
    _query(raw.get('items'))
    if raw.get('withinItem') is not None:
        _query(raw['withinItem'])
    _ordinal(raw.get('ordinal'))


def _query(value):
    if not isinstance(value, dict) or set(value) != {'kind', 'value'} or value.get('kind') != 'css':
        raise ValueError('unsupported_target_query')
    _nonempty(value.get('value'), 'target_query_required')


def _validate_scope(scope):
    if scope is None:
        return
    if not isinstance(scope, dict) or set(scope) - {'url', 'urlDigest'}:
        raise ValueError('unsupported_target_scope')
    if 'url' in scope:
        _nonempty(scope['url'], 'target_scope_url_required')
    if 'urlDigest' in scope:
        if 'url' not in scope or not isinstance(scope['urlDigest'], str) \
                or re.fullmatch(r'[0-9a-f]{64}', scope['urlDigest']) is None:
            raise ValueError('target_scope_url_digest_required')


def _exact_keys(value, required, optional=frozenset()):
    keys = set(value)
    if not required <= keys or keys - required - set(optional):
        raise ValueError('invalid_stable_target')


def _nonempty(value, error):
    if not isinstance(value, str) or not value:
        raise ValueError(error)


def _ordinal(value):
    if type(value) is not int or value < 1:
        raise ValueError('target_position_unavailable')

