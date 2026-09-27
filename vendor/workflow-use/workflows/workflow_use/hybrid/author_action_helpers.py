"""Native action argument normalization and safe bounded outcome summaries."""
import re
from pydantic import RootModel

VISIBLE_TEXT_EXTRACTION_GUIDANCE = (
    ' Return every string as literal browser-visible text: add no Markdown, YAML, bullets, numbering, backticks, '
    'or link/image syntax unless those characters are visibly present. Collapse every whitespace run to one space '
    'and concatenate inline element text without adding delimiters.')

def find_elements_outcome(agent):
    try:
        results = agent.history.history[-1].result
        if len(results) != 1:
            return {'queryOutcome': 'unavailable'}
        result = results[0]
        if result.error:
            return {'queryOutcome': 'invalid_selector' if 'Invalid CSS selector' in result.error else 'error'}
        matched = re.match(r'^Found ([0-9]+) elements? matching ', result.long_term_memory or '')
        if matched is None:
            return {'queryOutcome': 'unavailable'}
        count = int(matched.group(1))
        return {'queryOutcome': 'matched' if count else 'no_match', 'matchCount': count}
    except Exception:
        return {'queryOutcome': 'unavailable'}

def field_read_outcome(agent):
    try:
        results = agent.history.history[-1].result
        if len(results) != 1:
            return {'readOutcome': 'unavailable'}
        result = results[0]
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

FIND_ELEMENTS_DEFAULT_ATTRIBUTES = ['data-testid', 'class', 'role', 'aria-label', 'title', 'href', 'datetime']

def normalize_author_action(action):
    """Fill Browser-Use's optional DOM attributes before capture and dispatch."""
    action = action.root if isinstance(action, RootModel) else action
    scroll = getattr(action, 'scroll', None)
    if scroll is not None and getattr(scroll, 'index', None) == 0:
        # WHY：原生 scroll 的 0 与 None 都指向 viewport，不能当成缺失 DOM 索引。
        scroll.index = None
    extract = getattr(action, 'extract', None)
    query = getattr(extract, 'query', None)
    if isinstance(query, str) and VISIBLE_TEXT_EXTRACTION_GUIDANCE not in query:
        # WHY：extract LLM 可能把视觉样式转写成 Markdown；固定为纯可见文本与既有
        # normalizeWhitespace DOM 投影对齐，业务值仍由页面证明而不是由模型格式决定。
        extract.query = query.rstrip() + VISIBLE_TEXT_EXTRACTION_GUIDANCE
    params = getattr(action, 'find_elements', None)
    if params is not None and getattr(params, 'attributes', None) is None:
        # WHY：B-A-T 后续要编译相对字段 selector；只有数量和文本不足以证明真实 DOM 属性，
        # 因此在适配边界复用 Browser-Use 公开 attributes 参数，而不是让模型反复猜 selector。
        params.attributes = list(FIND_ELEMENTS_DEFAULT_ATTRIBUTES)
