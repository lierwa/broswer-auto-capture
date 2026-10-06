"""Bind one live DOM region to browser-use and Chrome's existing content APIs."""
import base64
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit, unquote_to_bytes
from urllib.request import DataHandler, Request

from browser_use.dom.markdown_extractor import convert_html_to_markdown
from .observation_scope import live_document_sample
from .content_css import background_urls
from .rendered_field_text import FieldReadError

CONTENT_SCHEMA = {'type': 'object', 'properties': {'content': {'type': 'string'}},
                  'required': ['content'], 'additionalProperties': False}
CONTENT_LIMIT = 64 * 1024 * 1024
SAFE_CONTENT_FAILURE_CODES = frozenset({'content_page_missing', 'content_page_identity_changed',
    'content_scope_requires_supported_observation', 'content_byte_limit', 'content_image_not_loaded',
    'content_image_resource_missing', 'content_image_resource_type_invalid', 'content_capture_store_required',
    'content_page_identity_unavailable', 'content_css_resource_unproven',
    'content_region_resolution_failed', 'content_region_limit', 'content_region_specification_invalid'})
REGION_CONTENT = r'''() => { const painted=e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&
    Array.from(e.getClientRects()).some(r=>r.width>0&&r.height>0); return JSON.stringify({html:this.outerHTML,
  textPreview:(this.innerText||'').slice(0,1500).replace(/[\uD800-\uDBFF]$/,''),
  images:Array.from(this.querySelectorAll('img')).concat(this.matches('img')?[this]:[]).map(i=>({
    url:i.currentSrc||i.src, loaded:i.complete&&i.naturalWidth>0})),
  unsupported:Array.from(this.querySelectorAll('iframe,canvas')).concat(this.matches('iframe,canvas')?[this]:[])
    .filter(painted).length,
  shadows:[this,...this.querySelectorAll('*')].filter(e=>e.shadowRoot&&painted(e)).length,
  backgrounds:[this,...this.querySelectorAll('*')].flatMap((e,ordinal)=>painted(e)?[null,'::before','::after'].flatMap(pseudo=>{
    const style=getComputedStyle(e,pseudo); const shown=!pseudo||(style.content!=='none'&&
      style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)>0);
    return style.backgroundImage!=='none'&&shown?
      [{ordinal,pseudo,image:style.backgroundImage}]:[];}):[])}); }'''


def content_schema(schema):
    return schema == CONTENT_SCHEMA


def content_result(result_spec):
    return (getattr(result_spec, 'mode', None) == 'data'
            and any(field.producerRef == 'page-content' for field in result_spec.fields))


async def capture_region(browser, element, *, readiness=False):
    # WHY：直接查询当前元素，不能把 DomWatchdog 的非空历史树当作展开/加载后的内容。
    before = await live_document_sample(browser)
    if not before['stable'] or not before['documentDigest']:
        raise ValueError('content_page_identity_unavailable')
    page = await browser.get_current_page()
    if page is None:
        raise ValueError('content_page_missing')
    info, url = await page.get_target_info(), await page.get_url()
    region = json.loads(await element.evaluate(REGION_CONTENT))
    if region['unsupported'] or region['shadows']:
        # TRADE-OFF：不把未取得的 iframe/canvas/shadow 内容伪报为完整；保留原生探索选择其它范围。
        raise ValueError('content_scope_requires_supported_observation')
    html = region['html']
    if len(html.encode()) > CONTENT_LIMIT:
        raise ValueError('content_byte_limit')
    if any(not image['url'] or not image['loaded'] for image in region['images']):
        raise ValueError('content_image_not_loaded')
    css_urls = background_urls(region['backgrounds'])
    if css_urls:
        region['images'].extend({'url': value, 'loaded': True} for value in css_urls)
    if readiness:
        # WHY：就绪轮询不反复取得/传输原图；只证明当前范围与图片已加载，产物由读取节点取得。
        await assert_content_document(browser, before)
        return json.dumps({'html': html, 'images': region['images']}, ensure_ascii=False, separators=(',', ':'))
    cdp = await browser.get_or_create_cdp_session(target_id=info['targetId'], focus=False)
    await cdp.cdp_client.send.Page.enable(session_id=cdp.session_id)
    tree = await cdp.cdp_client.send.Page.getResourceTree(session_id=cdp.session_id)
    resources = resource_index(tree['frameTree'])
    images, consumed = [], len(html.encode())
    for image in {item['url']: item for item in region['images']}.values():
        if not image['url'] or not image['loaded']:
            raise ValueError('content_image_not_loaded')
        raw, media_type = await image_content(cdp, resources, image['url'])
        consumed += len(raw)
        if consumed > CONTENT_LIMIT:
            raise ValueError('content_byte_limit')
        images.append({'url': image['url'], 'mediaType': media_type,
                       'encoding': 'base64', 'body': base64.b64encode(raw).decode()})
    markdown, _, _ = convert_html_to_markdown(html, extract_images=True)
    if browser.agent_focus_target_id != info['targetId'] or await page.get_url() != url:
        raise ValueError('content_page_identity_changed')
    await assert_content_document(browser, before)
    body = {'format': 'bat-page-content/v1', 'url': url, 'html': html,
                       'markdown': markdown, 'textPreview': region['textPreview'],
                       'images': images, 'backgrounds': region['backgrounds'],
                       'coverage': {'scope': 'selected_live_region', 'imageCount': len(images),
                                    'complete': True}}
    return content_receipt(browser, body)


