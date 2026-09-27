"""Adapt the existing QuickJS validator to the native preparation Agent tools."""
from copy import deepcopy
from types import SimpleNamespace
import json

import aiohttp
from browser_use.agent.views import ActionResult
from pydantic import Field
from jsonschema import Draft202012Validator

from .dom_evidence import CollectionReadRequired, DomQueryEvidence
from .evidence import Contract, EvidenceRef, ObservationFact, digest
from .natural_reads import VerifiedNaturalRead, find_elements_read_spec
from .natural_target_compile import natural_target
from .selection_annotation import SelectionExample


class SelectionCheck(Contract):
    source: str = Field(min_length=1, max_length=20000, description=
        'Pure JavaScript function main({candidates}). Each candidate has original ordinal and text; return '
        'candidate.ordinal, never an array index. Array order can differ from DOM ordinal order.')
    examples: list[SelectionExample] = Field(min_length=2, max_length=4, description=
        'Changed examples: {candidates:[{ordinal:1,text:"..."},...],ordinal:<expected selected ordinal>}. '
        'EVERY candidate requires its own unique ordinal and text. Vary count and selected ordinal.')


class SelectionMethodRequired(CollectionReadRequired):
    def __init__(self):
        RuntimeError.__init__(self, 'selection_method_required: call bat_validate_selection with a pure '
            'function main({candidates}) and 2-4 changed examples. The validator computes the current ordinal. '
            'Correct any reported error in this same preparation, then click that candidate using its '
            'current Browser-Use click index. Do not change the confirmed selection rule.')


