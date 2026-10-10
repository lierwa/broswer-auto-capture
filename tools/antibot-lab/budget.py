"""Thin owned-lab adapter to the unchanged PyrateLimiter SQLite sliding window."""
import hashlib
import json
from pathlib import Path
import sys

WHEELS = {
    'pyrate_limiter-4.5.0-py3-none-any.whl': 'e7320a715adf404cb7b2f399e05ceb59cae165275b21f7708eb1b9fd9608e91c',
    'filelock-3.19.1-py3-none-any.whl': 'd38e30481def20772f5baf097c122c3babc4fcdb7e14e57049eb9d88c6dc017d',
}
RATES = ((60, 3_600_000), (240, 86_400_000))


def load(base):
    for name, digest in WHEELS.items():
        source = base / 'upstream' / name
        if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
            raise ValueError('budget_dependency_changed')
        sys.path.insert(0, str(source))


def check(base, key, rates=RATES, database=None):
    if not base.is_absolute(): raise ValueError('budget_invalid_boundary')
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'apps/api/python'))
    from browser_use_runner.quota import check as quota_check
    return quota_check(database or base / 'data/budget.sqlite', key, rates)


if __name__ == '__main__':
    try:
        base = Path(sys.argv[1])
        load(base)
        result = check(base, sys.argv[2])
    except Exception as error:
        # 状态读取失败不转内存、不清空历史，也不填allowed。
        result = dict(version=1, status='error', reason=type(error).__name__)
    print(json.dumps(result))
