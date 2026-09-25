"""Authoring follow-up gates: only exact compiler field gaps may trigger evidence work."""
import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from browser_use import Agent as BrowserUseAgent
from pydantic import BaseModel

from browser_use_runner.output_schema import output_model_for
from workflow_use.hybrid.__main__ import _compilation_sources
from workflow_use.hybrid.author import (AUTHOR_URL_SHORTENING_LIMIT, NATURAL_AGENT_GUIDANCE,
                                        NATURAL_EXECUTION_AGENT_GUIDANCE,
                                        VISIBLE_TEXT_EXTRACTION_GUIDANCE, NavigationScopeViolation,
                                        _business_result, _public_compilation_request, _reject_navigation_scope_retry,
                                         author_tools, author_tools_for_result_spec, field_read_outcome,
                                        normalize_author_action)
from workflow_use.hybrid.dom_reference_tool import (
    MAX_MODEL_OUTPUT_CHARS,
    DomInspectParams,
    DomReferenceStore,
    _inspection_payload,
    register_dom_inspection_tool,
)
from workflow_use.hybrid.coverage import EXECUTION_EXTRACTION_RULE, execution_extraction_coverage, validate_coverage
from workflow_use.hybrid.evidence import ActionCoverage, EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.field_read_params import FieldReadToolParams
from workflow_use.hybrid.field_read_tool import _fixed_read_error
from workflow_use.hybrid.read import ReadField, ReadSpec, read_fields
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.natural_compile import NATURAL_SETTLE, natural_postconditions
from workflow_use.hybrid.rendered_field_text import FieldReadError
from workflow_use.hybrid.request import DataResultSpec, NaturalCompilationRequest, NaturalPlan


