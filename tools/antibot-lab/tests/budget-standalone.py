"""Protect the independent SQLite adapter using only Python and pinned wheels."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

source = Path(__file__).resolve().parents[1] / 'budget.py'
spec = importlib.util.spec_from_file_location('shield_budget', source)
budget = importlib.util.module_from_spec(spec)
spec.loader.exec_module(budget)
base = Path(sys.argv[1]).resolve()
budget.load(base)
key = 'a' * 64

if len(sys.argv) == 3:
    print(json.dumps(budget.check(base, key, ((1, 60000),), Path(sys.argv[2]))))
else:
    with tempfile.TemporaryDirectory(prefix='standalone-budget-', dir=base / 'reports') as temporary:
        database = Path(temporary) / 'quota.sqlite'
        results = [json.loads(subprocess.check_output([sys.executable, '-I', __file__, str(base), str(database)], text=True)) for _ in range(2)]
        assert [r['status'] for r in results] == ['allowed', 'denied'], results
        assert 1 <= results[1]['retryAfter'] <= 60
        try:
            budget.check(base, 'untrusted/table', database=database)
        except ValueError:
            pass
        else:
            raise AssertionError('invalid scope accepted')
    assert not database.exists()
    print(json.dumps(dict(passed=True, independentProcesses=2, persistedDenial=True, cleanup=True)))
