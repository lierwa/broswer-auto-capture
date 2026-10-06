"""Built product UI + SQLite fixture API; browser identity is covered separately by native gates."""
import asyncio,json,sys,os
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path.cwd()/os.environ.get('BAT_ACCOUNT_EVIDENCE_DIR','work/account-unified-20261003'); proof={'passed':False,'personalProfileTouched':False,'screenshots':[],'steps':[]}

async def layout(page,name):
 await page.wait_for_timeout(200)
 result=await page.evaluate('''()=>{const e=document.querySelector('[role=dialog]'),r=e.getBoundingClientRect();return {noDialogScroll:e.scrollHeight<=e.clientHeight+2,noHorizontalScroll:e.scrollWidth<=e.clientWidth+2,fitsViewport:r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth,width:r.width,height:r.height}}''')
 file=OUT/f'ui-{name}.png';await page.screenshot(path=str(file));proof['screenshots'].append(str(file));proof[name]=result
 assert all(result[k] for k in ('noDialogScroll','noHorizontalScroll','fitsViewport')),result

async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
  try:
   page=await browser.new_page(viewport={'width':1280,'height':800});errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   # Layout fixture only: actual authorization handshake is covered by the relay gates.
   await page.route('**/api/browser/daily-chrome',lambda route:route.fulfill(json={
    'paired':True,'busy':False,'connected':False,'profileDirectory':'Default',
    'extensionDirectory':'Owned fixture extension','profiles':[{'id':'Default','name':'测试 Chrome'}]}))
   async def fixture(**values):await page.request.post('http://127.0.0.1:4199/',data=values)
   async def settled():
    async with asyncio.timeout(30):
     while True:
      value=await page.evaluate('async()=>await (await fetch("/api/browser/account-directory")).json()')
      if not value['operation'] or value['operation']['status']!='running':return value
      await asyncio.sleep(.2)
   async def open_dialog():
    await page.get_by_role('button',name='浏览器设置',exact=True).click();await page.get_by_role('button',name='管理账号',exact=True).click()
    await page.locator('.platform-option').first.wait_for()
   await page.goto('http://127.0.0.1:4198/')
   await page.get_by_role('button',name='浏览器设置',exact=True).click()
   await page.get_by_text('已授权',exact=True).wait_for();await layout(page,'settings-dark')
   bounds=await page.locator('.browser-environment-choices [role=radio]').evaluate_all('els=>els.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y}))')
   assert len(bounds)==2 and abs(bounds[0]['y']-bounds[1]['y'])<2 and bounds[1]['x']>bounds[0]['x'],bounds
   assert proof['settings-dark']['height']<470,proof['settings-dark']
   await page.set_viewport_size({'width':390,'height':844});await layout(page,'settings-narrow')
   await page.set_viewport_size({'width':1280,'height':800})
   await page.get_by_role('button',name='管理账号',exact=True).click()
   await page.locator('.platform-option').first.wait_for()
   assert await page.locator('.platform-option').count()==13
   assert await page.get_by_role('dialog').count()==1
   for text in ('日常 Chrome','专属浏览器','查看检查记录','共享到','下一次运行'):
    assert text not in await page.get_by_role('dialog').inner_text(),text
   await layout(page,'desktop-dark')
   await page.get_by_role('button',name='检查并登录',exact=True).click();state=await settled()
   assert state['items'][0]['account']['state']=='ready',state['operation']
   await page.get_by_text('Synthetic A',exact=True).wait_for();await layout(page,'ready')
   assert await page.get_by_role('button',name='打开网站',exact=True).count()==0
   await page.get_by_role('button',name='检查登录',exact=True).click();await settled()
   await fixture(daily='unknown');await page.get_by_role('button',name='检查登录',exact=True).click();await settled()
   await page.get_by_text('暂时无法连接网站',exact=True).wait_for();await layout(page,'error')
   assert await page.get_by_role('button',name='检查登录',exact=True).count()==1
   assert await page.locator('.feedback-slot button').count()==0
   await fixture(daily='A');await page.get_by_role('button',name='检查登录',exact=True).click();await settled()
   await fixture(daily='none');await page.get_by_role('button',name='检查登录',exact=True).click();await settled()
   assert await page.get_by_text('需登录',exact=True).count()==1
   assert await page.get_by_role('button',name='打开网站',exact=True).count()==0
   assert await page.get_by_role('button',name='检查登录',exact=True).count()==0
   assert await page.get_by_role('button',name='去登录',exact=True).count()==1
   await fixture(daily='A');await page.get_by_role('button',name='去登录',exact=True).click();await settled()
   await page.get_by_role('button',name='更多账号操作',exact=True).click();await page.get_by_role('menuitem',name='移除账号',exact=True).click()
   await layout(page,'remove');assert await page.get_by_role('dialog').count()==1
   await page.get_by_role('button',name='取消',exact=True).click()
   await fixture(gate=True);await page.get_by_role('button',name='更多账号操作',exact=True).click();await page.get_by_role('menuitem',name='切换账号',exact=True).click()
   await page.get_by_role('button',name='取消',exact=True).wait_for();await layout(page,'waiting')
   await page.get_by_role('button',name='取消',exact=True).click();await settled();await fixture(gate=False)
   await fixture(longName=True);await page.wait_for_timeout(900);await layout(page,'long-name')
   await page.get_by_role('button',name='关闭网站账号',exact=True).click();await page.get_by_role('button',name='切换为浅色主题',exact=True).click();await open_dialog();await layout(page,'desktop-light')
   await page.set_viewport_size({'width':390,'height':844});await layout(page,'narrow-platforms')
   await page.locator('.platform-option').first.click();await layout(page,'narrow-account')
   await page.get_by_role('button',name='返回平台选择',exact=True).click()
   await page.set_viewport_size({'width':390,'height':480});await layout(page,'narrow-short')
   assert await page.locator('.platform-option').count()==6
   await page.get_by_role('button',name='下一页平台',exact=True).click();await page.get_by_role('button',name='上一页平台',exact=True).click()
   await page.set_viewport_size({'width':1024,'height':480});await layout(page,'short-screen')
   await page.get_by_role('textbox',name='搜索平台',exact=True).fill('知乎');assert await page.locator('.platform-option').count()==1
   await page.get_by_role('textbox',name='搜索平台',exact=True).fill('')
   await page.get_by_role('button',name='其他网站',exact=True).click()
   assert await page.locator('.platform-option.selected').count()==0
   assert await page.get_by_role('button',name='其他网站',exact=True).get_attribute('aria-pressed')=='true'
   await page.get_by_role('button',name='打开网站窗口',exact=True).click();await settled()
   await page.get_by_role('button',name='读取当前页面',exact=True).click();await settled();await page.get_by_role('button',name='选择登录标识',exact=True).wait_for()
   await page.get_by_role('button',name='使用此方法',exact=True).wait_for();await layout(page,'custom-short')
   await page.get_by_role('button',name='使用此方法',exact=True).click();await settled()
   await page.get_by_role('button',name='检查并添加账号',exact=True).click();await settled()
   await page.get_by_text('Synthetic B',exact=True).wait_for();await layout(page,'custom-saved-short')
   await page.get_by_role('button',name='更多账号操作',exact=True).click();await page.get_by_role('menuitem',name='移除账号',exact=True).click()
   await page.get_by_role('button',name='移除账号',exact=True).click();await settled();assert await page.get_by_text('检查此网站的登录状态',exact=True).count()==1
   proof['steps'].append('compact settings, 13 catalog, check/login/error/retry/remove-cancel/custom read/search/pagination, one Dialog')
   assert not errors,errors;proof['pageErrors']=errors;proof['passed']=True
  finally:await browser.close()

if __name__=='__main__':
 try:asyncio.run(main())
 finally:(OUT/'ui-validation.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
