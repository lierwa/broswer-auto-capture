"""Real field-reader/schema and readiness integration; controlled DOM, no model or browser."""
import asyncio
import json
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.postconditions import capture_check_baselines, check_fact, declared_checks
from workflow_use.hybrid.read import ReadSpec, read_fields
from workflow_use.hybrid.rendered_field_text import FieldReadError


async def main():
    value = json.load(sys.stdin)
    specification = ReadSpec.model_validate(value['read']['specification'])
    paths = value['read']['requiredPaths']
    checks = declared_checks(value['producer']['postconditions'], {}, None)
    browser = object()
    rows = []
    resolver = SimpleNamespace(assert_scope=AsyncMock(return_value='tab'),
                               resolve_collection=AsyncMock(side_effect=lambda *_a, **_k: rows))
    async def project(_browser, _spec, elements):
        return elements
    with patch('workflow_use.hybrid.postconditions.read_check_value',
               new=AsyncMock(side_effect=ValueError('target_scope_mismatch'))):
        await capture_check_baselines(browser, checks)
    with patch('workflow_use.hybrid.read.TargetResolver', return_value=resolver), \
            patch('workflow_use.hybrid.read.project_field_records', new=project):
        for incomplete in ([], [{'text': 'Next'}]):
            rows = incomplete
            try:
                await read_fields(browser, specification, required_paths=paths)
                raise AssertionError('incomplete_read_was_accepted')
            except FieldReadError:
                pass
            for _ in range(2):
                assert not (await check_fact(checks[0].parameters, browser))[0]
        rows = [{'text': 'Next', 'href': 'https://example.test/list?page=2'}]
        assert not (await check_fact(checks[0].parameters, browser))[0]
        assert (await check_fact(checks[0].parameters, browser))[0]
        assert await read_fields(browser, specification, required_paths=paths) == rows
        # 只绑定第一项 href；后续项没有 href 不能使这个消费路径失败。
        rows = [rows[0], {'text': 'Other'}]
        assert await read_fields(browser, specification, required_paths=paths) == rows
        assert not (await check_fact(checks[0].parameters, browser))[0]
        assert (await check_fact(checks[0].parameters, browser))[0]
    print('ready_only_with_required_path')


asyncio.run(main())
