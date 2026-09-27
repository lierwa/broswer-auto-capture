"""A complete empty native query remains scoped evidence, never a business total or selection."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from browser_use import Tools
from browser_use.agent.views import ActionResult

from workflow_use.hybrid.capture import EvidenceCollector
from workflow_use.hybrid.dom_evidence import capture_find_elements_query, complete_find_elements_query
from workflow_use.hybrid.evidence import EvidenceRef, digest
from workflow_use.hybrid.natural_compile import classify_natural_action, natural_dom_lookup_coverage
from workflow_use.hybrid.natural_selection import selection_read
from workflow_use.hybrid.post_action_target import CapturedTargetIdentity, verified_collection_query
from workflow_use.hybrid.registry import ActionRegistry


URL = 'https://example.test/items'
SELECTOR = 'a.next-page'
ARGS = {'selector': SELECTOR, 'max_results': 10, 'include_text': True, 'attributes': ['href']}


def reference(_kind, value):
    fingerprint = digest(value)
    return EvidenceRef(ref='sha256:' + fingerprint, digest=fingerprint)


class EmptyPage:
    def __init__(self):
        self.queries = []

    async def get_target_info(self):
        return {'targetId': 'tab-1'}

    async def get_url(self):
        return URL

    async def get_elements_by_css_selector(self, selector):
        self.queries.append(selector)
        return []


class EmptyBrowser:
    agent_focus_target_id = 'tab-1'

    def __init__(self):
        self.page = EmptyPage()
        evaluate = AsyncMock(return_value={'result': {'value': {
            'total': 0, 'showing': 0, 'elements': [], 'truncated': False}}})
        self.session = SimpleNamespace(session_id='session-1',
            cdp_client=SimpleNamespace(send=SimpleNamespace(Runtime=SimpleNamespace(evaluate=evaluate))))

    async def get_current_page(self):
        return self.page

    async def get_or_create_cdp_session(self):
        return self.session


class EmptyNativeQueryPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tools = Tools()
        self.browser = EmptyBrowser()
        self.registry = ActionRegistry.from_tools(self.tools)
        self.collector = EvidenceCollector(self.browser, self.registry,
            put_evidence=reference, redact_action=lambda value: value)
        self.collector.pending = {'sourceUrl': URL, 'actionId': 'a-0001'}
        self.summary = SimpleNamespace(url=URL)
        self.request = SimpleNamespace(plan=SimpleNamespace(outputSchemaDigest=digest({'type': 'null'})))

    async def native_result(self):
        registered = self.tools.registry.registry.actions['find_elements']
        return await registered.function(params=registered.param_model(**ARGS), browser_session=self.browser)

    async def pipeline(self, result, *, url=URL, tab_id='tab-1', arguments=None):
        arguments = arguments or ARGS
        pending = capture_find_elements_query(SimpleNamespace(url=url), 'a-0001',
            arguments, arguments, tab_id)
        query = complete_find_elements_query(pending, [result])
        result_ref = reference('action-result', result.model_dump(mode='json'))
        self.collector.results[(0, 0)] = result_ref
        reads = await self.collector.find_elements_read_facts(query, [result], 0)
        pre = SimpleNamespace(id='o-pre', url=URL, tabId='tab-1', sourceRefs=[reference('pre', URL)],
            facts=[self.collector.fact('url_digest', digest(URL))])
        post = SimpleNamespace(id='o-post', url=URL, tabId='tab-1', sourceRefs=[reference('post', URL)],
            facts=[self.collector.fact('url_digest', digest(URL)), self.collector.dom_query_fact(query), *reads])
        action = SimpleNamespace(id='a-0001', name='find_elements', args=arguments, effect='read',
            status='failed' if result.error else 'succeeded', resultRef=result_ref,
            preObservationRef=pre.id, postObservationRef=post.id)
        segment, path, gaps = classify_natural_action(
            self.request, self.registry, action, pre, post, {'type': 'null'})
        return query, reads, pre, post, action, segment, path, gaps

    async def test_native_empty_result_reaches_capture_and_compiler_as_a_scoped_read(self):
        result = await self.native_result()
        self.assertIsInstance(result, ActionResult)
        self.assertEqual(result.long_term_memory, f'Found 0 elements matching "{SELECTOR}".')
        query, reads, pre, post, action, segment, path, gaps = await self.pipeline(result)

        self.assertEqual((query.total, query.showing, query.truncated, query.complete), (0, 0, False, True))
        self.assertEqual(query.scope.urlDigest, digest(URL))
        self.assertEqual(len(reads), 1)
        self.assertEqual(reads[0].value['output'], [])
        self.assertTrue(reads[0].value['stable'])
        self.assertEqual(reads[0].value['resultDigest'], action.resultRef.digest)
        self.assertEqual(reads[0].value['containerIdsDigest'], digest([]))
        self.assertEqual(self.browser.page.queries, [SELECTOR] * 5)
        self.assertEqual(self.collector.source_gaps, [])
        self.assertIsNone(natural_dom_lookup_coverage(self.registry, action, pre, post))
        self.assertEqual(gaps, [])
        self.assertIsNone(path)  # Internal query does not become a declared business output.
        self.assertEqual(segment['operation']['name'], 'browser.read-fields')
        self.assertEqual(segment['operation']['specification']['outputSchema']['minItems'], 0)
        self.assertEqual(segment['target']['scope']['urlDigest'], digest(URL))

    async def test_truncated_native_result_cannot_produce_a_verified_read(self):
        self.browser.session.cdp_client.send.Runtime.evaluate.return_value = {'result': {'value': {
            'total': 11, 'showing': 10, 'elements': [], 'truncated': True}}}
        result = await self.native_result()
        query, reads, _pre, _post, _action, segment, _path, gaps = await self.pipeline(result)
        self.assertFalse(query.complete)
        self.assertIn('query_result_truncated', query.limitations)
        self.assertEqual(reads, [])
        self.assertIsNone(segment)
        self.assertTrue(gaps)
        self.assertEqual(self.browser.page.queries, [])

    async def test_failed_or_unrecognized_result_never_becomes_an_empty_read(self):
        for result, reason in [
            (ActionResult(error='find_elements failed'), 'query_action_failed'),
            (ActionResult(extracted_content='No matches', long_term_memory='No matches'),
             'query_result_summary_unrecognized'),
        ]:
            with self.subTest(reason=reason):
                query, reads, _pre, _post, _action, segment, _path, gaps = await self.pipeline(result)
                self.assertFalse(query.complete)
                self.assertIn(reason, query.limitations)
                self.assertIsNone(query.total)
                self.assertEqual(reads, [])
                self.assertIsNone(segment)
                self.assertTrue(gaps)
        self.assertEqual(self.browser.page.queries, [])

    async def test_empty_result_requires_a_known_page_scope(self):
        result = await self.native_result()
        for scope in ({'tab_id': None}, {'url': None}):
            with self.subTest(scope=scope):
                query, reads, _pre, _post, _action, segment, _path, gaps = await self.pipeline(result, **scope)
                self.assertFalse(query.complete)
                self.assertIn('query_scope_unavailable', query.limitations)
                self.assertEqual(reads, [])
                self.assertIsNone(segment)
                self.assertTrue(gaps)
        self.assertEqual(self.browser.page.queries, [])

    async def test_empty_query_cannot_supply_a_click_target_or_selection(self):
        query, reads, _pre, post, action, _segment, _path, _gaps = await self.pipeline(await self.native_result())
        identity = CapturedTargetIdentity(target_id='tab-1', url=URL, tag='a', attributes={},
            backend=17, history=object())
        _identity, target = await verified_collection_query(self.browser, self.summary,
            identity, self.collector.completed_queries, 1)
        self.assertIsNone(target)
        click = SimpleNamespace(id='a-0002', name='click', preObservationRef='click-pre')
        click_pre = SimpleNamespace(id=click.preObservationRef, url=URL, tabId='tab-1', facts=[
            self.collector.value_fact('dom_structure', {'actionRef': click.id,
                'queryCandidate': {'readActionRef': query.actionRef}})])
        trace = SimpleNamespace(actions=[action, click], observations=[post, click_pre])
        target = {'strategy': 'structure', 'container': {'kind': 'css', 'value': 'html'},
            'items': {'kind': 'css', 'value': SELECTOR}, 'withinItem': None, 'ordinal': 1,
            'scope': {'url': URL, 'urlDigest': digest(URL)}}
        self.assertEqual(reads[0].value['output'], [])
        self.assertIsNone(selection_read(trace, click, target))


if __name__ == '__main__':
    unittest.main()
