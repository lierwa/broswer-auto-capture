"""Calibrate native RTT source and missing states; no proxy/bot classification claim."""
import hashlib
import importlib.util
import json
from pathlib import Path
import socket
import ssl
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit

ROOT = Path.cwd().resolve()
BASE = ROOT / 'work/antibot-service'


def wsl(*args, check=True):
    result = subprocess.run(['wsl', '-d', 'Ubuntu', '--exec', *map(str, args)], cwd=ROOT,
                            capture_output=True, timeout=25)
    if check and result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace'))
    return result.stdout.decode(errors='replace').strip()


def linux(file):
    return wsl('wslpath', '-a', str(file))


def save(out, name, value):
    (out / name).write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def configuration(out):
    # Original config fragments are the tested surface, not duplicated formulas.
    command = "import * as m from './tools/antibot-lab/edge-rtt.ts';process.stdout.write(JSON.stringify(m))"
    fragments = json.loads(subprocess.check_output(['node', '--import', 'tsx', '--input-type=module', '-e', command], cwd=ROOT))
    body = fragments['rttLogFields'] + ',"inner_rtt_us":"%[fc_rtt(us)]","tls_version":"%[ssl_fc_protocol]","resumed":"%[ssl_fc_is_resumed]"'
    config = f'''global
  nbthread 1
defaults
  mode http
  timeout connect 5s
  timeout client 10s
  timeout server 10s
frontend first_hop
  mode tcp
  bind 127.0.0.1:4196
  tcp-request inspect-delay 5s
  tcp-request content accept if {{ req.ssl_hello_type 1 }}
  default_backend loopback
backend loopback
  mode tcp
  server inner 127.0.0.1:4197 send-proxy-v2 set-proxy-v2-tlv-fmt(0xe1) 1{fragments['rttProxyTlvs']}
frontend measurement
  bind 127.0.0.1:4197 accept-proxy ssl crt {linux(BASE / 'tls/edge.pem')} alpn http/1.1
  bind 127.0.0.1:4198 ssl crt {linux(BASE / 'tls/edge.pem')} alpn http/1.1
{fragments['rttDirectives']}
  http-request return status 200 content-type application/json lf-string '{{{body}}}'
'''
    (out / 'haproxy.cfg').write_text(config, encoding='utf-8', newline='\n')


