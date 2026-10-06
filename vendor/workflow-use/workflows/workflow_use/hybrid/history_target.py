"""Persist and uniquely remap Browser-Use interactive element identities."""
import hashlib
from typing import Literal

from browser_use.dom.views import DOMInteractedElement
from pydantic import Field, model_validator, model_serializer

from .evidence import Contract

SCHEMA_VERSION = 'browser-use.dom-interacted-element/v1'
IDENTITY_ATTRIBUTES = ('name', 'id', 'aria-label')


class HistoryAttributeDigest(Contract):
    name: Literal['name', 'id', 'aria-label']
    digest: str = Field(pattern=r'^[0-9a-f]{64}$')


class HistoryTargetIdentity(Contract):
    schemaVersion: Literal['browser-use.dom-interacted-element/v1'] = SCHEMA_VERSION
    nodeName: str = Field(min_length=1)
    xPath: str = Field(min_length=1)
    elementHash: str = Field(pattern=r'^-?\d+$')
    stableHash: str | None = Field(default=None, pattern=r'^-?\d+$')
    axNameDigest: str | None = Field(default=None, pattern=r'^[0-9a-f]{64}$')
    textDigest: str | None = Field(default=None, pattern=r'^[0-9a-f]{64}$')
    attributes: list[HistoryAttributeDigest]
    requireAxName: bool = False
    requireText: bool = False

    @model_validator(mode='after')
    def unique_attributes(self):
        if self.requireAxName and self.axNameDigest is None:
            raise ValueError('fixed_target_name_required')
        if self.requireText and self.textDigest is None:
            raise ValueError('fixed_target_text_required')
        if len({item.name for item in self.attributes}) != len(self.attributes):
            raise ValueError('duplicate_history_target_attribute')
        return self

    @model_serializer(mode='wrap')
    def preserve_old_identity(self, serialize):
        value = serialize(self)
        if not self.requireAxName:
            value.pop('requireAxName', None)
        if not self.requireText:
            value.pop('requireText', None)
        if self.textDigest is None:
            value.pop('textDigest', None)
        return value


def capture_history_target(node):
    """Copy Browser-Use's native history identity without persisting visible target text."""
    native = DOMInteractedElement.load_from_enhanced_dom_tree(node)
    attributes = native.attributes if isinstance(native.attributes, dict) else {}
    text = _target_text(node) if not native.ax_name else ''
    return HistoryTargetIdentity(
        nodeName=native.node_name.lower(), xPath=native.x_path,
        elementHash=str(native.element_hash),
        stableHash=str(native.stable_hash) if native.stable_hash is not None else None,
        axNameDigest=_text_digest(native.ax_name) if native.ax_name else None,
        textDigest=_text_digest(text) if text else None,
        attributes=[HistoryAttributeDigest(name=name, digest=_text_digest(attributes[name]))
                    for name in IDENTITY_ATTRIBUTES if isinstance(attributes.get(name), str)
                    and bool(attributes[name])])


def match_history_target(raw, mapping, target_id):
    """Use Browser-Use hashes/DOM fields, but require one candidate instead of taking the first."""
    identity = HistoryTargetIdentity.model_validate(raw)
    items = [(int(index), node) for index, node in mapping.items()
             if _eligible(node, target_id) and _value(node, 'node_name', 'tag_name').lower() == identity.nodeName]
    if identity.requireAxName or identity.requireText:
        # WHY：确认名字必须仍唯一；父子同名只是一条原生链，仍用原生身份选原点击位置。
        matches = [(index, node) for index, node in items
                   if (not identity.requireAxName or _text_digest(_ax_name(node)) == identity.axNameDigest)
                   and (not identity.requireText or _text_digest(_target_text(node)) == identity.textDigest)]
        if not matches:
            raise ValueError('missing_history_target')
        if len({id(node) for _, node in matches}) == 1:
            return matches[0]
        if named_group_is_unique([node for _, node in matches], target_id):
            predicates = [lambda node: str(_value(node, 'element_hash')) == identity.elementHash,
                lambda node: identity.stableHash is not None and str(node.compute_stable_hash()) == identity.stableHash,
                lambda node: _value(node, 'xpath', 'x_path') == identity.xPath]
            for predicate in predicates:
                exact = [(index, node) for index, node in matches if predicate(node)]
                if len({id(node) for _, node in exact}) == 1:
                    return exact[0]
        # WHY：独立同名分支或缺失原点击身份时拒绝，不能退回名称/属性任取父子。
        raise ValueError('ambiguous_history_target')
    levels = [
        ('exact', lambda node: str(_value(node, 'element_hash')) == identity.elementHash),
        ('stable', lambda node: identity.stableHash is not None
         and str(node.compute_stable_hash()) == identity.stableHash),
        ('xpath', lambda node: _value(node, 'xpath', 'x_path') == identity.xPath),
        ('ax_name', lambda node: identity.axNameDigest is not None
         and _text_digest(_ax_name(node)) == identity.axNameDigest),
    ]
    attribute_digests = {item.name: item.digest for item in identity.attributes}
    levels.extend((name, lambda node, key=name, expected=value:
                   _attribute_digest(node, key) == expected)
                  for name, value in attribute_digests.items())
    ambiguous = False
    for _level, predicate in levels:
        matches = [(index, node) for index, node in items if predicate(node)]
        if len(matches) > 1:
            # WHY：elementHash 等单一弱信号可能在多个同类后代上碰撞；只有所有已保存的
            # 原生身份信号都不能继续消歧时才判定歧义，不能抢在 stableHash/XPath 前失败。
            ambiguous = True
            continue
        if matches:
            return matches[0]
    raise ValueError('ambiguous_history_target' if ambiguous else 'missing_history_target')


def _eligible(node, target_id):
    return (isinstance(target_id, str) and _value(node, 'target_id') == target_id
            and _value(node, 'frame_id') is None and _value(node, 'shadow_root_type') is None
            and _value(node, 'is_visible') is not False)


def named_group_is_unique(nodes, target_id):
    from .record_projection_dom import _ancestors_to_root
    if not nodes or len(nodes) > 300:
        return False
    identifiers = {id(node) for node in nodes}
    for node in nodes:
        chain = set()
        for ancestor in _ancestors_to_root(node):
            if _value(ancestor, 'target_id') != target_id or _value(ancestor, 'frame_id') is not None \
                    or _value(ancestor, 'shadow_root_type') is not None:
                break
            chain.add(id(ancestor))
        if identifiers <= chain:
            return True
    return False


def _attribute_digest(node, name):
    attributes = _value(node, 'attributes') or {}
    value = attributes.get(name) if isinstance(attributes, dict) else None
    return _text_digest(value) if isinstance(value, str) and value else None


def _ax_name(node):
    ax = _value(node, 'ax_node')
    value = _value(ax, 'name') if ax is not None else None
    return value if isinstance(value, str) else ''


def _target_text(node):
    """Reuse the native DOM text API; store only a short target's digest."""
    read = getattr(node, 'get_all_children_text', None)
    if not callable(read):
        return ''
    value = read()
    return value if isinstance(value, str) and 0 < len(value) <= 200 else ''


def _text_digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def _value(node, *names):
    for name in names:
        if isinstance(node, dict) and name in node:
            return node[name]
        if hasattr(node, name):
            return getattr(node, name)
    return None
