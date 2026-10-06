"""Content-region CDP cleanup must retain the original failure and cancellation."""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from workflow_use.hybrid.content_region import resolve_read_regions


class ContentRegionTests(unittest.IsolatedAsyncioTestCase):
    async def test_remote_object_cleanup_preserves_primary_result(self):
        # 不变量：带对象的JS异常也释放；失效context释放不覆盖身份错误；取消继续传播。
        for failure in ('evaluation', 'identity', 'cancelled', 'success'):
            with self.subTest(failure=failure):
                result = {'result': {'objectId': 'owned-object'}}
                if failure == 'evaluation':
                    result['exceptionDetails'] = {'text': 'failed'}
                runtime = SimpleNamespace(evaluate=AsyncMock(return_value=result),
                    releaseObject=AsyncMock(side_effect=asyncio.CancelledError() if failure == 'cancelled' else RuntimeError('context closed')))
                dom = SimpleNamespace(describeNode=AsyncMock(return_value={'node': {'backendNodeId': 7}}))
                session = SimpleNamespace(session_id='owned-session', cdp_client=SimpleNamespace(send=SimpleNamespace(Runtime=runtime, DOM=dom)))
                element = object()
                page = SimpleNamespace(get_target_info=AsyncMock(return_value={'targetId': 'owned-target'}),
                    get_element=AsyncMock(return_value=element))
                browser = SimpleNamespace(get_or_create_cdp_session=AsyncMock(return_value=session))
                resolver = SimpleNamespace(resolve_collection=AsyncMock(return_value=[object(), object()]))
                spec = SimpleNamespace(contentRegion='common-ancestor', container='.related')
                identity_error = ValueError('content_page_identity_changed') if failure == 'identity' else None
                with patch('workflow_use.hybrid.content_region.live_document_sample', AsyncMock(return_value={'targetId': 'owned-target'})), \
                     patch('workflow_use.hybrid.content_region.assert_content_document', AsyncMock(side_effect=identity_error)):
                    if failure == 'success':
                        self.assertEqual(await resolve_read_regions(browser, spec, resolver, page=page), [element])
                    else:
                        expected = asyncio.CancelledError if failure == 'cancelled' else ValueError
                        with self.assertRaises(expected) as raised:
                            await resolve_read_regions(browser, spec, resolver, page=page)
                        if failure == 'identity':
                            self.assertIs(raised.exception, identity_error)
                        elif failure == 'evaluation':
                            self.assertEqual(str(raised.exception), 'content_region_resolution_failed')
                runtime.releaseObject.assert_awaited_once()
