"""Read-only, bounded target-map diagnostics for the local daily-Chrome fixture."""
import asyncio
import json
import os
import hashlib
import re
import subprocess
from pathlib import Path

from workflow_use.hybrid.targets import TargetResolver

if os.environ.get('BAT_LOCAL_TLS_SPKI'):
    pin = os.environ['BAT_LOCAL_TLS_SPKI']
    profile = Path(os.environ['BAT_LOCAL_TLS_PROFILE']).resolve()
    base = Path.cwd().resolve() / 'work/antibot-service'
    if not profile.is_relative_to(base) or not re.fullmatch(r'[A-Za-z0-9+/]{43}=', pin):
        raise ValueError('owned_tls_fixture_required')
    original_popen = subprocess.Popen
    def pinned_launch(args, **kwargs):
        if isinstance(args, list) and f'--user-data-dir={profile}' in args:
            args = [*args, '--ignore-certificate-errors-spki-list=' + pin]
        return original_popen(args, **kwargs)
    subprocess.Popen = pinned_launch

original = TargetResolver._resolve_index
records = []


def record_mapping(mapping, target_id):
    if len(records) >= 12:
        return
    try:
        records.append({'mappingSize': len(mapping),
            'matchingTarget': sum(node.target_id == target_id for node in mapping.values()),
            'mainFrameNodes': sum(node.frame_id is None for node in mapping.values()),
            'buttons': sum(node.node_name.lower() == 'button' for node in mapping.values())})
        Path(os.environ['BAT_M0_DIAGNOSTIC_PATH']).write_text(json.dumps(records), encoding='utf-8')
    except Exception:
        pass  # 诊断自身失败不得替换原始产品错误。


async def diagnosed(self, target, page, mapping, target_id):
    try:
        return await original(self, target, page, mapping, target_id)
    except Exception:
        # WHY：只记录本地夹具的结构计数，既不替选目标，也不改变失败分支。
        record_mapping(mapping, target_id)
        raise


TargetResolver._resolve_index = diagnosed
from browser_use_runner.hybrid_main import main, Runner
from failure_diagnostics import instrument
instrument(Runner)

if os.environ.get('BAT_CHALLENGE_DIAGNOSTIC_PATH'):
    from challenge_diagnostics import instrument as instrument_challenge
    instrument_challenge(Runner)

if os.environ.get('BAT_RESPONSE_DIAGNOSTIC_PATH'):
    original_response = Runner.record_document_response
    def diagnosed_response(self, event, session_id):
        response = event.get('response') or {}
        if response.get('status') in (429, 503):
            # 仅owned本地夹具的协议身份摘要；不保存网址、请求头或响应正文。
            token = lambda value: hashlib.sha256(str(value).encode()).hexdigest()[:16]
            value = {'request': token(event.get('requestId')), 'session': token(session_id),
                     'timestamp': event.get('timestamp'), 'type': event.get('type'),
                     'status': response.get('status'), 'urlHash': token(response.get('url')),
                     'diskCache': response.get('fromDiskCache'), 'worker': response.get('fromServiceWorker')}
            with Path(os.environ['BAT_RESPONSE_DIAGNOSTIC_PATH']).open('a', encoding='utf-8') as stream:
                stream.write(json.dumps(value) + '\n')
        return original_response(self, event, session_id)
    Runner.record_document_response = diagnosed_response

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except asyncio.CancelledError:
        pass
