"""Bounded browser facts for explaining a model-free page scroll attempt."""
import json
import math


SCROLL_STATE_SCRIPT = r'''() => {
  const root = document.scrollingElement;
  const rootStyle = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);
  return {
    x: scrollX,
    y: scrollY,
    maxX: Math.max(0, root.scrollWidth - innerWidth),
    maxY: Math.max(0, root.scrollHeight - innerHeight),
    rootOverflowY: rootStyle.overflowY,
    bodyOverflowY: bodyStyle.overflowY,
    bodyPosition: bodyStyle.position,
    bodyTop: bodyStyle.top,
  };
}'''


async def inspect_page_scroll(browser):
    page = await browser.get_current_page()
    if page is None:
        raise ValueError('page_unavailable')
    try:
        value = json.loads(await page.evaluate(SCROLL_STATE_SCRIPT))
    except Exception as error:
        raise ValueError('scroll_observation_unavailable') from error
    required = {'x', 'y', 'maxX', 'maxY', 'rootOverflowY', 'bodyOverflowY',
                'bodyPosition', 'bodyTop'}
    if (not isinstance(value, dict) or set(value) != required
            or any(not _coordinate(value[key]) for key in ('x', 'y', 'maxX', 'maxY'))
            or any(not isinstance(value[key], str) for key in (
                'rootOverflowY', 'bodyOverflowY', 'bodyPosition', 'bodyTop'))):
        raise ValueError('scroll_observation_invalid')
    return value


def scroll_dispatch_metadata(before, after, capture, down):
    events = capture.get('events') if isinstance(capture, dict) else []
    event_types = [event.get('event', {}).get('type') for event in events if isinstance(event, dict)]
    cancelled = any(event.get('event', {}).get('type') == 'wheel'
                    and event.get('event', {}).get('defaultPrevented') is True
                    for event in events if isinstance(event, dict))
    moved = after['y'] != before['y']
    if moved:
        reason = 'moved'
    elif cancelled:
        reason = 'event_cancelled'
    elif before['bodyPosition'] == 'fixed' or after['bodyPosition'] == 'fixed':
        reason = 'position_fixed_locked'
    elif before['maxY'] <= 0:
        reason = 'no_scroll_range'
    elif (down and before['y'] >= before['maxY']) or (not down and before['y'] <= 0):
        reason = 'at_boundary'
    elif any(value in ('hidden', 'clip') for value in (
            before['rootOverflowY'], before['bodyOverflowY'],
            after['rootOverflowY'], after['bodyOverflowY'])):
        reason = 'css_overflow_locked'
    else:
        reason = 'no_effect'
    return {
        'moved': moved,
        'reason': reason,
        'before': {key: before[key] for key in ('x', 'y', 'maxX', 'maxY')},
        'after': {key: after[key] for key in ('x', 'y', 'maxX', 'maxY')},
        'rootStyles': {'before': {'overflowY': before['rootOverflowY'],
                                  'bodyOverflowY': before['bodyOverflowY'],
                                  'bodyPosition': before['bodyPosition'], 'bodyTop': before['bodyTop']},
                       'after': {'overflowY': after['rootOverflowY'],
                                 'bodyOverflowY': after['bodyOverflowY'],
                                 'bodyPosition': after['bodyPosition'], 'bodyTop': after['bodyTop']}},
        'wheelEvents': event_types.count('wheel'),
        'scrollEvents': event_types.count('scroll'),
    }


def scroll_failure_code(result):
    metadata = result.metadata if isinstance(result.metadata, dict) else {}
    dispatch = metadata.get('batScrollDispatch')
    if not isinstance(dispatch, dict) or dispatch.get('moved') is not False:
        return None
    reason = dispatch.get('reason')
    codes = {
        'no_scroll_range': 'scroll_no_range',
        'at_boundary': 'scroll_at_boundary',
        'event_cancelled': 'scroll_event_cancelled',
        'css_overflow_locked': 'scroll_css_locked',
        'position_fixed_locked': 'scroll_position_fixed_locked',
        'no_effect': 'scroll_no_effect',
    }
    if reason not in codes:
        return None
    return codes[reason]


def _coordinate(value):
    return type(value) in (int, float) and math.isfinite(value)
