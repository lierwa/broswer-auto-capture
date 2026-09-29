"""Controlled source injection; real callbacks/compiler/ACK loop, no browser or model."""
import asyncio
import copy
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd() / 'vendor/workflow-use/workflows/tests'))
from test_author_compilation import fixture
from workflow_use.hybrid.author import AuthorInput, natural_compilation_request
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.source_response import author_source_response
from browser_use_runner.author_request_loop import AuthorRequestLoop
from browser_use_runner.compilation_control import CompilationAck, CompilationControl
from browser_use_runner.hybrid_commands import REQUEST, AuthorRequest


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
            # 本夹具 schema 与生产来源相同；只替换业务身份，所有事实/规范化/编译走真实实现。
            await callbacks.after_step(agent)
            prefix, gaps = live.collector.snapshot(agent.history, history_ref=live.history_ref,
                                                    redaction_manifest=live.redaction)
            body = prefix.model_dump(mode='json', exclude={'digest'})
            body.update(completed=True, finalResultRef=final.trace.finalResultRef.model_dump(mode='json'),
                        actions=[*body['actions'], final.trace.actions[-1].model_dump(mode='json')],
                        observations=[*body['observations'], *[item.model_dump(mode='json') for item in final.trace.observations[2:]]])
            trace = type(final.trace).model_validate({**body, 'digest': digest(body)})
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
