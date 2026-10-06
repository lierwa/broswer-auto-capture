"""Version 20261003.1: site evidence adapters, outside the common browser runtime.

Original cookie_auth/pong bodies are executed by account_sources; this module
only projects their actual response/page observations into the BAT result.
"""
import asyncio, hashlib, types
from types import SimpleNamespace

from browser_use_runner.account_borrow import CheckPage, accepts
from browser_use_runner.account_http import ReadClient, graphql_query, xhs_methods
from browser_use_runner.account_sources import BorrowedContext, mc_check, sau_check, upstream_function


def result(status, reason, identity=None, name=None, evidence=None):
    return {'status': status, 'reason': reason, 'identityKey': identity,
            'displayIdentity': str(name)[:120] if name else None,
            'identityConfirmed': bool(identity), 'evidence': evidence or []}


def account(platform, identity, name=None, evidence=None):
    key = hashlib.sha256(f"{platform['id']}:{identity}".encode()).hexdigest() if identity else None
    return result('authenticated', 'platform_confirmed', key, name, evidence)


def response(observations):
    item = observations['responses'][-1] if observations['responses'] else None
    if item is None:
        return None, None
    return item['status'], item['body']


def common_failure(observations):
    status, body = response(observations)
    if status in (403, 429):
        return result('inconclusive', 'challenge')
    if observations['errors']:
        return result('inconclusive', 'network_error')
    if status == 401:
        return result('unauthenticated', 'login_required', evidence=['http_unauthorized'])
    if status is not None and not 200 <= status < 300:
        return result('inconclusive', 'http_error')
    return None


def bili(platform, observations):
    failure = common_failure(observations)
    if failure:
        return failure
    _status, body = response(observations)
    if not isinstance(body, dict):
        return result('inconclusive', 'response_changed')
    data = body.get('data') or {}
    if body.get('code') == -101 or data.get('isLogin') is False:
        return result('unauthenticated', 'login_required', evidence=['nav.isLogin=false'])
    if data.get('isLogin') is True:
        return account(platform, data.get('mid'), data.get('uname'), ['nav.isLogin=true'])
    return result('inconclusive', 'response_changed')


def weibo(platform, observations):
    failure = common_failure(observations)
    if failure:
        return failure
    _status, body = response(observations)
    data = body.get('data', {}) if isinstance(body, dict) else {}
    if data.get('login') is False:
        return result('unauthenticated', 'login_required', evidence=['config.login=false'])
    if data.get('login') is True:
        user = data.get('user', {})
        return account(platform, data.get('uid') or user.get('id'),
                       data.get('nick') or user.get('screen_name'), ['config.login=true'])
    return result('inconclusive', 'response_changed')


def zhihu(platform, observations):
    failure = common_failure(observations)
    if failure:
        return failure
    _status, body = response(observations)
    if isinstance(body, dict) and body.get('uid') and body.get('name'):
        return account(platform, body['uid'], body['name'], ['me.uid/name'])
    return result('inconclusive', 'response_changed')


def xhs(platform, observations):
    failure = common_failure(observations)
    if failure:
        return failure
    _status, body = response(observations)
    data = body.get('data', {}) if isinstance(body, dict) else {}
    if data.get('result', {}).get('success') is True:
        # WHY：仅复用固定原pong明确的登录信号；来源没有UID/游客字段合同，不虚构稳定账号识别。
        if (data.get('user') or data).get('guest') is True:
            return result('inconclusive', 'guest_observed')
        return account(platform, None, evidence=['upstream.selfinfo.result.success=true'])
    if isinstance(body, dict) and body.get('code') in (-100, 401):
        return result('unauthenticated', 'login_required', evidence=['selfinfo.unauthorized'])
    return result('inconclusive', 'response_changed')


def kuaishou(platform, observations):
    failure = common_failure(observations)
    if failure:
        return failure
    _status, body = response(observations)
    data = body.get('data', {}) if isinstance(body, dict) else {}
    if data.get('visionProfileUserList', {}).get('result') == 1:
        return account(platform, None, evidence=['visionProfileUserList.result=1'])
    return result('inconclusive', 'response_changed')


async def visible(page, selector=None, text=None, role=None):
    target = (page.locator(selector) if selector else page.get_by_text(text, exact=True) if text
              else page.get_by_role(role[0], name=role[1], exact=True))
    return await target.count() > 0 and await target.first.is_visible()


