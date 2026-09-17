"""Compile a callback-proven DOM target into an existing replay locator."""
from .capability import TARGET_ACTIONS
from .dom_evidence import DomQueryCandidate
from .evidence import gap


def natural_target(action, pre):
    if action.name not in TARGET_ACTIONS:
        return None, [], []
    facts = [fact for fact in pre.facts if fact.kind == 'dom_structure'
             and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
    if len(facts) != 1:
        return None, [], [gap('missing_observation', [action.id],
                              'same_snapshot_dom_target_required', 'collect_evidence')]
    fact, value = facts[0], facts[0].value
    scope = value.get('scope') or {}
    url_digest = scope.get('urlDigest')
    if 'redacted_url_components' in value.get('limitations', []) and not isinstance(url_digest, str):
        return None, [], [gap('missing_effect_proof', [action.id],
                              'natural_target_scope_url_redacted', 'collect_evidence')]
    observed_digest = _fact_value(pre, 'url_digest')
    if isinstance(url_digest, str) and (observed_digest is None or observed_digest.value != url_digest):
        return None, [], [gap('missing_effect_proof', [action.id],
                              'natural_target_scope_url_digest_unproven', 'collect_evidence')]
    if scope.get('tabId') != pre.tabId or scope.get('frameId') is not None or not scope.get('targetId'):
        return None, [], [gap('unsupported_capability', [action.id],
                              'natural_target_document_identity_unavailable', 'add_capability')]
    nodes = [node for node in value.get('nodes', []) if node.get('id') == value.get('targetRef')]
    if len(nodes) != 1:
        return None, [], [gap('unsupported_capability', [action.id],
                              'natural_target_xpath_unavailable', 'add_capability')]
    target_scope = {'url': pre.url, **({'urlDigest': url_digest} if isinstance(url_digest, str) else {})}
    raw_candidate = value.get('queryCandidate')
    if raw_candidate is not None:
        candidate = _validated_candidate(raw_candidate, value, pre)
        if candidate is None:
            return None, [], [gap('unsupported_capability', [action.id],
                                  'natural_target_query_candidate_invalid', 'collect_evidence')]
        return {'strategy': 'css', 'value': candidate.items.value, 'scope': target_scope}, fact.sourceRefs, []
    xpath = nodes[0].get('xpath')
    if not isinstance(xpath, str) or not xpath:
        return None, [], [gap('unsupported_capability', [action.id],
                              'natural_target_xpath_unavailable', 'add_capability')]
    return {'strategy': 'xpath', 'value': xpath, 'scope': target_scope}, fact.sourceRefs, []


def _validated_candidate(raw, structure, pre):
    try:
        candidate = DomQueryCandidate.model_validate(raw)
    except Exception:
        return None
    scope = structure.get('scope') or {}
    return candidate if (
        candidate.complete is True
        and candidate.scope.tabId == scope.get('tabId') == pre.tabId
        and candidate.scope.frameId == scope.get('frameId') is None
        and candidate.targetRef == structure.get('targetRef')
        and candidate.container.kind == 'css' and candidate.container.value == 'html'
        and candidate.items.kind == 'css' and bool(candidate.items.value)
        and candidate.matchedItemOrdinal == 1 and candidate.withinItem is None
    ) else None


def _fact_value(observation, kind):
    matches = [fact for fact in observation.facts if fact.kind == kind]
    return matches[0] if len(matches) == 1 else None
