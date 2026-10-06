"""Bind a confirmed literal target through the existing native accessibility identity."""
from .history_target import _ax_name, _eligible, _target_text, _text_digest, _value, named_group_is_unique
from .evidence import Contract
from pydantic import Field, model_serializer
from typing import Literal


class FixedTargetAuthority(Contract):
    label: str = Field(min_length=1, max_length=200)
    uniqueMatches: Literal[1] = 1
    nameSource: Literal['ax_name', 'text'] = 'ax_name'

    @model_serializer(mode='wrap')
    def preserve_legacy_authority(self, serialize):
        value = serialize(self)
        if self.nameSource == 'ax_name':
            value.pop('nameSource', None)
        return value


def capture_fixed_target(structure, summary, selector_index, requirement_text):
    mapping = getattr(getattr(summary, 'dom_state', None), 'selector_map', {}) or {}
    node = mapping.get(selector_index, mapping.get(str(selector_index)))
    history = structure.historyTarget
    if node is None or history is None or not isinstance(requirement_text, str):
        return structure
    read = _ax_name if history.axNameDigest else _target_text
    name, expected_digest = read(node), history.axNameDigest or history.textDigest
    if not name or len(name) > 200 or name not in requirement_text or _text_digest(name) != expected_digest:
        return structure
    matches = [candidate for candidate in mapping.values()
               if _eligible(candidate, structure.scope.tabId)
               and _value(candidate, 'node_name', 'tag_name').lower() == history.nodeName and read(candidate) == name]
    if not any(candidate is node for candidate in matches) or not named_group_is_unique(matches, structure.scope.tabId):
        return structure
    # WHY：字面常量来自确认需求；同名节点只能是一条原生祖先链，独立分支仍歧义。
    name_source = 'ax_name' if history.axNameDigest else 'text'
    return structure.model_copy(update={'fixedTargetAuthority': FixedTargetAuthority(label=name, nameSource=name_source),
        'historyTarget': history.model_copy(update={
            'requireAxName': name_source == 'ax_name', 'requireText': name_source == 'text'})})


def fixed_target_authorized(structure, requirement_text):
    proof, identity = structure.get('fixedTargetAuthority'), structure.get('historyTarget')
    if not isinstance(proof, dict) or not isinstance(identity, dict) or not isinstance(requirement_text, str):
        return False
    label = proof.get('label')
    text_source = proof.get('nameSource', 'ax_name') == 'text'
    return (isinstance(label, str) and bool(label) and len(label) <= 200 and label in requirement_text
            and proof.get('nameSource', 'ax_name') in ('ax_name', 'text') and proof.get('uniqueMatches') == 1
            and identity.get('requireText' if text_source else 'requireAxName') is True
            and identity.get('textDigest' if text_source else 'axNameDigest') == _text_digest(label))