def request(context, port=4196, delay_tls=0, delay_http=0, session=None):
    incoming, outgoing = ssl.MemoryBIO(), ssl.MemoryBIO()
    client = context.wrap_bio(incoming, outgoing, server_side=False, server_hostname='localhost', session=session)
    first, delayed = True, False
    with socket.create_connection(('127.0.0.1', port), timeout=10) as transport:
        while True:
            try:
                client.do_handshake()
                break
            except ssl.SSLWantReadError:
                chunk = outgoing.read()
                if chunk and not first and delay_tls:
                    time.sleep(delay_tls)
                    delayed = True
                if chunk: transport.sendall(chunk)
                first = False
                incoming.write(transport.recv(65536))
        chunk = outgoing.read()
        if chunk:
            if delay_tls and not delayed: time.sleep(delay_tls)
            transport.sendall(chunk)
        if delay_http: time.sleep(delay_http)
        client.write(b'GET /measurement HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
        transport.sendall(outgoing.read())
        response = bytearray()
        while True:
            try:
                part = client.read(65536)
                if not part: break
                response.extend(part)
            except ssl.SSLWantReadError:
                part = transport.recv(65536)
                if not part: break
                incoming.write(part)
        headers, body = bytes(response).split(b'\r\n\r\n', 1)
        assert headers.startswith(b'HTTP/1.1 200')
        return json.loads(body), client.session


def controls(out):
    rows = []
    for version in [ssl.TLSVersion.TLSv1_2, ssl.TLSVersion.TLSv1_3]:
        context = ssl.create_default_context(cafile=str(BASE / 'tls/cert.pem'))
        context.minimum_version = context.maximum_version = version
        context.set_alpn_protocols(['http/1.1'])
        baseline, session = request(context)
        cases = [('cold', baseline), ('resumed', request(context, session=session)[0]),
                 ('client-processing-delay', request(context, delay_tls=.2)[0]),
                 ('http-delay', request(context, delay_http=.2)[0]),
                 ('no-proxy-metadata', request(context, port=4198)[0])]
        for name, row in cases:
            rows.append({'control': name, 'requestedTls': version.name, **row})
        save(out, 'observed.json', rows)
    validate(out, rows)


def validate(out, rows):
    for row in rows:
        # 原生API在此TLS1.2恢复控制返回-1；正常连接也可不可测，不能当bot或零耗时。
        if row['requestedTls'] == 'TLSv1_2' and row['control'] == 'resumed':
            assert row['tls_rtt_status'] == 'error' and row['tls_rtt_us'] == ''
        else:
            assert row['tls_rtt_status'] == 'measured' and int(row['tls_rtt_us']) > 0
        if row['control'] == 'no-proxy-metadata':
            assert row['rtt_source'] == 'unavailable' and row['transport_rtt_us'] == ''
        else:
            assert row['rtt_source'] == 'first-hop-tcp' and int(row['transport_rtt_us']) > 0
            assert int(row['transport_rttvar_us']) >= 0
        if row['control'] == 'resumed': assert row['resumed'] == '1'
        if row['control'] == 'client-processing-delay': assert int(row['tls_rtt_us']) >= 150_000
        if row['control'] == 'http-delay': assert int(row['tls_rtt_us']) < 150_000
    save(out, 'passed.json', {'controls': len(rows), 'firstHopPreserved': True, 'missingNotZero': True,
        'endpointProcessingIncluded': True, 'httpWaitExcluded': True, 'nativeOpenSSL': True,
        'tls12ResumptionNotMeasured': True, 'localhostProxyIsNotInternetRtt': True,
        'botRuleCalibrated': False, 'browserStarted': False, 'modelCalls': 0})


def quic_control():
    # 复用已有固定quic-go发送器与管理API；不再启动浏览器或第二套测量服务。
    spec = importlib.util.spec_from_file_location('online', ROOT / 'apps/api/tests/antibot-online.acceptance.py')
    online = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(online)
    out = Path(tempfile.mkdtemp(prefix='rtt-quic-', dir=BASE / 'reports'))
    print(json.dumps({'evidence': str(out)}), flush=True)
    source = ROOT / 'apps/api/tests/antibot-m0/quic-control-client.go'
    binary = out / 'control-client'
    module = wsl('go', 'env', 'GOMODCACHE') + '/github.com/quic-go/quic-go@v0.55.0'
    wsl('env', 'GOFLAGS=-mod=readonly', 'go', '-C', module, 'build', '-o', linux(binary), linux(source))
    save(out, 'source.json', {'quicGo': 'v0.55.0', 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'binarySha256': hashlib.sha256(binary.read_bytes()).hexdigest(), 'browserStarted': False})
    case = online.local('/api/cases', {'kind': 'catalog'})
    target = urlsplit(case['url'])
    address = json.loads((BASE / 'edge-endpoint.json').read_text())['address']
    body = {'URL': 'https://' + address + ':4183' + target.path, 'Host': target.hostname + ':4183',
        'UA': 'owned-quic-rtt-control', 'CA': linux(BASE / 'tls/cert.pem'), 'ReadDelayMs': 20}
    result = subprocess.run(['wsl', '-d', 'Ubuntu', '--exec', linux(binary)], cwd=ROOT,
        input=json.dumps(body).encode(), capture_output=True, timeout=15)
    save(out, 'closed.json', {'clientExited': True, 'exitCode': result.returncode, 'browserCreated': False})
    assert result.returncode == 0, result.stderr.decode(errors='replace')
    response = json.loads(result.stdout)
    assert response['protocol'] == 'HTTP/3.0'
    site = hashlib.sha256(target.hostname.encode()).hexdigest()
    rows = []
    deadline = time.monotonic() + 5
    while not rows and time.monotonic() < deadline:
        rows = [row for line in (BASE / 'logs/tls.jsonl').read_text().splitlines()
            if line.startswith('{') and (row := json.loads(line)).get('site') == site]
        if not rows: time.sleep(.1)
    save(out, 'observed.json', {'response': response, 'rows': rows})
    assert len(rows) == 1
    row = rows[0]
    assert row['alpn'] == 'h3' and row['rtt_source'] == 'direct-quic'
    assert int(row['transport_rtt_us']) >= 10_000 and int(row['transport_rttvar_us']) >= 0
    assert row['tls_rtt_status'] == 'unavailable' and row['tls_rtt_us'] in ('', '-')
    save(out, 'passed.json', {'nativeQuicMeasured': True, 'tlsNotFalselyMeasured': True,
        'clientReadDelayMs': 20, 'nativeQuicResolutionUs': 1000,
        'modelCalls': 0, 'botRuleCalibrated': False, 'chromeH3Retested': False})


def main():
    out = Path(tempfile.mkdtemp(prefix='rtt-native-', dir=BASE / 'reports'))
    print(json.dumps({'evidence': str(out)}), flush=True)
    binary = BASE / 'runtime/haproxy-rtt-candidate/haproxy'
    receipt = json.loads(binary.with_name('candidate.json').read_text())
    assert hashlib.sha256(binary.read_bytes()).hexdigest() == receipt['binarySha256']
    assert hashlib.sha256((ROOT / 'tools/antibot-lab/edge-ssl-rtt.c').read_bytes()).hexdigest() == receipt['rttAdapterSha256'], 'candidate_build_not_current'
    unit = 'bat-' + out.name
    configuration(out)
    wsl(linux(binary), '-c', '-f', linux(out / 'haproxy.cfg'))
    # Fixed loopback ports may only be used while unowned by any other process.
    assert not wsl('ss', '-H', '-ltn', 'sport = :4196 or sport = :4197 or sport = :4198')
    save(out, 'owner.json', {'unit': unit, 'binary': str(binary), 'directory': str(out),
        'ports': [4196, 4197, 4198], 'activeEdgeChanged': False, 'finallyStopsUnit': True})
    try:
        wsl('systemd-run', '--user', '--unit=' + unit, '--collect', '--service-type=exec',
            '--working-directory=' + linux(out), linux(binary), '-db', '-f', linux(out / 'haproxy.cfg'))
        time.sleep(.3)
        assert wsl('systemctl', '--user', 'show', unit, '--property=WorkingDirectory', '--value') == linux(out)
        controls(out)
    finally:
        # Ownership is the unique unit created above; no global process or port kill.
        wsl('systemctl', '--user', 'stop', unit)
        inactive = wsl('systemctl', '--user', 'is-active', unit, check=False) != 'active'
        ports_closed = not wsl('ss', '-H', '-ltn', 'sport = :4196 or sport = :4197 or sport = :4198')
        save(out, 'closed.json', {'inactive': inactive, 'portsClosed': ports_closed, 'profileCreated': False})
        assert inactive and ports_closed


if __name__ == '__main__':
    if sys.argv[1:] == ['--quic']: quic_control()
    elif not sys.argv[1:]: main()
    else: raise SystemExit('usage: antibot-rtt.acceptance.py [--quic]')
