"""Host read normalization and safe bounded native outcome summaries."""
import re
from pydantic import RootModel

def find_elements_outcome(result):
    try:
        if result.error:
            return {'queryOutcome': 'invalid_selector' if 'Invalid CSS selector' in result.error else 'error'}
        matched = re.match(r'^Found ([0-9]+) elements? matching ', result.long_term_memory or '')
        if matched is None:
            return {'queryOutcome': 'unavailable'}
        count = int(matched.group(1))
        return {'queryOutcome': 'matched' if count else 'no_match', 'matchCount': count}
    except Exception:
        return {'queryOutcome': 'unavailable'}

def field_read_outcome(result):
    try:
        if not result.error:
            return {'readOutcome': 'succeeded'}
        error = result.error
        allowed = ('ambiguous_or_missing_read_field', 'read_', 'natural_read_', 'dom_reference_',
                   'bat_read_fields_failed')
        if not isinstance(error, str) or not error.startswith(allowed) or len(error) > 2000:
            return {'readOutcome': 'unavailable'}
        return {'readOutcome': 'failed', 'readError': error}
    except Exception:
        return {'readOutcome': 'unavailable'}

def normalize_author_action(action, read_records=None):
    """Normalize host-owned reads without rewriting native action parameters."""
    action = action.root if isinstance(action, RootModel) else action
    _normalize_scalar_collection(getattr(action, 'bat_read_fields', None), read_records)
def _normalize_scalar_collection(params, records):
    """Canonicalize one value per selected row into the existing multi-value ReadSpec."""
    if params is None or records is None or getattr(params, 'readRef', None) is not None:
        return
    fields = getattr(params, 'fields', None)
    if not fields or set(fields) != {'value'} or fields['value'].selector != ':scope':
        return
    from .natural_reads import schema_at_path
    path = getattr(params, 'outputPath', None)
    if path is None:
        paths = getattr(params, 'paths', [])
        if len(paths) != 1:
            return
        path = paths[0]
    try:
        target = schema_at_path(records.output_schema, path)
    except (ValueError, KeyError, TypeError, AttributeError):
        return  # 参数错误留给工具的正式校验，不能让归一化回调中断原生探索。
    if target.get('type') != 'array' or target.get('items', {}).get('type') not in {'string', 'number', 'integer', 'boolean'}:
        return
    # WHY：每行读取自身与在文档中读取同一行集合等价；只交换两个既有选择器，
    # 不推断祖先/业务范围、不截断条目。归一化先于来源捕获，采样与复跑消费同一参数。
    fields['value'].selector, params.container = params.container, ':root'
