"""Sanitized cross-language fixtures, generated through the real public registry and strict contracts."""
import copy
import json
import sys

from browser_use.tools.service import Tools
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.__main__ import compilation_response
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.request import CompilationRequest
from workflow_use.hybrid.invokes import VerifiedChild
from test_hybrid_compiler import navigation_request, rehash


def fixture(kind='navigation', identities=None, verified_child=None):
    registry = ActionRegistry.from_tools(Tools())
    if kind == 'native-navigation':
        from workflow_use.hybrid.author import author_tools
        from browser_use_runner.output_schema import output_model_for
        model, _ = output_model_for({'type': 'null'}, 'HybridAgentOutput')
        registry = ActionRegistry.from_tools(author_tools(model))
    raw = navigation_request(registry)
    raw['requirement']['id'] = '10000000-0000-4000-8000-000000000002'
    raw['plan']['id'] = '10000000-0000-4000-8000-000000000003'
    raw['plan']['stepId'] = 'perform'
    if kind == 'nested':
        raw['runtimeInputSchema'] = {'type': 'object', 'properties': {'target': raw['runtimeInputSchema']},
                                    'required': ['target'], 'additionalProperties': False}
        raw['requirement']['clauses'][0]['expression']['binding']['path'] = ['target', 'url']
        raw['plan']['inputSchemaDigest'] = digest(raw['runtimeInputSchema'])
    if kind == 'missing-binding':
        raw['requirement']['clauses'].pop(0)
    if kind in ('loop', 'semantic-loop'):
        add_loop(raw)
        if kind == 'semantic-loop':
            raw['requirement']['clauses'][-2]['expression'] = {'bodyClauses': ['url']}
    if kind == 'branch':
        add_branch(raw)
    if kind == 'invoke':
        intent = {'id': 'reused', 'clauseRefs': ['reuse'], 'chainId': verified_child['chain']['id'],
                  'chainVersion': verified_child['chain']['version'], 'mode': 'once',
                  'inputBindings': [{'source': 'input', 'path': []}],
                  'outputBindings': [{'source': 'node', 'nodeId': 'reused', 'path': []}], 'onItemFailure': 'stop'}
        raw['control']['invokes'] = [intent]
        raw['requirement']['clauses'].append({'id': 'reuse', 'kind': 'constraint', 'expression': {
            'invoke': {key: value for key, value in intent.items() if key not in ('id', 'clauseRefs')}, 'actionRefs': ['a-0001']}})
    if kind == 'prior-navigation':
        add_prior_navigation(raw)
    if kind in ('semantic', 'assembly'):
        add_semantic(raw)
    if kind == 'assembly':
        output_schema = {'type': 'object', 'properties': {'records': raw['requirement']['clauses'][0]['expression']['read']['outputSchema'],
                         'summary': {'type': 'string', 'maxLength': 100}}, 'required': ['records', 'summary'], 'additionalProperties': False}
        raw['requirement']['clauses'].append({'id': 'assembled-result', 'kind': 'output', 'expression': {'assemble': {
            'fields': [{'binding': {'source': 'node', 'nodeId': 'a-0001', 'path': []}, 'path': ['records']},
                       {'binding': {'source': 'node', 'nodeId': 'a-0002', 'path': []}, 'path': ['summary']}], 'schema': output_schema}}})
        raw['plan']['outputSchemaDigest'] = digest(output_schema)
    if kind == 'read-loop':
        add_semantic(raw)
        raw['trace']['actions'] = raw['trace']['actions'][:1]
        raw['trace']['observations'] = raw['trace']['observations'][:2]
        raw['acceptedAnnotations'] = []
        raw['requirement']['clauses'] = raw['requirement']['clauses'][:1]
        add_loop(raw)
        specification = raw['requirement']['clauses'][0]['expression']['read']
        raw['trace']['observations'][2]['facts'][0]['value']['actionRef'] = 'a-0002'
        output_schema = {**specification['outputSchema'], 'maxItems': 4}
        intent = raw['control']['loops'][0]
        intent['accumulator'] = {'variable': 'records', 'initial': {'source': 'constant', 'value': []},
                                'next': {'source': 'node', 'nodeId': 'a-0001', 'path': []},
                                'operation': 'append_unique', 'stableKeyPath': ['name'], 'schema': output_schema}
        raw['requirement']['clauses'][-1]['expression']['loop'] = {k: v for k, v in intent.items() if k not in ('id', 'clauseRefs')}
        raw['plan']['outputSchemaDigest'] = digest(output_schema)
    if identities:
        raw['requirement'].update(id=identities['requirementId'], version=identities['requirementVersion'])
        raw['plan'].update(id=identities['planId'], version=identities['planVersion'], stepId=identities['stepId'])
    rehash(raw, 'requirement')
    rehash(raw, 'plan')
    rehash(raw, 'trace')
    parsed = CompilationRequest.model_validate(raw)
    children = [VerifiedChild.model_validate(verified_child)] if verified_child else []
    return {'request': parsed.model_dump(mode='json'), 'response': compilation_response(parsed, registry, children)}


