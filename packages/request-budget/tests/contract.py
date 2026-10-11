"""Protect independent caller data and the compatible public import boundary."""
import json
from pathlib import Path
import sys
import tempfile

import bat_request_budget

root = Path.cwd().resolve()
sys.path.insert(0, str(root / 'apps/api/python'))
from browser_use_runner.quota import check

assert check is bat_request_budget.check
with tempfile.TemporaryDirectory(prefix='shared-data-', dir=root / 'work/antibot-service/reports') as out:
    key, rates = 'a' * 64, ((1, 60000),)
    first, second = Path(out) / 'product.sqlite', Path(out) / 'shield.sqlite'
    assert check(first, key, rates)['status'] == 'allowed'
    assert check(first, key, rates)['status'] == 'denied'
    assert check(second, key, rates)['status'] == 'allowed'
    assert check(second, key, rates)['status'] == 'denied'
    assert check(first, 'b' * 64, rates)['status'] == 'allowed'
print(json.dumps(dict(passed=True, sameFunction=True, independentDatabases=True, independentScope=True,
                     version=bat_request_budget.__version__, module=bat_request_budget.__file__, cleanup=True)))
