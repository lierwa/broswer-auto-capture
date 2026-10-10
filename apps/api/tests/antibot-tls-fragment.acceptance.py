"""Native ALPN source survives record fragmentation and differs from negotiation."""
import hashlib
import json
from pathlib import Path
import socket
import ssl
import tempfile
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path.cwd().resolve(); BASE = ROOT / 'work/antibot-service'


def request(fragmented, alpn):
    req = Request('http://127.0.0.1:4188/api/cases', data=b'{"kind":"catalog"}',
        headers={'Origin': 'http://127.0.0.1:4188', 'Content-Type': 'application/json'})
    with urlopen(req, timeout=10) as response: case = json.load(response)
    target = urlsplit(case['url'].replace('http:', 'https:').replace(':4187/', ':4183/'))
    context = ssl.create_default_context(cafile=str(BASE / 'tls/cert.pem'))
    if alpn: context.set_alpn_protocols(alpn)
    incoming, outgoing = ssl.MemoryBIO(), ssl.MemoryBIO()
    client = context.wrap_bio(incoming, outgoing, server_side=False, server_hostname='localhost')
    first = True
    with socket.create_connection(('127.0.0.1', 4183), timeout=12) as transport:
        while True:
            try:
                client.do_handshake(); break
            except ssl.SSLWantReadError:
                chunk = outgoing.read()
                if first and fragmented:
                    length = int.from_bytes(chunk[3:5], 'big'); payload = chunk[5:5+length]
                    assert chunk[0] == 22 and len(payload) > 20
                    chunk = chunk[:3] + (20).to_bytes(2, 'big') + payload[:20] + chunk[:3] + (length-20).to_bytes(2, 'big') + payload[20:] + chunk[5+length:]
                first = False
                if chunk: transport.sendall(chunk)
                incoming.write(transport.recv(65536))
        transport.sendall(outgoing.read())
        client.write(f'GET {target.path} HTTP/1.1\r\nHost: {target.netloc}\r\nConnection: close\r\n\r\n'.encode())
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
        assert response.startswith(b'HTTP/1.1 200'), 'owned-challenge-unavailable'
        negotiated = client.selected_alpn_protocol()
    site = hashlib.sha256(target.hostname.encode()).hexdigest()
    rows = [json.loads(line) for line in (BASE/'logs/tls.jsonl').read_text().splitlines() if line.startswith('{')]
    rows = [row for row in rows if row['site'] == site]
    return {'fragmented': fragmented, 'offeredAlpn': alpn, 'negotiated': negotiated, 'rows': rows}


def main():
    out = Path(tempfile.mkdtemp(prefix='tls-fragment-', dir=BASE/'reports'))
    result = [request(False, []), request(True, ['http/1.1']),
              request(False, ['x-lab-9', 'http/1.1']), request(True, ['a' * 254 + 'z', 'http/1.1'])]
    (out/'observed.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    assert result[0]['rows'] and all(row['ja4_status'] == 'measured' and row['ja4'].split('_')[0].endswith('00') for row in result[0]['rows'])
    assert result[1]['negotiated'] == 'http/1.1'
    for item, suffix in zip(result[1:], ('h1', 'x9', 'az')):
        assert item['negotiated'] == 'http/1.1'
        assert item['rows'] and all(row['ja4_status'] == 'measured' and row['ja4'].split('_')[0].endswith(suffix) for row in item['rows'])
    (out/'passed.json').write_text(json.dumps({'normalNoAlpnMeasured': True, 'fragmentedHelloNativeMeasured': True,
        'firstAdvertisementDiffersFromNegotiated': True, 'maximumProtocolLength': 255,
        'noBrowser': True, 'modelCalls': 0}), encoding='utf-8')
    print(json.dumps({'evidence': str(out)}))


if __name__ == '__main__': main()
