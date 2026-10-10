"""Consented human baseline, isolated visible Chrome, no CDP or automation connection."""
import json
import argparse
from pathlib import Path
import shutil
import ssl
import subprocess
import sys
import time
import urllib.request
import uuid

import psutil
from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog

ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT / 'apps/api/tests/antibot-m0'))
from browser import close_owned, save


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--focus-check', action='store_true')
    parser.add_argument('--input-mode', choices=['direct', 'remote', 'unknown'], default='unknown')
    options = parser.parse_args()
    phases = [2] if options.focus_check else [0, 1, 2]
    parent = ROOT / 'work/antibot-service/reports'
    key = uuid.uuid4().hex
    out = (parent / ('human-' + key)).resolve()
    profile = out / 'profile'
    url = 'https://localhost:4185/measurement/human/' + key
    if options.focus_check: url += '?phase=2&mode=focus'
    context = ssl.create_default_context()
    context.load_verify_locations(str(ROOT / 'work/antibot-service/tls/cert.pem'))
    assert b'B-A-T' in urllib.request.urlopen(url, context=context, timeout=10).read()
    out.mkdir(); profile.mkdir()
    executable = LocalBrowserWatchdog._find_installed_browser_path('chrome')
    owner = subprocess.Popen([str(executable), '--user-data-dir=' + str(profile), '--no-first-run',
        '--no-default-browser-check', '--ignore-certificate-errors', '--window-size=1050,850', url],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    started = psutil.Process(owner.pid).create_time()
    receipt = {'ownerPid': owner.pid, 'ownerStarted': started, 'profile': str(profile),
        'purpose': 'consented-human-baseline', 'controlConnected': False, 'headless': False,
        'inputMode': options.input_mode, 'requestedPhases': phases, 'focusSupplement': options.focus_check,
        'at': time.time(), 'closed': False, 'tlsTrust': 'temporary-browser-only'}
    save(out, 'owner.json', receipt)
    print(json.dumps({'ready': True, 'url': url, 'evidence': str(out)}), flush=True)
    try:
        deadline = time.monotonic() + 1800
        while owner.poll() is None and time.monotonic() < deadline:
            if all((out / f'phase-{phase}.json').exists() for phase in phases):
                save(out, 'complete.json', {'phases': len(phases), 'method': 'user-operation-no-cdp', 'at': time.time()})
                time.sleep(7)
                break
            time.sleep(1)
    finally:
        receipt['closed'] = close_owned(owner.pid, started, profile)
        save(out, 'closed.json', receipt)
        if not receipt['closed']: raise ValueError('human_browser_close_unconfirmed')
        owner.wait(timeout=5)
        assert profile.resolve().parent == out and out.is_relative_to(parent)
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        shutil.rmtree(profile)
        save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


if __name__ == '__main__': main()
