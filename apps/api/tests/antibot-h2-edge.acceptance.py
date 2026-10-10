"""Protect original client metadata, independent decoder agreement and real CrowdSec detection."""
import asyncio
import hashlib
import http.client
import importlib.util
import json
from pathlib import Path
import ssl
import tempfile
from uuid import uuid4

ROOT = Path.cwd().resolve()
BASE = ROOT / 'work/antibot-service'
spec = importlib.util.spec_from_file_location('online', ROOT / 'apps/api/tests/antibot-online.acceptance.py')
online = importlib.util.module_from_spec(spec)
spec.loader.exec_module(online)
from antibot_h2_cases import CHROME, request, controls, facts


async def main():
    out = Path(tempfile.mkdtemp(prefix='h2-integrated-', dir=BASE / 'reports'))
    print(json.dumps({'evidence': str(out)}), flush=True)
    config_files = [BASE / 'haproxy.cfg', BASE / 'routes.yaml', *sorted((BASE / 'config/scenarios').glob('bat-lab*.yaml'))]
    before_config = {str(file.relative_to(BASE)): hashlib.sha256(file.read_bytes()).hexdigest() for file in config_files}
    online.save(out, 'preconditions.json', {'config': before_config, 'fullShieldEntry': 'https://localhost:4183',
        'browserStarted': False, 'adapter': json.loads((BASE / 'edge-h2.json').read_text())})
    assert await controls(online, out, port=4183) == 9
    controls_proof = json.loads((out / 'h2-controls.json').read_text())
    assert all(row['entry'] == 'full-shield' for case in controls_proof for row in case['facts'])
    proof = []
    for port in [4183, 4193]:
        case = {'id': str(uuid4())}
        await asyncio.to_thread(request, CHROME, ['masp', 'mpas'], case['id'], repeat=2, port=port, window=15663105)
        rows = await facts(online, case, 2)
        proof.append({'port': port, 'case': case['id'], 'facts': rows})
        online.save(out, 'independent-decoder.json', proof)
        assert [row['outcome'] for row in rows] == ['consistent', 'mismatch']
    assert [r['facts'] for r in proof[0]['facts']] == [r['facts'] for r in proof[1]['facts']]
    boundaries = []
    for name, settings, headers, reason in [
        ('capacity', {**CHROME, **{i: 1 for i in range(256, 513)}}, (), 'settings_capacity'),
        ('forwarded', CHROME, [('x-forwarded-for', '198.51.100.9')], None)]:
        case = {'id': str(uuid4())}
        await asyncio.to_thread(request, settings, 'masp', case['id'], headers=headers, port=4183)
        rows = await facts(online, case, 1)
        boundaries.append({'name': name, 'case': case['id'], 'facts': rows})
        online.save(out, 'boundaries.json', boundaries)
        assert len(rows) == 1 and rows[0]['reason'] == reason
        assert rows[0]['source_ip'] != '198.51.100.9'
        assert rows[0]['valid'] == str(reason is None).lower()
    case = {'id': str(uuid4())}
    connection = http.client.HTTPSConnection('localhost', 4183, timeout=5,
        context=ssl.create_default_context(cafile=str(BASE / 'tls/cert.pem')))
    try:
        connection.request('GET', f'/case/{case["id"]}/transport')
        connection.getresponse().read()
    finally: connection.close()
    rows = await facts(online, case, 1)
    boundaries.append({'name': 'http1', 'case': case['id'], 'facts': rows})
    online.save(out, 'boundaries.json', boundaries)
    assert len(rows) == 1 and rows[0]['reason'] == 'http2_not_negotiated' and rows[0]['valid'] == 'false'
    assert all(hashlib.sha256((BASE / name).read_bytes()).hexdigest() == digest for name, digest in before_config.items())
    online.save(out, 'passed.json', {'controls': 9, 'independentDecoderAgrees': True,
        'streamOrderRetained': True, 'full16bitId32bitValue': True, 'windowUpdate': True,
        'unavailableNotGreen': True, 'forwardedIgnored': True, 'fullShieldEntry': True,
        'realCrowdSecPositiveAndNormal': True, 'browserStarted': False, 'businessTested': False})


if __name__ == '__main__': asyncio.run(main())
