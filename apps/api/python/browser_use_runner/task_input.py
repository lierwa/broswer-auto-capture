"""Small native-clear adapter for the pinned browser-use actor; keep its input engine."""
from types import MethodType
import asyncio
import os
import random

from browser_use.actor.element import Element
from browser_use.actor.page import Page
from browser_use.browser.events import TypeTextEvent
from browser_use_runner.access_cooldown import guard
from browser_use_runner.task_special_input import fill_special
from browser_use_runner.task_click import hover_before_click
from browser_use_runner.task_pointer import native_pointer_timing

MAX_KEY_PAUSE = 1.5

STATE = """function() {
  return {focused:this.getRootNode().activeElement===this,
    editable:this.isContentEditable || this.tagName==='TEXTAREA' || (this.tagName==='INPUT' &&
      ['text','search','url','tel','email','password','number'].includes(this.type)),
    empty:this.isContentEditable ? this.textContent==='' : this.value==='',
    mac:navigator.platform.startsWith('Mac')};
}"""

COMMIT = """function() {
  const state = (STATE_FUNCTION).call(this);
  if (!state.editable || !state.focused) return false;
  const start=this.selectionStart, end=this.selectionEnd, dir=this.selectionDirection;
  const selection=this.isContentEditable ? this.ownerDocument.getSelection() : null;
  const range=selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  this.blur(); this.focus({preventScroll:true});
  try { this.setSelectionRange(start,end,dir); } catch {}
  if (range && this.contains(range.commonAncestorContainer)) {
    selection.removeAllRanges(); selection.addRange(range);
  }
  return this.getRootNode().activeElement===this;
}""".replace('STATE_FUNCTION', STATE)


def adapt_key_events(client, wait=asyncio.sleep):
    channel = client.send.Input
    if getattr(channel, '_bat_key_context', False): return
    original, pending = channel.dispatchKeyEvent, {}

    async def dispatch(params, session_id=None):
        key, kind = session_id or '', params.get('type')
        previous = pending.pop(key, {})
        # WHY：CDP逐事件默认modifiers=0/code=''；原B-U char遗漏字段会丢失刚按下的Shift。
        # 只补原按键上下文，不改字符/映射/时序；显式参数优先，不新增或重发任何事件。
        if kind == 'char' and previous:
            params = {**previous, **params}
        # WHY：真实外站对照确认原约30ms逐字输入触发行为检测；只给原引擎加入可取消节奏。
        # CMU独立样本DD四分位128/191/301ms：复用标准库偏态分布，保留停顿而非窄均匀间隔。
        # 不随机误输、不等待导航键/快捷键；60–1500ms只约束适配器附加等待。
        if kind == 'keyDown' and len(params.get('key', '')) == 1 and not params.get('modifiers', 0) & 7:
            await wait(min(MAX_KEY_PAUSE, max(.06, random.lognormvariate(-1.655, .63))))
        result = await original(params, session_id=session_id)
        if kind in ('keyDown', 'rawKeyDown'):
            if len(pending) >= 128: pending.pop(next(iter(pending)))
            pending[key] = {name: params[name] for name in ('modifiers', 'code') if name in params}
        return result

    channel.dispatchKeyEvent = dispatch
    channel._bat_key_context = True


def adapt_typing_deadline(bus):
    if getattr(bus, '_bat_typing_deadline', False): return
    original = bus.dispatch

    def dispatch(event):
        # WHY：保留原处理预算，只补逐字节奏引入的最大等待；用户显式上限与外层运行预算不改。
        if (isinstance(event, TypeTextEvent) and 'event_timeout' not in event.model_fields_set
                and 'TIMEOUT_TypeTextEvent' not in os.environ and event.event_timeout == 60.0):
            event.event_timeout += MAX_KEY_PAUSE * len(event.text)
        return original(event)

    object.__setattr__(bus, 'dispatch', dispatch)
    object.__setattr__(bus, '_bat_typing_deadline', True)


async def native_clear(page, object_id, cdp_client, session_id):
    async def state():
        result = await cdp_client.send.Runtime.callFunctionOn(params={
            'functionDeclaration': STATE, 'objectId': object_id, 'returnByValue': True}, session_id=session_id)
        return result['result']['value']
    try:
        current = await state()
        if not current['focused'] or not current['editable']:
            return False
        if current['empty']:
            return True
        await page.press('Meta+A' if current['mac'] else 'Control+A')
        await page.press('Backspace')
        return (await state())['empty']
    except Exception:
        return False


