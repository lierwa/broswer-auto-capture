"""Small value helpers shared by evidence capture without owning browser state."""

import json

from browser_use.tools.extraction.views import ExtractionResult

from .evidence import digest


def extraction_value(result, arguments, url):
    """Decode only the pinned upstream result envelope; field proof remains independent."""
    metadata = result.metadata or {}
    if metadata.get('structured_extraction') is True:
        extracted = ExtractionResult.model_validate(metadata.get('extraction_result'))
        if extracted.is_partial or extracted.source_url != url:
            raise ValueError('extraction_source_incomplete')
        return extracted.data
    content = result.extracted_content or ''
    prefix = f"<url>\n{url}\n</url>\n<query>\n{arguments.get('query', '')}\n</query>\n<result>\n"
    suffix = '\n</result>'
    if content.startswith(prefix) and content.endswith(suffix):
        return json.loads(content[len(prefix):-len(suffix)])
    return json.loads(content)


def target_value(action_ref, target_ref, value, sanitizer):
    safe = sanitizer('value', value) if sanitizer is not None and isinstance(value, str) else value
    return {'actionRef': action_ref, 'targetRef': target_ref, 'value': safe}


def replace_action_identity(value, previous, current):
    if isinstance(value, dict):
        return {key: (current if key in ('actionRef', 'nodeId') and item == previous
                      else replace_action_identity(item, previous, current))
                for key, item in value.items()}
    if isinstance(value, list):
        return [replace_action_identity(item, previous, current) for item in value]
    return value


def schema_reachable(candidate, root):
    if digest(candidate) == digest(root):
        return True
    if not isinstance(root, dict):
        return False
    children = list((root.get('properties') or {}).values()) if isinstance(root.get('properties'), dict) else []
    if isinstance(root.get('items'), dict):
        children.append(root['items'])
    return any(schema_reachable(candidate, child) for child in children if isinstance(child, dict))
