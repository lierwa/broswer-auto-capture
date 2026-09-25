import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.dom_evidence import CollectionReadRequired, DomQueryEvidence, DomScope, complete_find_elements_query
from workflow_use.hybrid.evidence import EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.natural_compile import natural_dom_lookup_coverage, natural_postconditions
from workflow_use.hybrid.natural_effects import read_page_effect
from workflow_use.hybrid.natural_reads import (
    VerifiedNaturalRead,
    compile_verified_read,
    find_elements_read_spec,
    runtime_read_specification,
)
from workflow_use.hybrid.natural_selection import bind_selection_function
from workflow_use.hybrid.natural_target_compile import natural_target
from workflow_use.hybrid.post_action_target import CapturedTargetIdentity, verified_collection_query

URL = 'https://example.test/items'
URL_DIGEST = digest(URL)
REF = EvidenceRef(ref='sha256:' + '1' * 64, digest='1' * 64)


def query(total=3, *, truncated=False, max_results=10, selector='a.item'):
    return DomQueryEvidence(actionRef='a-0001',
        scope=DomScope(url=URL, urlDigest=URL_DIGEST, tabId='tab-1', targetId=None,
                       frameId=None, document=None),
        query={'kind': 'css', 'value': selector}, requestedAttributes=[], includeText=True,
        maxResults=max_results, total=total, showing=min(total, max_results), truncated=truncated,
        complete=total > 0 and not truncated, limitations=['result_bodies_omitted'])


def fact(identity, kind, value):
    return ObservationFact(id=identity, kind=kind, value=value, sourceRefs=[REF])


class Element:
    def __init__(self, backend):
        self.backend = backend

    async def get_basic_info(self):
        return {'backendNodeId': self.backend}


def scoped_summary(backends, target_backend, *, tag='a', class_name='item'):
    parent = SimpleNamespace(node_name='div', backend_node_id=1000, target_id='tab-1',
                             frame_id=None, children_nodes=[])
    children = [SimpleNamespace(node_name=tag, backend_node_id=backend,
                 target_id='tab-1', frame_id=None, parent_node=parent,
                 attributes={'class': class_name}) for backend in backends]
    parent.children_nodes = children
    target = next(child for child in children if child.backend_node_id == target_backend)
    return SimpleNamespace(url=URL, dom_state=SimpleNamespace(selector_map={3: target}))


