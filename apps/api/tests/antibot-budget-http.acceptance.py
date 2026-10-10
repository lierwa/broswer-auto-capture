"""Owned source-admission calibration; deliberately separate from full gateway acceptance."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = Path('work/antibot-service').resolve()


def request(url, data=None, headers=None):
    if data is not None:
        assert url.startswith('http://127.0.0.1:4188/api/')
        headers = {'Origin': 'http://127.0.0.1:4188', 'Content-Type': 'application/json'}
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None, headers=headers or {})
    try:
        response = urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, dict(response.headers), response.read()


def wsl(*args):
    return subprocess.run(['wsl', '-d', 'Ubuntu', '--exec', *args], capture_output=True, check=True).stdout.decode().strip()


def main():
    out = Path(tempfile.mkdtemp(prefix='budget-http-', dir=BASE / 'reports'))
    prepared = json.loads((BASE / 'prepared.json').read_text())
    owner = json.loads(request('http://127.0.0.1:4188/api/health')[2])
    assert owner['owner'] == 'bat-antibot-lab' and owner['base'] == prepared['base']
    key = json.loads((BASE / 'secrets.json').read_text())['bouncer']
    ip = '192.0.2.189'
    case = json.loads(request('http://127.0.0.1:4188/api/cases', {'kind': 'catalog'})[2])
    url = 'http://127.0.0.1:4189/case/' + case['id'] + '/document/7'
    headers = {'X-Bat-Lab-Origin': key, 'X-Real-IP': ip, 'Host': case['id'] + '.localhost'}
    preconditions = dict(case=case['id'], source=ip, purpose='isolated-persistent-quota-source-admission',
                         gatewayParticipated=False, whitelistAdded=False, realLongWindowElapsed=False)
    (out / 'preconditions.json').write_text(json.dumps(preconditions, indent=2))
    for _ in range(60):
        assert request(url, headers=headers)[0] == 200
    status, denied_headers, raw = request(url, headers=headers)
    assert status == 429 and int(denied_headers['Retry-After']) > 3500
    assert json.loads(raw)['limit'] == 60
    unit = 'bat-antibot-origin.service'
    assert wsl('systemctl', '--user', 'show', unit, '-p', 'WorkingDirectory', '--value') == prepared['base']
    try:
        assert wsl('systemctl', '--user', 'is-active', 'bat-antibot-window-test.service') != 'active'
    except subprocess.CalledProcessError:
        pass
    before = wsl('systemctl', '--user', 'show', unit, '-p', 'InvocationID', '--value')
    wsl('systemctl', '--user', 'restart', unit)
    for _ in range(50):
        try:
            assert request('http://127.0.0.1:4188/api/health')[0] == 200
            break
        except (OSError, AssertionError):
            time.sleep(.2)
    after = wsl('systemctl', '--user', 'show', unit, '-p', 'InvocationID', '--value')
    assert before != after and request(url, headers=headers)[0] == 429
    assert request(url, headers={**headers, 'X-Real-IP': '192.0.2.190'})[0] == 200
    second = json.loads(request('http://127.0.0.1:4188/api/cases', {'kind': 'catalog'})[2])
    assert request(url.replace(case['id'], second['id']), headers=headers)[0] == 200
    time.sleep(3)
    bin_path = prepared['base'] + '/runtime/crowdsec/crowdsec-v1.8.1/cmd/crowdsec-cli/cscli'
    alerts = json.loads(wsl(bin_path, '-c', prepared['base'] + '/config/config.yaml', 'alerts', 'list', '-l', '0', '-o', 'json'))
    expected = hashlib.sha256(json.dumps([case['id'], ip], separators=(',', ':')).encode()).hexdigest()
    rows = [json.loads(line) for line in (BASE / 'logs/observations.jsonl').read_text().splitlines()]
    measured = [row for row in rows if row.get('session') == expected and row.get('category') == 'persistent-budget']
    assert sum(row['outcome'] == 'allowed' for row in measured) == 60
    assert sum(row['outcome'] == 'denied' for row in measured) == 2
    assert any(a['scenario'] == 'bat-lab/persistent-budget' and a['source']['value'] == ip for a in alerts)
    report = dict(**preconditions, defaultPolicy={'hour': 60, 'day': 240}, actualRequests=64,
                  primaryAllowed=60, primaryDenied=2, independentIpAndCase=True,
                  nativeCrowdsecAlert=True, retryAfter=denied_headers['Retry-After'],
                  sourceRestartBefore=before, sourceRestartAfter=after, modelCalls=0)
    (out / 'passed.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(dict(out=str(out), passed=True, **report)))


if __name__ == '__main__':
    main()