def add_loop(raw):
    action = copy.deepcopy(raw['trace']['actions'][0])
    action.update(id='a-0002', stepIndex=1, preObservationRef='o-0002', postObservationRef='o-0003')
    observation = copy.deepcopy(raw['trace']['observations'][1])
    observation.update(id='o-0003', sequence=2)
    raw['trace']['actions'].append(action)
    raw['trace']['observations'].append(observation)
    intent = {'id': 'repeat', 'clauseRefs': ['repeat-rule', 'repeat-body'], 'bodyRef': 'repeat-body',
              'stableItemKey': None, 'maxIterations': 2, 'accumulator': {},
              'continuePredicate': {'operator': 'greater_than', 'left': {'source': 'constant', 'value': 2},
                                    'right': {'source': 'variable', 'name': 'cursor-repeat', 'path': []}},
              'stopOutcomes': ['complete', 'exhausted', 'blocked', 'failed']}
    raw['control']['loops'] = [intent]
    raw['requirement']['clauses'].extend([
        {'id': 'repeat-body', 'kind': 'constraint', 'expression': {'iterations': [['a-0001'], ['a-0002']]}},
        {'id': 'repeat-rule', 'kind': 'constraint', 'expression': {
            'loop': {k: v for k, v in intent.items() if k not in ('id', 'clauseRefs')}}}])


def add_branch(raw):
    schema = raw['runtimeInputSchema']
    schema['properties']['enabled'] = {'type': 'boolean'}
    schema['required'].append('enabled')
    raw['plan']['inputSchemaDigest'] = digest(schema)
    source = {'source': 'input', 'path': ['enabled']}
    predicate = {'operator': 'equals', 'left': source, 'right': {'source': 'constant', 'value': True}}
    intent = {'id': 'enabled', 'clauseRefs': ['enabled-rule'], 'predicateSource': source, 'predicate': predicate,
              'outcomes': {'true': 'a-0001', 'false': 'completed'}}
    raw['control']['branches'] = [intent]
    raw['requirement']['clauses'].append({'id': 'enabled-rule', 'kind': 'constraint', 'expression': {
        'branch': {k: v for k, v in intent.items() if k not in ('id', 'clauseRefs')}}})
    raw['trace']['observations'][0]['facts'].append({'id': 'branch-observed', 'kind': 'branch_choice',
        'value': {'branchId': 'enabled', 'outcome': 'true', 'predicate': predicate},
        'sourceRefs': raw['trace']['observations'][0]['sourceRefs']})