class DynamicSelectionTest(unittest.TestCase):
    def test_retained_target_guidance_preserves_complete_query_count(self):
        result = SimpleNamespace(error=None, long_term_memory=(
            'Found 38 elements matching "a.item". Retained DOM targets '
            '(query indexes are not Browser-Use click indexes): {"matchCount":38}'))

        pending = query().model_copy(update={'maxResults': 50, 'total': None, 'showing': None,
                                             'truncated': None, 'complete': False})
        completed = complete_find_elements_query(pending, [result])

        self.assertEqual(completed.total, 38)
        self.assertEqual(completed.showing, 38)
        self.assertFalse(completed.truncated)
        self.assertTrue(completed.complete)

    def test_only_incomplete_find_elements_may_remain_agent_internal(self):
        registry = SimpleNamespace(validate_action=lambda _name, _args: None)
        action = SimpleNamespace(id='a-0001', name='find_elements', status='succeeded', args={},
                                 resultRef=EvidenceRef(ref='result', digest='2' * 64))
        pre = SimpleNamespace(id='o-pre', tabId='tab-1', url=URL, sourceRefs=[REF],
                              facts=[fact('url-pre', 'url_digest', URL_DIGEST)])
        incomplete = query(total=12, truncated=True)
        post = SimpleNamespace(id='o-post', tabId='tab-1', url=URL, sourceRefs=[REF], facts=[
            fact('url-post', 'url_digest', URL_DIGEST),
            fact('query', 'dom_query', incomplete.model_dump(mode='json')),
        ])

        coverage = natural_dom_lookup_coverage(registry, action, pre, post)
        self.assertEqual(coverage.disposition, 'agent_internal')

        complete = query()
        post.facts[1] = fact('query-complete', 'dom_query', complete.model_dump(mode='json'))
        self.assertIsNone(natural_dom_lookup_coverage(registry, action, pre, post))

    def test_complete_find_elements_query_becomes_internal_read(self):
        current = query()
        specification = find_elements_read_spec(current)
        value = VerifiedNaturalRead(actionRef='a-0001', specification=specification,
            outputPath=[], readPath=[], output=[{'text': 'one', 'ordinal': 1}, {'text': 'two', 'ordinal': 2}, {'text': 'three', 'ordinal': 3}],
            resultDigest='2' * 64, urlDigest=URL_DIGEST, targetId='tab-1',
            containerIdsDigest='3' * 64, stable=True)
        pre = SimpleNamespace(id='o-pre', tabId='tab-1', url=URL,
                              sourceRefs=[REF], facts=[fact('url-pre', 'url_digest', URL_DIGEST)])
        post = SimpleNamespace(id='o-post', tabId='tab-1', url=URL, sourceRefs=[REF], facts=[
            fact('url-post', 'url_digest', URL_DIGEST),
            fact('query', 'dom_query', current.model_dump(mode='json')),
            fact('read', 'verified_natural_read', value.model_dump(mode='json')),
        ])
        action = SimpleNamespace(id='a-0001', name='find_elements',
                                 resultRef=EvidenceRef(ref='result', digest='2' * 64))
        request = SimpleNamespace(plan=SimpleNamespace(outputSchemaDigest=digest({'type': 'null'})))

        segment, path, issues = compile_verified_read(request, action, pre, post, {'type': 'null'}, [])

        self.assertEqual(issues, [])
        self.assertIsNone(path)
        self.assertEqual(segment['operation']['name'], 'browser.read-fields')
        self.assertEqual(segment['operation']['specification']['container'], 'a.item')
        self.assertEqual(segment['operation']['specification']['maxInputBytes'], 128000)

    def test_truncated_query_is_not_replayable(self):
        with self.assertRaisesRegex(ValueError, 'find_elements_read_query_incomplete'):
            find_elements_read_spec(query(total=12, truncated=True))

    def test_prior_query_proves_clicked_collection_ordinal(self):
        class Page:
            async def get_url(self): return URL
            async def get_elements_by_css_selector(self, _selector):
                return [Element(10), Element(20), Element(30)]

        class Browser:
            agent_focus_target_id = 'tab-1'
            async def get_current_page(self): return Page()

        identity = CapturedTargetIdentity(target_id='tab-1', url=URL, tag='a', attributes={},
                                          backend=30, history=object())
        current = query()
        verified = VerifiedNaturalRead(actionRef=current.actionRef, specification=find_elements_read_spec(current),
            outputPath=[], readPath=[], output=[{'text': str(index), 'ordinal': index} for index in (1, 2, 3)],
            resultDigest='2' * 64, urlDigest=URL_DIGEST, targetId='tab-1',
            containerIdsDigest='3' * 64, stable=True)
        with patch('workflow_use.hybrid.post_action_target.read_fields_with_proof',
                   AsyncMock(return_value=(verified.output, verified.containerIdsDigest))):
            _identity, target = asyncio.run(verified_collection_query(
                Browser(), scoped_summary((10, 20, 30), 30), identity, [(current, verified)], 3))
        self.assertEqual(target['ordinal'], 3)
        self.assertEqual(target['items'], {'kind': 'css', 'value': 'a.item'})
        self.assertEqual(target['readActionRef'], 'a-0001')

        with patch('workflow_use.hybrid.post_action_target.read_fields_with_proof',
                   AsyncMock(return_value=([{'text': 'changed', 'ordinal': 1}], verified.containerIdsDigest))):
            with self.assertRaises(CollectionReadRequired):
                asyncio.run(verified_collection_query(
                    Browser(), scoped_summary((10, 20, 30), 30), identity, [(current, verified)], 3))

    def test_broad_page_controls_cannot_prove_single_card_button_choice(self):
        class Page:
            async def get_url(self): return URL
            async def get_elements_by_css_selector(self, _selector):
                return [Element(index) for index in range(1, 42)]

        class Browser:
            agent_focus_target_id = 'tab-1'
            async def get_current_page(self): return Page()

        identity = CapturedTargetIdentity(target_id='tab-1', url=URL, tag='button',
            attributes={}, backend=17, history=object())
        current = query(41, max_results=100, selector='button')
        verified = VerifiedNaturalRead(actionRef=current.actionRef,
            specification=find_elements_read_spec(current), outputPath=[], readPath=[],
            output=[{'text': str(index), 'ordinal': index} for index in range(1, 42)],
            resultDigest='2' * 64, urlDigest=URL_DIGEST, targetId='tab-1',
            containerIdsDigest='3' * 64, stable=True)
        summary = scoped_summary((17,), 17, tag='button', class_name='media-card-btn')
        with patch('workflow_use.hybrid.post_action_target.read_fields_with_proof',
                   AsyncMock()) as read:
            with self.assertRaises(CollectionReadRequired):
                asyncio.run(verified_collection_query(
                    Browser(), summary, identity, [(current, verified)], 3))
            read.assert_not_awaited()

    def test_query_candidate_needs_requirement_owned_program_not_inferred_count(self):
        structure = {'actionRef': 'a-0002', 'scope': {'url': URL, 'urlDigest': URL_DIGEST,
            'tabId': 'tab-1', 'targetId': 'tab-1', 'frameId': None}, 'targetRef': 'n-0001',
            'nodes': [{'id': 'n-0001', 'tag': 'a', 'xpath': '/html/body/a[3]'}],
            'queryCandidate': {'scope': {'kind': 'document', 'tabId': 'tab-1', 'frameId': None},
                'container': {'kind': 'css', 'value': 'html'}, 'items': {'kind': 'css', 'value': 'a.item'},
                'withinItem': None, 'matchedItemOrdinal': 3, 'targetRef': 'n-0001', 'complete': True,
                'readActionRef': 'a-0001'},
            'historyTarget': None, 'limitations': []}
        pre = SimpleNamespace(id='click-pre', tabId='tab-1', url=URL, facts=[
            fact('url', 'url_digest', URL_DIGEST), fact('dom', 'dom_structure', structure)])
        action = SimpleNamespace(id='a-0002', name='click', preObservationRef=pre.id)
        target, _refs, issues = natural_target(action, pre)
        self.assertEqual(issues, [])
        self.assertEqual(target['strategy'], 'structure')
        self.assertEqual(target['ordinal'], 3)

        specification = find_elements_read_spec(query())
        verified = VerifiedNaturalRead(actionRef='a-0001', specification=specification,
            outputPath=[], readPath=[], output=[{'text': 'one', 'ordinal': 1}, {'text': 'two', 'ordinal': 2}, {'text': 'three', 'ordinal': 3}],
            resultDigest='2' * 64, urlDigest=URL_DIGEST, targetId='tab-1',
            containerIdsDigest='3' * 64, stable=True)
        read_fact = fact('read', 'verified_natural_read', verified.model_dump(mode='json'))
        trace = SimpleNamespace(actions=[SimpleNamespace(id='a-0001', name='find_elements', postObservationRef='read-post'), action],
                                observations=[pre, SimpleNamespace(id='read-post', tabId='tab-1', url=URL,
                                                                    facts=[read_fact])])
        read_segment = {'id': 's-a-0001', 'operation': {'name': 'browser.read-fields',
            'specification': runtime_read_specification(specification)},
            'outputs': [{'sourceRef': 'read'}]}
        click_segment = {'id': 's-a-0002', 'target': target}
        request = SimpleNamespace(trace=trace, requirement=SimpleNamespace(sourceDigest='4' * 64))
        non_click = SimpleNamespace(id=action.id, name='input', preObservationRef=pre.id)
        self.assertEqual(bind_selection_function(request, non_click, [read_segment], click_segment),
                         ([], click_segment, []))
        inserted, selected, gaps = bind_selection_function(request, action, [read_segment], click_segment)
        self.assertEqual(inserted, [])
        self.assertIsNone(selected)
        self.assertEqual(gaps[0].reason, 'selection_function_evidence_required')
        draft = {'language': 'javascript', 'source': 'function main({candidates}) { return candidates[0].ordinal; }',
            'inputs': {'candidates': specification.outputSchema},
            'outputSchema': {'type': 'integer', 'minimum': 1, 'maximum': 10},
            'examples': [{'input': {'candidates': verified.output}, 'output': 3}]}
        proposal = fact('selection-a-0002', 'selection_function', {'actionRef': action.id,
            'readFactRef': read_fact.id, 'requirementDigest': '4' * 64, 'draft': draft})
        trace.observations[0].facts.append(proposal)
        inserted, selected, gaps = bind_selection_function(request, action, [read_segment], click_segment)
        self.assertEqual(gaps, [])
        self.assertEqual(inserted[0]['kind'], 'function')
        self.assertEqual(inserted[0]['inputBindings']['candidates']['nodeId'], 's-a-0001')
        self.assertEqual(selected['target']['ordinalBinding'], {
            'source': 'node', 'nodeId': 'selection-a-0002', 'path': []})
        verified.targetId = 'other-tab'
        read_fact.value = verified.model_dump(mode='json')
        self.assertEqual(bind_selection_function(request, action, [read_segment], click_segment)[2][0].reason,
                         'collection_selection_read_required')
        verified.targetId = 'tab-1'
        read_fact.value = verified.model_dump(mode='json')
        proposal.value['requirementDigest'] = '5' * 64
        self.assertEqual(bind_selection_function(request, action, [read_segment], click_segment)[2][0].reason,
                         'selection_function_source_mismatch')

    def test_fixed_identity_is_not_rejected_merely_for_repeated_ancestors(self):
        identity = {'schemaVersion': 'browser-use.dom-interacted-element/v1', 'nodeName': 'a',
                    'xPath': '/html/body/div/a[2]', 'elementHash': '1', 'stableHash': '2',
                    'axNameDigest': None, 'attributes': []}
        structure = {'actionRef': 'a-0002', 'scope': {'url': URL, 'urlDigest': URL_DIGEST,
            'tabId': 'tab-1', 'targetId': 'tab-1', 'frameId': None}, 'targetRef': 'n-0003',
            'nodes': [
                {'id': 'n-0001', 'tag': 'div', 'xpath': '/html/body/div', 'parentRef': None,
                 'childrenRefs': ['n-0002', 'n-0003']},
                {'id': 'n-0002', 'tag': 'a', 'xpath': '/html/body/div/a[1]', 'parentRef': 'n-0001',
                 'childrenRefs': []},
                {'id': 'n-0003', 'tag': 'a', 'xpath': '/html/body/div/a[2]', 'parentRef': 'n-0001',
                 'childrenRefs': []},
            ], 'queryCandidate': None, 'historyTarget': identity, 'limitations': []}
        pre = SimpleNamespace(tabId='tab-1', url=URL, facts=[
            fact('url', 'url_digest', URL_DIGEST), fact('dom', 'dom_structure', structure)])

        target, _refs, issues = natural_target(SimpleNamespace(id='a-0002', name='click'), pre)

        self.assertEqual(issues, [])
        self.assertEqual(target['strategy'], 'history')

    def test_repeated_collection_without_read_cannot_compile_fixed_xpath(self):
        identity = {'schemaVersion': 'browser-use.dom-interacted-element/v1', 'nodeName': 'a',
                    'xPath': '/html/body/div/a[3]', 'elementHash': '1', 'stableHash': '2',
                    'axNameDigest': None, 'attributes': []}
        structure = {'actionRef': 'a-0002', 'scope': {'url': URL, 'urlDigest': URL_DIGEST,
            'tabId': 'tab-1', 'targetId': 'tab-1', 'frameId': None}, 'targetRef': 'n-0004',
            'nodes': [
                {'id': 'n-0001', 'tag': 'div', 'xpath': '/html/body/div', 'parentRef': None,
                 'childrenRefs': ['n-0002', 'n-0003', 'n-0004'], 'attributes': {}},
                *[{'id': f'n-000{index}', 'tag': 'a', 'xpath': f'/html/body/div/a[{index - 1}]',
                   'parentRef': 'n-0001', 'childrenRefs': [],
                   'attributes': {'class': 'entry selected' if index == 4 else 'entry'}}
                  for index in (2, 3, 4)],
            ], 'queryCandidate': None, 'historyTarget': identity,
            'coverage': {'childSets': [{'parentRef': 'n-0001', 'truncated': False}]},
            'limitations': ['query_candidate_unavailable']}
        pre = SimpleNamespace(tabId='tab-1', url=URL, facts=[
            fact('url', 'url_digest', URL_DIGEST), fact('dom', 'dom_structure', structure)])

        target, _refs, issues = natural_target(SimpleNamespace(id='a-0002', name='click'), pre)

        self.assertIsNone(target)
        self.assertEqual([(item.reason, item.resolution) for item in issues],
                         [('collection_selection_read_required', 'collect_evidence')])

    def test_exact_identity_selector_is_not_blanket_rejected(self):
        structure = {'actionRef': 'a-0002', 'scope': {'url': URL, 'urlDigest': URL_DIGEST,
            'tabId': 'tab-1', 'targetId': 'tab-1', 'frameId': None}, 'targetRef': 'n-0004',
            'nodes': [
                {'id': 'n-0001', 'tag': 'ul', 'xpath': '/html/body/ul', 'parentRef': None,
                 'childrenRefs': ['n-0002', 'n-0003']},
                {'id': 'n-0002', 'tag': 'li', 'xpath': '/html/body/ul/li[1]', 'parentRef': 'n-0001',
                 'childrenRefs': ['n-0004']},
                {'id': 'n-0003', 'tag': 'li', 'xpath': '/html/body/ul/li[2]', 'parentRef': 'n-0001',
                 'childrenRefs': ['n-0005']},
                {'id': 'n-0004', 'tag': 'a', 'xpath': '/html/body/ul/li[1]/a', 'parentRef': 'n-0002',
                 'childrenRefs': []},
                {'id': 'n-0005', 'tag': 'a', 'xpath': '/html/body/ul/li[2]/a', 'parentRef': 'n-0003',
                 'childrenRefs': []},
            ], 'queryCandidate': {
                'scope': {'kind': 'document', 'tabId': 'tab-1', 'frameId': None},
                'container': {'kind': 'css', 'value': 'html'},
                'items': {'kind': 'css', 'value': 'a[title="Observed item"]'},
                'withinItem': None, 'matchedItemOrdinal': 1,
                'targetRef': 'n-0004', 'complete': True,
            }, 'historyTarget': None, 'limitations': []}
        pre = SimpleNamespace(tabId='tab-1', url=URL, facts=[
            fact('url', 'url_digest', URL_DIGEST), fact('dom', 'dom_structure', structure)])

        target, _refs, issues = natural_target(SimpleNamespace(id='a-0002', name='click'), pre)

        self.assertEqual(issues, [])
        self.assertEqual(target['strategy'], 'structure')

    def test_wait_uses_active_media_as_completion_proof(self):
        class Page:
            async def evaluate(self, _script): return 'playing'

        self.assertEqual(asyncio.run(read_page_effect('media_playback', Page())), 'playing')
        pre = SimpleNamespace(facts=[fact('url-pre', 'url_digest', URL_DIGEST),
                                     fact('media-pre', 'media_playback', 'playing')])
        post = SimpleNamespace(facts=[fact('url-post', 'url_digest', URL_DIGEST),
                                      fact('media-post', 'media_playback', 'playing')])
        conditions, _refs, issues = natural_postconditions(
            SimpleNamespace(id='a-0003', name='wait'), pre, post, None, [])
        self.assertEqual(issues, [])
        self.assertEqual(conditions[0]['kind'], 'media_playback')
        self.assertEqual(conditions[0]['equals'], 'playing')


if __name__ == '__main__':
    unittest.main()
