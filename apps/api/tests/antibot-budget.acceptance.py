"""Persistent native rolling-window contract; short-time proof is not a day-long run."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path.cwd().resolve()
SOURCE = ROOT / 'tools/antibot-lab/budget.py'
BASE = ROOT / 'work/antibot-service'
spec = importlib.util.spec_from_file_location('budget', SOURCE)
budget = importlib.util.module_from_spec(spec)
spec.loader.exec_module(budget)


def initialize(base):
    (base / 'upstream').mkdir(parents=True)
    (base / 'data').mkdir()
    for name in budget.WHEELS:
        shutil.copyfile(BASE / 'upstream' / name, base / 'upstream' / name)


def child(base, key):
    result = subprocess.run([sys.executable, '-I', str(SOURCE), str(base), key],
                            capture_output=True, timeout=10, check=True)
    return json.loads(result.stdout)


def run(out):
    key = hashlib.sha256(b'owned-window-test').hexdigest()
    other = hashlib.sha256(b'independent-origin').hexdigest()
    base = out / 'owned-runtime'
    initialize(base)
    budget.load(base)
    assert budget.RATES == ((60, 3_600_000), (240, 86_400_000))
    before = time.time()
    results = [budget.check(base, key) for _ in range(60)]
    assert all(row['status'] == 'allowed' for row in results)
    denied = child(base, key)
    assert denied['status'] == 'denied' and 3500 <= denied['retryAfter'] <= 3601
    assert denied['intervalMs'] == 3_600_000 and denied['limit'] == 60
    assert child(base, other)['status'] == 'allowed'
    # 已经消耗50，20个真实进程并发争抢余下10，不能因每进程的内存状态超发。
    race = hashlib.sha256(b'concurrent-scope').hexdigest()
    for _ in range(50):
        assert budget.check(base, race)['status'] == 'allowed'
    with ThreadPoolExecutor(max_workers=8) as pool:
        competing = list(pool.map(lambda _: child(base, race), range(20)))
    assert sum(row['status'] == 'allowed' for row in competing) == 10
    assert sum(row['status'] == 'denied' for row in competing) == 10
    # 使用同一原窗口算法，两个时间尺度，真实等4秒；期间无bucket/worker存活。
    short = out / 'short.sqlite'
    short_rates = ((2, 4000), (3, 8000))
    assert budget.check(base, key, short_rates, short)['status'] == 'allowed'
    assert budget.check(base, key, short_rates, short)['status'] == 'allowed'
    assert budget.check(base, key, short_rates, short)['status'] == 'denied'
    time.sleep(4.15)
    assert budget.check(base, key, short_rates, short)['status'] == 'allowed'
    longer = budget.check(base, key, short_rates, short)
    assert longer['status'] == 'denied' and longer['intervalMs'] == 8000
    assert child(base, 'untrusted;table')['status'] == 'error'
    broken = out / 'broken-runtime'
    initialize(broken)
    (broken / 'data/budget.sqlite').write_bytes(b'owned-invalid-sqlite')
    assert child(broken, key)['status'] == 'error'
    assert (broken / 'data/budget.sqlite').read_bytes() == b'owned-invalid-sqlite'
    return dict(platform=sys.platform, elapsedSeconds=time.time() - before, actualDefaultLimit=60,
                firstDenial=denied, independentScope=True, competingProcesses=20,
                concurrentAllowed=10, concurrentDenied=10, realShortWindowSeconds=4.15,
                idleNoLiveBucket=True, higherWindowStillDenied=longer, corruptStateReported=True,
                realHourElapsed=False, realDayElapsed=False, powerLossTested=False,
                windowsWslSimultaneousWritersSupported=False)


def main():
    out = Path(tempfile.mkdtemp(prefix='budget-', dir=BASE / 'reports'))
    (out / 'owner.json').write_text(json.dumps(dict(purpose='owned-budget-calibration', platform=sys.platform)))
    try:
        result = run(out)
        (out / 'passed.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(json.dumps(dict(out=str(out), passed=True, **result)))
    except Exception as error:
        (out / 'first-failure.json').write_text(json.dumps(dict(type=type(error).__name__, message=str(error))))
        raise


if __name__ == '__main__':
    main()
