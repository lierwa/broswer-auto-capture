"""Attach the proven singleton query guard; semantic programs are annotated after actions."""
from copy import deepcopy
from types import SimpleNamespace

from .dom_evidence import DomQueryEvidence
from .evidence import EvidenceRef, ObservationFact, digest
from .natural_reads import VerifiedNaturalRead, find_elements_read_spec
from .natural_repeat_evidence import _assert_same_document
from .natural_target_compile import natural_target


class PreparedSelections:
    def __init__(self):
        self.collector = self.request = None
        self.clicks = {}

    def bind(self, collector, request):
        self.collector, self.request = collector, request

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
        guard = self.unique_query_guard(candidate, target, pre)
        if guard is None or guard['ordinal'] != target['ordinal']:
            # WHY：缺少程序是编译缺口，不是浏览器操作错误；交给动作后的在线生成。
            return
        self.clicks[pre.id] = deepcopy(guard)

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
