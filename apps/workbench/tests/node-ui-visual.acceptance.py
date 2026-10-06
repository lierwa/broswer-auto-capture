"""Focused headless regression: final CSS, real node identity and read-only live UI."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright


async def check_nodes(page):
    geometry = await page.locator('.react-flow__node').evaluate_all('''es=>es.map(e=>{
      const card=e.querySelector('.chain-stage-card, .chain-terminal-card'), r=e.getBoundingClientRect(), scale=r.width/e.offsetWidth;
      const title=card.querySelector('.chain-stage-title, strong'), s=getComputedStyle(card), t=getComputedStyle(title);
      return {id:e.dataset.id, terminal:card.classList.contains('chain-terminal-card'), height:r.height/scale,
        font:t.fontSize, weight:t.fontWeight, background:s.backgroundColor, radius:s.borderRadius,
        ports:[...card.querySelectorAll('.react-flow__handle')].map(p=>{
          const h=p.getBoundingClientRect();return (h.y+h.height/2-r.y)/scale})};
    })''')
    stage = next(node for node in geometry if not node['terminal'])
    for node in geometry:
        assert all(abs(port - 27) < .6 for port in node['ports']), node
        if node['terminal']:
            assert abs(node['height'] - 54) < .6, node
            for key in ('font', 'weight', 'background', 'radius'):
                assert node[key] == stage[key], (key, node, stage)
    return geometry


async def check_live(context, out):
    page = await context.new_page()
    await page.set_viewport_size({'width':1400, 'height':850})
    await page.goto('http://127.0.0.1:4173/')
    await page.locator('.task-list').wait_for()
    target = page.locator('.task-list').get_by_text('读取京东收藏商品', exact=True)
    assert await target.count(), 'existing_user_task_not_found'
    await target.first.click()
    await page.get_by_role('tab', name='链路', exact=True).click()
    await page.locator('.chain-stage-card').first.wait_for()
    fit = page.locator('.react-flow__controls-fitview')
    if await fit.count(): await fit.click()
    await page.wait_for_timeout(400)
    geometry = await check_nodes(page)
    names = await page.locator('.chain-action-select .chain-action-name').all_text_contents()
    assert len(names) == 8, names
    icons = await page.locator('.chain-action-select .chain-node-type-icon').evaluate_all('''es=>es.map(e=>({
      kind:e.dataset.kind,capability:e.dataset.capability,type:e.title,svg:e.querySelector('svg').getAttribute('class')}))''')
    assert len(icons) == len(names) and all(icon['type'] for icon in icons), icons
    for icon in icons:
        if icon['kind'] == 'function': assert 'lucide-braces' in icon['svg'], icon
        if icon.get('capability') == 'browser.workflow-step': assert 'lucide-app-window' in icon['svg'], icon
        if icon.get('capability') == 'browser.read-fields': assert 'lucide-scan-text' in icon['svg'], icon
    bounds = await page.locator('.react-flow__node').evaluate_all('''es=>{
      const rs=es.map(e=>e.getBoundingClientRect()), x=Math.min(...rs.map(r=>r.x))-24,y=Math.min(...rs.map(r=>r.y))-24;
      return {x,y,width:Math.max(...rs.map(r=>r.right))-x+24,height:Math.max(...rs.map(r=>r.bottom))-y+24};}''')
    await page.screenshot(path=str(out / 'live-nodes-dark.png'), clip=bounds, animations='disabled')
    await page.screenshot(path=str(out / 'live-workbench-dark.png'), animations='disabled')
    return {'geometry':geometry, 'childRows':len(names), 'types':icons}


async def main():
    root = Path.cwd()
    out = root / 'work/node-branch-spacing-20261005'
    out.mkdir(parents=True, exist_ok=True)
    evidence = root / 'work/chain-control-integration-20261004/natural-control.json'
    url = 'http://127.0.0.1:4180/tests/fixtures/control-screen.html?evidence=/@fs/' + evidence.as_posix()
    proof = {'headless':True, 'isolatedProfile':True, 'writes':[], 'errors':[], 'passed':False}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        context = await browser.new_context(viewport={'width':820, 'height':780}, color_scheme='dark')
        async def read_only(route):
            if route.request.method not in ('GET', 'HEAD', 'OPTIONS'):
                proof['writes'].append(route.request.method)
                await route.abort('blockedbyclient')
            else:
                await route.continue_()
        await context.route('**/api/**', read_only)
        context.on('page', lambda page: page.on('pageerror', lambda error: proof['errors'].append(str(error))))
        page = await context.new_page()
        try:
            await page.goto(url + '&long=1')
            await page.locator('.chain-loop-body').wait_for()
            await page.evaluate('document.fonts.ready')
            stage = page.locator('.chain-stage-card')
            names = await stage.locator('.chain-action-name, .chain-loop-heading strong').evaluate_all('''es=>es.map(e=>{
              const s=getComputedStyle(e);return {text:e.textContent,title:e.title,clamp:s.webkitLineClamp,
                height:e.getBoundingClientRect().height,lineHeight:parseFloat(s.lineHeight),scroll:e.scrollWidth,width:e.clientWidth,
                whitespace:s.whiteSpace,ellipsis:s.textOverflow};})''')
            assert len(names) >= 5, names
            assert all(n['clamp'] == '1' and n['height'] <= n['lineHeight']+.6
                       and n['whitespace'] == 'nowrap' and n['ellipsis'] == 'ellipsis' for n in names), names
            assert all(n['scroll'] > n['width']+1 and len(n['title']) > 100 for n in names), names
            source = json.loads(evidence.read_text(encoding='utf-8'))
            originals = {node['id']:node for node in source['chain']['nodes']}
            types = await stage.locator('button[data-node-id], button[data-target-id]').evaluate_all('''es=>es.map(e=>{
              const icon=e.querySelector('.chain-node-type-icon');return {id:e.dataset.nodeId||e.dataset.targetId,
                kind:icon?.dataset.kind,capability:icon?.dataset.capability,type:icon?.title};})''')
            for row in types:
                original = originals[row['id']]
                assert row['kind'] == original['kind'] and row['type'], row
                assert row.get('capability') == original.get('capability', {}).get('name'), row
            assert await stage.locator('.chain-loop-heading small').count() == 0
            assert await stage.locator('.chain-node-type-icon').all_text_contents() == ['']*len(types)
            columns = await stage.locator('.chain-status-icon').evaluate_all('es=>es.map(e=>e.getBoundingClientRect().right)')
            assert max(columns)-min(columns) < 2, columns
            routes = await stage.locator('.chain-action-routes > li').evaluate_all('''es=>es.map(e=>{
              const label=e.querySelector('.chain-route-label'),name=e.querySelector('.chain-action-name'),s=getComputedStyle(e);
              return {label:label.getBoundingClientRect().width,target:name.getBoundingClientRect().width,
                height:e.getBoundingClientRect().height,columns:s.gridTemplateColumns,children:e.children.length};})''')
            assert all(row['height'] >= 36 and row['children'] == 2 and abs(row['label']-84)<1 for row in routes), routes
            assert min(row['target'] for row in routes) >= 170, routes
            proof['branchRows'] = routes
            assert await stage.locator('.chain-status-icon[data-tone="running"]').count() == 1
            before = await stage.bounding_box()
            await stage.screenshot(path=str(out / 'one-line-children-dark.png'), animations='disabled')
            for mode in ('下一轮', '已结束'):
                await page.get_by_role('button', name=mode, exact=True).click()
                assert before == await stage.bounding_box(), mode
            await stage.locator('[data-node-id="s-r1"]').click()
            inspector = page.locator('aside[aria-label="动作说明"]')
            await inspector.wait_for()
            assert '根据当前输入读取内容、核对条件并保存本次处理结果。'*6 in await inspector.inner_text()
            await page.get_by_role('button', name='关闭检查器').click()
            await page.get_by_role('button', name='切换主题').click()
            await stage.screenshot(path=str(out / 'one-line-children-light.png'), animations='disabled')
            await page.set_viewport_size({'width':3000, 'height':900})
            await page.goto(url + '&full=1')
            await page.locator('.chain-terminal-card').first.wait_for()
            await page.evaluate('document.fonts.ready')
            proof['fullGraph'] = await check_nodes(page)
            await page.get_by_role('button', name='切换主题').click()
            proof['lightFullGraph'] = await check_nodes(page)
            proof['existingTaskReadOnly'] = await check_live(context, out)
            assert not proof['writes'] and not proof['errors'], proof
            proof.update({'passed':True, 'oneLineEllipsis':True, 'actualTypeIcons':True, 'alignedStatusColumn':True,
                          'noTypeTextTags':True, 'fullNameInspector':True,
                          'completeList':True, 'stableExecutionGeometry':True, 'darkAndLight':True,
                          'compactSharedHeader':True, 'portsAligned':True})
        except Exception:
            await page.screenshot(path=str(out / 'first-failure.png'), animations='disabled')
            raise
        finally:
            await browser.close()
            if not proof['passed'] and not (out / 'first-failure-proof.json').exists():
                (out / 'first-failure-proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2), encoding='utf-8')
            (out / 'visual-proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps({k:v for k,v in proof.items() if k not in ('fullGraph','lightFullGraph')}, ensure_ascii=False))


asyncio.run(main())
