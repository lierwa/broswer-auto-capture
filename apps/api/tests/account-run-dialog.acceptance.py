"""Actual published task UI; failed POST is intercepted, no business task mutated."""
import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path.cwd()/'work/account-user-regressions-20261003'
proof={'passed':False,'serverMutations':[],'interceptedPosts':0,'screenshots':[]}
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
  try:
   page=await browser.new_page(viewport={'width':1280,'height':800})
   page.on('request',lambda r:proof['serverMutations'].append(r.url) if r.method not in ('GET','HEAD','OPTIONS') and '/api/task-chain?' not in r.url else None)
   async def gate(route):
    if route.request.method=='POST':
     proof['interceptedPosts']+=1
     await route.fulfill(status=409,content_type='application/json',body=json.dumps({'error':'受控验证：暂时无法开始运行','code':'account_operation_busy'}))
    else:await route.continue_()
   await page.route('**/api/task-chain?*',gate)
   await page.goto('http://127.0.0.1:4173/')
   if await page.get_by_role('button',name='链路',exact=True).count():await page.get_by_role('button',name='链路',exact=True).click()
   await page.get_by_role('button',name='再次运行',exact=True).click()
   dialog=page.get_by_role('dialog')
   await dialog.get_by_role('button',name='开始运行',exact=True).click()
   await dialog.get_by_role('button',name='重试',exact=True).wait_for()
   assert await page.get_by_text('受控验证：暂时无法开始运行',exact=True).count()==1
   assert await dialog.get_by_role('button',name='重试',exact=True).count()==1
   await dialog.get_by_role('button',name='运行设置',exact=True).click()
   for name,size in [('run-dark',{'width':1280,'height':800}),('run-short',{'width':1024,'height':480}),('run-narrow',{'width':390,'height':650})]:
    await page.set_viewport_size(size)
    await page.wait_for_timeout(200)
    geometry=await dialog.evaluate('e=>{const r=e.getBoundingClientRect();return {noScroll:e.scrollHeight<=e.clientHeight+2,fits:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}}')
    assert all(geometry.values()),geometry
    file=OUT/f'{name}.png';await page.screenshot(path=str(file));proof['screenshots'].append(str(file));proof[name]=geometry
   await dialog.get_by_role('button',name='取消',exact=True).click()
   await page.set_viewport_size({'width':1280,'height':800})
   await page.get_by_role('button',name='切换为浅色主题',exact=True).click()
   await page.get_by_role('button',name='再次运行',exact=True).click()
   await page.wait_for_timeout(250)
   file=OUT/'run-light.png';await page.screenshot(path=str(file));proof['screenshots'].append(str(file))
   assert proof['interceptedPosts']==1
   assert not proof['serverMutations'],proof['serverMutations']
   proof['passed']=True
  finally:await browser.close()
try:asyncio.run(main())
finally:(OUT/'run-dialog.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
