"""Direct provenance facts derived from natural-task inputs and native action parameters."""
import re
from typing import Literal

from pydantic import Field, JsonValue

from .evidence import Contract, digest
from .field_read_params import FieldReadSelector

NATIVE_PARAMETERS = {
    'bat_read_fields': frozenset({'outputPath', 'container', 'fields'}),
    'bat_scroll_to': frozenset({'selector'}),
    'bat_wait_for': frozenset({'selector'}),
    'navigate': frozenset({'new_tab'}),
    'input': frozenset({'clear', 'text'}),
    'wait': frozenset({'seconds'}),
    'scroll': frozenset({'down', 'pages'}),
    'send_keys': frozenset({'keys'}),
}

_KEY_ALIASES = {
    'ctrl': 'Control', 'control': 'Control', 'alt': 'Alt', 'option': 'Alt',
    'meta': 'Meta', 'cmd': 'Meta', 'command': 'Meta', 'shift': 'Shift',
    'enter': 'Enter', 'return': 'Enter', 'tab': 'Tab', 'delete': 'Delete',
    'backspace': 'Backspace', 'escape': 'Escape', 'esc': 'Escape', 'space': ' ',
    'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight',
    'pageup': 'PageUp', 'pagedown': 'PageDown', 'home': 'Home', 'end': 'End',
}
_MODIFIER_KEYS = frozenset({'Control', 'Alt', 'Meta', 'Shift'})
_CONTROL_KEYS = frozenset({*_KEY_ALIASES.values(), *(f'F{index}' for index in range(1, 13))})
_REDACTED_VALUE = re.compile(r'<redacted:[a-f0-9]{64}>\Z')
_BROWSER_USE_SECRET = re.compile(r'<secret>.*?</secret>')

# Pinned browser-use accepts this field only because empty-object schemas need a model-visible property;
# Tools.go_back receives the model but never reads the description.
IGNORED_TECHNICAL_PARAMETERS = {'go_back': frozenset({'description'})}


class NaturalBindingFact(Contract):
    actionRef: str = Field(pattern=r'^a-\d{4,}$')
    argumentPath: str = Field(min_length=1)
    binding: dict[str, JsonValue]
    provenance: Literal['runtime_input', 'native_parameter', 'task_literal']
    taskQuote: str | None = None


def binding_facts(action_ref, action_name, arguments, input_value, input_schema, requirement_text):
    facts = []
    for argument_path, value in sorted(arguments.items()):
        if argument_path in ('index', 'element_index', 'xpath'):
            continue
        if argument_path in IGNORED_TECHNICAL_PARAMETERS.get(action_name, frozenset()):
            continue
        input_paths = matching_input_paths(input_value, input_schema, value)
        if len(input_paths) == 1:
            facts.append(NaturalBindingFact(actionRef=action_ref, argumentPath=argument_path,
                binding={'source': 'input', 'path': input_paths[0]}, provenance='runtime_input'))
            continue
        if is_native_parameter(action_name, argument_path, value):
            facts.append(NaturalBindingFact(actionRef=action_ref, argumentPath=argument_path,
                binding={'source': 'constant', 'value': value}, provenance='native_parameter'))
            continue
        if isinstance(value, str) and value and value in requirement_text:
            facts.append(NaturalBindingFact(actionRef=action_ref, argumentPath=argument_path,
                binding={'source': 'constant', 'value': value}, provenance='task_literal', taskQuote=value))
    return facts


def is_native_parameter(action_name, argument_path, value):
    if argument_path not in NATIVE_PARAMETERS.get(action_name, frozenset()):
        return False
    if action_name == 'send_keys':
        return is_control_key_sequence(value)
    if action_name == 'input' and argument_path == 'text':
        # WHY：普通固定输入是原生动作参数；已脱敏值和 browser-use 的敏感占位符不能升级为版本化常量。
        return (isinstance(value, str)
                and _REDACTED_VALUE.fullmatch(value) is None
                and _BROWSER_USE_SECRET.search(value) is None)
    if action_name == 'bat_read_fields':
        return is_field_read_parameter(argument_path, value)
    if action_name in ('bat_scroll_to', 'bat_wait_for'):
        return isinstance(value, str) and 0 < len(value) <= 2000
    return True


def is_field_read_parameter(argument_path, value):
    if argument_path == 'outputPath':
        return isinstance(value, list) and all(isinstance(item, str) or type(item) is int for item in value)
    if argument_path == 'container':
        return isinstance(value, str) and 0 < len(value) <= 2000
    if not isinstance(value, dict) or not 0 < len(value) <= 100 or not all(isinstance(key, str) for key in value):
        return False
    try:
        for field in value.values():
            FieldReadSelector.model_validate(field)
    except Exception:
        return False
    return True


def is_control_key_sequence(value):
    """Match only keyboard controls handled specially by pinned browser-use 0.13.8."""
    # WHY：send_keys 同时能输入正文；只承认原生特殊键与有限快捷键，避免把任意字符串升级为可落盘常量。
    if not isinstance(value, str) or not value or value != value.strip():
        return False
    parts = value.split('+')
    if len(parts) == 1:
        return _normalized_key(parts[0]) in _CONTROL_KEYS
    if len(parts) > 5 or any(not part or part != part.strip() for part in parts):
        return False
    modifiers = [_normalized_key(part) for part in parts[:-1]]
    if any(item not in _MODIFIER_KEYS for item in modifiers) or len(set(modifiers)) != len(modifiers):
        return False
    main = _normalized_key(parts[-1])
    return main in _CONTROL_KEYS or (len(main) == 1 and main.isascii() and main.isprintable())


def _normalized_key(value):
    return _KEY_ALIASES.get(value.lower(), value)


def matching_input_paths(input_value, input_schema, expected):
    matches = []
    def visit(value, schema, path):
        if schema and digest(value) == digest(expected):
            matches.append(path)
        if not isinstance(value, dict) or not isinstance(schema, dict):
            return
        properties = schema.get('properties')
        if not isinstance(properties, dict):
            return
        for key, child in value.items():
            child_schema = properties.get(key)
            if isinstance(key, str) and isinstance(child_schema, dict):
                visit(child, child_schema, [*path, key])
    visit(input_value, input_schema, [])
    return matches