async def browser_evidence(platform, borrowed, observations):
    page, key = CheckPage(borrowed, platform['origins'], observations), platform['id']
    if key == 'baijiahao' and not observations['errors']:
        # 上游发布控件属于视频编辑页，不能把后台首页没有登录提示当作正证据。
        await CheckPage(borrowed, platform['origins'], observations).goto('https://baijiahao.baidu.com/builder/rc/edit?type=videoV2')
    if observations['errors']:
        return result('inconclusive', 'network_error')
    if any(marker in page.url.lower() for marker in ('/login', '/signin', 'passport.', 'auth.alipay.com', 'accounts.google.com')):
        return result('unauthenticated', 'login_required', evidence=['login_redirect'])
    negatives = {'douyin': ['手机号登录', '扫码登录'], 'baijiahao': ['注册/登录百家号'],
                 'channels': ['扫码登录'], 'hupu': ['登录'], 'tiktok': ['Log in'], 'youtube': ['Sign in']}
    for text in negatives.get(key, []):
        if await visible(page, text=text):
            return result('unauthenticated', 'login_required', evidence=['visible_login_prompt'])
    if key == 'alipay-life' and await visible(page, selector='iframe[title="login"]'):
        return result('unauthenticated', 'login_required', evidence=['visible_login_frame'])
    if observations.get('redirectOutsideScope'):
        return result('inconclusive', 'page_changed')
    if not accepts(page.url, platform['origins']):
        return result('inconclusive', 'page_changed')
    selectors = {
        'douyin': 'div.progress-div [class^="upload-btn-input"]',
        'baijiahao': '[data-testid="publish-btn"]',
        'alipay-life': 'a:has-text("发布视频推荐分辨率720p及以上，建议1080p")',
        'tiktok': 'input[type="file"][accept*="video"]',
        'youtube': 'ytcp-app',
    }
    if key == 'hupu' and await visible(page, role=('button', '上传视频')):
        return account(platform, None, evidence=['upstream.upload_button'])
    if key == 'channels' and (await visible(page, text='发表视频') or await visible(page, text='保存草稿')):
        return account(platform, None, evidence=['upstream.creator_controls'])
    if key in selectors:
        # file input通常hidden：检查源发布流程需要的真实元素和授权后的准确URL，不做上传。
        element = page.locator(selectors[key])
        present = await element.count() > 0 if key in ('douyin', 'tiktok') else await visible(page, selector=selectors[key])
        if present and (key != 'youtube' or '/channel/' in page.url):
            return account(platform, None, evidence=['upstream.authenticated_creator_control'])
    return result('inconclusive', 'positive_evidence_missing')


async def tieba(platform, borrowed, observations):
    if observations.get('observe') and not accepts(borrowed.page.url, platform['origins']):
        return result('inconclusive', 'page_changed')
    # WHY：原签名读取只调用固定上游 evaluate；goto 经只读外观禁止，不向观察暴露可编辑 Page。
    page = SimpleNamespace(url=borrowed.page.url, goto=CheckPage(borrowed, platform['origins'], observations).goto,
                           evaluate=borrowed.page.evaluate)
    client = SimpleNamespace(_host='https://tieba.baidu.com', playwright_page=page)
    for name in ('_ensure_tieba_origin', '_fetch_json_by_browser'):
        function, receipt = upstream_function('mediacrawler', platform['source']['file'], name)
        observations['sources'].append(receipt)
        setattr(client, name, types.MethodType(function, client))
    sign, receipt = upstream_function('mediacrawler', platform['source']['file'], '_sign_pc_params', {'hashlib': hashlib})
    observations['sources'].append(receipt)
    client._sign_pc_params = sign
    data = await client._fetch_json_by_browser('/c/s/pc/sync', params={'subapp_type':'pc', '_client_type':'20'}, use_sign=True)
    user = data.get('data', {}).get('user', {})
    if user.get('is_login') == 0:
        return result('unauthenticated', 'login_required', evidence=['pc.sync.user.is_login=0'])
    if user.get('is_login') == 1:
        return account(platform, user.get('user_id') or user.get('id'), user.get('name'), ['pc.sync.user.is_login=1'])
    return result('inconclusive', 'response_changed')


async def _check(platform, borrowed, observations):
    source = platform['source']
    if source['package'] == 'social-auto-upload':
        try:
            await sau_check(source['file'], borrowed, platform, observations)
        except Exception:
            observations['errors'].append('source_call_failed')
        checked = await browser_evidence(platform, borrowed, observations)
    else:
        client = ReadClient(platform, borrowed, observations) if 'host' in platform else SimpleNamespace(
            cookie_urls=platform['cookieUrls'], playwright_page=borrowed.page)
        if 'host' in platform:
            await client.initialize()
        if platform['id'] == 'xiaohongshu':
            xhs_methods(client)
        if platform['id'] == 'kuaishou':
            graphql_query(client)
        context = BorrowedContext(borrowed, platform, observations)
        await mc_check(source['file'], client, observations, context)
        project = {'bilibili': bili, 'weibo': weibo, 'zhihu': zhihu, 'xiaohongshu': xhs, 'kuaishou': kuaishou}
        checked = (project[platform['id']](platform, observations) if platform['id'] in project else
                   await tieba(platform, borrowed, observations))
    if observations.get('navigationSuppressed'):
        checked['evidence'].append('navigation_suppressed')
    return {**checked, 'sources': observations['sources'], 'modelCalls': 0,
            'globalInitSuppressed': observations.get('globalInitSuppressed', False)}


async def check(platform, borrowed, observe=False):
    observations = {'sources': [], 'errors': [], 'responses': [], 'observe': observe}
    try:
        return await _check(platform, borrowed, observations)
    except Exception:
        return {**result('inconclusive', 'network_or_response_error'), 'sources': observations['sources'],
                'modelCalls': 0, 'globalInitSuppressed': observations.get('globalInitSuppressed', False)}
