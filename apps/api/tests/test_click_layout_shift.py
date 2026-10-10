"""A moving layout must not turn one semantic click into a click at obsolete coordinates."""
import json
import unittest

import test_antibot_event_capture as fixture
from browser_use_runner.runtime_diagnostics import pointer_counts
from workflow_use.hybrid.capability import OrdinaryCapability


SHIFT = """() => {
  const button = document.querySelector('#choose');
  button.style.cssText = 'position:absolute;left:40px;top:100px;width:100px;height:40px';
  globalThis.ownedShift = {moved:false,clicks:[]};
  document.addEventListener('mousemove', event => {
    if (!event.isTrusted || ownedShift.moved) return;
    ownedShift.moved = true;
    button.style.left = '340px';
  }, {capture:true,once:true});
  window.addEventListener('click', event => ownedShift.clicks.push({
    intended:event.target === button, trusted:event.isTrusted, x:event.clientX,y:event.clientY}),true);
}"""
READ = """() => { const target = document.querySelector('#choose'), rect=target.getBoundingClientRect();
  return {...ownedShift, completed:target.dataset.done === 'yes', rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
}"""


class ClickLayoutShiftTest(fixture.CaptureIsolationTest):
    async def exercise(self, browser, capture, url):
        page = await browser.get_current_page()
        rows = []
        for mode in ['actor', 'ordinary']:
            await page.goto(url + '?' + mode)
            await page.evaluate(SHIFT)
            target = (await page.get_elements_by_css_selector('#choose'))[0]
            row = {'mode':mode, 'before':json.loads(await page.evaluate(READ)), 'dispatchBefore':pointer_counts(browser)}
            try:
                if mode == 'actor':
                    await capture.arm('click', element=target)
                    await target.click()
                    result = await capture.complete()
                    row['capture'] = {'status':result['status'], 'events':len(result['events']),
                                      'relations':[event['graph']['intentRelation'] for event in result['events']]}
                else:
                    capability = OrdinaryCapability(browser)
                    capability.event_capture = capture
                    await capability.execute_checked('click', {}, {'strategy':'css','value':'#choose'}, [])
            except Exception as error:
                row['errorType'] = type(error).__name__
                row['capture'] = getattr(error, 'event_capture', None)
            row.update(after=json.loads(await page.evaluate(READ)), dispatchAfter=pointer_counts(browser))
            rows.append(row)
            fixture.save(self.evidence_directory, 'click-layout-shift.json', rows)
        self.assertTrue(all(row['after']['moved'] for row in rows))
        self.assertTrue(all(row['after']['completed'] for row in rows), 'click_used_obsolete_coordinates')
        for row in rows:
            self.assertEqual(row['after']['clicks'], [{'intended':True,'trusted':True,'x':390,'y':120}])
        await page.goto(url)
        return await super().exercise(browser, capture, url)


if __name__ == '__main__':
    unittest.main()
