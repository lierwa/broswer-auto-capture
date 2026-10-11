"""Thin owned-lab adapter to the unchanged PyrateLimiter SQLite sliding window."""
import hashlib
import re
import json
from pathlib import Path
import sys

WHEELS = {
    'pyrate_limiter-4.5.0-py3-none-any.whl': 'e7320a715adf404cb7b2f399e05ceb59cae165275b21f7708eb1b9fd9608e91c',
    'filelock-3.19.1-py3-none-any.whl': 'd38e30481def20772f5baf097c122c3babc4fcdb7e14e57049eb9d88c6dc017d',
}
RATES = ((60, 3_600_000), (240, 86_400_000))


def load(base, shared=None):
    for name, digest in WHEELS.items():
        source = base / 'upstream' / name
        if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
            raise ValueError('budget_dependency_changed')
        sys.path.insert(0, str(source))
    shared = shared or Path(__file__).resolve().parent / 'shared'
    receipt = json.loads((shared / 'request-budget.json').read_text(encoding='utf-8'))
    if receipt['version'] != '1.0.0' or receipt['wheel'] != 'bat_request_budget-1.0.0-py3-none-any.whl':
        raise ValueError('budget_shared_receipt_invalid')
    source = shared / receipt['wheel']
    if hashlib.sha256(source.read_bytes()).hexdigest() != receipt['wheelSha256']:
        raise ValueError('budget_shared_dependency_changed')
    # WHY：-I不读取PYTHONPATH；仅显式加入校验后的纯Python制品，并拒绝缓存的异源模块。
    sys.path.insert(0, str(source))
    import bat_request_budget
    if bat_request_budget.__version__ != receipt['version'] or not any(
            bat_request_budget.__file__.startswith(str(source) + sep) for sep in ('/', '\\')):
        raise ValueError('budget_shared_module_changed')
    return dict(version=receipt['version'], sourceDigest=receipt['sourceDigest'],
                wheelSha256=receipt['wheelSha256'], module=bat_request_budget.__file__)


def check(base, key, rates=RATES, database=None):
    if not base.is_absolute(): raise ValueError('budget_invalid_boundary')
    if re.fullmatch('[a-f0-9]{64}', key) is None: raise ValueError('budget_invalid_boundary')
    from bat_request_budget import check as shared_check
    target = database or base / 'data/budget.sqlite'
    return shared_check(target, key, rates)


if __name__ == '__main__':
    try:
        base = Path(sys.argv[1])
        loaded = load(base)
        result = dict(status='ready', **loaded) if sys.argv[2] == '--check-dependencies' else check(base, sys.argv[2])
    except Exception as error:
        # 状态读取失败不转内存、不清空历史，也不填allowed。
        result = dict(version=1, status='error', reason=type(error).__name__)
    print(json.dumps(result))