def adapt_watchdog(browser):
    watchdog = browser._default_action_watchdog
    if watchdog is None or getattr(watchdog, '_task_native_clear', False):
        return
    original = watchdog._clear_text_field
    original_commit = watchdog._trigger_framework_events
    original_special = watchdog._set_value_directly
    original_click = watchdog._click_element_node_impl
    async def click(instance, element_node):
        session = await browser.cdp_client_for_node(element_node)
        element = Element(browser, element_node.backend_node_id, session.session_id)
        await hover_before_click(element)
        with native_pointer_timing():
            return await original_click(element_node)
    async def special(instance, element_node, text, object_id, cdp_session):
        page = Page(browser, cdp_session.target_id, session_id=cdp_session.session_id)
        # 增强颜色等原生不可表达值仍沿原B-U回退；与Actor共享真实blur提交，不能只派发脚本blur。
        if await fill_special(page, object_id, text, actor_fallback=True): return
        return await original_special(element_node, text, object_id, cdp_session)
    async def clear(instance, object_id, cdp_session):
        page = Page(browser, cdp_session.target_id, session_id=cdp_session.session_id)
        if await native_clear(page, object_id, cdp_session.cdp_client, cdp_session.session_id):
            return True
        return await original(object_id=object_id, cdp_session=cdp_session)
    async def commit(instance, object_id, cdp_session):
        # WHY：原生输入已更新框架；用实际blur/focus提交change/校验并恢复光标，不伪造事件。
        try:
            result = await cdp_session.cdp_client.send.Runtime.callFunctionOn(params={
                'objectId': object_id, 'functionDeclaration': COMMIT, 'returnByValue': True},
                session_id=cdp_session.session_id)
            if result.get('result', {}).get('value') is True:
                return
        except Exception:
            pass
        await original_commit(object_id=object_id, cdp_session=cdp_session)
    # WHY：固定0.13.8未提供策略注册API；只适配本Browser实例的原有hook，保留原事件/输入引擎。
    object.__setattr__(watchdog, '_clear_text_field', MethodType(clear, watchdog))
    object.__setattr__(watchdog, '_trigger_framework_events', MethodType(commit, watchdog))
    object.__setattr__(watchdog, '_set_value_directly', MethodType(special, watchdog))
    object.__setattr__(watchdog, '_click_element_node_impl', MethodType(click, watchdog))
    object.__setattr__(watchdog, '_task_native_clear', True)


class TaskElement(Element):
    def __init__(self, browser, backend_node_id, session_id, page):
        super().__init__(browser, backend_node_id, session_id)
        self._task_page = page

    async def fill(self, value: str, clear: bool = True):
        if clear:
            object_id = await self._get_remote_object_id()
            if object_id and await fill_special(self._task_page, object_id, value, actor_fallback=True): return
        return await super().fill(value, clear=clear)

    async def click(self, button='left', click_count=1, modifiers=None):
        guard(await self._task_page.get_url())
        await hover_before_click(self)
        with native_pointer_timing():
            await super().click(button=button, click_count=click_count, modifiers=modifiers)

    async def _clear_text_field(self, object_id, cdp_client, session_id):
        # WHY：B-U 0.13.8优先JS清空产生脚本事件；复用同会话Page.press，不复制按键映射。
        # TRADE-OFF：只有已聚焦文本控件走原生替换；特殊控件或失败保留上游兼容路径。
        if await native_clear(self._task_page, object_id, cdp_client, session_id):
            return True
        return await super()._clear_text_field(object_id, cdp_client, session_id)


class TaskPage(Page):
    async def goto(self, url):
        guard(url)
        # WHY：原Actor只等导航提交，按钮可能先于defer处理器出现；复用B-U原按loaderId等待，不重发点击。
        status = await self._browser_session._navigate_and_wait(url, self._target_id, wait_until='domcontentloaded')
        if status is not None: raise TimeoutError('capture_navigation_readiness_timeout')

    async def get_element(self, backend_node_id):
        session_id = await self._ensure_session()
        return TaskElement(self._browser_session, backend_node_id, session_id, self)

    async def get_elements_by_css_selector(self, selector):
        # 固定上游Element字段只用于包装现有查询结果；不重做DOM定位。
        return [TaskElement(self._browser_session, element._backend_node_id, element._session_id, self)
            for element in await super().get_elements_by_css_selector(selector)]