class PreparedSelections:
    def __init__(self):
        self.collector = self.request = self.model = None
        self.validated, self.clicks = {}, {}

    def bind(self, collector, request, model):
        self.collector, self.request, self.model = collector, request, model

    def current_read(self):
        if self.collector is None or not self.collector.observations:
            raise ValueError('selection_current_read_required')
        current = self.collector.observations[-1]
        for observation in reversed(self.collector.observations):
            if observation.tabId != current.tabId or observation.url != current.url:
                break
            for fact in reversed(observation.facts):
                value = fact.value
                if (fact.kind == 'verified_natural_read' and isinstance(value, dict)
                        and value.get('stable') is True and isinstance(value.get('output'), list)
                        and value.get('specification', {}).get('includeOrdinal') is True):
                    return fact
        raise ValueError('selection_current_read_required')

    async def validate(self, params):
        try:
            fact = self.current_read()
            read = fact.value
            body = {**params.model_dump(mode='json'), 'candidates': read['output'],
                    'candidateSchema': read['specification']['outputSchema'],
                    'maxItems': read['specification']['maxItems']}
            validator = Draft202012Validator(body['candidateSchema'])
            for index, example in enumerate(params.examples):
                invalid = next(validator.iter_errors(example.candidates), None)
                if invalid is not None:
                    return ActionResult(error='selection_example_schema_invalid: example '
                        + str(index + 1) + ', path=' + json.dumps(list(invalid.absolute_path))
                        + ', constraint=' + invalid.validator + '. Use this exact candidate schema: '
                        + json.dumps(body['candidateSchema'], ensure_ascii=False)
                        + '. Every candidate has its own original ordinal and text; no click performed.')
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20), trust_env=False) as client:
                async with client.post(self.model.endpoint + '/validate-selection', json=body,
                        headers={'Authorization': 'Bearer ' + self.model.token}) as response:
                    checked = await response.json()
                    status = response.status
            if status != 200:
                raise ValueError('selection_validation_unavailable')
            if checked.get('valid') is not True:
                reason = checked.get('reason', 'selection_validation_failed')
                details = {key: checked[key] for key in ('exampleIndex', 'actual', 'expected') if key in checked}
                return ActionResult(error=reason + ' ' + json.dumps(details) + ': correct the program or expected examples using the '
                    'confirmed rule. exampleIndex 1 is the first changed example, 0 is the current candidates. '
                    'Do not change the task rule merely to match an answer; no click has been performed.')
            ordinal = checked['ordinal']
            if type(ordinal) is not int or not any(item.get('ordinal') == ordinal for item in body['candidates']):
                raise ValueError('selection_validation_invalid_result')
            draft = {'language': 'javascript', 'source': params.source,
                'inputs': {'candidates': body['candidateSchema']},
                'outputSchema': {'type': 'integer', 'minimum': 1, 'maximum': body['maxItems']},
                'examples': [{'input': {'candidates': body['candidates']}, 'output': ordinal},
                    *[{'input': {'candidates': item.candidates}, 'output': item.ordinal} for item in params.examples]]}
            self.validated[fact.id] = {'draft': deepcopy(draft), 'ordinal': ordinal,
                                       'readFactRef': fact.id, 'readActionRef': read['actionRef']}
            selected = next(item for item in body['candidates'] if item['ordinal'] == ordinal)
            return ActionResult(extracted_content='Selection method validated: '
                + json.dumps(selected, ensure_ascii=False)
                + '. Click this candidate using its current Browser-Use index; ordinal is not a click index.')
        except (ValueError, KeyError, AttributeError, aiohttp.ClientError, TimeoutError):
            return ActionResult(error='selection_validation_unavailable: obtain a complete current '
                'find_elements read and try the validation tool again; no click has been performed.')

    def before_dispatch(self):
        collector = self.collector
        pending = collector.pending
        if pending is None or 'click' not in pending['action']:
            return
        pre = next(item for item in collector.observations if item.id == pending['pre'])
        action = SimpleNamespace(id=pending['actionId'], name='click', args=pending['action']['click'])
        target, _, issues = natural_target(action, pre)
        if (issues or target is None or target.get('strategy') != 'structure'
                or target.get('container') != {'kind': 'css', 'value': 'html'}
                or target.get('withinItem') is not None):
            return
        structures = [fact.value for fact in pre.facts if fact.kind == 'dom_structure'
                      and isinstance(fact.value, dict) and fact.value.get('actionRef') == action.id]
        candidate = structures[0].get('queryCandidate') if len(structures) == 1 else None
        if not candidate or not candidate.get('readActionRef'):
            return
        if self.unique_query_target(candidate, target, pre):
            return
        records = [item for item in self.validated.values() if item['readActionRef'] == candidate['readActionRef']
                   and item['ordinal'] == target['ordinal']]
        if len(records) != 1:
            raise SelectionMethodRequired()
        self.clicks[pre.id] = deepcopy(records[0])

    def unique_query_target(self, candidate, target, pre):
        """A complete singleton control needs no selection algorithm during exploration."""
        try:
            fact = self.current_read()
            read = VerifiedNaturalRead.model_validate(fact.value)
            observations = [item for item in self.collector.observations if fact in item.facts]
            queries = [item.value for observation in observations for item in observation.facts
                       if item.kind == 'dom_query' and isinstance(item.value, dict)
                       and item.value.get('actionRef') == read.actionRef]
            if len(observations) != 1 or len(queries) != 1:
                return False
            query = DomQueryEvidence.model_validate(queries[0])
            from .natural_repeat_evidence import _assert_same_document
            _assert_same_document(observations[0], pre)
            # WHY：这里只放行当前完整唯一控件；普通集合编译仍要求 selection_function，
            # repeat 编译另外核验每一轮 query 身份、原生动作及新记录，不能把单例当动态选择规则。
            return (candidate['readActionRef'] == read.actionRef and read.stable is True
                and read.output == [{**read.output[0], 'ordinal': 1}] and target['ordinal'] == 1
                and read.targetId == pre.tabId and query.scope.tabId == pre.tabId
                and query.scope.frameId is None and query.scope.url == pre.url
                and query.scope.urlDigest == read.urlDigest == digest(pre.url)
                and query.complete is True and query.truncated is False
                and query.total == query.showing == 1
                and query.query.model_dump(mode='json') == target['items']
                and digest(read.specification) == digest(find_elements_read_spec(query)))
        except (ValueError, IndexError, KeyError, TypeError):
            return False

    def attach(self, trace):
        updated = trace.model_copy(deep=True)
        observations = {item.id: item for item in updated.observations}
        for action in updated.actions:
            record = self.clicks.get(action.preObservationRef)
            if record is None or action.name != 'click' or action.status != 'succeeded':
                continue
            value = {'actionRef': action.id, 'readFactRef': record['readFactRef'],
                     'requirementDigest': self.request.requirementDigest, 'draft': record['draft']}
            fingerprint = digest(value)
            observations[action.preObservationRef].facts.append(ObservationFact(
                id='selection-' + action.id, kind='selection_function', value=value,
                sourceRefs=[EvidenceRef(ref='sha256:' + fingerprint, digest=fingerprint)]))
        body = updated.model_dump(mode='json', exclude={'digest'})
        return type(trace).model_validate({**body, 'digest': digest(body)})


def register_selection_tool(tools):
    records = PreparedSelections()

    @tools.registry.action('Validate a deterministic rule over the latest complete find_elements candidates '
        'BEFORE clicking a dynamic collection item. Supply JavaScript function main({candidates}) and 2-4 '
        'changed examples; vary both candidate count and selected ordinal. The tool computes the current ordinal. '
        'No browser, network, imports or async. The same program becomes the replay method.', param_model=SelectionCheck)
    async def bat_validate_selection(params: SelectionCheck):
        return await records.validate(params)

    return records
