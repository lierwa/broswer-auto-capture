"""Real B-U input and independent BotD; synthetic own page only, no human claim."""
import asyncio
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import psutil
from browser_use import BrowserProfile
from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog

ROOT = Path.cwd().resolve()
PURPOSE = 'input-probe-owned-headless'
sys.path.insert(0, str(ROOT / 'apps/api/python'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/antibot-m0'))
from browser import endpoint, close_owned, save
from browser_use_runner.task_browser import TaskBrowser


async def snapshot(page):
    return json.loads(await page.evaluate('() => globalThis.__events.splice(0)'))


async def exercise_joint(browser, out):
    from browser_use.browser.events import TypeTextEvent, ScrollEvent
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement/inputs')
    for _ in range(40):
        controls = await page.get_elements_by_css_selector('input[aria-label=controlled]')
        if controls: break
        await asyncio.sleep(.1)
    await page.evaluate("""() => {
      document.body.style.minHeight='4000px';
      globalThis.__events=[];
      for(const type of ['keydown','keyup','input','paste','compositionend','focus','blur','wheel','scroll'])
        document.addEventListener(type,e=>globalThis.__events.push({type:e.type,trusted:e.isTrusted,
          at:e.timeStamp,repeat:!!e.repeat,composing:!!e.isComposing,hidden:document.hidden,
          scrollKey:type==='keydown'&&['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key),
          y:scrollY}),true);
    }""")
    rows = []
    text = 'Typing sample @2026! ' * 15 if '--long-text' in sys.argv else 'Public browser typing sample 2026'
    for mode in (['watchdog'] if '--long-text' in sys.argv else ['actor', 'watchdog']):
        await snapshot(page)
        if mode == 'actor': await controls[0].fill(text)
        else:
            state = await browser.get_browser_state_summary()
            node = next(n for n in state.dom_state.selector_map.values() if n.attributes.get('aria-label') == 'controlled')
            event = browser.event_bus.dispatch(TypeTextEvent(node=node, text=text, clear=True))
            await event; await event.event_result(raise_if_any=True, raise_if_none=False)
        actual = json.loads(await page.evaluate('(expected) => ({matches:document.querySelector("input[aria-label=controlled]").value===expected,length:document.querySelector("input[aria-label=controlled]").value.length})', text))
        rows.append(dict(mode=mode, actual=actual, events=await snapshot(page))); save(out, 'joint-events.json', rows)
        assert actual == {'matches': True, 'length': len(text)}
    for mode in ['watchdog-scroll', 'keyboard-scroll', 'anchor-scroll']:
        await page.evaluate('() => {document.activeElement.blur();scrollTo(0,0)}')
        await asyncio.sleep(.1); await snapshot(page)
        if mode == 'watchdog-scroll':
            event = browser.event_bus.dispatch(ScrollEvent(direction='down', amount=1200))
            await event; await event.event_result(raise_if_any=True, raise_if_none=False)
        elif mode == 'keyboard-scroll': await page.press('Control+End')
        else: await page.evaluate('() => scrollTo(0,document.body.scrollHeight)')
        await asyncio.sleep(.25)
        events = await snapshot(page)
        rows.append(dict(mode=mode, events=events))
    save(out, 'joint-events.json', rows)
    assert all(row['events'] for row in rows), 'joint_measurement_missing'
    return dict(cases=len(rows), measuredOnly=True, modelCalls=0, humanBaseline=False)

async def exercise_motion(browser, out):
    from browser_use.browser.events import ClickElementEvent
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement')
    button = (await page.get_elements_by_css_selector('button'))[0]
    entry = (await page.get_elements_by_css_selector('input'))[0]
    await button.click()  # 第一处位置未知，不冒充已经掌握真人指针坐标。
    await page.evaluate("""() => {
      globalThis.__events=[];
      for(const type of ['mousemove','mousedown','mouseup','click'])
        document.addEventListener(type,e=>globalThis.__events.push({type:e.type,trusted:e.isTrusted,
          x:e.clientX,y:e.clientY,at:e.timeStamp,target:e.target.tagName}),true);
    }""")
    rows = []
    for mode, tag in [('actor','INPUT'),('actor','BUTTON'),('watchdog','INPUT'),('watchdog','BUTTON')]:
        if mode == 'actor':
            await (entry if tag == 'INPUT' else button).click()
        else:
            summary = await browser.get_browser_state_summary()
            node = next(n for n in summary.dom_state.selector_map.values() if n.tag_name.lower() == tag.lower())
            pending = browser.event_bus.dispatch(ClickElementEvent(node=node))
            await pending
            await pending.event_result(raise_if_any=True, raise_if_none=False)
        events = await snapshot(page)
        moves = [e for e in events if e['type'] == 'mousemove']
        clicks = [e for e in events if e['type'] == 'click']
        row = {'mode': mode, 'tag': tag, 'moves': len(moves), 'events': events,
               'movementDuration': moves[-1]['at'] - moves[0]['at'] if moves else 0}
        rows.append(row)
        save(out, 'motion-events.json', rows)
        assert len(clicks) == 1 and clicks[0]['target'] == tag, 'click_target_or_count_changed'
        assert all(e['trusted'] for e in events), 'scripted_pointer_event'
        if '--expect-instant' in sys.argv:
            assert len(moves) <= 1, 'baseline_already_has_trajectory'
        else:
            assert len(moves) > 5 and row['movementDuration'] > 30, 'trajectory_not_observed'
    return {'rows': rows, 'modelCalls': 0, 'allTargetsAndCountsCorrect': True, 'humanIdentityClaim': False}


async def exercise_number(browser, out):
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement/inputs')
    for _ in range(30):
        controls = await page.get_elements_by_css_selector('input[type=number]')
        if controls: break
        await asyncio.sleep(.1)
    await page.evaluate("""() => {
      globalThis.__events=[];
      for(const type of ['keydown','keyup','beforeinput','input','change','focus','blur'])
        document.addEventListener(type,e=>globalThis.__events.push({type:e.type,trusted:e.isTrusted}),true);
    }""")
    await controls[0].fill('34')
    actor = await snapshot(page)
    assert await page.evaluate("() => document.querySelector('input[type=number]').value") == '34'
    from browser_use.browser.events import TypeTextEvent
    summary = await browser.get_browser_state_summary()
    node = next(n for n in summary.dom_state.selector_map.values() if n.attributes.get('type') == 'number')
    pending = browser.event_bus.dispatch(TypeTextEvent(node=node, text='56', clear=True))
    await pending
    await pending.event_result(raise_if_any=True, raise_if_none=False)
    native = await snapshot(page)
    assert await page.evaluate("() => document.querySelector('input[type=number]').value") == '56'
    result = {'actor': actor, 'watchdog': native, 'valuesCorrect': True, 'modelCalls': 0}
    save(out, 'number-events.json', result)
    if '--expect-scripted' in sys.argv:
        assert any(not e['trusted'] for e in actor) and any(not e['trusted'] for e in native)
    else:
        assert actor and native and all(e['trusted'] for e in actor + native), 'number_used_scripted_events'
    return result


async def exercise_rich(browser, out):
    from browser_use.browser.events import TypeTextEvent
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement/inputs')
    for _ in range(30):
        controls = await page.get_elements_by_css_selector('[contenteditable]')
        if controls: break
        await asyncio.sleep(.1)
    await page.evaluate("""() => {
      globalThis.__events=[];
      for(const type of ['keydown','keyup','beforeinput','input','change','focus','blur'])
        document.addEventListener(type,e=>globalThis.__events.push({type:e.type,trusted:e.isTrusted}),true);
    }""")
    rows = []
    for mode, text, clear, expected in [('actor','Rich中文',True,'Rich中文'),
            ('actor',' append',False,'Rich中文 append'), ('actor','',True,''),
            ('watchdog','探索 rich',True,'探索 rich')]:
        if mode == 'actor': await controls[0].fill(text, clear=clear)
        else:
            summary = await browser.get_browser_state_summary()
            node = next(n for n in summary.dom_state.selector_map.values() if n.attributes.get('aria-label') == 'rich')
            pending = browser.event_bus.dispatch(TypeTextEvent(node=node, text=text, clear=clear))
            await pending
            await pending.event_result(raise_if_any=True, raise_if_none=False)
        events = await snapshot(page)
        value = await page.evaluate("() => document.querySelector('[contenteditable]').textContent")
        state = await page.evaluate("() => document.querySelector('#rich-state').textContent")
        committed = await page.evaluate("() => document.querySelector('#rich-committed').textContent")
        rows.append({'mode': mode, 'clear': clear, 'valueCorrect': value == expected,
            'frameworkCorrect': state == expected, 'commitCorrect': committed == expected,
            'scripted': sum(not e['trusted'] for e in events), 'events': events})
        save(out, 'rich-events.json', rows)
        if '--expect-scripted' not in sys.argv:
            assert value == state == expected, 'rich_input_semantics'
            assert all(e['trusted'] for e in events), 'rich_scripted_events'
            if mode == 'watchdog':
                assert committed == expected
                assert await page.evaluate("() => document.activeElement.getAttribute('aria-label')") == 'rich'
    if '--expect-scripted' in sys.argv: assert any(row['scripted'] for row in rows)
    return {'rows': rows, 'modelCalls': 0, 'baseline': '--expect-scripted' in sys.argv}


async def exercise(browser, out):
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement/probe')
    probe = None
    for _ in range(60):
        raw = await page.evaluate('() => globalThis.__probeResult || null')
        probe = json.loads(raw) if raw else None
        if probe: break
        await asyncio.sleep(.1)
    assert probe and probe.get('validity') != 'error', probe
    assert probe['verdict']['bot'], 'known-headless-positive-not-detected'
    await page.goto('https://localhost:4185/measurement')
    await page.evaluate("""() => {
      globalThis.__events = [];
      for (const type of ['pointerdown','pointerup','mousedown','mouseup','click','keydown','keyup','beforeinput','input','change','focus','blur']) {
        document.addEventListener(type, e => globalThis.__events.push({type:e.type,trusted:e.isTrusted,
          inputType:e.inputType || null, at:e.timeStamp, visible:document.visibilityState}),true);
      }
    }""")
    button = (await page.get_elements_by_css_selector('button'))[0]
    await button.click(); click = await snapshot(page)
    entry = (await page.get_elements_by_css_selector('input'))[0]
    await entry.fill('本地 Test'); typed = await snapshot(page)
    value = await page.evaluate("() => document.querySelector('input').value")
    assert value == '本地 Test', 'input-semantic-regression'
    await page.evaluate("() => document.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}))")
    scripted = await snapshot(page)
    assert any(e['type'] == 'click' and e['trusted'] for e in click)
    assert any(e['type'] == 'input' and e['trusted'] for e in typed)
    assert all(e['trusted'] for e in typed), 'native-input-used-script-dispatch'
    assert scripted and not scripted[-1]['trusted']
    regression = []
    for content, clear, expected in [('替换', True, '替换'), (' append', False, '替换 append'), ('', True, '')]:
        await entry.fill(content, clear=clear)
        events = await snapshot(page)
        assert await page.evaluate("() => document.querySelector('input').value") == expected
        assert all(e['trusted'] for e in events), 'text-replacement-used-script-dispatch'
        regression.append({'clear': clear, 'length': len(expected), 'allTrusted': True})
    from browser_use.browser.events import TypeTextEvent
    state = await browser.get_browser_state_summary()
    node = next(node for node in state.dom_state.selector_map.values() if node.tag_name == 'input')
    pending = browser.event_bus.dispatch(TypeTextEvent(node=node, text='原生探索', clear=True))
    await pending
    await pending.event_result(raise_if_any=True, raise_if_none=False)
    native_events = await snapshot(page)
    save(out, 'watchdog-events.json', native_events)
    assert await page.evaluate("() => document.querySelector('input').value") == '原生探索'
    assert all(e['trusted'] for e in native_events), 'watchdog-input-used-script-dispatch'
    await page.goto('https://localhost:4185/measurement/inputs')
    for _ in range(30):
        controls = await page.get_elements_by_css_selector('input[aria-label=controlled]')
        if controls: break
        await asyncio.sleep(.1)
    await page.evaluate("""() => { globalThis.__keys=[];
      document.addEventListener('keypress',e=>__keys.push({key:e.key,code:e.code,
        shift:e.shiftKey,trusted:e.isTrusted}),true); }""")
    await controls[0].fill('React 中文@!')
    assert await page.evaluate("() => document.querySelector('#state').textContent") == 'React 中文@!'
    state = await browser.get_browser_state_summary()
    node = next(node for node in state.dom_state.selector_map.values() if node.attributes.get('aria-label') == 'controlled')
    pending = browser.event_bus.dispatch(TypeTextEvent(node=node, text='Native @React!', clear=True))
    await pending
    await pending.event_result(raise_if_any=True, raise_if_none=False)
    assert await page.evaluate("() => document.querySelector('#state').textContent") == 'Native @React!'
    assert await page.evaluate("() => document.querySelector('#committed').textContent") == 'Native @React!'
    assert await page.evaluate("() => document.activeElement.getAttribute('aria-label')") == 'controlled'
    keys = json.loads(await page.evaluate('() => globalThis.__keys'))
    save(out, 'keypress-events.json', keys)
    shifted = [e for e in keys if e['key'] in '@!']
    assert len(shifted) == 4 and all(e['trusted'] and e['shift'] and
        e['code'] == ('Digit2' if e['key'] == '@' else 'Digit1') for e in shifted), 'native_char_lost_key_modifiers'
    area = (await page.get_elements_by_css_selector('textarea'))[0]
    await area.fill('line one\n第二行')
    assert await page.evaluate("() => document.querySelector('textarea').value") == 'line one\n第二行'
    number = (await page.get_elements_by_css_selector('input[type=number]'))[0]
    await number.fill('34')
    assert await page.evaluate("() => document.querySelector('input[type=number]').value") == '34'
    return {'probe': probe, 'clickEvents': click, 'inputEvents': typed, 'scriptedEvents': scripted,
        'inputValueCorrect': True, 'replacementRegression': regression, 'watchdogEvents': native_events,
        'reactControlledAndBlur': True, 'focusPreserved': True, 'multiline': True, 'numberFallback': True,
        'isTrustedProvesHuman': False, 'modelCalls': 0}


async def exercise_special(browser, out):
    from browser_use.browser.events import TypeTextEvent
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement/inputs')
    targets = {'date': '2026-10-09', 'time': '14:35', 'datetime-local': '2026-10-09T14:35',
               'month': '2026-10', 'week': '2026-W41', 'color': '#aabbcc', 'range': '73'}
    for _ in range(40):
        if await page.get_elements_by_css_selector('input[type=date]'): break
        await asyncio.sleep(.1)
    if '--inspect-special' in sys.argv:
        trees = {}
        for kind in targets:
            element = (await page.get_elements_by_css_selector(f'input[type="{kind}"]'))[0]
            trees[kind] = await element._client.send.DOM.describeNode(params={
                'backendNodeId': element._backend_node_id, 'depth': -1, 'pierce': True}, session_id=element._session_id)
        save(out, 'native-controls.json', trees)
        return {'inspectedOnly': True, 'browserActions': 0}
    await page.evaluate("""() => {
      globalThis.__events=[];
      for(const type of ['keydown','keyup','beforeinput','input','change','focus','blur'])
        document.addEventListener(type,e=>globalThis.__events.push({type:e.type,trusted:e.isTrusted}),true);
    }""")
    results = []
    for kind, value in targets.items():
        summary = await browser.get_browser_state_summary()
        node = next(n for n in summary.dom_state.selector_map.values() if n.attributes.get('type') == kind)
        await snapshot(page)
        pending = browser.event_bus.dispatch(TypeTextEvent(node=node, text=value, clear=True))
        await pending
        await pending.event_result(raise_if_any=True, raise_if_none=False)
        events = await snapshot(page)
        actual = json.loads(await page.evaluate("""type => {
          const node=document.querySelector(`input[type="${type}"]`);
          return {value:node.value, state:document.getElementById(type+'-state').textContent,
            committed:document.getElementById(type+'-committed').textContent, focused:document.activeElement===node};
        }""".replace('type =>', '(type) =>'), kind))
        row = dict(type=kind, actual=actual, events=events, scripted=sum(not e['trusted'] for e in events))
        results.append(row)
        save(out, 'nontext.json', results)
        assert actual['value'] == actual['state'] == value
        if '--expect-special-scripted' in sys.argv: assert row['scripted'] > 0
        else:
            assert row['scripted'] == 0
            assert actual['committed'] == value and actual['focused']
    return dict(controls=results, remainingScriptedTypes=[r['type'] for r in results if r['scripted']],
                modelCalls=0, humanIdentityClaim=False)


async def exercise_special_compat(browser, out):
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement/inputs')
    for _ in range(40):
        if await page.get_elements_by_css_selector('input[type=date]'): break
        await asyncio.sleep(.1)
    await page.evaluate("""() => {
      globalThis.__events=[];
      for(const type of ['keydown','keyup','beforeinput','input','change','focus','blur','mousedown','mouseup','click'])
        document.addEventListener(type,e=>globalThis.__events.push({type:e.type,trusted:e.isTrusted,target:e.target.type}),true);
    }""")
    results = []
    targets = {'date': '2028-02-29', 'month': '2028-02', 'week': '2028-W09',
               'time': '23:59', 'datetime-local': '2028-02-29T23:59', 'range': '0.35', 'color': '#00Ff80'}
    for language in ['zh-CN', 'en-US']:
        await page.evaluate("""(lang) => {
          document.querySelectorAll('input').forEach(node => node.lang=lang);
          const range=document.querySelector('input[type=range]'); range.min='0';range.max='1';range.step='.05';
        }""", language)
        for kind, value in targets.items():
            control = (await page.get_elements_by_css_selector(f'input[type="{kind}"]'))[0]
            for text in ([value, '#000000', '#ffffff'] if kind == 'color' else [value] if kind == 'range' else [value, '']):
                await snapshot(page)
                await control.fill(text)
                events = await snapshot(page)
                if kind == 'color': save(out, 'color-compat-events.json', events)
                actual = json.loads(await page.evaluate("""(type) => ({
                  value:document.querySelector(`input[type="${type}"]`).value,
                  state:document.getElementById(type+'-state').textContent,
                  committed:document.getElementById(type+'-committed').textContent
                })""", kind))
                results.append(dict(language=language, type=kind, requested=text, actual=actual,
                                    scripted=sum(not e['trusted'] for e in events)))
                save(out, 'nontext-compat.json', results)
                assert actual['value'] == actual['state'] == actual['committed'] == (text.lower() if kind == 'color' else text)
                assert results[-1]['scripted'] == 0
    return dict(cases=len(results), actor=True, nonemptyAndClear=True, modelCalls=0)


async def exercise_color_list(browser, out):
    from browser_use.browser.events import TypeTextEvent
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement/inputs')
    for _ in range(40):
        if await page.get_elements_by_css_selector('input[type=color]'): break
        await asyncio.sleep(.1)
    await page.evaluate("""() => {
      const list=document.createElement('datalist');list.id='owned-color-list';
      list.innerHTML='<option value="#123456"></option><option value="#abcdef"></option>';
      document.body.append(list);document.querySelector('input[type=color]').setAttribute('list',list.id);
      globalThis.__events=[];
      for(const type of ['input','change','focus','blur'])
        document.addEventListener(type,e=>globalThis.__events.push({type:e.type,trusted:e.isTrusted}),true);
    }""")
    element = (await page.get_elements_by_css_selector('input[type=color]'))[0]
    rows = []
    cases = [('actor', '#123456', 'populated'), ('actor', '#112233', 'populated'),
             ('watchdog', '#abcdef', 'populated'), ('actor', '#654321', 'empty'),
             ('actor', '#00ff80', 'missing'), ('actor', '#000000', 'none')]
    for mode, value, variant in cases:
        if variant == 'empty': await page.evaluate("() => document.querySelector('#owned-color-list').innerHTML=''")
        elif variant == 'missing': await page.evaluate("() => document.querySelector('input[type=color]').setAttribute('list','nonexistent')")
        elif variant == 'none': await page.evaluate("() => document.querySelector('input[type=color]').removeAttribute('list')")
        await snapshot(page)
        if mode == 'actor': await element.fill(value)
        else:
            summary = await browser.get_browser_state_summary()
            node = next(n for n in summary.dom_state.selector_map.values() if n.attributes.get('type') == 'color')
            event = browser.event_bus.dispatch(TypeTextEvent(node=node, text=value, clear=True))
            await event; await event.event_result(raise_if_any=True, raise_if_none=False)
        events = await snapshot(page)
        actual = json.loads(await page.evaluate("""() => ({
          value:document.querySelector('input[type=color]').value,
          state:document.getElementById('color-state').textContent,
          committed:document.getElementById('color-committed').textContent,
          focused:document.activeElement===document.querySelector('input[type=color]')})"""))
        rows.append(dict(mode=mode, variant=variant, value=value, actual=actual, events=events,
                         scripted=sum(not e['trusted'] for e in events)))
        save(out, 'color-list.json', rows)
        if '--expect-special-scripted' in sys.argv: assert rows[-1]['scripted'] > 0
        else:
            assert actual['value'] == actual['state'] == value
            assert rows[-1]['scripted'] == 0 and actual['committed'] == value and actual['focused']
    features = json.loads(await page.evaluate("""() => {
      const node=document.createElement('input');node.type='color';node.setAttribute('alpha','');
      node.value='#12345680';const alpha=node.value;
      node.setAttribute('colorspace','display-p3');node.value='color(display-p3 1 0 0 / 0.5)';
      return {alphaSerialized:alpha,p3Serialized:node.value};
    }"""))
    save(out, 'color-features.json', features)
    return dict(cases=len(rows), actorAndWatchdog=True, baseline='--expect-special-scripted' in sys.argv, modelCalls=0)


async def exercise_special_fallback(browser, out):
    from browser_use.browser.events import TypeTextEvent
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement/inputs')
    for _ in range(40):
        if await page.get_elements_by_css_selector('input[type=color]'): break
        await asyncio.sleep(.1)
    await page.evaluate("""() => {
      globalThis.__events=[];
      for(const type of ['input','change','focus','blur'])
        document.addEventListener(type,e=>globalThis.__events.push({type:e.type,trusted:e.isTrusted}),true);
    }""")
    cases = [('color', '#abcdef', {'alpha': ''}),
             ('color', 'color(display-p3 1 0 0 / 0.5)', {'colorspace': 'display-p3'}),
             ('color', '', {}), ('range', '3333', {'min': '0', 'max': '10000', 'step': '1'}),
             ('range', '0.12345', {'min': '0', 'max': '1', 'step': 'any'}),
             ('range', '0.12', {'min': '0', 'max': '1', 'step': 'any'})]
    rows = []
    for mode, (kind, value, attrs) in [('actor', case) for case in cases] + [('watchdog', case) for case in cases[:3]]:
        expected = await page.evaluate("""(data) => {
          const node=document.querySelector(`input[type="${data.kind}"]`);
          for(const key of ['alpha','colorspace','min','max','step']) node.removeAttribute(key);
          for(const [key,value] of Object.entries(data.attrs)) node.setAttribute(key,value);
          const copy=node.cloneNode();copy.value=data.value;return copy.value;
        }""", dict(kind=kind, value=value, attrs=attrs))
        extended = await page.evaluate("""() => {
          const node=document.querySelector('input[type=color]');
          return String(node.alpha===true || !!node.colorSpace && node.colorSpace!=='limited-srgb');
        }""") == 'true'
        await snapshot(page)
        if mode == 'actor':
            await (await page.get_elements_by_css_selector(f'input[type="{kind}"]'))[0].fill(value)
        else:
            state = await browser.get_browser_state_summary()
            node = next(n for n in state.dom_state.selector_map.values() if n.attributes.get('type') == kind)
            pending = browser.event_bus.dispatch(TypeTextEvent(node=node, text=value, clear=True))
            await pending
            await pending.event_result(raise_if_any=True, raise_if_none=False)
        events = await snapshot(page)
        actual = json.loads(await page.evaluate("""(type) => ({
          value:document.querySelector(`input[type="${type}"]`).value,
          state:document.getElementById(type+'-state').textContent,
          committed:document.getElementById(type+'-committed').textContent,
          focused:document.activeElement===document.querySelector(`input[type="${type}"]`)})""", kind))
        rows.append(dict(mode=mode, type=kind, requested=value, attrs=attrs, expected=expected, actual=actual, events=events,
                         nativeExpected=kind == 'color' and not extended or kind == 'range' and value != '0.12345',
                         scripted=sum(not e['trusted'] for e in events)))
        save(out, 'special-fallback.json', rows)
        assert actual['value'] == actual['state'] == actual['committed'] == expected and actual['focused']
        assert (rows[-1]['scripted'] == 0) == rows[-1]['nativeExpected'], 'native_or_fallback_boundary_changed'
    return dict(cases=len(rows), nativeCases=sum(row['nativeExpected'] for row in rows),
                remainingFallbacks=sum(not row['nativeExpected'] for row in rows), modelCalls=0)


async def main():
    if os.environ.get('BAT_RUN_OWNED_INPUT') != '1': raise ValueError('owned_input_gate_required')
    parent = ROOT / 'work/antibot-service/reports'
    out = Path(tempfile.mkdtemp(prefix='input-', dir=parent)).resolve()
    profile = out / 'profile'; profile.mkdir()
    executable = LocalBrowserWatchdog._find_installed_browser_path('chrome')
    owner = subprocess.Popen([str(executable), '--headless=new', '--remote-debugging-port=0',
        '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + str(profile), '--no-first-run',
        '--no-default-browser-check', '--ignore-certificate-errors', 'about:blank'],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    started = psutil.Process(owner.pid).create_time()
    receipt = {'ownerPid': owner.pid, 'ownerStarted': started, 'profile': str(profile), 'closed': False,
        'purpose': PURPOSE, 'humanBaseline': False, 'tlsTrust': 'temporary-browser-only'}
    save(out, 'owner.json', receipt); browser = None
    try:
        cdp = await endpoint(profile, owner)
        browser = TaskBrowser(browser_profile=BrowserProfile(cdp_url=cdp, is_local=False, keep_alive=True,
            enable_default_extensions=False), cdp_url=cdp, is_local=False)
        await browser.start()
        number_only = '--number-only' in sys.argv
        selected = exercise_special_fallback if '--special-fallback' in sys.argv else exercise_color_list if '--color-list' in sys.argv else exercise_joint if '--joint-only' in sys.argv else exercise_special_compat if '--special-compat' in sys.argv else exercise_special if '--special-only' in sys.argv else exercise_rich if '--rich-only' in sys.argv else exercise_motion if '--motion-only' in sys.argv else exercise_number if number_only else exercise
        result = await selected(browser, out)
        save(out, 'result.json', result)
        print(json.dumps({'evidence': str(out), 'numberOnly': number_only, 'passed': True}))
    finally:
        try:
            if browser is not None: await browser.stop()
        finally:
            receipt['closed'] = close_owned(owner.pid, started, profile); save(out, 'closed.json', receipt)
            assert receipt['closed']
            owner.wait(timeout=5)
            assert profile.resolve().parent == out and out.is_relative_to(parent)
            assert not any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')])
            shutil.rmtree(profile)
            save(out, 'profile-deleted.json', {'permanentlyDeleted': not profile.exists()})


if __name__ == '__main__': asyncio.run(main())
