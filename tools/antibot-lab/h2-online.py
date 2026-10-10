"""Pinned Hypercorn protocol events -> unchanged Kitsune hints -> existing CrowdSec."""
import asyncio
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import subprocess
import sys

BASE = Path(sys.argv[1]).resolve()
ROOT = Path(__file__).resolve().parents[2]
WHEELS = ('hypercorn-', 'h2-', 'hpack-', 'hyperframe-', 'h11-', 'priority-', 'wsproto-')
for item in json.loads((ROOT / 'tools/antibot-lab/artifacts.json').read_text()):
    if item['name'].startswith(WHEELS):
        source = BASE / 'upstream' / item['name']
        if hashlib.sha256(source.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('h2_dependency_changed')
        sys.path.insert(0, str(source))

import h2.events
import hypercorn.protocol
from hypercorn.asyncio import serve
from hypercorn.config import Config
from hypercorn.protocol.h2 import H2Protocol

PSEUDO = {b':method': 'm', b':authority': 'a', b':scheme': 's', b':path': 'p'}
CASE = re.compile(rb'/case/([a-f0-9-]{36})/transport(?:\?.*)?\Z')


def record(case, source, facts, reason=None, entry='independent'):
    result = {'status': 'unavailable', 'outcome': 'unknown'}
    if reason is None:
        try:
            output = subprocess.run([str(BASE / 'runtime/h2-hints/h2-hints')],
                input=json.dumps([facts]), capture_output=True, text=True, timeout=2, check=True)
            result = json.loads(output.stdout)[0]
            if (result['status'] not in ('measured', 'unavailable')
                    or result['outcome'] not in ('consistent', 'mismatch', 'unknown')):
                raise ValueError('h2_classifier_result_invalid')
        except (subprocess.SubprocessError, ValueError, OSError, IndexError, KeyError, TypeError):
            result = {'status': 'error', 'outcome': 'unknown'}
    row = dict(at=datetime.now(timezone.utc).isoformat(), source_ip=str(ipaddress.ip_address(source)),
               site=case, session=case, category='h2-coherence', valid=str(result['status'] == 'measured').lower(),
               outcome=result['outcome'], measurement=result['status'], reason=reason, facts=facts, entry=entry)
    # WHY：只写设置数值和头名顺序，不写任何头值/Cookie/URL内容或TLS密钥。
    with (BASE / 'logs/observations.jsonl').open('a', encoding='utf-8') as stream:
        stream.write(json.dumps(row) + '\n')


class ObservedH2(H2Protocol):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.initial_settings = None
        self.window_update = 0
        self.initial_order = None

    async def _handle_events(self, events):
        for event in events:
            if isinstance(event, h2.events.RemoteSettingsChanged) and self.initial_settings is None:
                self.initial_settings = [dict(ID=int(key), Value=value.new_value)
                                         for key, value in event.changed_settings.items()]
            if isinstance(event, h2.events.WindowUpdated) and event.stream_id == 0 and not self.window_update and self.initial_order is None:
                self.window_update = event.delta
            if isinstance(event, h2.events.RequestReceived):
                order = ','.join(PSEUDO[k] for k, _ in event.headers if k in PSEUDO)
                self.initial_order = self.initial_order or order
                path = next((v for k, v in event.headers if k == b':path'), b'')
                match = CASE.fullmatch(path)
                if match and self.client and self.ssl:
                    facts = dict(Settings=(self.initial_settings or [])[:256],
                                 PseudoHeaderOrder=order, WindowUpdate=self.window_update)
                    reason = 'settings_unavailable' if self.initial_settings is None else (
                        'settings_capacity' if len(self.initial_settings) > 256 else None)
                    record(match[1].decode(), self.client[0], facts, reason)
        # 原解码、流控、响应、请求处理均继续由Hypercorn/hyper-h2承担。
        await super()._handle_events(events)


async def application(scope, receive, send):
    if scope['type'] == 'lifespan':
        while True:
            event = await receive()
            await send({'type': event['type'] + '.complete'})
            if event['type'] == 'lifespan.shutdown': return
    if scope['type'] != 'http': return
    while not (event := await receive()).get('type') == 'http.disconnect':
        if not event.get('more_body', False): break
    match = CASE.fullmatch(scope['path'].encode())
    if match and scope['http_version'] != '2':
        record(match[1].decode(), scope['client'][0], {}, 'http2_not_negotiated')
    body = json.dumps({'owner': 'bat-antibot-h2', 'protocol': scope['http_version'],
                       'scope': 'independent-protocol-observation'}).encode()
    await send({'type': 'http.response.start', 'status': 200 if match or scope['path'] == '/health' else 404,
                'headers': [(b'content-type', b'application/json'), (b'cache-control', b'no-store')]})
    await send({'type': 'http.response.body', 'body': body})


if __name__ == '__main__':
    # 固定版本唯一协议构造点适配；不改变通用HTTP库或产品浏览器。
    hypercorn.protocol.H2Protocol = ObservedH2
    config = Config()
    config.bind = ['127.0.0.1:4193']
    config.certfile, config.keyfile = str(BASE / 'tls/cert.pem'), str(BASE / 'tls/key.pem')
    config.accesslog = None
    config.h2_max_concurrent_streams = 10
    config.h2_max_header_list_size = 16384
    config.keep_alive_max_requests = 30
    config.read_timeout = 5
    config.graceful_timeout = 3
    from edge_h2_online import serve_with_edge
    asyncio.run(serve_with_edge(BASE, record, serve(application, config)))
