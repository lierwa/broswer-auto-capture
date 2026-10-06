"""HTTPX public transport adapter for the original MC client check methods."""
import json, random, types, zipfile
from types import SimpleNamespace

import httpx
from browser_use_runner.account_sources import SOURCE, upstream_function, source_tree


class ReadClient:
    def __init__(self, platform, borrowed, observations):
        self.platform, self.borrowed, self.observations = platform, borrowed, observations
        self._host = platform['host']
        self.cookie_urls = platform['cookieUrls']
        self.headers = {'User-Agent': 'Mozilla/5.0', 'Referer': platform['url']}
        self.playwright_page = borrowed.page
        self.graphql = {}
        self.proxy = None

    async def initialize(self):
        self.headers['User-Agent'] = await self.borrowed.page.evaluate('() => navigator.userAgent')
        cookies = await self.borrowed.cookies(self.cookie_urls)
        self.headers['Cookie'] = '; '.join(f"{c['name']}={c['value']}" for c in cookies)
        self.cookie_dict = {c['name']: c['value'] for c in cookies}

    async def request(self, method, url, **kwargs):
        if method not in ('GET', 'POST') or not any(url.startswith(origin + '/') for origin in self.platform['origins']):
            raise ValueError('account_http_scope_denied')
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
                response = await client.request(method, url, headers=kwargs.pop('headers', self.headers), **kwargs)
                return self.observe(response)
        except Exception:
            self.observations['errors'].append('request_error')
            raise

    def observe(self, response):
        if len(response.content) > 100000:
            raise ValueError('account_response_too_large')
        payload = response.json()
        self.observations['responses'].append({'status': response.status_code, 'body': payload})
        # WHY：原MC pong消费原客户端已解包的data；未登录码不被吞为成功。
        return payload.get(self.platform.get('envelope'), payload) if self.platform.get('envelope') else payload

    async def get(self, uri, params=None, **_kwargs):
        return await self.request('GET', self._host + uri, params=params)

    async def post(self, uri, data, **_kwargs):
        return await self.request('POST', self._host + uri, json=data)

    async def get_current_user_info(self):
        function, receipt = upstream_function('mediacrawler', self.platform['source']['file'], 'get_current_user_info')
        self.observations['sources'].append(receipt)
        return await function(self)


class RecordingClient:
    def __init__(self, owner):
        self.owner = owner
        self.client = httpx.AsyncClient(timeout=15, follow_redirects=False)

    async def __aenter__(self):
        await self.client.__aenter__()
        return self

    async def __aexit__(self, *args):
        return await self.client.__aexit__(*args)

    async def get(self, url, **kwargs):
        try:
            response = await self.client.get(url, **kwargs)
            self.owner.observe(response)
            return response
        except Exception:
            self.owner.observations['errors'].append('request_error')
            raise


def xhs_methods(client):
    trace, receipt = upstream_function('mediacrawler', 'media_platform/xhs/xhs_sign.py', 'get_trace_id', {'random': random})
    client.observations['sources'].append(receipt)
    sign, receipt = upstream_function('mediacrawler', 'media_platform/xhs/playwright_sign.py',
                                     'sign_with_xhshow', {'get_trace_id': trace})
    client.observations['sources'].append(receipt)
    headers, receipt = upstream_function('mediacrawler', 'media_platform/xhs/client.py',
                                         '_pre_headers', {'sign_with_xhshow': sign})
    client.observations['sources'].append(receipt)
    client._pre_headers = types.MethodType(headers, client)
    query, receipt = upstream_function('mediacrawler', 'media_platform/xhs/client.py',
                                      'query_self', {'make_async_client': lambda **_kw: RecordingClient(client)})
    client.observations['sources'].append(receipt)
    client.query_self = types.MethodType(query, client)


def graphql_query(client):
    source_tree('mediacrawler', 'media_platform/kuaishou/graphql.py')
    # 原pong使用dict.get；直接提供原GraphQL文件，保留原查询而非重写查询。
    with zipfile.ZipFile(SOURCE / 'mediacrawler.zip') as archive:
        client.graphql = {'vision_profile_user_list': archive.read(
            'media_platform/kuaishou/graphql/vision_profile_user_list.graphql').decode('utf-8')}
