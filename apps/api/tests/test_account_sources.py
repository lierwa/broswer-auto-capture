"""Pinned original functions + real Playwright DOM; fixtures are compatibility proof, not real platform login proof."""
import asyncio, importlib.util, json, sys, unittest, os
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit
from patchright.async_api import async_playwright

ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT/'apps/api/python'))
from browser_use_runner.account_session import catalog, module_from
from browser_use_runner.account_sources import sau_check, mc_check, BorrowedContext
from browser_use_runner.account_http import ReadClient, xhs_methods, graphql_query
from browser_use_runner.account_borrow import AccountPage

def cors(platform):
    url = urlsplit(platform['url'])
    return {'Access-Control-Allow-Origin':f'{url.scheme}://{url.netloc}', 'Access-Control-Allow-Credentials':'true',
        'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'*'}

async def three_states(module, platform, borrowed, page, positive):
    key=platform['id']; results=[]
    negative={'douyin':'<button>手机号登录</button>', 'baijiahao':'<a>注册/登录百家号</a>',
      'alipay-life':'<iframe title="login"></iframe>', 'hupu':'<button>登录</button>', 'channels':'<div>扫码登录</div>',
      'tiktok':'<button>Log in</button>', 'youtube':'<button>Sign in</button>'}
    for scenario in ('unauthenticated','challenge','http503','timeout','changed'):
        status=401 if scenario=='unauthenticated' else 403 if scenario=='challenge' else 503 if scenario=='http503' else 200
        async def route(route):
            if 'host' in platform:
                if route.request.is_navigation_request():
                    await route.fulfill(status=200,content_type='text/html',body='<main>Owned</main>'); return
                if scenario=='timeout': await route.abort('timedout'); return
                await route.fulfill(status=status,content_type='application/json',
                    headers={**cors(platform), 'Access-Control-Allow-Headers':route.request.headers.get('access-control-request-headers', '*')},
                    body=json.dumps(positive if scenario=='http503' else {})); return
            if scenario=='timeout': await route.abort('timedout'); return
            if key=='tieba' and '/c/s/pc/sync' in route.request.url:
                await route.fulfill(status=200 if scenario=='unauthenticated' else status,content_type='application/json',
                  body=json.dumps({'data':{'user':{'is_login':0}}} if scenario=='unauthenticated' else {})); return
            await route.fulfill(status=200 if scenario=='unauthenticated' else status, content_type='text/html; charset=utf-8',
              body=negative.get(key,'<main>Fixture</main>') if scenario=='unauthenticated' else '<main>Changed or blocked</main>')
        await page.route('**/*',route)
        try:
            checked=await module.check(platform,borrowed)
        finally: await page.unroute('**/*')
        expected='unauthenticated' if scenario=='unauthenticated' else 'inconclusive'
        assert checked['status']==expected,(key,scenario,checked)
        assert checked['modelCalls']==0 and checked['sources'],(key,scenario,'original callable not executed')
        results.append({'scenario':scenario,'expected':expected,'actual':checked['status'],'sourceReceipts':checked['sources']})
    return results

class SourceCompatibility(unittest.IsolatedAsyncioTestCase):
    async def test_original_functions_and_three_states(self):
        data, evidence = catalog()
        module = module_from(evidence)
        cases = {
            'bilibili': {'code': 0, 'data': {'isLogin': True, 'mid': 12345, 'uname': 'Synthetic A'}},
            'weibo': {'data': {'login': True, 'uid': '12345', 'nick': 'Synthetic A'}},
            'zhihu': {'uid': '12345', 'name': 'Synthetic A'},
            'xiaohongshu': {'data': {'result': {'success': True}, 'user': {'user_id': '12345', 'guest': False}}},
            'kuaishou': {'data': {'visionProfileUserList': {'result': 1}}},
        }
        html = {'douyin':'<div class="progress-div"><input class="upload-btn-input-test" type="file"></div>',
            'baijiahao':'<button data-testid="publish-btn">发布</button>', 'alipay-life':'<a>发布视频推荐分辨率720p及以上，建议1080p</a>',
            'hupu':'<button>上传视频</button>', 'channels':'<button>发表视频</button>',
            'tiktok':'<input type="file" accept="video/mp4">', 'youtube':'<ytcp-app>Studio</ytcp-app>'}
        receipts = []
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
            try:
                page = await browser.new_page()
                page.set_default_timeout(3000)
                async def cookies(_urls): return [{'name': 'a1', 'value': 'synthetic', 'domain': '.xiaohongshu.com', 'path':'/'}]
                borrowed = SimpleNamespace(page=AccountPage(page), cookies=cookies)
                for platform in data['platforms']:
                    key = platform['id']
                    selected = os.environ.get('BAT_SOURCE_PLATFORM', '').split(',')
                    if selected != [''] and key not in selected: continue
                    observations = {'sources':[], 'errors':[], 'responses':[]}
                    source = platform['source']
                    if key in cases:
                        async def api_route(route):
                            await route.fulfill(status=200, content_type='text/html' if route.request.is_navigation_request() else 'application/json',
                                headers={**cors(platform), 'Access-Control-Allow-Headers':route.request.headers.get('access-control-request-headers', '*')},
                                body='<main>Owned</main>' if route.request.is_navigation_request() else json.dumps(cases[key]))
                        await page.route('**/*', api_route)
                        try:
                            await page.goto(platform['url'])
                            client = ReadClient(platform, borrowed, observations)
                            await client.initialize()
                            if key == 'xiaohongshu': xhs_methods(client)
                            if key == 'kuaishou': graphql_query(client)
                            await mc_check(source['file'], client, observations, BorrowedContext(borrowed, platform, observations))
                        finally: await page.unroute('**/*')
                        assert observations.get('upstreamBoolean') is True, key
                        checked = {'bilibili':module.bili,'weibo':module.weibo,'zhihu':module.zhihu,'xiaohongshu':module.xhs,'kuaishou':module.kuaishou}[key](platform, observations)
                    elif key == 'tieba':
                        async def route(route):
                            await route.fulfill(status=200, content_type='application/json' if '/c/s/pc/sync' in route.request.url else 'text/html',
                              body=json.dumps({'data':{'user':{'is_login':1,'id':'synthetic'}}}) if '/c/s/pc/sync' in route.request.url else '<main>Tieba</main>')
                        await page.route('**/*', route)
                        await mc_check(source['file'], SimpleNamespace(cookie_urls=platform['cookieUrls']), observations, BorrowedContext(borrowed, platform, observations))
                        checked = await module.tieba(platform, borrowed, observations)
                        await page.unroute('**/*')
                    else:
                        async def route(route):
                            body = html[key] + ('<script>history.replaceState(null,"","/channel/synthetic")</script>' if key=='youtube' else '')
                            await route.fulfill(status=200, content_type='text/html; charset=utf-8', body=body)
                        await page.route('**/*', route)
                        await sau_check(source['file'], borrowed, platform, observations)
                        checked = await module.browser_evidence(platform, borrowed, observations)
                        await page.unroute('**/*')
                    assert checked['status'] == 'authenticated', (key, checked, observations.get('errors'), page.url, observations.get('upstreamBoolean'))
                    assert observations['sources'], key
                    assert all(r['commit'] and r['startLine'] > 0 for r in observations['sources'])
                    matrix=await three_states(module,platform,borrowed,page,cases.get(key,{}))
                    receipts.append({'platform':key, 'sources':observations['sources'], 'result':checked['status'], 'states':matrix,'realPlatformAcceptance':False})
                # 上游TikTok except会返回true，真实导航异常仍必须未知。
                tiktok = next(p for p in data['platforms'] if p['id']=='tiktok')
                await page.route('**/*', lambda route: route.fulfill(status=200, content_type='text/html', body='<select><option>x</option></select>'))
                observations = {'sources':[], 'errors':[], 'responses':[]}
                await sau_check(tiktok['source']['file'], borrowed, tiktok, observations)
                assert observations['upstreamBoolean'] is True
                assert (await module.browser_evidence(tiktok, borrowed, observations))['status']=='inconclusive'
                await page.unroute('**/*')
                bili = data['platforms'][0]
                assert module.bili(bili, {'responses':[{'status':200,'body':{'code':-101,'data':{'isLogin':False}}}], 'errors':[]})['status']=='unauthenticated'
                assert module.bili(bili, {'responses':[], 'errors':['timeout']})['status']=='inconclusive'
                xhs = next(p for p in data['platforms'] if p['id']=='xiaohongshu')
                assert module.xhs(xhs, {'responses':[{'status':200,'body':{'data':{'result':{'success':True},'user':{'guest':True}}}}], 'errors':[]})['status']=='inconclusive'
            finally:
                await browser.close()
        output = Path(os.environ.get('BAT_ACCOUNT_PROOF_DIR', ROOT/'work/account-rebuild-20261003'))
        (output/'source-compatibility.json').write_text(json.dumps({'passed':True,'cases':receipts,'exceptionTrueRejected':True}, indent=2)+'\n')

if __name__=='__main__': unittest.main()
