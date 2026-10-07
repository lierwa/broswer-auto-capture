"""Read-only method evidence; never dispatch a proposed navigation."""
from typing import Literal
from urllib.parse import urlsplit

from browser_use.agent.views import ActionResult
from pydantic import Field

from .dom_evidence import DomQueryEvidence
from .evidence import Contract
from .natural_reads import VerifiedNaturalRead, read_fields_with_proof
from .natural_repeat_evidence import _assert_same_document


class InspectedNavigate(Contract):
    url: str = Field(min_length=1, max_length=8000)


class InspectedAction(Contract):
    navigate: InspectedNavigate


class InspectActionParams(Contract):
    action: InspectedAction


class InspectedMethod(Contract):
    actionRef: str
    readFactRef: str
    requirementDigest: str
    registryDigest: str
    action: InspectedAction
    dispatch: Literal[False]
    intent: str


def latest_method_read(observations, before, destination):
    """Use only the last query in this document; never fall back after an empty read."""
    parsed = urlsplit(destination)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('inspected_navigation_url_invalid')
    for owner in reversed(observations[:observations.index(before)]):
        _assert_same_document(owner, before)
        queries = [f for f in owner.facts if f.kind == 'dom_query']
        if not queries:
            continue
        if len(queries) != 1:
            break
        query = DomQueryEvidence.model_validate(queries[0].value)
        matches = [f for f in owner.facts if f.kind == 'verified_natural_read'
                   and isinstance(f.value, dict) and f.value.get('actionRef') == query.actionRef]
        if len(matches) != 1 or not query.complete or query.truncated:
            break
        fact, read = matches[0], VerifiedNaturalRead.model_validate(matches[0].value)
        if (not read.stable or not read.specification.includeOrdinal or not isinstance(read.output, list)
                or read.targetId != before.tabId or not any(
                    row.get('attribute_href') == destination for row in read.output)):
            break
        return fact, read
    raise ValueError('inspected_navigation_current_read_required')


def inspected_method_read(trace, action):
    before = next(o for o in trace.observations if o.id == action.preObservationRef)
    facts = [f for f in before.facts if f.kind == 'inspected_method'
             and isinstance(f.value, dict) and f.value.get('actionRef') == action.id]
    if len(facts) != 1:
        raise ValueError('inspected_navigation_evidence_required')
    method = InspectedMethod.model_validate(facts[0].value)
    if method.action.model_dump(mode='json') != action.args.get('action'):
        raise ValueError('inspected_navigation_action_mismatch')
    fact, read = latest_method_read(trace.observations, before, method.action.navigate.url)
    if method.readFactRef != fact.id:
        raise ValueError('inspected_navigation_read_mismatch')
    return fact, read


def register_inspection_tool(tools):
    @tools.registry.action('Record a reusable navigation method WITHOUT navigating. First use find_elements '
        'to read the complete current candidates including text and href. Select an actual candidate URL '
        'by the confirmed rule, even when the current page already satisfies it. No IDs or code are needed. '
        'Afterwards use native wait for required page-wide effects such as playback, then finish.',
        param_model=InspectActionParams)
    async def bat_inspect_action(params: InspectActionParams):
        collector = tools._bat_method_collector
        if collector is None or collector.pending is None:
            return ActionResult(error='inspected_navigation_capture_required')
        try:
            guard = getattr(collector.browser, '_security_watchdog', None)
            if guard is None or not guard._is_url_allowed(params.action.navigate.url):
                return ActionResult(error='inspected_navigation_outside_authorized_scope')
            before = next(o for o in collector.observations if o.id == collector.pending['pre'])
            fact, read = latest_method_read(collector.observations, before, params.action.navigate.url)
            # WHY：复用真实只读采样，目标变化就要求新读取，不请求目标网址或伪造导航后态。
            output, proof = await read_fields_with_proof(collector.browser, read.specification,
                {'targetId': before.tabId, 'url': before.url})
            if output != read.output or proof != read.containerIdsDigest:
                raise ValueError('inspected_navigation_read_changed')
            value = InspectedMethod(actionRef=collector.pending['actionId'], readFactRef=fact.id,
                requirementDigest=tools._bat_method_requirement, registryDigest=collector.registry.schemaDigest,
                action=params.action, dispatch=False, intent=collector.pending.get('intent', ''))
            before.facts.append(collector.value_fact('inspected_method', value.model_dump(mode='json')))
            return ActionResult(extracted_content='Navigation method target recorded; no navigation performed. '
                'Record required page-wide effects with native wait. Do not repeat external writes.')
        except (ValueError, KeyError, TypeError, StopIteration):
            return ActionResult(error='inspected_navigation_current_evidence_required: '
                'read complete candidates again with find_elements after navigation or page changes. '
                'This inspection has not navigated and does not erase earlier successful native actions.')