async def image_content(cdp, resources, url):
    scheme = urlsplit(url).scheme.lower()
    if scheme == 'data':
        if len(url.encode()) > CONTENT_LIMIT * 2:
            raise ValueError('content_byte_limit')
        # WHY：内嵌图的原始字节已在URI内；直接复用标准库RFC2397处理器，不创建网络下载器。
        # WHY：HTML 允许省略末尾 Base64 填充，Chrome 已加载的合法原图不能被 RFC2397 处理器拒绝。
        # 只补标准解码所需填充；URI/MIME/百分号解码仍复用标准库，来源保留原 URL。
        header, separator, encoded = url.partition(',')
        request_url = url
        if separator and header.endswith(';base64'):
            size = len(unquote_to_bytes(encoded).translate(None, b' \t\n\r\f'))
            request_url += '=' * (-size % 4)
        with DataHandler().data_open(Request(request_url)) as response:
            raw, media_type = response.read(CONTENT_LIMIT + 1), response.headers.get_content_type()
    else:
        resource = resources.get(url)
        if resource is None:
            category = scheme if scheme in ('http', 'https', 'blob') else 'other'
            raise FieldReadError('content_image_resource_missing', reason='image_scheme_' + category)
        frame_id, media_type = resource
        if not media_type.startswith('image/'):
            raise ValueError('content_image_resource_type_invalid')
        payload = await cdp.cdp_client.send.Page.getResourceContent(
            params={'frameId': frame_id, 'url': url}, session_id=cdp.session_id)
        raw = base64.b64decode(payload['content'], validate=True) if payload['base64Encoded'] else payload['content'].encode()
    if not media_type.startswith('image/'):
        raise ValueError('content_image_resource_type_invalid')
    if len(raw) > CONTENT_LIMIT:
        raise ValueError('content_byte_limit')
    return raw, media_type


async def assert_content_document(browser, before):
    after = await live_document_sample(browser)
    if not after['stable'] or any(before[key] != after[key] for key in ('url', 'targetId', 'documentDigest')):
        raise ValueError('content_page_identity_changed')


def content_receipt(browser, body):
    payload = json.dumps(body, ensure_ascii=False, separators=(',', ':'))
    raw = payload.encode()
    if len(raw) > CONTENT_LIMIT:
        raise ValueError('content_byte_limit')
    owned = getattr(browser, '_bat_content_store', None)
    if owned is None:
        if len(raw) > 128 * 1024:
            raise ValueError('content_capture_store_required')
        return payload
    root, owner = owned
    owner = str(owner)
    digest = hashlib.sha256(raw).hexdigest()
    directory = Path(root) / 'content-receipts' / owner
    directory.mkdir(parents=True, exist_ok=True)
    # WHY：这是有界 IPC 的产物传输，不是另一套存储；宿主核验本次 owner/摘要后落入既有 Artifact。
    (directory / (digest + '.json')).write_bytes(raw)
    return json.dumps({'format': 'bat-page-content-ref/v1', 'url': body['url'], 'ownerId': owner,
                      'digest': digest, 'byteLength': len(raw), 'coverage': body['coverage'],
                      'textPreview': body.get('textPreview', body['markdown'][:1500])}, ensure_ascii=False, separators=(',', ':'))


def resource_index(root):
    # WHY：只读浏览器已加载资源；不复制 cookie、不建立第二个浏览器或自写 HTTP 下载器。
    frames, output = [root], {}
    while frames:
        frame = frames.pop()
        for item in frame.get('resources', []):
            output[item['url']] = (frame['frame']['id'], item['mimeType'])
        frames.extend(frame.get('childFrames', []))
    return output


def content_summary(output):
    content = json.loads(output['content'])
    # WHY：原文与原图只进入受管证据/产物；模型记忆不重复承载整页及 base64 图片。
    return {'url': content['url'], 'format': content['format'], 'coverage': content['coverage'],
            'textPreview': content.get('textPreview', content.get('markdown', '')[:1500])}
