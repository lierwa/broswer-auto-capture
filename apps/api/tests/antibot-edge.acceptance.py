"""Compare live first-hop JA4 against tshark; consume the unchanged full shield."""
import asyncio
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ROOT = Path.cwd().resolve(); BASE = ROOT / 'work/antibot-service'
spec = importlib.util.spec_from_file_location('online', ROOT / 'apps/api/tests/antibot-online.acceptance.py')
online = importlib.util.module_from_spec(spec); spec.loader.exec_module(online)
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present


def rows(file):
    return [json.loads(line) for line in file.read_text().splitlines() if line.startswith('{')]


def edge_case():
    case = online.local('/api/cases', {'kind': 'catalog'})
    case['url'] = case['url'].replace('http:', 'https:').replace(':4187/', ':4183/')
    return case


async def exercise(browser, out):
    page = await browser.get_current_page(); normal = edge_case()
    before = {row['id'] for row in online.alerts()}
    await online.ready(page, normal['url'])
    for attempt in range(3):
        result = await page.evaluate("() => fetch(location.href+'?native=" + str(attempt) + "').then(r=>({status:r.status}))")
        assert json.loads(result)['status'] == 200
    await asyncio.sleep(3)
    normal_alerts = [row['scenario'] for row in online.alerts() if row['id'] not in before]
    native_key = hashlib.sha256(urlsplit(normal['url']).hostname.encode()).hexdigest()
    native_rows = [row for row in rows(BASE / 'logs/tls.jsonl') if row['site'] == native_key]
    online.save(out, 'normal.json', {'case': normal, 'tls': native_rows, 'alerts': normal_alerts})
    assert 'bat-lab/protocol-continuity' not in normal_alerts, 'normal-browser-protocol-alert'
    assert len(native_rows) >= 5 and all(row['valid'] == 'true' for row in native_rows)
    mixed = edge_case(); before = {row['id'] for row in online.alerts()}
    await online.ready(page, mixed['url'])
    session = await browser.get_or_create_cdp_session()
    found = await session.cdp_client.send.Network.getCookies(params={'urls': [mixed['url']]}, session_id=session.session_id)
    cookie = next(c['value'] for c in found['cookies'] if c['name'] == '__crowdsec_challenge')
    target = urlsplit(mixed['url']); ua = await page.evaluate('() => navigator.userAgent')
    context = ssl.create_default_context(cafile=str(BASE / 'tls/cert.pem'))
    with httpx.Client(verify=context, trust_env=False) as client:
        response = client.get('https://localhost:4183' + target.path + '?mixed=owned', headers={
            'Host': target.netloc, 'User-Agent': ua, 'Cookie': '__crowdsec_challenge=' + cookie,
            'X-Real-IP': '198.51.100.19', 'X-Forwarded-For': '198.51.100.19', 'Forwarded': 'for=198.51.100.19'})
        assert response.status_code == 200 and 'crowdsec-internal/challenge' not in response.text
    await asyncio.sleep(4)
    current = [row['scenario'] for row in online.alerts() if row['id'] not in before]
    mixed_key = hashlib.sha256(target.hostname.encode()).hexdigest()
    mixed_rows = [row for row in rows(BASE / 'logs/tls.jsonl') if row['site'] == mixed_key]
    gateway = [row for row in rows(BASE / 'logs/access.jsonl') if row.get('RequestHost') == target.hostname]
    online.save(out, 'mixed.json', {'case': mixed, 'tls': mixed_rows, 'alerts': current,
        'gatewaySources': sorted({row['ClientHost'] for row in gateway}), 'sourceSpoofed': False})
    assert 'bat-lab/protocol-continuity' in current, 'mixed-network-not-detected-online'
    assert len({row['tls_family'] for row in mixed_rows if row['transport'] == 't'}) >= 2
    assert '198.51.100.19' not in {row['source_ip'] for row in mixed_rows}
    assert {row['source_ip'] for row in mixed_rows} == {row['ClientHost'] for row in gateway}, 'proxy-source-lost'
    return native_rows + mixed_rows


def alpn_counterexample(out):
    case = edge_case(); target = urlsplit(case['url'])
    context = ssl.create_default_context(cafile=str(BASE / 'tls/cert.pem'))
    context.set_alpn_protocols(['owned-test', 'http/1.1'])
    with socket.create_connection(('127.0.0.1', 4183), timeout=5) as transport:
        with context.wrap_socket(transport, server_hostname='localhost') as connection:
            assert connection.selected_alpn_protocol() == 'http/1.1'
            request = f'GET {target.path} HTTP/1.1\r\nHost: {target.netloc}\r\nConnection: close\r\n\r\n'
            connection.sendall(request.encode())
            while connection.recv(65536): pass
    site = hashlib.sha256(target.hostname.encode()).hexdigest()
    observed = [row for row in rows(BASE / 'logs/tls.jsonl') if row['site'] == site]
    online.save(out, 'alpn-counterexample.json', {'advertisedFirst': 'owned-test', 'negotiated': 'http/1.1',
        'expectedJa4Suffix': 'ot', 'observed': observed, 'tcpAlpnCorrected': True})
    assert observed and all(row['ja4'].split('_')[0].endswith('ot') for row in observed)
    assert all(row['ja4_status'] == 'measured' for row in observed)
    return observed


