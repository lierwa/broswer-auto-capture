"""Synthetic source bridge: normalize -> production Python compiler -> TS boundary."""
import json
import sys

from test_natural_repeat import PAGE1, repeat_source
from test_method_source_compile import fact, reference
from workflow_use.hybrid.__main__ import compilation_response
from workflow_use.hybrid.evidence import NormalizedObservation
from workflow_use.hybrid.normalize import HistoryInput, HistoryRecord, ResultEvidence, normalize_history
from workflow_use.hybrid.evidence import digest


def shift(value):
    if isinstance(value, str) and value.startswith('a-') and value[2:].isdigit():
        return f'a-{int(value[2:]) + 1:04d}'
    if isinstance(value, list):
        return [shift(item) for item in value]
    if isinstance(value, dict):
        return {key: shift(item) for key, item in value.items()}
    return value


def bridge(configuration):
    request, registry, schema = repeat_source(terminal_probe=configuration.get('terminalProbe', False),
        duplicate_links=configuration.get('duplicateLinks', 1), lookup_probes=configuration.get('lookupProbes', False),
        final_positive=configuration.get('finalPositive', False),
        final_query_budget=configuration.get('finalQueryBudget'), final_query_count=configuration.get('finalQueryCount'),
        same_tab_advance=configuration.get('sameTabAdvance', False))
    observations = []
    for index, url in enumerate(['about:blank', PAGE1]):
        extras = [fact('natural_binding', {'actionRef': 'a-0001', 'argumentPath': 'url',
            'binding': {'source': 'constant', 'value': PAGE1}, 'provenance': 'plan_entry_url'})] if index == 0 else [
            fact('natural_postcondition', {'actionRef': 'a-0001', 'kind': 'url', 'bindingArgument': 'url', 'matched': True})]
        observations.append(NormalizedObservation(id=f'o-{index + 1:04d}', sequence=index, url=url,
            tabId='tab-1', facts=[fact('url_digest', digest(url)), fact('url', url), *extras], sourceRefs=[reference(url)]))
    names = {item.id: f'o-{index + 3:04d}' for index, item in enumerate(request.trace.observations)}
    for index, observation in enumerate(request.trace.observations):
        facts = []
        for original in observation.facts:
            value = shift(original.value)
            if original.kind == 'repeat_method':
                value['requirementDigest'] = configuration['requirement']['sourceDigest']
            facts.append(fact(original.kind, value))
        observations.append(observation.model_copy(update={'id': names[observation.id], 'sequence': index + 2, 'facts': facts}))
    records = [HistoryRecord(stepIndex=0, actions=[{'navigate': {'url': PAGE1}}],
        results=[ResultEvidence(errorPresent=False, ref=reference('entry'))],
        preObservationRef='o-0001', postObservationRefs={'0': 'o-0002'})]
    for index, action in enumerate(request.trace.actions):
        records.append(HistoryRecord(stepIndex=index + 1, actions=[{action.name: action.args}],
            results=[ResultEvidence(errorPresent=False, ref=action.resultRef, is_done=action.name == 'done',
                                    success=True if action.name == 'done' else None)],
            preObservationRef=names[action.preObservationRef], postObservationRefs={'0': names[action.postObservationRef]}))
    trace, issues = normalize_history(HistoryInput(source=request.trace.source, completed=True, records=records,
        observations=observations, finalResultRef=request.trace.finalResultRef,
        redactionManifestRef=request.trace.redactionManifestRef), registry)
    if issues:
        raise AssertionError(issues)
    raw = request.model_dump(mode='json', by_alias=True)
    raw['trace'] = trace.model_dump(mode='json')
    for key in ['requirement', 'plan']:
        raw[key].update(configuration[key])
        raw[key]['digest'] = digest({name: value for name, value in raw[key].items() if name != 'digest'})
    parsed = type(request).model_validate(raw)
    return {'request': parsed.model_dump(mode='json', by_alias=True),
            'response': compilation_response(parsed, registry, output_schema=schema)}


print(json.dumps(bridge(json.load(sys.stdin)), ensure_ascii=False))
