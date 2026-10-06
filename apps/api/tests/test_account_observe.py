"""Own Windows Chrome: source observation cannot change URL, input or focus."""
import asyncio, json, os, sys, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import httpx
from playwright.async_api import async_playwright

ROOT=Path.cwd().resolve(); sys.path.insert(0,str(ROOT/'apps/api/python'))
from browser_use_runner.account_session import catalog,module_from
from browser_use_runner.account_borrow import CheckPage
OUTPUT=ROOT/'work/account-unified-20261003'; proof={'passed':False,'personalProfileTouched':False,'modelCalls':0,'cases':[]}

class Observe(unittest.IsolatedAsyncioTestCase):
 async def test_native_sources_preserve_login_input(self):
  data,file=catalog(); module=module_from(file)
  async with async_playwright() as pw:
   browser=await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
   try:
    page=await browser.new_page(); page.set_default_timeout(1500)
    async def cookies(_urls):return []
    borrowed=SimpleNamespace(page=page,cookies=cookies)
    for key in ('bilibili','douyin'):
     platform=next(p for p in data['platforms'] if p['id']==key)
     async def route(route):await route.fulfill(status=200,content_type='text/html; charset=utf-8',body='<input id="typing" value="owned"><div class="progress-div"><input class="upload-btn-input-owned" type="file"></div>')
     await page.route('**/*',route); await page.goto(platform['url'])
     await page.locator('#typing').fill('owned input in progress'); await page.locator('#typing').focus()
     before=await page.evaluate('()=>({url:location.href,value:document.querySelector("#typing").value,focus:document.activeElement.id})')
     native=httpx.AsyncClient
     def factory(*args,**kwargs):return native(*args,**kwargs,transport=httpx.MockTransport(lambda req:httpx.Response(200,json={'code':0,'data':{'isLogin':True,'mid':12345,'uname':'Owned fixture'}})))
     with patch('httpx.AsyncClient',factory): result=await module.check(platform,borrowed,observe=True)
     after=await page.evaluate('()=>({url:location.href,value:document.querySelector("#typing").value,focus:document.activeElement.id})')
     self.assertEqual(before,after); self.assertEqual(result['status'],'authenticated',result)
     self.assertEqual(result['modelCalls'],0); self.assertTrue(result['sources'])
     if key=='douyin':self.assertIn('navigation_suppressed',result['evidence'])
     observations={'observe':True,'errors':[]}
     facade=CheckPage(borrowed,platform['origins'],observations)
     for mutation in ('click','fill','focus'):
      with self.assertRaises(ValueError):getattr(facade.locator('#typing'),mutation)
     proof['cases'].append({'platform':key,'status':result['status'],'unchangedUrlInputFocus':True,'sourceReceipts':result['sources'],'evidence':result['evidence']})
     await page.unroute('**/*')
    proof['passed']=True
   finally:await browser.close()

if __name__=='__main__':
 try:unittest.main()
 finally:(OUTPUT/'observe-windows.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
