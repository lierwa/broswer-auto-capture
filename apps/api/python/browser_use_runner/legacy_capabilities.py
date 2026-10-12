"""Published v1 IR projection onto the existing managed browser, with no agent loop."""
import hashlib
import json
from urllib.parse import urldefrag

from browser_use_runner.site_scope import allowed_url


# WHY：只读页面结构沿旧公开合同投影；没有用户脚本、存储读取或第二个页面解析器。
PAGE = """() => ({url:location.href,title:document.title.slice(0,300),
text:(document.body?.innerText||'').slice(0,150000),truncated:(document.body?.innerText||'').length>150000,
links:Array.from(document.querySelectorAll('a[href]')).filter(a=>a.getClientRects().length&&(a.innerText||'').trim()).slice(0,150).map(a=>({url:a.href,title:(a.innerText||'').trim().slice(0,300)})),
headings:Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(e=>e.getClientRects().length&&(e.innerText||'').trim()).slice(0,100).map(e=>({level:Number(e.tagName.slice(1)),text:(e.innerText||'').trim().slice(0,1000)})),
paragraphs:Array.from(document.querySelectorAll('p')).filter(e=>e.getClientRects().length&&(e.innerText||'').trim()).slice(0,300).map(e=>(e.innerText||'').trim().slice(0,5000))})"""


def tab_number(target_id):
    # WHY：旧 IR 使用整数 tabId；公开投影绑定实际目标，不使用列表位置或临时编号。
    return int(hashlib.sha256(str(target_id).encode()).hexdigest()[:13], 16)


def decoded(value):
    return json.loads(value) if isinstance(value, str) else value


async def owned_tabs(runtime):
    tabs = await runtime.browser.get_tabs()
    scope = getattr(runtime.managed_window, 'scope', None)
    result = [tab for tab in tabs if (scope is None or tab.target_id in scope.owned)
              and (tab.url == 'about:blank' or allowed_url(tab.url, runtime.allowed_sites))]
    numbers = [tab_number(tab.target_id) for tab in result]
    if len(set(numbers)) != len(numbers):
        raise ValueError('hybrid_legacy_invalid_response')
    return result


async def execute_legacy(runtime, command):
    if runtime.browser is None:
        raise ValueError('hybrid_session_not_started')
    kind = command.get('type')
    if kind not in ('navigate', 'click', 'hover', 'fill', 'press', 'select', 'tabs',
                    'tab_open', 'tab_select', 'tab_close', 'page', 'read', 'observe', 'upload', 'download'):
        raise ValueError('hybrid_legacy_capability_unsupported')
    if runtime.connection is not None:
        runtime.connection.scope.ensure_connection()
    if kind not in ('navigate', 'tab_open', 'tabs'):
        await runtime.assert_page_scope()
        runtime.assert_document_access(await (await runtime.browser.get_current_page()).get_url())
    runtime.commands += 1
    output = await dispatch(runtime, command)
    browser = await runtime.observe()
    if browser['url'] != 'about:blank':
        await runtime.assert_page_scope()
        runtime.assert_document_access(browser['url'])
    page = await runtime.browser.get_current_page()
    # WHY：人工恢复条件可能读取 text；真实读取与同一目标摘要绑定，不能复用上一步文本。
    text = await page.evaluate("() => (document.body?.innerText||'').slice(0,150001)")
    if runtime.browser.agent_focus_target_id != browser['tabId'] or await page.get_url() != browser['url']:
        raise ValueError('hybrid_legacy_invalid_response')
    return {'output': output, 'browser': browser, 'tabId': tab_number(browser['tabId']),
            'text': text[:150000], 'truncated': len(text) > 150000}


