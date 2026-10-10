"""Shared thin adapter; PyrateLimiter owns the sliding window, SQL and process lock."""
import math
from pathlib import Path
import re
import time


def check(database, scope, rates):
    if not Path(database).is_absolute() or re.fullmatch('[a-f0-9]{64}', scope) is None:
        raise ValueError('budget_invalid_boundary')
    from pyrate_limiter import SQLiteBucket, Rate, RateItem
    bucket = SQLiteBucket.init_from_file([Rate(limit, interval) for limit, interval in rates],
        db_path=str(database), table='scope_' + scope, use_file_lock=True)
    try:
        bucket.conn.execute('PRAGMA synchronous=FULL')
        now = time.time_ns() // 1_000_000
        bucket.leak(now)
        decision = bucket.put_decision(RateItem('business-admission', now))
        rate = decision.failing_rate
        return dict(version=1, status='allowed' if decision.allowed else 'denied',
                    retryAfter=math.ceil((decision.retry_after_ms or 0) / 1000),
                    intervalMs=rate.interval if rate else None, limit=rate.limit if rate else None)
    finally:
        bucket.close()
