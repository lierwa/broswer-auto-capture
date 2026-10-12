"""Actual TLS control clients using original hyperframe/hpack, then native B-A-T H2."""
import asyncio
import hashlib
import http.client
import json
from pathlib import Path
import socket
import ssl
import struct
import sys
from uuid import uuid4

BASE = Path.cwd() / 'work/antibot-service'
for item in json.loads((Path.cwd() / 'tools/antibot-lab/artifacts.json').read_text()):
    if item['name'].startswith(('hyperframe-', 'hpack-')):
        file = BASE / 'upstream' / item['name']
        assert hashlib.sha256(file.read_bytes()).hexdigest() == item['sha256']
        sys.path.insert(0, str(file))
from hyperframe.frame import Frame, SettingsFrame, HeadersFrame, DataFrame, WindowUpdateFrame
from hpack import Encoder

CHROME = {1: 65536, 2: 0, 4: 6291456, 6: 262144}
FIREFOX = {1: 65536, 2: 0, 4: 131072, 5: 16384}


class WireSettings(SettingsFrame):
    def serialize_body(self):
        # 固定hyperframe6.1发送端有setting & 0xFF；仅测试报文按RFC保持uint16，接收库不改。
        return b''.join(struct.pack('!HI', key, value) for key, value in self.settings.items())


def exact(stream, length):
    result = b''
    while len(result) < length:
        chunk = stream.recv(length - len(result))
        if not chunk: raise AssertionError('h2_peer_closed')
        result += chunk
    return result


def request(settings, order, case, fragmented=False, repeat=1, headers=(), port=4193, window=0):
    # WHY：mkcert 叶证书不是信任根；旧自签夹具仍可直接信任其证书。
    authority = BASE / 'tls/rootCA.pem'
    context = ssl.create_default_context(cafile=str(authority if authority.exists() else BASE / 'tls/cert.pem'))
    context.set_alpn_protocols(['h2'])
    result = []
    with socket.create_connection(('127.0.0.1', port), timeout=5) as connection:
        with context.wrap_socket(connection, server_hostname='localhost') as stream:
            assert stream.selected_alpn_protocol() == 'h2'
            encoder = Encoder()
            data = b'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n' + WireSettings(0, settings=settings).serialize()
            if window: data += WindowUpdateFrame(0, window_increment=window).serialize()
            if fragmented:
                for chunk in [data[:7], data[7:26], data[26:]]: stream.sendall(chunk)
            else: stream.sendall(data)
            for i in range(repeat):
                names = {'m': (':method', 'GET'), 'a': (':authority', f'localhost:{port}'),
                         's': (':scheme', 'https'), 'p': (':path', f'/case/{case}/transport')}
                current = order[i] if isinstance(order, list) else order
                frame = HeadersFrame(2*i+1, data=encoder.encode([names[key] for key in current] + list(headers)))
                frame.flags.add('END_HEADERS'); frame.flags.add('END_STREAM')
                stream.sendall(frame.serialize())
                payload = b''
                while True:
                    frame, size = Frame.parse_frame_header(memoryview(exact(stream, 9)))
                    assert size <= 65536
                    frame.parse_body(memoryview(exact(stream, size)))
                    if isinstance(frame, SettingsFrame) and 'ACK' not in frame.flags:
                        ack = SettingsFrame(0); ack.flags.add('ACK'); stream.sendall(ack.serialize())
                    if isinstance(frame, DataFrame):
                        payload += frame.data
                        if frame.flow_controlled_length:
                            for sid in [0, frame.stream_id]:
                                stream.sendall(WindowUpdateFrame(sid, window_increment=frame.flow_controlled_length).serialize())
                    if frame.stream_id == 2*i+1 and 'END_STREAM' in frame.flags: break
                result.append(json.loads(payload) if port == 4193 else {'bytes': len(payload), 'protocol': '2'})
    return result


async def facts(online, case, count):
    for _ in range(40):
        rows = [row for row in online.observations(case) if row['category'] == 'h2-coherence']
        if len(rows) >= count: return rows
        await asyncio.sleep(.1)
    return rows