async def dispatch(runtime, command):
    kind = command['type']
    if kind in ('navigate', 'tab_open', 'tabs', 'tab_select', 'tab_close'):
        return await tab_action(runtime, command)
    page = await runtime.browser.get_current_page()
    if kind == 'observe':
        return None
    if kind == 'page':
        return decoded(await page.evaluate(PAGE))
    if kind == 'read':
        html = await page.evaluate("() => document.documentElement.outerHTML.slice(0,4000001)")
        return {'html': html[:4000000], 'truncated': len(html) > 4000000}
    if kind in ('upload', 'download'):
        from browser_use_runner.legacy_files import file_action
        return await file_action(runtime, command)
    target = await native_target(runtime, command.get('target'))
    if kind in ('click', 'fill') and command.get('dispatch') != 'dom':
        action = 'input' if kind == 'fill' else 'click'
        args = {'text': command['value'], 'clear': True} if kind == 'fill' else {}
        await runtime.capability.execute_checked(action, args, target, [])
        return None
    element = (await runtime.capability.resolve_target(target, action_name='click')).element if target else None
    if kind == 'click':
        # WHY：旧显式DOM激活包含form.requestSubmit语义；只在唯一原生目标上执行固定动作。
        await element.evaluate("""() => {const f=this instanceof HTMLFormElement?this:this.closest('form');
          if(f){const s=this instanceof HTMLButtonElement||(this instanceof HTMLInputElement&&['submit','image'].includes(this.type))?this:undefined;
          if(typeof f.requestSubmit==='function') s?f.requestSubmit(s):f.requestSubmit();else f.submit();}
          else this.click();} """)
    elif kind == 'hover':
        await element.hover()
    elif kind == 'press':
        if element is not None:
            await element.focus()
        await page.press(command['key'])
    elif kind == 'select':
        await element.select_option(command['values'])
    return None


async def native_target(runtime, target):
    if target is None:
        return None
    if 'selector' in target:
        return {'strategy': 'css', 'value': target['selector']}
    # WHY：语义匹配复用现有 resolver；只适配旧 occurrence/fallbackName 合同。
    return {'strategy': 'title', 'role': target['role'], 'name': target['name'],
            **{key: target[key] for key in ('occurrence', 'fallbackName') if key in target}}


async def tab_action(runtime, command):
    from browser_use.browser.events import SwitchTabEvent, CloseTabEvent
    kind = command['type']
    tabs = await owned_tabs(runtime)
    if kind == 'tabs':
        return [{'tabId': tab_number(tab.target_id), 'url': tab.url,
                 'active': tab.target_id == runtime.browser.agent_focus_target_id} for tab in tabs]
    if kind in ('tab_select', 'tab_close'):
        selected = next((tab for tab in tabs if tab_number(tab.target_id) == command['tabId']), None)
        if selected is None:
            raise ValueError('hybrid_legacy_permission_denied')
        event_type = SwitchTabEvent if kind == 'tab_select' else CloseTabEvent
        event = runtime.browser.event_bus.dispatch(event_type(target_id=selected.target_id))
        await event
        await event.event_result(raise_if_any=True, raise_if_none=False)
        return None
    url = command['url']
    if not allowed_url(url, runtime.allowed_sites):
        raise ValueError('hybrid_legacy_origin_denied')
    if kind == 'navigate' and command.get('reuseOpenTab'):
        selected = next((tab for tab in tabs if urldefrag(tab.url)[0] == urldefrag(url)[0]), None)
        if selected is not None:
            await runtime.capability.execute_checked('switch', {'tab_id': str(selected.target_id)}, None, [])
            return None
    if kind == 'tab_open':
        # WHY：new_tab导航会复用空白页；旧tab_open明确创建新页且background不得抢焦点。
        # 复用原生创建回执和TaskPage导航等待，归属仍由同一个TargetScope登记。
        target_id = await runtime.browser._cdp_create_new_page('about:blank', background=command.get('background', False))
        page = await runtime.browser._managed_page(target_id)
        await page.goto(url)
        actual = await page.get_url()
        if not allowed_url(actual, runtime.allowed_sites):
            raise ValueError('hybrid_legacy_origin_denied')
        runtime.assert_document_access(actual)
        if not command.get('background', False):
            event = runtime.browser.event_bus.dispatch(SwitchTabEvent(target_id=target_id))
            await event
            await event.event_result(raise_if_any=True, raise_if_none=False)
        return {'tabId': tab_number(target_id), 'url': actual, 'active': not command.get('background', False)}
    await runtime.execute({'name': 'browser.workflow-step', 'version': 2, 'actionName': 'navigate',
                           'args': {'url': url, 'new_tab': False}, 'target': None, 'postconditions': []})
    return None
