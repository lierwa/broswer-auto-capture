"""Native helper cancellation/focus loss must leave the actual owned range untouched."""
import asyncio
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch

ROOT = Path.cwd().resolve()
spec = importlib.util.spec_from_file_location('devices', ROOT/'apps/api/tests/antibot-device.acceptance.py')
devices = importlib.util.module_from_spec(spec)
spec.loader.exec_module(devices)


async def exercise(browser, out):
    from browser_use_runner import native_range
    page = await browser.get_current_page()
    results = []
    for mode in ['cancel', 'focus-change']:
        await page.goto('https://localhost:4185/measurement/inputs')
        await page.evaluate('''() => {
          const node=document.querySelector('input[type=range]');node.min='0';node.max='1';node.step='any';
          globalThis.__rangeEvents=[];
          for(const type of ['input','change'])node.addEventListener(type,e=>__rangeEvents.push({type,trusted:e.isTrusted}));
        }''')
        element = (await page.get_elements_by_css_selector('input[type=range]'))[0]
        object_id = await element._get_remote_object_id()
        node = (await page._client.send.DOM.describeNode(params={'objectId': object_id}, session_id=page._session_id))['node']
        old = await page.evaluate('() => document.querySelector("input[type=range]").value')
        original_focus, original_spawn = native_range._focused, asyncio.create_subprocess_exec
        ready, helpers, calls = asyncio.Event(), [], 0

        async def focus(*args):
            nonlocal calls
            calls += 1
            if calls == 2:
                ready.set()
                if mode == 'cancel': await asyncio.Future()
                else: await page.evaluate('() => document.querySelector("input[aria-label=controlled]").focus()')
            return await original_focus(*args)

        async def spawn(*args, **kwargs):
            process = await original_spawn(*args, **kwargs)
            helpers.append(process)
            return process

        with patch.object(native_range, '_focused', focus), patch.object(native_range.asyncio, 'create_subprocess_exec', spawn):
            action = asyncio.create_task(native_range.fill_native_range(page, node, '0.12345', object_id))
            try:
                if mode == 'cancel':
                    await asyncio.wait_for(ready.wait(), 10)
                    action.cancel()
                    try: await action
                    except asyncio.CancelledError: pass
                    else: raise AssertionError('native_cancel_swallowed')
                else:
                    try: await action
                    except RuntimeError as error: assert str(error) == 'native_range_target_changed'
                    else: raise AssertionError('native_focus_loss_swallowed')
            finally:
                if not action.done():
                    action.cancel()
                    await asyncio.gather(action, return_exceptions=True)
        actual = json.loads(await page.evaluate('() => ({value:document.querySelector("input[type=range]").value,events:__rangeEvents})'))
        results.append({'mode': mode, 'old': old, 'actual': actual, 'helpersClosed': all(p.returncode is not None for p in helpers)})
        devices.online.save(out, 'native-boundaries.json', results)
        assert helpers and all(p.returncode is not None for p in helpers)
        assert actual['value'] == old and actual['events'] == []
    devices.online.save(out, 'passed.json', {'cases': len(results), 'nativeDispatches': 0, 'helpersClosed': True})


if __name__ == '__main__':
    devices.exercise = exercise
    asyncio.run(devices.main())