def add_semantic(raw):
    raw['trace']['observations'][0]['url'] = raw['trace']['observations'][1]['url']
    schema = {'type': 'array', 'maxItems': 2, 'items': {'type': 'object', 'additionalProperties': False,
              'properties': {'name': {'type': 'string', 'maxLength': 40}}, 'required': ['name']}}
    specification = {'container': '.entry', 'fields': {'name': {'selector': '.name', 'attribute': None, 'valueType': 'string'}},
                     'maxItems': 2, 'maxInputBytes': 4000, 'outputSchema': schema}
    output_schema = {'type': 'string', 'maxLength': 100}
    raw['plan']['outputSchemaDigest'] = digest(output_schema)
    raw['requirement']['clauses'] = [
        {'id': 'read', 'kind': 'output', 'expression': {'read': specification}},
        {'id': 'summary', 'kind': 'output', 'expression': {'purpose': 'summarize', 'outputSchema': output_schema,
         'budget': {'maxCalls': 1, 'maxInputBytes': 4000, 'timeoutMs': 1000}}}]
    first = raw['trace']['actions'][0]
    first.update(name='extract', args={'query': 'Read the requested fields'}, effect='read')
    second = copy.deepcopy(first)
    second.update(id='a-0002', stepIndex=1, preObservationRef='o-0002', postObservationRef='o-0003',
                  args={'query': 'Summarize the bounded records'}, resultRef={'ref': 'fixture:summary', 'digest': '2' * 64})
    raw['trace']['actions'].append(second)
    post = raw['trace']['observations'][1]
    post['facts'].append({'id': 'read-proof', 'kind': 'verified_field_read', 'sourceRefs': post['sourceRefs'],
                        'value': {'actionRef': first['id'], 'specificationDigest': digest(specification),
                                  'resultDigest': first['resultRef']['digest']}})
    final = copy.deepcopy(post)
    final.update(id='o-0003', sequence=2, facts=[])
    raw['trace']['observations'].append(final)
    raw['acceptedAnnotations'] = [{'kind': 'semantic_operation', 'segmentEvidenceRefs': [second['resultRef']],
        'clauseRefs': ['summary'], 'purpose': 'summarize', 'candidateIds': None,
        'inputFieldRefs': ['a-0001'], 'proposedOutputSchema': output_schema}]


def add_prior_navigation(raw):
    add_semantic(raw)
    schema = {'type': 'object', 'properties': {'url': {'type': 'string', 'maxLength': 100}},
              'required': ['url'], 'additionalProperties': False}
    read = {'container': 'a', 'fields': {'url': {'selector': 'a', 'attribute': 'href', 'valueType': 'string'}},
            'maxItems': 1, 'maxInputBytes': 1000, 'outputSchema': schema}
    raw['acceptedAnnotations'] = []
    raw['requirement']['clauses'] = [
        {'id': 'read', 'kind': 'output', 'expression': {'read': read}},
        {'id': 'url', 'kind': 'input', 'expression': {'actionName': 'navigate', 'argumentPath': 'url',
         'binding': {'source': 'node', 'nodeId': 'clause:read', 'path': ['url']}}},
        {'id': 'same-tab', 'kind': 'constraint', 'expression': {'actionName': 'navigate', 'argumentPath': 'new_tab',
         'binding': {'source': 'constant', 'value': False}}}]
    raw['plan']['outputSchemaDigest'] = digest({'type': 'null'})
    url = 'https://fixture.invalid/next'
    raw['trace']['actions'][1].update(name='navigate', args={'url': url, 'new_tab': False}, effect='navigation')
    raw['trace']['observations'][2]['url'] = url
    observation = raw['trace']['observations'][1]
    proof = observation['facts'][0]
    proof['value']['specificationDigest'] = digest(read)
    observation['facts'].append({**proof, 'id': 'field-value', 'kind': 'verified_field_output',
        'value': {**proof['value'], 'output': {'url': url}}})


if __name__ == '__main__':
    print(json.dumps(fixture(sys.argv[1] if len(sys.argv) > 1 else 'navigation',
                            json.loads(sys.argv[2]) if len(sys.argv) > 2 else None,
                            json.loads(sys.argv[3]) if len(sys.argv) > 3 else None), ensure_ascii=False))
