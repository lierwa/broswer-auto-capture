"""Controlled source injection; real callbacks/compiler/ACK loop, no browser or model."""
import asyncio
import copy
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd() / 'vendor/workflow-use/workflows/tests'))
from test_author_compilation import fixture
from workflow_use.hybrid.author import AuthorInput, natural_compilation_request, author_tools_for_result_spec
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.source_response import author_source_response
from workflow_use.hybrid.method_receipt import attach_method_receipt
from browser_use_runner.author_request_loop import AuthorRequestLoop
from browser_use_runner.compilation_control import CompilationAck, CompilationControl
from browser_use_runner.hybrid_commands import REQUEST, AuthorRequest
from browser_use_runner.output_schema import output_model_for


def add_discovery(trace, gaps, mode):
    if not mode:
        return trace
    sys.path.insert(0, str(Path.cwd() / 'apps/api/tests'))
    from test_discovery_gap_liveness import fixture as discovery_fixture
    from workflow_use.hybrid.evidence import gap
    from tests.test_natural_read_liveness import fact
    probe, _ledger = discovery_fixture(f'a-{len(trace.actions):04d}')
    action, (pre, post) = probe.trace.actions[0], probe.trace.observations
    pre.facts = [fact(row.id, row.kind, {**row.value, 'nativeStepNumber': len(trace.actions)})
                 if row.kind == 'native_action_dispatch' else row for row in pre.facts]
    body = trace.model_dump(mode='json', exclude={'digest'})
    done, done_observations = body['actions'].pop(), body['observations'][-2:]
    body['observations'] = body['observations'][:-2]
    # WHY：真实编译器处理无消费者探查，原始 gap 原样交给宿主；不伪造 final 的清零结果。
    action.preObservationRef = f'o-{len(body["observations"]) + 1:04d}'
    action.postObservationRef = f'o-{len(body["observations"]) + 2:04d}'
    body['actions'].append(type(trace.actions[0]).model_validate({**vars(action),
        'stepIndex': len(body['actions'])}).model_dump(mode='json'))
    for observation in (pre, post):
        index = len(body['observations'])
        body['observations'].append(type(trace.observations[0]).model_validate({
            **body['observations'][0], **vars(observation), 'id': f'o-{index + 1:04d}',
            'sequence': index}).model_dump(mode='json'))
    done.update(id=f'a-{len(body["actions"]) + 1:04d}', stepIndex=len(body['actions']),
                preObservationRef=f'o-{len(body["observations"]) + 1:04d}',
                postObservationRef=f'o-{len(body["observations"]) + 2:04d}')
    body['actions'].append(done)
    for observation in done_observations:
        index = len(body['observations'])
        body['observations'].append({**observation, 'id': f'o-{index + 1:04d}', 'sequence': index})
    gaps.append(gap('missing_effect_proof', [action.id],
                    'natural_read_container_identity_changed', 'collect_evidence'))
    if mode == 'unresolved':
        gaps.append(gap('invalid_source', [action.id], 'source_invalid', 'reject_trace'))
    return type(trace).model_validate({**body, 'digest': digest(body)})


class Runner:
    def __init__(self, channel):
        self.channel, self.control = channel, None

    async def handle(self, raw):
        request = REQUEST.validate_json(json.dumps(raw))
        if isinstance(request, CompilationAck):
            return self.control.acknowledge(request)
        if isinstance(request, AuthorRequest):
            if not request.onlineCompilation:
                raise ValueError('online_required')
            self.control = CompilationControl(request.id, lambda event: self.channel.write(json.dumps(event) + '\n'))
            live, callbacks, agent, final = fixture(self.control.exchange)
            live.request = AuthorInput.model_validate(request.source)
            model, _unwrap = output_model_for(live.request.outputSchema, 'OnlineFixtureOutput')
            live.collector.registry = ActionRegistry.from_tools(author_tools_for_result_spec(
                model, live.request.resultSpec, source_protocol=live.request.sourceProtocol))
            callbacks.registry_provider = lambda: live.collector.registry
            # 本夹具 schema 与生产来源相同；只替换业务身份，所有事实/规范化/编译走真实实现。
            await callbacks.after_step(agent)
            prefix, gaps = live.collector.snapshot(agent.history, history_ref=live.history_ref,
                                                    redaction_manifest=live.redaction)
            body = prefix.model_dump(mode='json', exclude={'digest'})
            body.update(completed=True, finalResultRef=final.trace.finalResultRef.model_dump(mode='json'),
                        actions=[*body['actions'], final.trace.actions[-1].model_dump(mode='json')],
                        observations=[*body['observations'], *[item.model_dump(mode='json') for item in final.trace.observations[2:]]])
            body['actions'][-1]['args']['methodOutcome'] = 'recorded'
            trace = type(final.trace).model_validate({**body, 'digest': digest(body)})
            trace = add_discovery(trace, gaps, os.environ.get('BAT_TEST_DISCOVERY_GAP_MODE'))
            # WHY：沿用生产 author 的V3方法回执；旧V2夹具不能省略当前协议事实。
            trace = attach_method_receipt(trace, live.request)
            request = natural_compilation_request(live.request, trace, live.collector.registry)
            await live.finish(request, gaps)
            output = next(f.value for o in trace.observations for f in o.facts
                          if f.kind == 'verified_natural_read')['output']
            return author_source_response(output, request, gaps)
        if raw['type'] == 'close':
            return {'closed': True, 'stages': [{'stage': stage, 'status': 'not_required', 'code': None}
                for stage in ('capability_close', 'browser_close')]}
        return {'mode': 'hybrid/v2', 'modelCalls': 0}


class Diagnostics:
    def emit(self, _event):
        pass


async def main():
    with os.fdopen(3, 'w', buffering=1) as channel:
        runner = Runner(channel)
        await AuthorRequestLoop(runner, channel, Diagnostics(), lambda error: str(error)).run()


if __name__ == '__main__':
    asyncio.run(main())
