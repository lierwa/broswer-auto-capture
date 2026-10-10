"""Declared origin quotas; no invented per-site limits and no network retries."""
from functools import lru_cache
import os
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator
from browser_use_runner import access_cooldown
from browser_use_runner.quota import check


class Rate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    limit: StrictInt = Field(gt=0, le=1_000_000_000)
    intervalMs: StrictInt = Field(gt=0, le=31_536_000_000)


class Policy(BaseModel):
    model_config = ConfigDict(extra='forbid')
    origin: str
    source: Literal['operator', 'site-policy']
    rates: list[Rate] = Field(min_length=1, max_length=8)

    @field_validator('origin')
    @classmethod
    def origin_only(cls, value):
        parsed = urlsplit(value)
        if (not access_cooldown.key(value) or parsed.username or parsed.password or parsed.query
                or parsed.fragment or parsed.path not in ('', '/') or '*' in parsed.netloc):
            raise ValueError('access_policy_origin_required')
        return value


class Policies(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: Literal[1]
    policies: list[Policy] = Field(max_length=256)


@lru_cache(maxsize=4)
def load(file, stamp, size):
    if size > 262144: raise ValueError('access_policy_file_too_large')
    policies = Policies.model_validate_json(Path(file).read_text(encoding='utf-8')).policies
    result = {access_cooldown.key(policy.origin): policy for policy in policies}
    if len(result) != len(policies): raise ValueError('access_policy_origin_duplicate')
    return result


def acquire(url):
    access_cooldown.guard(url)
    file = os.environ.get('BAT_ACCESS_POLICY_FILE')
    if not file: return 'unconfigured'
    path = Path(file)
    if not path.is_absolute(): raise ValueError('access_policy_absolute_path_required')
    try: stat = path.stat()
    # WHY：明确指定的策略丢失是故障，不能静默撤销用户限额或使用旧缓存继续放行。
    except FileNotFoundError as error: raise ValueError('access_policy_file_unavailable') from error
    policy = load(str(path), stat.st_mtime_ns, stat.st_size).get(access_cooldown.key(url))
    if policy is None: return 'unconfigured'
    directory = access_cooldown.directory()
    if directory is None: raise ValueError('access_policy_state_required')
    Path(directory).mkdir(parents=True, exist_ok=True)
    rates = sorted(((rate.limit, rate.intervalMs) for rate in policy.rates), key=lambda rate: rate[1])
    decision = check(Path(directory) / 'quotas.sqlite', access_cooldown.key(url), rates)
    if decision['status'] == 'denied':
        access_cooldown.restrict_by_policy(url, decision['retryAfter'])
        raise RuntimeError('capture_rate_limited')
    return 'admitted'
