"""Wait ownership requires either unchanged proof or an explicitly bounded eventual-effect policy."""
import copy
import unittest

from browser_use.tools.service import Tools
from test_hybrid_compiler import navigation_request, rehash

from workflow_use.hybrid.causal import delayed_post_for_conditions, supporting_wait
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.request import CompilationRequest


class CausalTests(unittest.TestCase):
    def test_wait_is_owned_once_without_new_runtime_sleep_or_model(self):
        registry = ActionRegistry.from_tools(Tools())
        raw = navigation_request(registry)
        raw['trace']['observations'][1]['documentDigest'] = 'a' * 64
        after = copy.deepcopy(raw['trace']['observations'][1])
        after.update(id='o-0003', sequence=2)
        raw['trace']['observations'].append(after)
        action = copy.deepcopy(raw['trace']['actions'][0])
        action.update(id='a-0002', name='wait', stepIndex=1, effect='none', args={'seconds': 1},
                      preObservationRef='o-0002', postObservationRef='o-0003')
        raw['trace']['actions'].append(action)
        rehash(raw, 'trace')
        result = compile_request(CompilationRequest.model_validate(raw), registry)
        self.assertFalse(result.gaps)
        self.assertEqual(len(result.segments), 1)
        self.assertEqual([row.disposition for row in result.coverage], ['compiled', 'supporting'])
        self.assertEqual(result.coverage[1].ownerSegmentId, result.segments[0]['id'])
        for field, value in [('url', 'https://fixture.invalid/unexplained'), ('tabId', 'different-tab'), ('documentDigest', None)]:
            changed = copy.deepcopy(raw)
            changed['trace']['observations'][2][field] = value
            rehash(changed, 'trace')
            rejected = compile_request(CompilationRequest.model_validate(changed), registry)
            self.assertTrue(rejected.gaps)
            self.assertEqual(rejected.coverage[1].disposition, 'not_compilable')

    def test_declared_delayed_effect_owns_the_pure_wait_once(self):
        registry = ActionRegistry.from_tools(Tools())
        raw = delayed_fixture(registry)
        request = CompilationRequest.model_validate(raw)
        result = compile_request(request, registry)
        self.assertFalse(result.gaps)
        self.assertEqual(len(result.segments), 1)
        self.assertEqual([row.disposition for row in result.coverage], ['compiled', 'supporting'])
        self.assertEqual(result.coverage[1].exclusionRule, 'bounded_postcondition_wait/v1')
        self.assertEqual(result.canonicalDigest, compile_request(request, registry).canonicalDigest)

    def test_missing_budget_clock_cross_tab_or_intervening_write_cannot_prove_wait(self):
        registry = ActionRegistry.from_tools(Tools())
        for mutation in ('budget', 'clock', 'late', 'tab', 'write'):
            raw = delayed_fixture(registry)
            if mutation == 'budget':
                del raw['requirement']['clauses'][1]['expression']['settle']
            elif mutation == 'clock':
                raw['trace']['observations'][1]['facts'].pop()
            elif mutation == 'late':
                raw['trace']['observations'][2]['facts'][-1]['value'] = 9999
            elif mutation == 'tab':
                raw['trace']['observations'][2]['tabId'] = 'other-tab'
            else:
                raw['trace']['actions'][1].update(name='click', args={'index': 1}, effect='external_write')
            rehash(raw, 'requirement')
            rehash(raw, 'trace')
            result = compile_request(CompilationRequest.model_validate(raw), registry)
            with self.subTest(mutation=mutation):
                self.assertTrue(result.gaps)
                self.assertEqual(result.controlGraph['entry'], '')

    def test_wait_attempt_limit_rejects_effect_visible_only_after_a_second_wait(self):
        registry = ActionRegistry.from_tools(Tools())
        raw = delayed_fixture(registry)
        raw['requirement']['clauses'][1]['expression']['settle']['maxAttempts'] = 1
        raw['trace']['observations'][2]['facts'][0]['value'] = 'Before'
        final = copy.deepcopy(raw['trace']['observations'][2])
        final.update(id='o-0004', sequence=3)
        final['facts'][0]['value'] = 'Saved'
        final['facts'][-1]['value'] = 2500
        raw['trace']['observations'].append(final)
        wait = copy.deepcopy(raw['trace']['actions'][1])
        wait.update(id='a-0003', stepIndex=2, preObservationRef='o-0003', postObservationRef='o-0004')
        raw['trace']['actions'].append(wait)
        rehash(raw, 'requirement')
        rehash(raw, 'trace')

        result = compile_request(CompilationRequest.model_validate(raw), registry)

        self.assertTrue(result.gaps)
        self.assertEqual(result.controlGraph['entry'], '')

    def test_explicit_url_digest_condition_allows_url_change_but_other_fact_does_not(self):
        registry = ActionRegistry.from_tools(Tools())
        request = CompilationRequest.model_validate(delayed_fixture(registry))
        action, after = request.trace.actions[0], request.trace.observations[2]
        next(fact for fact in after.facts if fact.kind == 'url_digest').value = 'b' * 64
        condition = {'kind': 'url_digest', 'changed': True,
                     'settle': {'maxMs': 30000, 'maxAttempts': 100, 'intervalMs': 300}}

        proven, waits = delayed_post_for_conditions(request.trace, registry, action, [condition],
            lambda observed: [condition] if observed.id == after.id else [])
        self.assertEqual(proven.id, after.id)
        self.assertEqual([item.id for item in waits], ['a-0002'])

        condition['kind'] = 'target_state'
        self.assertEqual(delayed_post_for_conditions(request.trace, registry, action, [condition],
            lambda _observed: [condition]), (None, []))

    def test_supporting_wait_accepts_stable_natural_fact_proven_before_wait(self):
        registry = ActionRegistry.from_tools(Tools())
        request = CompilationRequest.model_validate(delayed_fixture(registry))
        before, post, after = request.trace.observations
        for observation, value in ((before, '{"aria-expanded":false}'),
                                   (post, '{"aria-expanded":true}'),
                                   (after, '{"aria-expanded":true}')):
            observation.facts[0].kind = 'target_state'
            observation.facts[0].value = value
        post.documentDigest = after.documentDigest = 'd' * 64
        owner = {'id': 's-a-0001', 'kind': 'deterministic',
                 'operation': {'name': 'browser.workflow-step'},
                 'postconditions': [{'kind': 'target_state', 'changed': True}], 'proofRefs': []}

        support = supporting_wait(request, registry, request.trace.actions[1], owner)

        self.assertEqual(support.ownerSegmentId, 's-a-0001')
        self.assertEqual(support.exclusionRule, 'unchanged_wait_after_proven_effect/v1')

    def test_changed_completion_proves_bounded_wait_without_sample_equality(self):
        registry = ActionRegistry.from_tools(Tools())
        raw = delayed_fixture(registry)
        expression = raw['requirement']['clauses'][1]['expression']
        expression.pop('equals')
        expression['changed'] = True
        rehash(raw, 'requirement')
        result = compile_request(CompilationRequest.model_validate(raw), registry)
        self.assertFalse(result.gaps)
        condition = result.segments[0]['postconditions'][0]
        self.assertTrue(condition['changed'])
        self.assertNotIn('equals', condition)
        self.assertEqual(result.coverage[1].exclusionRule, 'bounded_postcondition_wait/v1')
        raw['trace']['observations'][2]['facts'][0]['value'] = 'Before'
        rehash(raw, 'trace')
        self.assertTrue(compile_request(CompilationRequest.model_validate(raw), registry).gaps)

    def test_bounded_wait_after_already_proven_effect_uses_declared_facts(self):
        registry = ActionRegistry.from_tools(Tools())
        raw = delayed_fixture(registry)
        raw['trace']['observations'][1]['facts'][0]['value'] = 'Saved'
        for index, observation in enumerate(raw['trace']['observations']):
            observation['documentDigest'] = str(index + 1) * 64
        rehash(raw, 'trace')
        result = compile_request(CompilationRequest.model_validate(raw), registry)
        self.assertFalse(result.gaps)
        self.assertEqual(result.coverage[1].exclusionRule, 'bounded_postcondition_wait/v1')
        del raw['requirement']['clauses'][1]['expression']['settle']
        rehash(raw, 'requirement')
        self.assertTrue(compile_request(CompilationRequest.model_validate(raw), registry).gaps)


