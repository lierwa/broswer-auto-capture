"""Adapt the existing QuickJS validator to the native preparation Agent tools."""
from copy import deepcopy
from types import SimpleNamespace
import json

import aiohttp
from browser_use.agent.views import ActionResult
from pydantic import Field, JsonValue
from jsonschema import Draft202012Validator

from .dom_evidence import DomQueryEvidence
from .evidence import Contract, EvidenceRef, ObservationFact, digest
from .natural_reads import VerifiedNaturalRead, find_elements_read_spec
from .natural_repeat_evidence import _assert_same_document
from .natural_target_compile import natural_target


class SelectionExample(Contract):
    candidates: list[dict[str, JsonValue]] = Field(min_length=1, max_length=300)
    ordinal: int = Field(gt=0, le=300)


class SelectionCheck(Contract):
    source: str = Field(min_length=1, max_length=20000, description=
        'Pure JavaScript function main({candidates}). Each candidate has original ordinal and text; return '
        'candidate.ordinal, never an array index. Candidates follow DOM order; preserve their ordinal '
        'if your function filters or sorts them.')
    examples: list[SelectionExample] = Field(default_factory=list, max_length=4, description=
        'Optional additional examples: {candidates:[{ordinal:1,text:"..."},...],ordinal:<expected ordinal>}. '
        'EVERY candidate requires its original ordinal and text. Expected ordinals follow the task rule; '
        'first-item and fixed-position rules may always return the same ordinal. Current live input is checked automatically.')


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
            # WHY：空集合是页面查询结果，不是函数错误；必须重新读取，不能回用旧集合或诱导反复改函数。
            if not read['output']:
                return ActionResult(error='selection_candidates_empty: the latest find_elements query returned '
                    'zero candidates. Inspect the current page and use find_elements with a corrected scoped '
                    'query before validating a selection rule. Changing the function cannot create missing '
                    'candidates; older reads are not used and no click has been performed.')
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
                    'confirmed rule. exampleIndex 0 is the current input; 1 onward are your optional examples. '
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
        records = [item for item in self.validated.values() if item['readActionRef'] == candidate['readActionRef']]
        if not records:
            guard = self.unique_query_guard(candidate, target, pre)
            if guard is not None:
                records = [guard]
        if len(records) != 1 or records[0]['ordinal'] != target['ordinal']:
            # WHY：缺少程序是编译缺口，不是浏览器操作错误；交给动作后的在线生成。
            return
        self.clicks[pre.id] = deepcopy(records[0])

    def unique_query_guard(self, candidate, target, pre):
        """Reuse the proven singleton query; never infer a choice among multiple candidates."""
        try:
            fact = self.current_read()
            read = VerifiedNaturalRead.model_validate(fact.value)
            observations = [item for item in self.collector.observations if fact in item.facts]
            queries = [item.value for observation in observations for item in observation.facts
                       if item.kind == 'dom_query' and isinstance(item.value, dict)
                       and item.value.get('actionRef') == read.actionRef]
            if len(observations) != 1 or len(queries) != 1:
                return None
            query = DomQueryEvidence.model_validate(queries[0])
            _assert_same_document(observations[0], pre)
            if not (candidate['readActionRef'] == read.actionRef and read.stable is True
                and read.output == [{**read.output[0], 'ordinal': 1}] and target['ordinal'] == 1
                and read.targetId == pre.tabId and query.scope.tabId == pre.tabId
                and query.scope.frameId is None and query.scope.url == pre.url
                and query.scope.urlDigest == read.urlDigest == digest(pre.url)
                and query.complete is True and query.truncated is False
                and query.total == query.showing == 1
                and query.query.model_dump(mode='json') == target['items']
                and digest(read.specification) == digest(find_elements_read_spec(query))):
                return None
            # WHY：这是唯一性保护，不是从单例猜业务规则；复跑出现第二项必须失败而非选第一项。
            draft = {'language': 'javascript', 'source': 'function main({candidates}) { '
                'if (candidates.length !== 1) throw new Error("target_not_unique"); '
                'return candidates[0].ordinal; }', 'inputs': {'candidates': read.specification.outputSchema},
                'outputSchema': {'type': 'integer', 'minimum': 1, 'maximum': read.specification.maxItems},
                'examples': [{'input': {'candidates': read.output}, 'output': 1}]}
            return {'draft': draft, 'ordinal': 1, 'readFactRef': fact.id, 'readActionRef': read.actionRef}
        except (ValueError, IndexError, KeyError, TypeError):
            return None

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
            prepared = ObservationFact(
                id='selection-' + action.id, kind='selection_function', value=value,
                sourceRefs=[EvidenceRef(ref='sha256:' + fingerprint, digest=fingerprint)])
            facts = observations[action.preObservationRef].facts
            existing = [item for item in facts if item.id == prepared.id]
            if existing and existing != [prepared]:
                raise ValueError('selection_function_snapshot_conflict')
            if not existing:
                facts.append(prepared)
        body = updated.model_dump(mode='json', exclude={'digest'})
        return type(trace).model_validate({**body, 'digest': digest(body)})


def register_selection_tool(tools):
    records = PreparedSelections()

    @tools.registry.action('Validate a deterministic rule over the latest complete find_elements candidates '
        'BEFORE clicking a collection item. Supply JavaScript function main({candidates}) implementing '
        'the confirmed task rule. Extra examples are optional, not proof of business correctness. '
        'A first-item rule may always return ordinal 1. The tool computes the current ordinal from live input. '
        'No browser, network, imports or async. The same program becomes the replay method.', param_model=SelectionCheck)
    async def bat_validate_selection(params: SelectionCheck):
        return await records.validate(params)

    return records