class AuthorFollowUpTests(unittest.TestCase):
    def test_execution_authoring_excludes_unreplayable_extract_but_keeps_structured_query(self):
        class Output(BaseModel):
            value: None = None

        registry = ActionRegistry.from_tools(author_tools(Output, exclude_extract=True))

        self.assertNotIn('extract', registry.names)
        self.assertIn('find_elements', registry.names)
        self.assertTrue({'navigate', 'scroll', 'search_page', 'send_keys', 'dropdown_options'} <= set(registry.names))
        self.assertFalse({'search', 'find_text', 'switch', 'close', 'save_as_pdf'} & set(registry.names))

        rebuilt = ActionRegistry.from_tools(author_tools_for_result_spec(
            Output, SimpleNamespace(mode='execution')))
        self.assertEqual(rebuilt.schemaDigest, registry.schemaDigest)

    def test_successful_business_result_does_not_require_a_judge(self):
        class History:
            def is_done(self): return True
            def is_successful(self): return True
            def get_structured_output(self, model): return model.model_validate({'value': 'done'})

        schema = {'type': 'object', 'properties': {'value': {'type': 'string'}},
                  'required': ['value'], 'additionalProperties': False}
        model, unwrap = output_model_for(schema, 'SuccessfulOutput')
        completed, output, gaps = _business_result(History(), False, model, unwrap, schema)

        self.assertTrue(completed)
        self.assertEqual(output, {'value': 'done'})
        self.assertEqual(gaps, [])

    def test_agent_guidance_preserves_runtime_url_and_reads_every_output_page(self):
        self.assertIn('runtime input URL exactly as supplied', NATURAL_AGENT_GUIDANCE)
        self.assertIn('Use native extract on every page', NATURAL_AGENT_GUIDANCE)
        self.assertIn('complete visible text only', NATURAL_AGENT_GUIDANCE)
        self.assertIn('transient signed URLs', NATURAL_AGENT_GUIDANCE)
        self.assertIn('stop immediately', NATURAL_AGENT_GUIDANCE)

    def test_execution_guidance_does_not_request_the_excluded_extract_tool(self):
        self.assertNotIn('Use native extract on every page', NATURAL_EXECUTION_AGENT_GUIDANCE)
        self.assertIn('native extract is intentionally unavailable', NATURAL_EXECUTION_AGENT_GUIDANCE)
        self.assertIn('find_elements for complete candidate collections', NATURAL_EXECUTION_AGENT_GUIDANCE)

    def test_navigation_outside_authorized_scope_stops_without_another_model_step(self):
        agent = SimpleNamespace(history=SimpleNamespace(history=[SimpleNamespace(result=[
            SimpleNamespace(error='Navigation failed: Navigation to https://elsewhere.test blocked by security policy'),
        ])]))

        with self.assertRaisesRegex(NavigationScopeViolation, 'hybrid_navigation_outside_authorized_scope'):
            _reject_navigation_scope_retry(agent)

    def test_extract_query_is_normalized_to_literal_visible_text_before_dispatch(self):
        params = SimpleNamespace(query='Read the complete body.', extract_links=False)
        action = SimpleNamespace(extract=params, find_elements=None)

        normalize_author_action(action)
        normalize_author_action(action)

        self.assertEqual(params.query.count(VISIBLE_TEXT_EXTRACTION_GUIDANCE), 1)
        self.assertIn('Collapse every whitespace run to one space', params.query)
        self.assertIn('add no Markdown', params.query)

    def test_runtime_input_url_is_not_shortened_before_the_navigate_action(self):
        url = ('https://example.test/issues?q=' + 'is%3Aissue%20state%3Aclosed%20label%3Abug%20'
               + 'created%3A2026-08-01..2026-08-31%20sort%3Aupdated-desc')
        agent = SimpleNamespace(_url_shortening_limit=AUTHOR_URL_SHORTENING_LIMIT)

        visible, replacements = BrowserUseAgent._replace_urls_in_text(agent, url)

        self.assertEqual(visible, url)
        self.assertEqual(replacements, {})

    def test_optional_null_from_browser_use_is_omitted_at_the_json_schema_boundary(self):
        schema = {'type': 'object', 'properties': {
            'items': {'type': 'array', 'items': {'type': 'string'}},
            'detail': {'type': 'object', 'properties': {'title': {'type': 'string'}},
                       'required': ['title'], 'additionalProperties': False},
        }, 'required': ['items'], 'additionalProperties': False}
        model, unwrap = output_model_for(schema, 'OptionalOutput')

        value = model.model_validate({'items': [], 'detail': None})

        self.assertEqual(unwrap(value), {'items': []})

    def test_author_result_serializes_result_spec_with_public_schema_alias(self):
        class Compilation(BaseModel):
            resultSpec: DataResultSpec

        schema = {'type': 'object', 'properties': {'items': {'type': 'array', 'items': {'type': 'string'}}},
                  'required': ['items'], 'additionalProperties': False}
        compilation = Compilation(resultSpec={'contractVersion': 'bat-result-spec/v1', 'mode': 'data',
            'schema': schema, 'fields': [{'path': ['items'], 'description': 'items',
                                         'producerRef': 'items-read'}], 'edgeCases': []})
        result = _public_compilation_request(compilation)

        self.assertEqual(result['resultSpec']['schema'], schema)
        self.assertNotIn('schemaValue', result['resultSpec'])

    def test_natural_source_payload_matches_public_author_request(self):
        schema = {'type': 'object', 'properties': {'items': {'type': 'array', 'items': {'type': 'string'}}},
                  'required': ['items'], 'additionalProperties': False}
        spec = DataResultSpec.model_validate({'contractVersion': 'bat-result-spec/v1', 'mode': 'data',
            'schema': schema, 'fields': [{'path': ['items'], 'description': 'items',
                                         'producerRef': 'items-read'}], 'edgeCases': []})
        plan = NaturalPlan.model_construct(id='plan', version=1, sourceDigest='a' * 64,
            digest='b' * 64, stepId='step', inputSchemaDigest='c' * 64,
            outputSchemaDigest='d' * 64, callMode='once', entryUrls=[], resultSpec=spec)
        request = NaturalCompilationRequest.model_construct(
            compilerVersion='bat-hybrid/2', actionRegistryVersion='registry',
            requirement=SimpleNamespace(model_dump=lambda **_kwargs: {'id': 'requirement'}), plan=plan,
            runtimeInputSchema={'type': 'object'},
            trace=SimpleNamespace(model_dump=lambda **_kwargs: {'mediaType': 'trace'}))

        public_plan = request.model_dump(mode='json', by_alias=True)['plan']
        public_plan.pop('digest')
        source_plan = _compilation_sources(request)[1]

        self.assertEqual(source_plan, public_plan)
        self.assertIn('schema', source_plan['resultSpec'])
        self.assertNotIn('schemaValue', source_plan['resultSpec'])

    def test_execution_extract_cannot_be_erased_when_public_result_is_null(self):
        class Output(BaseModel):
            value: None = None

        registry = ActionRegistry.from_tools(author_tools(Output))
        url = 'https://example.test/watch'
        url_digest = digest(url)
        url_fact = lambda identity: ObservationFact(
            id=identity, kind='url_digest', value=url_digest,
            sourceRefs=[EvidenceRef(ref='fixture:' + identity, digest=url_digest)])
        pre = SimpleNamespace(id='o-pre', tabId='tab-1', url=url, facts=[url_fact('before')], sourceRefs=[])
        post = SimpleNamespace(id='o-post', tabId='tab-1', url=url, facts=[url_fact('after')], sourceRefs=[])
        action = SimpleNamespace(id='a-0001', name='extract', effect='read', status='succeeded',
            args={'query': 'Read visible playback state.', 'extract_links': False, 'extract_images': False},
            resultRef=EvidenceRef(ref='fixture:result', digest='2' * 64),
            preObservationRef=pre.id, postObservationRef=post.id)

        coverage = execution_extraction_coverage(
            registry, action, pre, post, SimpleNamespace(mode='execution'), {'type': 'null'})

        self.assertIsNone(coverage)
        stale = ActionCoverage(actionRef=action.id, disposition='agent_internal', ownerSegmentId=None,
            exclusionRule=EXECUTION_EXTRACTION_RULE, evidenceRefs=[action.resultRef])
        trace = SimpleNamespace(actions=[action], observations=[pre, post])
        issues = validate_coverage(trace, [stale], set(), registry=registry,
            result_spec=SimpleNamespace(mode='execution'), output_schema={'type': 'null'})
        self.assertEqual([issue.reason for issue in issues], ['invalid_exclusion'])
        self.assertIsNone(execution_extraction_coverage(
            registry, action, pre, post, SimpleNamespace(mode='data'), {'type': 'null'}))

    def test_click_navigation_accepts_a_new_focused_tab_without_persisting_its_id(self):
        before = ObservationFact(id='before-url', kind='url_digest', value='1' * 64,
            sourceRefs=[EvidenceRef(ref='fixture:before-url', digest='1' * 64)])
        after = ObservationFact(id='after-url', kind='url_digest', value='2' * 64,
            sourceRefs=[EvidenceRef(ref='fixture:after-url', digest='2' * 64)])
        pre = SimpleNamespace(tabId='tab-before', facts=[before])
        post = SimpleNamespace(tabId='tab-after', facts=[after])

        conditions, _refs, issues = natural_postconditions(
            SimpleNamespace(id='a-0001', name='click'), pre, post, {'strategy': 'history'}, [])

        self.assertEqual(issues, [])
        self.assertEqual(conditions, [{
            'kind': 'url_digest', 'changed': True, 'clauseRef': after.id, 'settle': NATURAL_SETTLE,
        }])

    def test_fixed_wait_keeps_the_runtime_url_without_freezing_the_sample_url(self):
        before = ObservationFact(id='before-url', kind='url_digest', value='1' * 64,
            sourceRefs=[EvidenceRef(ref='fixture:before-url', digest='1' * 64)])
        after = ObservationFact(id='after-url', kind='url_digest', value='1' * 64,
            sourceRefs=[EvidenceRef(ref='fixture:after-url', digest='2' * 64)])
        pre = SimpleNamespace(tabId='tab-1', facts=[before])
        post = SimpleNamespace(tabId='tab-1', facts=[after])

        conditions, _refs, issues = natural_postconditions(
            SimpleNamespace(id='a-0001', name='wait'), pre, post, None, [])

        self.assertEqual(issues, [])
        self.assertEqual(conditions, [{
            'kind': 'url_digest', 'unchanged': True, 'clauseRef': after.id,
        }])

    def test_optional_result_field_requires_edge_case(self):
        schema = {'type': 'object', 'properties': {
            'items': {'type': 'array', 'items': {'type': 'string'}},
            'detail': {'type': 'string'},
        }, 'required': ['items'], 'additionalProperties': False}

        with self.assertRaisesRegex(ValueError, 'result_spec_optional_field_edge_case_required'):
            DataResultSpec.model_validate({'contractVersion': 'bat-result-spec/v1', 'mode': 'data',
                'schema': schema, 'fields': [
                    {'path': ['items'], 'description': 'items', 'producerRef': 'items-read'},
                    {'path': ['detail'], 'description': 'detail', 'producerRef': 'detail-read'},
                ], 'edgeCases': []})

    def test_result_refs_match_public_task_chain_key_contract(self):
        schema = {'type': 'object', 'properties': {'message': {'type': 'string'}},
                  'required': ['message'], 'additionalProperties': False}
        spec = DataResultSpec.model_validate({'contractVersion': 'bat-result-spec/v1', 'mode': 'data',
            'schema': schema, 'fields': [{'path': ['message'], 'description': 'message',
                                         'producerRef': 'catalogResultText'}], 'edgeCases': []})

        self.assertEqual(spec.fields[0].producerRef, 'catalogResultText')
        with self.assertRaises(ValueError):
            DataResultSpec.model_validate({'contractVersion': 'bat-result-spec/v1', 'mode': 'data',
                'schema': schema, 'fields': [{'path': ['message'], 'description': 'message',
                                             'producerRef': 'a' * 65}], 'edgeCases': []})

    def test_authoring_exposes_no_bat_evidence_or_wait_tools_to_the_model(self):
        class Output(BaseModel):
            value: str

        registry = ActionRegistry.from_tools(author_tools(Output))

        self.assertTrue({
            'bat_inspect_dom', 'bat_read_fields', 'bat_wait_for', 'bat_scroll_to', 'bat_summarize',
        }.isdisjoint(registry.names))

    def test_projected_schema_failure_keeps_a_fixed_diagnostic(self):
        error = FieldReadError('read_output_schema_mismatch', reason='projected_output_invalid')

        self.assertEqual(
            _fixed_read_error(error),
            'read_output_schema_mismatch: reason=projected_output_invalid',
        )

    def test_model_visible_field_read_contract_has_no_css(self):
        schema = json.dumps(FieldReadToolParams.model_json_schema(), sort_keys=True)

        self.assertNotIn('selector', schema.lower())
        self.assertNotIn('"container"', schema.lower())
        self.assertNotIn('containerref', schema.lower())

    def test_dom_refs_are_exposed_once_even_with_long_term_summary(self):
        class Tools:
            def action(self, _description, param_model):
                self.param_model = param_model
                def register(function):
                    self.function = function
                    return function
                return register

        tools = Tools()
        store = register_dom_inspection_tool(tools)

        async def inspect(_browser, _index):
            return {'nodes': [{'ref': 'dom-1', 'tag': 'article'}]}

        store.inspect = inspect
        result = asyncio.run(tools.function(DomInspectParams(index=7), SimpleNamespace()))

        self.assertTrue(result.include_extracted_content_only_once)
        self.assertIn('dom-1', result.extracted_content)
        self.assertIn('Inspected 1 bounded DOM nodes', result.long_term_memory)

    def test_dom_inspection_stays_below_browser_use_read_state_limit(self):
        class Node:
            node_name = 'DIV'
            session_id = 'session'
            target_id = 'target'
            frame_id = None
            shadow_root_type = None
            parent_node = None
            children_nodes = []

            def __init__(self, backend):
                self.backend_node_id = backend
                self.attributes = {name: 'x' * 240 for name in (
                    'id', 'class', 'role', 'name', 'type', 'data-testid', 'data-test',
                    'data-cy', 'aria-label', 'href', 'datetime')}

            def get_all_children_text(self, max_depth):
                return 'y' * (max_depth * 240)

        store = DomReferenceStore()
        references = [store._remember(Node(index), 'target', 'https://example.test/')
                      for index in range(1, 241)]

        payload = _inspection_payload(references[0].ref, references, store, False)
        encoded = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))

        self.assertLessEqual(len(encoded), MAX_MODEL_OUTPUT_CHARS)
        self.assertTrue(payload['truncated'])
        self.assertLess(len(payload['nodes']), len(references))

    def test_real_dom_refs_generate_and_verify_the_existing_read_spec(self):
        def node(tag, backend):
            return SimpleNamespace(node_name=tag, backend_node_id=backend, session_id='session',
                target_id='target', frame_id=None, shadow_root_type=None, attributes={},
                parent_node=None, children_nodes=[])

        html, body, listing = node('HTML', 1), node('BODY', 2), node('UL', 3)
        first, first_title, first_state = node('LI', 4), node('A', 5), node('SPAN', 6)
        second, second_title, second_state = node('LI', 7), node('A', 8), node('SPAN', 9)
        html.children_nodes, body.parent_node = [body], html
        body.children_nodes, listing.parent_node = [listing], body
        listing.children_nodes = [first, second]
        first.parent_node = second.parent_node = listing
        first.children_nodes, second.children_nodes = [first_title, first_state], [second_title, second_state]
        first_title.parent_node = first_state.parent_node = first
        second_title.parent_node = second_state.parent_node = second

        store = DomReferenceStore()
        references = {item.backend_node_id: store._remember(item, 'target', 'https://example.test/')
                      for item in (first, first_title, first_state, second, second_title, second_state)}
        live = {
            4: 'html > body:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(1)',
            5: 'html > body:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(1) > a:nth-of-type(1)',
            6: 'html > body:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(1) > span:nth-of-type(1)',
            # The enhanced tree omits one ordinary sibling; live DOM positions must still win.
            7: 'html > body:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(3)',
            8: 'html > body:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(3) > a:nth-of-type(1)',
            9: 'html > body:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(3) > span:nth-of-type(1)',
        }

        class Element:
            def __init__(self, backend, page):
                self.backend = backend
                self.page = page

            async def get_basic_info(self):
                return {'backendNodeId': self.backend}

            async def evaluate(self, _script, selector=None):
                if not self.page.document_requested:
                    raise RuntimeError('Document needs to be requested first')
                if self.backend in self.page.removed:
                    raise RuntimeError('backend node is no longer available')
                if selector is None:
                    return live[self.backend]
                selectors = []
                if 'a:nth-of-type(1)' in selector:
                    selectors.append(':scope > a:nth-of-type(1)')
                if 'span:nth-of-type(1)' in selector:
                    selectors.append(':scope > span:nth-of-type(1)')
                return json.dumps({'selectors': selectors})

        class Page:
            def __init__(self):
                self.document_requested = False
                self.removed = set()

            async def get_url(self):
                return 'https://example.test/'

            async def get_target_info(self):
                return {'targetId': 'target'}

            async def get_elements_by_css_selector(self, selector):
                if selector == 'html':
                    self.document_requested = True
                    return [Element(1, self)]
                requested = selector.split(',')
                return [Element(backend, self) for backend, path in live.items()
                        if path in requested and backend not in self.removed]

            async def get_element(self, backend):
                return Element(backend, self)

        class Browser:
            agent_focus_target_id = 'target'

            def __init__(self):
                self.page = Page()

            async def get_current_page(self):
                return self.page

        params = FieldReadToolParams.model_validate({'outputPath': ['issues'], 'records': [
            {'fields': {
                'title': {'refs': [references[5].ref]}, 'state': {'refs': [references[6].ref]},
            }},
            {'fields': {
                'title': {'refs': [references[8].ref]}, 'state': {'refs': [references[9].ref]},
            }},
        ]})
        target_schema = {'type': 'array', 'maxItems': 2, 'items': {'type': 'object',
            'properties': {'title': {'type': 'string'}, 'state': {'type': 'string'}},
            'required': ['title', 'state'], 'additionalProperties': False}}

        browser = Browser()
        mapping = asyncio.run(store.mapping(params, target_schema, browser))

        self.assertIn('li:nth-of-type(1)', mapping.specification.container)
        self.assertIn('li:nth-of-type(3)', mapping.specification.container)
        self.assertEqual(mapping.specification.fields['title'].selector,
                         ':scope > a:nth-of-type(1)')
        self.assertEqual(mapping.specification.fields['state'].selector,
                         ':scope > span:nth-of-type(1)')
        browser.page.removed.add(8)
        with self.assertRaisesRegex(ValueError, 'dom_reference_field_mismatch'):
            asyncio.run(store.mapping(params, target_schema, browser))

    def test_fabricated_dom_ref_is_rejected_before_reading(self):
        params = FieldReadToolParams.model_validate({'outputPath': ['title'], 'records': [
            {'fields': {'value': {'refs': ['dom-998']}}},
        ]})

        with self.assertRaisesRegex(ValueError, 'dom_reference_missing'):
            asyncio.run(DomReferenceStore().mapping(
                params, {'type': 'string'}, SimpleNamespace()))

    def test_record_scope_cannot_expand_to_the_document_root(self):
        def node(tag, backend):
            return SimpleNamespace(node_name=tag, backend_node_id=backend, session_id='session',
                target_id='target', frame_id=None, shadow_root_type=None, attributes={},
                parent_node=None, children_nodes=[])

        html, body = node('HTML', 1), node('BODY', 2)
        first, second = node('ARTICLE', 3), node('ARTICLE', 4)
        first_title, second_state = node('A', 5), node('SPAN', 6)
        html.children_nodes, body.parent_node = [body], html
        body.children_nodes, first.parent_node, second.parent_node = [first, second], body, body
        first.children_nodes, first_title.parent_node = [first_title], first
        second.children_nodes, second_state.parent_node = [second_state], second
        store = DomReferenceStore()
        title = store._remember(first_title, 'target', 'https://example.test/')
        state = store._remember(second_state, 'target', 'https://example.test/')
        params = FieldReadToolParams.model_validate({'outputPath': ['issue'], 'records': [
            {'fields': {'title': {'refs': [title.ref]}, 'state': {'refs': [state.ref]}}},
        ]})
        schema = {'type': 'object', 'properties': {
            'title': {'type': 'string'}, 'state': {'type': 'string'},
        }, 'required': ['title', 'state'], 'additionalProperties': False}

        with self.assertRaisesRegex(ValueError, 'dom_reference_record_scope_mismatch'):
            asyncio.run(store.mapping(params, schema, SimpleNamespace()))

    def test_dom_reference_failures_remain_visible_in_progress(self):
        result = SimpleNamespace(error='dom_reference_record_scope_mismatch')
        agent = SimpleNamespace(history=SimpleNamespace(history=[SimpleNamespace(result=[result])]))

        self.assertEqual(field_read_outcome(agent), {
            'readOutcome': 'failed', 'readError': 'dom_reference_record_scope_mismatch',
        })

    def test_projected_output_contract_failure_is_not_an_unknown_tool_error(self):
        class Element:
            async def evaluate(self, _script, _projection):
                return json.dumps({'value': {
                    'selfMatched': False,
                    'values': [{'value': 'too long', 'hasShadow': False}],
                }})

        class Resolver:
            def __init__(self, _browser):
                pass

            async def resolve_collection(self, _selector, _scope=None):
                return [Element()]

        specification = ReadSpec(
            container='article', fields={'value': ReadField(selector='span')}, maxItems=1,
            outputSchema={'type': 'object', 'properties': {
                'value': {'type': 'string', 'maxLength': 1},
            }, 'required': ['value'], 'additionalProperties': False},
        )
        with patch('workflow_use.hybrid.read.TargetResolver', Resolver):
            with self.assertRaisesRegex(FieldReadError, 'read_output_schema_mismatch'):
                asyncio.run(read_fields(object(), specification))

    def test_reader_supports_object_arrays_with_multivalue_fields(self):
        class Element:
            def __init__(self, values):
                self.values = values

            async def evaluate(self, _script, projection):
                return json.dumps({field['name']: {
                    'selfMatched': False,
                    'values': [{'value': value, 'hasShadow': False}
                               for value in self.values[field['name']]],
                } for field in projection})

        elements = [
            Element({'title': ['First'], 'labels': ['bug', 'external'], 'url': ['/issues/1']}),
            Element({'title': ['Second'], 'labels': ['bug'], 'url': ['/issues/2']}),
        ]

        class Resolver:
            def __init__(self, _browser):
                pass

            async def resolve_collection(self, _selector, _scope=None):
                return elements

        specification = ReadSpec(
            container='li.issue', fields={
                'title': ReadField(selector='a.title'),
                'labels': ReadField(selector='a.label', multiple=True, maxValues=3),
                'url': ReadField(selector='a.title', attribute='href'),
            }, maxItems=2,
            outputSchema={'type': 'array', 'items': {'type': 'object', 'properties': {
                'title': {'type': 'string'},
                'labels': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 3},
                'url': {'type': 'string'},
            }, 'required': ['title', 'labels', 'url'], 'additionalProperties': False}, 'maxItems': 2},
        )
        with patch('workflow_use.hybrid.read.TargetResolver', Resolver):
            result = asyncio.run(read_fields(object(), specification))

        self.assertEqual(result, [
            {'title': 'First', 'labels': ['bug', 'external'], 'url': '/issues/1'},
            {'title': 'Second', 'labels': ['bug'], 'url': '/issues/2'},
        ])

    def test_reader_supports_one_scalar_output_leaf(self):
        class Element:
            async def evaluate(self, _script, _projection):
                return json.dumps({'value': {
                    'selfMatched': False,
                    'values': [{'value': 'Issue title', 'hasShadow': False}],
                }})

        class Resolver:
            def __init__(self, _browser):
                pass

            async def resolve_collection(self, _selector, _scope=None):
                return [Element()]

        specification = ReadSpec(
            container='article', fields={'value': ReadField(selector='h1')}, maxItems=1,
            outputSchema={'type': 'object', 'properties': {
                'value': {'type': 'string'},
            }, 'required': ['value'], 'additionalProperties': False},
        )
        with patch('workflow_use.hybrid.read.TargetResolver', Resolver):
            result = asyncio.run(read_fields(object(), specification))

        self.assertEqual(result, {'value': 'Issue title'})


if __name__ == '__main__':
    unittest.main()
