"""Calibrate the persistent shield with one explicitly automated, owned headless browser."""
import asyncio
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.request import Request, urlopen

import psutil
from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog

sys.path.insert(0, str(Path(__file__).parent / 'antibot-m0'))
from browser import close_owned, save

ROOT = Path.cwd().resolve()
PARENT = ROOT / 'work/antibot-service'
ADMIN = 'http://127.0.0.1:4188'


def request(route, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = Request(ADMIN + route, data=data, headers={'Origin': ADMIN, 'Content-Type': 'application/json'})
    with urlopen(req, timeout=15) as response:
        return json.load(response)


async def run():
    if os.environ.get('BAT_ANTIBOT_SERVICE_POSITIVE') != '1':
        raise ValueError('explicit_local_calibration_required')
    directory = Path(tempfile.mkdtemp(prefix='positive-', dir=PARENT)).resolve()
    profile = directory / 'profile'
    profile.mkdir()
    case = request('/api/cases', {'kind': 'catalog', 'variant': 1})
    before = request('/api/report')
    executable = LocalBrowserWatchdog._find_installed_browser_path('chrome')
    owner = subprocess.Popen([str(executable), '--headless=new', '--remote-debugging-port=0',
        '--remote-debugging-address=127.0.0.1', '--enable-automation', '--user-data-dir=' + str(profile),
        '--no-first-run', '--no-default-browser-check', case['url']],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    started = psutil.Process(owner.pid).create_time()
    receipt = {'ownerPid': owner.pid, 'ownerStarted': started, 'profile': str(profile),
               'headless': True, 'closed': False, 'purpose': 'crowdsec_known_positive'}
    save(directory, 'owner.json', receipt)
    save(directory, 'case.json', case)
    try:
        deadline = time.monotonic() + 60
        result = None
        while time.monotonic() < deadline:
            report = request('/api/report')
            new = report['submissions'][len(before['submissions']):]
            if new:
                result = new[-1]
                break
            await asyncio.sleep(1)
        if result is None:
            raise ValueError('challenge_result_missing')
        reached = [r for r in report['business'] if r['case_id'] == case['id']]
        valid = result['result'] == 'rejected' and len(reached) == 0
        save(directory, 'proof.json', {'valid': valid, 'detector': result, 'businessReached': reached,
             'scope': 'headless automation positive; not a daily browser baseline'})
        print(json.dumps({'directory': str(directory), 'valid': valid, 'detector': result}))
        if not valid:
            raise ValueError('known_positive_not_blocked')
    finally:
        receipt['closed'] = close_owned(owner.pid, started, profile)
        save(directory, 'closed.json', receipt)
        if not receipt['closed']:
            raise ValueError('positive_owner_close_unconfirmed')
        owner.wait(timeout=5)
        assert profile.resolve().parent == directory and directory.is_relative_to(PARENT)
        assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
        shutil.rmtree(profile)
        save(directory, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


if __name__ == '__main__':
    asyncio.run(run())
