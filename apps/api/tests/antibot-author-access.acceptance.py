"""Actual B-U Agent loop with deterministic local model replies; no paid/external model."""
import argparse
import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import sys
import tempfile
from threading import Thread
from unittest.mock import patch
from uuid import uuid4

from pydantic import BaseModel
from browser_use.llm.views import ChatInvokeCompletion

ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT / 'apps/api/python'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/antibot-m0'))
from browser import save
from browser_use_runner.hybrid_main import Runner
from browser_use_runner.managed_window import _profile_process_present


class Replies(BaseModel):
    model: str = 'owned-scripted-replies'
    calls: int = 0
    url: str
    _verified_api_keys: bool = True

    @property
    def provider(self): return 'owned-fixture'
    @property
    def name(self): return self.model
    @property
    def model_name(self): return self.model

    async def ainvoke(self, _messages, output_format=None, **_kwargs):
        self.calls += 1
        action = {'navigate': {'url': self.url + '?attempt=' + str(self.calls), 'new_tab': False}} if self.calls < 3 else {
            'done': {'success': False, 'reason': 'end of controlled error fixture', 'methodOutcome': 'unsupported'}}
        return ChatInvokeCompletion(completion=output_format.model_validate({'evaluation_previous_goal': 'fixture',
            'memory': 'owned HTTP status test', 'next_goal': 'controlled request', 'action': [action]}), usage=None)


class Fixture(BaseHTTPRequestHandler):
    status = 503
    visits = []
    challenge = False

    def do_GET(self):
        if self.path.startswith('/document'): self.visits.append({'status': self.status, 'path': self.path})
        self.send_response(self.status)
        self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Cache-Control', 'no-store')
        if self.challenge: self.send_header('cf-mitigated', 'challenge')
        self.end_headers(); self.wfile.write(b'<title>Owned HTTP fixture</title><link rel="icon" href="data:,"><p>Owned response</p>')

    def log_message(self, *_args): pass


async def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--status', type=int, default=503)
    parser.add_argument('--resume-challenge', action='store_true')
    args = parser.parse_args(); status = args.status
    parent = ROOT / 'work/antibot-service/reports'
    out = Path(tempfile.mkdtemp(prefix='author-access-', dir=parent)).resolve(); profile = out / 'profile'
    server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture); Fixture.status = status
    Fixture.challenge = args.resume_challenge
    thread = Thread(target=server.serve_forever, daemon=True); thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'; model = Replies(url=origin + '/document')
    runner = Runner(); print(json.dumps({'evidence': str(out), 'status': status}), flush=True)
    waits, resume_tasks = [], []
    async def confirm_fixture(wait):
        # 本地协议控制，不是真人验证码证据；模拟授权用户完成后页面变为正常响应。
        before = await runner.human_wait.identity()
        Fixture.challenge = False; Fixture.status = 200
        await (await runner.browser.get_current_page()).goto(origin + '/document?fixture-confirmed=1')
        await runner.human_wait.resume(wait['id']); runner.human_wait.release(wait['id'])
        waits.append({'sameSession': before['sessionId'] == runner.browser.id,
                      'sameTab': before['tabId'] == runner.browser.agent_focus_target_id})
    if args.resume_challenge:
        runner.publish_human_wait = lambda _request, wait: resume_tasks.append(asyncio.create_task(confirm_fixture(wait)))
    try:
        await runner.start({'headless': True, 'profilePath': str(profile), 'allowedOrigins': [origin],
            'allowedSites': [{'scheme': 'http', 'domain': '127.0.0.1', 'port': server.server_port, 'includeSubdomains': False}],
            'managedWindow': {'ownerId': uuid4(), 'resume': False}})
        lease = runner.managed_window._load()
        save(out, 'owner.json', {'pid': lease.browserPid, 'started': lease.browserStarted, 'profile': str(profile)})
        raw = {'id': str(uuid4()), 'type': 'hybrid_author', 'model': {'model': model.model, 'token': 'synthetic', 'endpoint': origin},
            'source': {'sourceProtocol': 'bat-hybrid/3', 'task': 'Exercise owned local HTTP fixture.', 'input': None,
                'inputSchema': {'type': 'null'}, 'outputSchema': {'type': 'null'}, 'resultSpec': {'contractVersion': 'bat-result-spec/v1', 'mode': 'execution'},
                'requirementId': str(uuid4()), 'requirementVersion': 1, 'requirementText': 'Exercise owned local HTTP fixture.',
                'requirementDigest': 'a' * 64, 'entryUrls': [origin + '/document'], 'planId': str(uuid4()),
                'planVersion': 1, 'planDigest': 'b' * 64, 'stepId': 'step-1', 'callMode': 'once', 'maxSteps': 4}}
        with patch('browser_use_runner.hybrid_main.AIConnectModel', side_effect=lambda **_: model):
            result = await runner.handle(raw)
        proof = {'status': status, 'visits': Fixture.visits, 'scriptedModelCalls': model.calls, 'externalModelCalls': 0,
            'sourceGaps': result.get('sourceGaps'), 'expectedVisits': 3 if args.resume_challenge else 2 if status == 200 else 1,
            'waits': waits, 'confirmation': 'local protocol fixture, not real human' if args.resume_challenge else None}
        save(out, 'observed.json', proof)
        assert len(Fixture.visits) == proof['expectedVisits'], 'native-exploration-retried-explicit-http-failure'
        assert model.calls == (3 if status == 200 or args.resume_challenge else 1), 'next-model-turn-not-stopped'
        if args.resume_challenge: assert waits == [{'sameSession': True, 'sameTab': True}], 'challenge-wait-missing'
        save(out, 'passed.json', proof)
    finally:
        for task in resume_tasks:
            if not task.done(): task.cancel()
        await asyncio.gather(*resume_tasks, return_exceptions=True)
        closed = await runner.close(); save(out, 'closed.json', closed)
        server.shutdown(); server.server_close(); thread.join(timeout=3)
        assert not _profile_process_present(profile)
        assert profile.parent == out and out.is_relative_to(parent)
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


if __name__ == '__main__': asyncio.run(main())
