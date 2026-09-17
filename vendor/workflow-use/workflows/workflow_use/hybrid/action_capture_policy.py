"""Explicit capture contract for every action exposed by the formal authoring Tools instance.

Product Alignment:
- natural-language task: record any native action used while exploring a browser task.
- reusable chain boundary: one Tools.act action with exact arguments, result, browser context and optional DOM events.
- runtime inputs: the live public action registry and current BrowserSession.
- dynamic task outputs: action evidence classified by mechanism, never by site or sampled value.
- generic platform capability used: browser-use Tools and BrowserSession.
- replay model calls: 0.
- site/task-specific code added: no.
"""
from dataclasses import dataclass
from typing import Literal


EventExpectation = Literal['none', 'optional', 'required']
Boundary = Literal['terminal', 'read', 'artifact', 'document', 'tab', 'target', 'scroll']


@dataclass(frozen=True)
class ActionCapturePolicy:
    boundary: Boundary
    event_types: tuple[str, ...] = ()
    event_expectation: EventExpectation = 'none'


# This is deliberately exhaustive for author_tools(), not a compiler admission list. A provider upgrade or a
# registration change must fail the focused registry test until its capture semantics are classified.
ACTION_CAPTURE_POLICIES = {
    'done': ActionCapturePolicy('terminal'),
    'wait': ActionCapturePolicy('read'),
    'navigate': ActionCapturePolicy('document'),
    'search': ActionCapturePolicy('document'),
    'go_back': ActionCapturePolicy('document'),
    'switch': ActionCapturePolicy('tab'),
    'close': ActionCapturePolicy('tab'),
    'click': ActionCapturePolicy('target', ('click',), 'required'),
    'input': ActionCapturePolicy('target', ('beforeinput', 'input', 'change'), 'required'),
    # Browser-level shortcuts do not always reach the document. Acceptance still requires DOM key events for
    # the Enter scenario; the generic recorder must not fabricate them for Control+L or other browser commands.
    'send_keys': ActionCapturePolicy(
        'target', ('keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'change'), 'optional'),
    # browser-use selects native <select> options by script and intentionally emits untrusted input/change.
    'select_dropdown': ActionCapturePolicy('target', ('input', 'change'), 'required'),
    'dropdown_options': ActionCapturePolicy('read'),
    'scroll': ActionCapturePolicy('scroll', ('scroll',), 'optional'),
    'find_text': ActionCapturePolicy('scroll', ('scroll',), 'optional'),
    'bat_scroll_to': ActionCapturePolicy('scroll', ('scroll',), 'optional'),
    'extract': ActionCapturePolicy('read'),
    'search_page': ActionCapturePolicy('read'),
    'find_elements': ActionCapturePolicy('read'),
    'bat_read_fields': ActionCapturePolicy('read'),
    'bat_wait_for': ActionCapturePolicy('read'),
    'bat_summarize': ActionCapturePolicy('read'),
    'save_as_pdf': ActionCapturePolicy('artifact'),
}


def action_capture_policy(action_name: str | None) -> ActionCapturePolicy:
    try:
        return ACTION_CAPTURE_POLICIES[action_name]
    except KeyError:
        raise ValueError('unclassified_native_action_capture') from None