def delayed_fixture(registry):
    raw = navigation_request(registry)
    target = {'strategy': 'css', 'value': '#save'}
    raw['requirement']['clauses'] = [
        {'id': 'target', 'kind': 'selection', 'expression': {'strategy': 'locator', 'target': target}},
        {'id': 'saved', 'kind': 'completion', 'expression': {'actionRef': 'a-0001', 'factKind': 'title', 'equals': 'Saved',
         'settle': {'maxMs': 1500, 'maxAttempts': 3, 'intervalMs': 100}}}]
    raw['control']['selections'] = [{'id': 'save', 'clauseRefs': ['target'], 'actionRefs': ['a-0001'],
                                  'strategy': 'locator', 'target': target}]
    action = raw['trace']['actions'][0]
    action.update(name='click', args={'index': 1}, effect='external_write')
    before, post = raw['trace']['observations']
    post['url'] = before['url']
    after = copy.deepcopy(post)
    after.update(id='o-0003', sequence=2)
    for observation, title, clock in [(before, 'Before', 1000), (post, 'Before', 1010), (after, 'Saved', 2010)]:
        observation['facts'] = [{'id': observation['id'] + '-' + kind, 'kind': kind, 'value': value,
                                'sourceRefs': observation['sourceRefs']} for kind, value in [
                                    ('title', title), ('url_digest', 'a' * 64), ('monotonic_ms', clock)]]
    before['facts'].insert(0, {'id': 'resolved', 'kind': 'resolved_target',
        'value': {'actionRef': 'a-0001', 'index': 1, 'target': target}, 'sourceRefs': before['sourceRefs']})
    raw['trace']['observations'].append(after)
    wait = copy.deepcopy(action)
    wait.update(id='a-0002', name='wait', stepIndex=1, effect='none', args={'seconds': 1},
                preObservationRef='o-0002', postObservationRef='o-0003')
    raw['trace']['actions'].append(wait)
    rehash(raw, 'requirement')
    rehash(raw, 'trace')
    return raw