async def controls(online, out, port=4193):
    controls = [('chrome', CHROME, 'masp', 'consistent'), ('firefox', FIREFOX, 'mpas', 'consistent'),
                ('mixed', CHROME, 'mpas', 'mismatch'), ('reverse', FIREFOX, 'masp', 'mismatch'),
                ('empty', {}, 'masp', 'unknown'), ('unknown', {1: 4096, 4: 65535}, 'masp', 'unknown'),
                ('extension', {**CHROME, 43981: 4294967295}, 'masp', 'consistent'),
                ('fragmented', CHROME, 'masp', 'consistent'), ('reused', CHROME, 'masp', 'consistent')]
    proof = []
    before = {row['id'] for row in online.alerts()}
    for name, settings, order, expected in controls:
        case = {'id': str(uuid4())}
        online.save(out, 'current-control.json', {'name': name, 'case': case['id'], 'port': port})
        response = await asyncio.to_thread(request, settings, order, case['id'], name == 'fragmented',
                                          2 if name == 'reused' else 1, port=port, window=15663105)
        rows = await facts(online, case, len(response))
        proof.append({'name': name, 'case': case['id'], 'response': response, 'facts': rows, 'expected': expected})
        online.save(out, 'h2-controls.json', proof)
        assert len(rows) == len(response) and all(row['outcome'] == expected for row in rows)
        assert all(row['facts']['Settings'] == [{'ID': k, 'Value': v} for k, v in settings.items()] for row in rows)
        assert all(row['facts']['WindowUpdate'] == 15663105 for row in rows)
        assert all(row['valid'] == str(expected != 'unknown').lower() for row in rows)
    await asyncio.sleep(3)
    alerts = [row for row in online.alerts() if row['id'] not in before and row['scenario'] == 'bat-lab/h2-coherence']
    positive = {row['case'] for row in proof if row['expected'] == 'mismatch'}
    observed = {value['value'] for row in alerts for event in row['events'] for value in event['meta'] if value['key'] == 'session'}
    online.save(out, 'h2-alerts.json', alerts)
    assert observed == positive, 'h2_native_rule_false_positive_or_missing'
    return len(controls)


async def boundaries(online, out):
    proof = []
    before = {row['id'] for row in online.alerts()}
    for name, settings, headers, reason in [
            ('capacity', {**CHROME, **{i: 1 for i in range(256, 513)}}, (), 'settings_capacity'),
            ('forwarded', CHROME, [('x-forwarded-for', '198.51.100.9')], None)]:
        case = {'id': str(uuid4())}
        await asyncio.to_thread(request, settings, 'masp', case['id'], headers=headers)
        rows = [row for row in online.observations(case) if row['category'] == 'h2-coherence']
        proof.append({'name': name, 'case': case['id'], 'facts': rows})
        online.save(out, 'h2-boundaries.json', proof)
        assert len(rows) == 1 and rows[0]['reason'] == reason
        assert rows[0]['valid'] == str(reason is None).lower()
        assert rows[0]['source_ip'] != '198.51.100.9'
    case = {'id': str(uuid4())}
    connection = http.client.HTTPSConnection('localhost', 4193, timeout=5,
        context=ssl.create_default_context(cafile=str(BASE / 'tls/cert.pem')))
    try:
        connection.request('GET', f'/case/{case["id"]}/transport')
        assert json.loads(connection.getresponse().read())['protocol'] == '1.1'
    finally:
        connection.close()
    rows = [row for row in online.observations(case) if row['category'] == 'h2-coherence']
    proof.append({'name': 'http1', 'case': case['id'], 'facts': rows})
    online.save(out, 'h2-boundaries.json', proof)
    assert len(rows) == 1 and rows[0]['valid'] == 'false' and rows[0]['reason'] == 'http2_not_negotiated'
    await asyncio.sleep(3)
    assert not any(row['scenario'] == 'bat-lab/h2-coherence' for row in online.alerts() if row['id'] not in before)
    online.save(out, 'passed.json', {'capacityUnavailable': True, 'forwardedIgnored': True,
        'http1Unavailable': True, 'noFalsePositive': True, 'browserStarted': False})


async def exercise(online, browser, out):
    count = await controls(online, out)
    normal = {'id': str(uuid4())}
    page = await browser.get_current_page()
    await page.goto(f'https://localhost:4193/case/{normal["id"]}/transport')
    assert json.loads(await page.evaluate('() => document.body.textContent'))['protocol'] == '2'
    assert json.loads(await page.evaluate('() => fetch(location.href).then(r=>r.json())'))['protocol'] == '2'
    facts = [row for row in online.observations(normal) if row['category'] == 'h2-coherence']
    online.save(out, 'normal.json', {'tasks': [normal], 'facts': facts})
    assert len(facts) == 2 and all(row['valid'] == 'true' and row['outcome'] == 'consistent' for row in facts)
    online.save(out, 'passed.json', {'controls': count, 'actualNativeRequests': 2,
        'nativeCoherent': True, 'nativeCrowdSecPositiveAndNormal': True, 'modelCalls': 0,
        'fullShieldEntry': False, 'scope': 'independent first-hop H2 layer'})
