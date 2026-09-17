"""Lossless-enough public BrowserStateSummary facts linked through action pre/post observations."""

from .dom_evidence import safe_url
from .evidence import digest


def browser_context_value(summary, focus_target_id):
    tabs = []
    for tab in getattr(summary, 'tabs', []) or []:
        target_id = _value(tab, 'target_id') or _value(tab, 'targetId')
        raw_url = _value(tab, 'url')
        if not isinstance(target_id, str) or not target_id or not isinstance(raw_url, str):
            continue
        tabs.append({'targetId': target_id, 'url': safe_url(raw_url), 'urlDigest': digest(raw_url)})
    page_info = getattr(summary, 'page_info', None)
    viewport = None if page_info is None else {
        key: _value(page_info, source) for key, source in {
            'scrollX': 'scroll_x', 'scrollY': 'scroll_y', 'pixelsAbove': 'pixels_above',
            'pixelsBelow': 'pixels_below', 'viewportWidth': 'viewport_width',
            'viewportHeight': 'viewport_height'}.items()
        if type(_value(page_info, source)) in (int, float)
    }
    return {
        'schemaVersion': 'bat.browser-context/v1',
        'focusTargetId': str(focus_target_id) if focus_target_id else None,
        'tabs': tabs,
        'viewport': viewport,
        'closedPopupMessages': [str(item) for item in getattr(summary, 'closed_popup_messages', []) or []],
    }


def _value(value, name):
    return value.get(name) if isinstance(value, dict) else getattr(value, name, None)
