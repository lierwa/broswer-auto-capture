"""Canonical plain text for DOM nodes whose visual structure was serialized as Markdown."""
import re


PRESENTATION_MARKER = re.compile(r'(^|\s)(?:[-+*]|\d{1,9}[.)])\s+')


def normalize_presentation_text(value: str) -> str:
    """Normalize DOM layout whitespace without deleting visible punctuation."""
    value = ' '.join(value.split())
    value = re.sub(r'(\(|\[)\s+', r'\1', value)
    return re.sub(r'\s+([)\]])', r'\1', value)


def normalize_extracted_presentation_text(value: str) -> str:
    """Discard Markdown presentation added by extractors before comparing with DOM text."""
    value = value.replace('`', '')
    value = PRESENTATION_MARKER.sub(r'\1', value)
    return normalize_presentation_text(value)


def extracted_presentation_candidates(value: str) -> set[str]:
    """Keep punctuation-preserving and Markdown-marker interpretations until DOM disambiguates them."""
    without_code_fences = value.replace('`', '')
    return {
        normalize_presentation_text(without_code_fences),
        normalize_extracted_presentation_text(value),
    }
