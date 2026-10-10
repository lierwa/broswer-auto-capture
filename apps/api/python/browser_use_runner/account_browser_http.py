"""Bounded account reads through the already-owned browser's native Fetch API."""
import json
from urllib.parse import urlsplit

import httpx
from browser_use_runner.account_borrow import accepts
from browser_use_runner.access_cooldown import guard, remember


FETCH = """async ({url, method, headers, body, origin}) => {
  if (location.origin !== origin) throw Error('account_document_changed');
  const response = await fetch(url, {
    method, headers, body, credentials: 'include', redirect: 'error',
    signal: AbortSignal.timeout(15000), cache: 'no-store'
  });
  const reader = response.body?.getReader();
  const chunks = []; let size = 0;
  try {
    while (reader) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100000) throw Error('account_response_too_large');
      chunks.push(value);
    }
  } finally { await reader?.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return {status: response.status, body: new TextDecoder().decode(bytes), retryAfter: response.headers.get('retry-after')};
}"""


async def browser_request(borrowed, origins, method, url, **kwargs):
    """No fallback transport, new page, navigation, retry, or credential export."""
    current = borrowed.page.url
    if (method not in ('GET', 'POST') or not accepts(url, origins)
            or not accepts(current, origins) or urlsplit(url).username is not None):
        raise ValueError('account_http_scope_denied')
    params = kwargs.pop('params', None)
    if params:
        url = str(httpx.URL(url).copy_merge_params(params))
    guard(url)
    headers = httpx.Headers(kwargs.pop('headers', {}))
    # WHY：Cookie/UA/Origin/Client Hints由真实浏览器和Cookie jar生成；复制它们会破坏身份连续性。
    for name in list(headers):
        if name in ('cookie', 'user-agent', 'origin', 'referer', 'host', 'content-length', 'connection') or name.startswith('sec-'):
            del headers[name]
    body = None
    if 'json' in kwargs:
        body = json.dumps(kwargs.pop('json'), ensure_ascii=False, separators=(',', ':'))
        headers['content-type'] = 'application/json'
    if kwargs or method == 'GET' and body is not None:
        raise ValueError('account_http_options_unsupported')
    parsed = urlsplit(current)
    # WHY：沿浏览器CORS/CSP与重定向规则失败即返回不确定，不能静默降级为另一个网络栈。
    value = await borrowed.page.evaluate(FETCH, {'url': url, 'method': method,
        'headers': dict(headers), 'body': body, 'origin': f'{parsed.scheme}://{parsed.netloc}'})
    if (not isinstance(value, dict) or not isinstance(value.get('status'), int)
            or not isinstance(value.get('body'), str)):
        raise ValueError('account_http_response_invalid')
    if not getattr(borrowed, 'response_admission', False):
        remember(url, value['status'], {'retry-after': value.get('retryAfter')})
    return httpx.Response(value['status'], text=value['body'], request=httpx.Request(method, url))