def independent(out, linux_out, actual):
    result = subprocess.run(['wsl', '-d', 'Ubuntu', '--exec', 'tshark', '-r', linux_out + '/first-hop.pcapng',
        '-Y', 'tls.handshake.type == 1', '-T', 'fields', '-e', 'tls.handshake.ja4', '-e', 'tls.handshake.ja4_r'],
        capture_output=True, check=True)
    measurements = []
    for line in result.stdout.decode().splitlines():
        original, raw = line.split('\t'); parts = raw.split('_')
        # Independent test correction required by JA4 spec: ignore GREASE everywhere.
        # tshark 4.6.4 retains GREASE in signature algorithms; preserve both results.
        signatures = parts[3].split(',') if len(parts) > 3 else []
        signatures = [s for s in signatures if not (int(s, 16) & 0x0f0f == 0x0a0a and s[:2] == s[2:])]
        extension_input = parts[2] + ('_' + ','.join(signatures) if signatures else '')
        digest = lambda value: hashlib.sha256(value.encode()).hexdigest()[:12]
        corrected = parts[0] + '_' + digest(parts[1]) + '_' + digest(extension_input)
        measurements.append({'tshark': original, 'specGreaseCorrected': corrected, 'greaseChanged': original != corrected})
    online.save(out, 'independent.json', {'measurements': measurements, 'edgeJa4': sorted({r['ja4'] for r in actual})})
    values = {m['specGreaseCorrected'] for m in measurements}
    assert actual and all(row['ja4'] in values for row in actual), 'edge-ja4-disagrees-with-independent-normal-and-mixed'
    assert any(value.split('_')[0].endswith('ot') for value in values), 'alpn-counterexample-not-captured'


async def main():
    out = Path(tempfile.mkdtemp(prefix='edge-', dir=BASE / 'reports')).resolve(); profile = out / 'profile'
    window, browser = ManagedWindow(profile, uuid4()), None
    pem = x509.load_pem_x509_certificate((BASE / 'tls/cert.pem').read_bytes())
    pin = base64.b64encode(hashlib.sha256(pem.public_key().public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)).digest()).decode()
    original_popen = subprocess.Popen
    def launch(args, **kwargs):
        if any(arg == '--user-data-dir=' + str(profile) for arg in args):
            args = [*args, '--ignore-certificate-errors-spki-list=' + pin]
        return original_popen(args, **kwargs)
    linux_out = '/mnt/' + out.as_posix()[0].lower() + out.as_posix()[2:]
    capture = original_popen(['wsl', '-d', 'Ubuntu', '-u', 'root', '--exec', 'tshark', '-i', 'lo', '-f', 'port 4183',
        '-a', 'duration:35', '-a', 'filesize:4096', '-w', linux_out + '/first-hop.pcapng'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(json.dumps({'evidence': str(out)}), flush=True)
    actual = []
    try:
        with patch('browser_use_runner.managed_window.subprocess.Popen', side_effect=launch):
            browser = await window.start(resume=False, allowed_domains=['*.localhost'])
        lease = window._load()
        online.save(out, 'owner.json', {'pid': lease.browserPid, 'started': lease.browserStarted, 'profile': str(profile),
            'tlsTrust': 'only-owned-certificate-SPKI-in-temporary-Chrome', 'personalTrustChanged': False})
        actual = await exercise(browser, out)
        actual += alpn_counterexample(out)
        if '--workers' in sys.argv:
            spec = importlib.util.spec_from_file_location('worker', Path(__file__).with_name('antibot-worker.acceptance.py'))
            worker = importlib.util.module_from_spec(spec); spec.loader.exec_module(worker)
            await worker.exercise(browser, out, online.save)
    finally:
        closed = await window.close(browser); online.save(out, 'closed.json', closed)
        assert closed['status'] == 'confirmed' and not _profile_process_present(profile)
        assert profile.parent == out and out.is_relative_to(BASE / 'reports')
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        if profile.exists(): shutil.rmtree(profile)
        online.save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})
        code = await asyncio.to_thread(capture.wait, timeout=45)
        online.save(out, 'capture-closed.json', {'exitCode': code, 'boundedSeconds': 35, 'port': 4183})
    independent(out, linux_out, actual)
    online.save(out, 'passed.json', {'liveProtocolRule': True, 'normalMixedJa4MatchedWithSpecGreaseCorrection': True,
        'tcpAlpnCounterexampleCorrected': True, 'quicJa4StillPartial': True, 'normalAndMixed': True,
        'transports': sorted({row['transport'] for row in actual}), 'fullShieldKept': True, 'modelCalls': 0})


if __name__ == '__main__': asyncio.run(main())
