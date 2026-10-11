"""Corrupt or missing shared artifacts must fail before the SQLite admission call."""
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile

source = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('owned_budget', source / 'budget.py')
budget = importlib.util.module_from_spec(spec)
spec.loader.exec_module(budget)
base = Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix='shared-loading-', dir=base / 'reports') as out:
    copied = Path(out) / 'shared'
    shutil.copytree(source / 'shared', copied)
    wheel = copied / 'bat_request_budget-1.0.0-py3-none-any.whl'
    wheel.write_bytes(wheel.read_bytes() + b'owned-corruption')
    try:
        budget.load(base, copied)
    except ValueError as error:
        assert str(error) == 'budget_shared_dependency_changed'
    else:
        raise AssertionError('corrupt shared wheel accepted')
    wheel.unlink()
    try:
        budget.load(base, copied)
    except FileNotFoundError:
        pass
    else:
        raise AssertionError('missing shared wheel accepted')
loaded = budget.load(base)
print(json.dumps(dict(passed=True, corruptRejected=True, missingRejected=True, loaded=loaded, cleanup=True)))
