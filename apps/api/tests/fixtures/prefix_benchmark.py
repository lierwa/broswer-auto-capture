"""Bounded 500-action prefix stress fixture (larger than native 100-step author budget)."""
import copy
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path.cwd() / 'vendor/workflow-use/workflows/tests'))
from test_method_source_compile import method_source, fact
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.natural_prefix import compile_natural_prefix
from workflow_use.hybrid.__main__ import compilation_envelope
from workflow_use.hybrid.source_response import canonical_json


def main():
    host = json.load(sys.stdin)
    request, registry, schema, _read = method_source()
    raw = request.model_dump(mode='json', by_alias=True)
    plan, step = host['plan'], host['plan']['steps'][0]
    raw['requirement'].update(id=plan['requirement']['id'], version=plan['requirement']['version'],
                              sourceDigest=plan['requirement']['digest'])
    raw['plan'].update(id=plan['id'], version=plan['version'], stepId=step['id'],
                       sourceDigest=host['planDigest'], resultSpec=step['resultSpec'])
    for key in ('requirement', 'plan'):
        raw[key]['digest'] = digest({k:v for k,v in raw[key].items() if k != 'digest'})
    trace = raw['trace']
    original_action, original_observations = trace['actions'][0], trace['observations'][:2]
    actions, observations = [], []
    for index in range(500):
        identity = f'a-{index + 1:04d}'
        action = copy.deepcopy(original_action)
        action.update(id=identity, stepIndex=index, preObservationRef=f'o-{index * 2 + 1:04d}',
                      postObservationRef=f'o-{index * 2 + 2:04d}')
        actions.append(action)
        for offset, source in enumerate(original_observations):
            observation = copy.deepcopy(source)
            observation.update(id=f'o-{index * 2 + offset + 1:04d}', sequence=index * 2 + offset)
            for item in observation['facts']:
                if item['kind'] == 'verified_natural_read':
                    value = item['value']; value['actionRef'] = identity; value['readRef'] = f'r{index + 1}'
                    item.update(fact(item['kind'], value).model_dump(mode='json'))
            observations.append(observation)
    trace.update(completed=False, finalResultRef=None, actions=actions, observations=observations)
    trace['digest'] = digest({k:v for k,v in trace.items() if k != 'digest'})
    request = type(request).model_validate(raw)
    started = time.perf_counter()
    compiled = compile_natural_prefix(request, registry, output_schema=schema)
    response = compilation_envelope(request, compiled)
    payload = canonical_json({'phase': 'prefix', 'stepId': step['id'],
        'canonicalRequest': canonical_json(request.model_dump(mode='json', by_alias=True)), 'response': response})
    print(json.dumps({'payload': payload, 'pythonMs': (time.perf_counter() - started) * 1000,
                      'bytes': len(payload.encode('utf-8'))}))


if __name__ == '__main__':
    main()
