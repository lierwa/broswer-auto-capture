"""Adapt ISO values to Chromium's existing native fields; reuse B-U keyboard engines."""
from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation
import asyncio
import logging
import re

from browser_use.actor.element import Element
from browser_use.browser.watchdogs.default_action_watchdog import DefaultActionWatchdog
from browser_use_runner.native_range import fill_native_range


def parts(kind, value):
    if value == '': return {}
    try:
        if kind == 'week':
            match = re.fullmatch(r'(\d{4})-W(\d{2})', value)
            if not match: return None
            year, week = map(int, match.groups())
            date.fromisocalendar(year, week, 1)
            return dict(year=year, week=week)
        if kind in ('date', 'month'):
            parsed = date.fromisoformat(value + '-01' if kind == 'month' else value)
            return dict(year=parsed.year, month=parsed.month, **({} if kind == 'month' else dict(day=parsed.day)))
        parsed = datetime.fromisoformat(value) if kind == 'datetime-local' else time.fromisoformat(value)
        if parsed.tzinfo is not None: return None
        result = dict(hour=parsed.hour, minute=parsed.minute, second=parsed.second,
                      millisecond=parsed.microsecond // 1000)
        if kind == 'datetime-local': result.update(year=parsed.year, month=parsed.month, day=parsed.day)
        return result
    except ValueError:
        return None


def native_fields(node):
    fields, pending = {}, [s for s in node.get('shadowRoots', []) if s.get('shadowRootType') == 'user-agent']
    while pending:
        current = pending.pop()
        attrs = dict(zip(current.get('attributes', [])[::2], current.get('attributes', [])[1::2]))
        match = re.fullmatch(r'-webkit-datetime-edit-(\w+)-field', attrs.get('pseudo', ''))
        if match: fields[match[1]] = (current['backendNodeId'], attrs)
        pending.extend(current.get('children', []))
    return fields


async def fill_calendar(page, node, kind, value):
    values, fields = parts(kind, value), native_fields(node)
    if values is None or not fields: return False
    if any(name not in fields and amount != 0 for name, amount in values.items()): return False
    if 'ampm' in fields and values:
        hour = values['hour']
        values.update(hour=hour % 12 or 12, ampm=int(hour >= 12))
    for name, (backend, attrs) in fields.items():
        await page._client.send.DOM.focus(params={'backendNodeId': backend}, session_id=page._session_id)
        if name == 'ampm' and values:
            if int(attrs.get('aria-valuenow', '-1')) != values['ampm']: await page.press('ArrowUp')
            continue
        await page.press('Backspace')
        if values:
            # WHY：原Actor已有完整char/key映射；直接复用，禁止另写第二份键盘引擎。
            element = Element(page._browser_session, backend, page._session_id)
            await element.fill(str(values.get(name, 0)), clear=False)
    return True


async def range_position(page, node, fraction, object_id, vertical, reverse):
    """Choose a point on Chrome's own track; Chrome still owns rounding and value updates."""
    pending, parts = list(node.get('shadowRoots', [])), {}
    while pending:
        child = pending.pop()
        attrs = dict(zip(child.get('attributes', [])[::2], child.get('attributes', [])[1::2]))
        if attrs.get('id') in ('track', 'thumb'): parts[attrs['id']] = child['backendNodeId']
        pending.extend(child.get('children', []))
    if set(parts) != {'track', 'thumb'}: return None
    await page._client.send.DOM.scrollIntoViewIfNeeded(params={'backendNodeId': node['backendNodeId']}, session_id=page._session_id)
    models = {}
    for key, backend in parts.items():
        models[key] = (await page._client.send.DOM.getBoxModel(
            params={'backendNodeId': backend}, session_id=page._session_id))['model']
    track, thumb = models['track']['content'], models['thumb']['border']
    # 旋转/倾斜不套轴向公式；保留原兼容，不能按错误坐标点击其它目标。
    if track[1] != track[3] or track[0] != track[6]: return None
    width, height = thumb[2] - thumb[0], thumb[5] - thumb[1]
    ratio = 1 - fraction if reverse else fraction
    x = (track[0] + track[2]) / 2 if vertical else track[0] + width / 2 + (track[2] - track[0] - width) * ratio
    y = track[1] + height / 2 + (track[5] - track[1] - height) * ratio if vertical else (track[1] + track[5]) / 2
    # WHY：document.elementFromPoint在Shadow DOM返回host；复用Chrome原生命中以保留跨frame/shadow边界。
    x, y = round(x), round(y)
    # Chrome getNodeForLocation接收文档坐标，Input/BoxModel用视口坐标；滚动后不能混用。
    layout = (await page._client.send.Page.getLayoutMetrics(session_id=page._session_id))['cssLayoutViewport']
    hit = await page._client.send.DOM.getNodeForLocation(params={'x': round(x + layout['pageX']), 'y': round(y + layout['pageY']),
        'includeUserAgentShadowDOM': False}, session_id=page._session_id)
    if hit.get('backendNodeId') != node['backendNodeId']: return None
    mouse = await page.mouse
    await mouse.move(x, y)
    try:
        await mouse.click(x, y)
    except BaseException:
        # 取消可能发生在按下后；只释放本动作同坐标按键，不再次点击或吞掉原错误。
        try:
            await page._client.send.Input.dispatchMouseEvent(params={
                'type': 'mouseReleased', 'x': x, 'y': y, 'button': 'left', 'clickCount': 0}, session_id=page._session_id)
        except Exception: pass
        raise
    result = await page._client.send.Runtime.callFunctionOn(params={'objectId': object_id,
        'functionDeclaration': 'function(){return this.value;}', 'returnByValue': True}, session_id=page._session_id)
    return Decimal(result['result']['value'])


async def fill_range(page, node, value, state, object_id):
    attrs = dict(zip(node.get('attributes', [])[::2], node.get('attributes', [])[1::2]))
    try:
        minimum, maximum = Decimal(attrs.get('min', '0')), Decimal(attrs.get('max', '100'))
        # Chrome键盘step=any仅全范围1/100；更细值先复用owned窗口原生RangeValuePattern。
        step = (maximum - minimum) / 100 if attrs.get('step', '').lower() == 'any' else Decimal(attrs.get('step', '1'))
        target, old = Decimal(value), Decimal(state['value'])
        if not all(n.is_finite() for n in [minimum, maximum, step, target, old]): return False
        if step <= 0 or not minimum <= target <= maximum: return False
        finer = bool((target - minimum) % step)
    except (InvalidOperation, ValueError):
        return False
    if finer:
        return await fill_native_range(page, node, value, object_id) if attrs.get('step', '').lower() == 'any' else False
    try:
        maximum = minimum + ((maximum - minimum) // step) * step
        candidates = [(None, (target - old) / step), ('Home', (target - minimum) / step),
                      ('End', (target - maximum) / step)]
        key, count = min(candidates, key=lambda pair: abs(pair[1]))
        vertical = state['writingMode'].startswith('vertical') or state['appearance'] == 'slider-vertical'
        reverse = state['direction'] == 'rtl' or state['appearance'] == 'slider-vertical'
        if state['writingMode'] not in ('horizontal-tb', 'vertical-lr', 'vertical-rl'): return False
        if abs(count) > 256 and maximum > minimum:
            try:
                old = await range_position(page, node, float((target - minimum) / (maximum - minimum)),
                                           object_id, vertical, reverse)
            except Exception as error:
                logging.getLogger(__name__).warning('range_native_unavailable:%s', type(error).__name__)
                return False
            if old is None: return False
            key, count = None, (target - old) / step
        if abs(count) > 256 or count != int(count): return False
    except (InvalidOperation, ValueError):
        return False
    await page._client.send.DOM.focus(params={'backendNodeId': node['backendNodeId']}, session_id=page._session_id)
    if key: await page.press(key)
    increase = 'ArrowDown' if vertical and not reverse else 'ArrowUp'
    decrease = 'ArrowUp' if increase == 'ArrowDown' else 'ArrowDown'
    for _ in range(abs(int(count))): await page.press(increase if count > 0 else decrease)
    return True


async def color_fields(page, backend):
    # getFullAXTree默认主frame；同源iframe与主文档共用CDP session，必须沿实际节点取frame。
    ancestors = await page._client.send.Accessibility.getAXNodeAndAncestors(
        params={'backendNodeId': backend}, session_id=page._session_id)
    frame = next((n.get('frameId') for n in ancestors['nodes'] if n.get('frameId')), None)
    if frame is None: return {}
    tree = await page._client.send.Accessibility.getFullAXTree(params={'frameId': frame}, session_id=page._session_id)
    nodes = {n['nodeId']: n for n in tree['nodes']}
    owner = next((n for n in nodes.values() if n.get('backendDOMNodeId') == backend), {})
    if owner.get('role', {}).get('value') != 'ColorWell': return {}
    pending, fields, seen = list(owner.get('childIds', [])), {}, set()
    while pending and len(seen) < 128:
        key = pending.pop()
        if key in seen: continue
        seen.add(key); item = nodes.get(key, {})
        pending.extend(item.get('childIds', []))
        if item.get('role', {}).get('value') not in ('textbox', 'button', 'spinbutton') or not item.get('backendDOMNodeId'): continue
        # WHY：只沿当前ColorWell的原生AX子树找字段，不匹配页面上的同名id或本地化标签。
        field = item['backendDOMNodeId']
        node = (await page._client.send.DOM.describeNode(params={'backendNodeId': field}, session_id=page._session_id))['node']
        raw_attrs = node.get('attributes', [])
        attrs = dict(zip(raw_attrs[::2], raw_attrs[1::2]))
        if 'other-color' in attrs.get('class', '').split(): fields['other-color'] = field
        elif node.get('nodeName') == 'FORMAT-TOGGLER': fields['format-toggler'] = field
        elif item.get('role', {}).get('value') == 'textbox': fields[attrs.get('id')] = field
    return fields


async def fill_color(page, node, value, platform, extended=False, wide=False):
    if platform != 'Win32' or wide: return False
    pattern = r'#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?' if extended else r'#[0-9a-fA-F]{6}'
    if not re.fullmatch(pattern, value): return False
    # WHY：原HEX字段支持8位且不量化透明度；非HEX和P3继续原保真路径，不另写CSS颜色解析器。
    if extended and len(value) == 7: value += 'ff'
    values = {'hexValueContainer': value} if extended else {
        name: str(int(value[1 + index * 2:3 + index * 2], 16))
        for index, name in enumerate(['rValueContainer', 'gValueContainer', 'bValueContainer'])}
    opened = changed = done = False
    try:
        # 原AX需启用才维护popup子树；与B-U已有AX使用共享，不在结束时关闭其它采集者的domain。
        await page._client.send.Accessibility.enable(session_id=page._session_id)
        await page._client.send.Accessibility.getPartialAXTree(params={'backendNodeId': node['backendNodeId'],
            'fetchRelatives': False}, session_id=page._session_id)
        await (await page.get_element(node['backendNodeId'])).click()
        opened = True
        for _ in range(10):
            fields = await color_fields(page, node['backendNodeId'])
            if all(key in fields for key in values): break
            if 'other-color' in fields:
                # WHY：候选列表仍由Chrome持有；通过原按钮进入已有RGB编辑器，不脚本改控件值。
                await page._client.send.DOM.focus(params={'backendNodeId': fields['other-color']}, session_id=page._session_id)
                await page._client.send.Input.dispatchKeyEvent(params={'type': 'char', 'key': 'Enter',
                    'text': '\r', 'windowsVirtualKeyCode': 13}, session_id=page._session_id)
            elif 'format-toggler' in fields:
                await page._client.send.DOM.focus(params={'backendNodeId': fields['format-toggler']}, session_id=page._session_id)
                await page.press('ArrowUp')
            await asyncio.sleep(.02)
        else:
            logging.getLogger(__name__).warning('color_popup_fields_unavailable')
            return False
        for name, channel in values.items():
            await page._client.send.DOM.focus(params={'backendNodeId': fields[name]}, session_id=page._session_id)
            await page.press('Control+A')
            # 原Chrome popup接收char事件；Actor.fill的Runtime对象和insertText属于主文档，不能替用。
            changed = True
            # Chromium char事件的text有长度上限；HEX沿原字段逐字输入，不能一次塞9字符。
            for text in channel if extended else [channel]:
                await page._client.send.Input.dispatchKeyEvent(params={'type': 'char', 'text': text}, session_id=page._session_id)
        done = True
        return True
    except Exception as error:
        if changed: raise RuntimeError('color_native_action_unconfirmed') from error
        logging.getLogger(__name__).warning('color_native_unavailable:%s', type(error).__name__)
        return False  # 原控件不可用仍交上游兼容路径；不吞取消。
    finally:
        if opened:
            await page.press('Enter' if done else 'Escape')
            if changed and not done: await page.press('Escape')  # 原popup第一次Escape还原颜色，第二次关闭。


async def fill_special(page, object_id, value, *, actor_fallback=False):
    result = await page._client.send.Runtime.callFunctionOn(params={'objectId': object_id,
        # WHY：让Chrome解释颜色合法值；未连接clone不触碰实际表单或派发事件，不能因无效属性误走脚本。
        'functionDeclaration': """function(value){
          const copy=this.cloneNode();if(this.type==='color') copy.value=value;
          const style=getComputedStyle(this);
          return {type:this.type,value:this.value,canonical:copy.value,disabled:this.disabled,
            readOnly:this.readOnly,platform:navigator.platform,
            writingMode:style.writingMode,direction:style.direction,appearance:style.appearance,
            extended:this.alpha===true || !!this.colorSpace && this.colorSpace!=='limited-srgb',
            wide:!!this.colorSpace && this.colorSpace!=='limited-srgb'};
        }""", 'arguments': [{'value': value}],
        'returnByValue': True}, session_id=page._session_id)
    state = result.get('result', {}).get('value', {})
    kind = state.get('type')
    if kind not in ('date', 'time', 'datetime-local', 'month', 'week', 'range', 'color'): return False
    if state.get('disabled') or state.get('readOnly'): return False
    described = await page._client.send.DOM.describeNode(params={'objectId': object_id, 'depth': -1, 'pierce': True},
                                                       session_id=page._session_id)
    node = described['node']
    native_value = state['canonical'] if kind == 'color' else value
    color_value = value if state.get('extended') else native_value
    done = (await fill_color(page, node, color_value, state.get('platform'), state.get('extended'), state.get('wide')) if kind == 'color' else
            await fill_range(page, node, value, state, object_id) if kind == 'range'
            else await fill_calendar(page, node, kind, value))
    fallback = not done and actor_fallback and page._browser_session._default_action_watchdog is not None
    if fallback:
        # WHY：Actor原fill把不支持键入的控件当文本，可能留黑色/旧值。复用固定B-U原特殊控件路径；
        # TRADE-OFF：此路径仍有脚本事件，不能算原生化。0.13.8原方法未使用element_node参数。
        session = await page._browser_session.get_or_create_cdp_session(target_id=page._target_id, focus=False)
        await page._client.send.DOM.focus(params={'backendNodeId': node['backendNodeId']}, session_id=page._session_id)
        await DefaultActionWatchdog._set_value_directly(page._browser_session._default_action_watchdog,
            None, value, object_id, session)
        await page.press('Tab')  # 原回退只派发脚本blur；真实焦点离开才触发React的focusout提交。
        logging.getLogger(__name__).warning('special_input_native_unavailable:%s', kind)
    elif not done: return False
    result = await page._client.send.Runtime.callFunctionOn(params={'objectId': object_id,
        'functionDeclaration': 'function(){this.blur();this.focus({preventScroll:true});return this.value;}',
        'returnByValue': True}, session_id=page._session_id)
    return fallback or result.get('result', {}).get('value') == native_value
