"""Activate a tested owned build; failures restore the original engine/configuration."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path.cwd().resolve()
BASE = ROOT / 'work/antibot-service'
UNIT = 'bat-antibot-engine.service'


def wsl(*args, check=True):
    result = subprocess.run(['wsl', '-d', 'Ubuntu', '--exec', *args], cwd=ROOT,
                            capture_output=True, check=check)
    return result.stdout.decode().strip()


def show(prop):
    return wsl('systemctl', '--user', 'show', UNIT, '--property=' + prop, '--value')


def stop():
    wsl('systemctl', '--user', 'stop', UNIT)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        state = wsl('systemctl', '--user', 'is-active', UNIT, check=False)
        if state != 'active': return
        time.sleep(.2)
    raise RuntimeError('owned-engine-still-active')


def start():
    result = subprocess.run(['node', '--experimental-strip-types', 'tools/antibot-lab/lab.ts', 'start'],
                            cwd=ROOT, capture_output=True, check=True, timeout=100)
    return result.stdout.decode().strip()


def main():
    base = json.loads((BASE / 'prepared.json').read_text())['base']
    assert show('WorkingDirectory') == base, 'engine-owner-changed'
    assert wsl('systemctl', '--user', 'is-active', 'bat-antibot-window-test.service', check=False) != 'active'
    manifest = json.loads((BASE / 'runtime/crowdsec-persistent/manifest.json').read_text())
    binary = BASE / 'runtime/crowdsec-persistent/crowdsec'
    assert hashlib.sha256(binary.read_bytes()).hexdigest() == manifest['binarySha256']
    signing = BASE / 'config/appsec-configs/bat-lab-signing.yaml'
    receipt = BASE / 'persistent-engine.json'
    original, old_receipt = signing.read_bytes(), receipt.read_bytes() if receipt.exists() else None
    out = Path(tempfile.mkdtemp(prefix='persistent-activate-', dir=BASE / 'reports'))
    previous = show('InvocationID')
    print(json.dumps(dict(evidence=str(out))), flush=True)
    config = json.loads(original)
    config['challenge']['spent_set_db'] = base + '/data/challenge-spent.sqlite'
    try:
        stop()
        signing.write_text(json.dumps(config), newline='\n')
        receipt.write_text(json.dumps({**manifest, 'installed': True}), newline='\n')
        wsl(base + '/runtime/crowdsec-persistent/crowdsec', '-c', base + '/config/config.yaml', '-t')
        ready = start()
        assert show('InvocationID') != previous
        assert '/runtime/crowdsec-persistent/crowdsec' in show('ExecStart'), 'wrong-engine-binary'
        (out / 'result.json').write_text(json.dumps(dict(previous=previous, current=show('InvocationID'),
            binarySha256=manifest['binarySha256'], ready=ready, storedNonceHashesOnly=True,
            configBefore=hashlib.sha256(original).hexdigest(), configAfter=hashlib.sha256(signing.read_bytes()).hexdigest(),
            oldRulesAndSecretPreserved=True, originalBinaryPreserved=True), indent=2))
    except BaseException:
        stop()
        signing.write_bytes(original)
        if old_receipt is not None: receipt.write_bytes(old_receipt)
        elif receipt.exists(): receipt.unlink()
        restored = start()
        (out / 'restored.json').write_text(json.dumps(dict(ready=restored, originalRestored=True)))
        raise


if __name__ == '__main__': main()
