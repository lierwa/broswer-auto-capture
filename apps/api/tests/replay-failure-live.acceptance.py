"""Read-only check of the user's recorded failure; a fresh headless Chrome only."""
import json
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

root = Path.cwd()
out = root / 'work' / 'account-lease-repair-20261004'
task_id = '215b5b90-f588-447c-afa8-6e66e143a2f2'
execution_id = '92aa09d8-5270-4862-877a-47239112b58b'
api = 'http://127.0.0.1:4175'
detail = json.load(urlopen(f'{api}/api/task-chain/execution?taskId={task_id}&executionId={execution_id}'))
assert detail['startupFailure']['code'] == 'hybrid_attached_window_busy'
assert detail['execution']['status'] == 'failed'
assert all(not step['runIds'] for step in detail['execution']['steps'])
accounts = json.load(urlopen(f'{api}/api/browser/accounts'))
current = json.load(urlopen(f'{api}/api/browser/platform-accounts'))['currentIdentityIds']['daily']
# The current grant still resolves to the same account Profile; no Chrome transport is opened here.
import sqlite3
database = sqlite3.connect(f'file:{root / "data/workbench.sqlite"}?mode=ro', uri=True)
maintenance = next(json.loads(body) for body, in database.execute(
    'select body from browserAccountFacts where kind="maintenance"')
    if json.loads(body)['ownerId'] == '97a54079-4099-4977-a2df-3771bd40d266')
database.close()
assert maintenance['status'] == 'closed' and maintenance['browserIdentityId'] == current
assert maintenance['ownerId'] == maintenance['leaseId']
writes = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe', headless=True)
    try:
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        page.on('request', lambda request: writes.append(request.method + ' ' + request.url)
                if '/api/' in request.url and request.method not in ('GET', 'HEAD', 'OPTIONS') else None)
        page.route('**/api/**', lambda route: route.continue_() if route.request.method in ('GET', 'HEAD', 'OPTIONS') else route.abort())
        page.goto('http://127.0.0.1:4173/')
        page.locator('.task-list').wait_for()
        page.get_by_text('读取京东收藏商品', exact=True).first.click()
        page.get_by_role('tab', name='链路', exact=True).click()
        page.get_by_text('此前操作的浏览器窗口租约尚未释放', exact=False).first.wait_for()
        assert '具体的底层错误未记录' not in page.locator('body').inner_text()
        page.screenshot(path=str(out / 'live-replay-reason.png'))
        expect(page.get_by_role('button', name='再次运行', exact=True)).to_be_enabled()
        page.get_by_role('button', name='再次运行', exact=True).click()
        dialog = page.get_by_role('dialog', name='再次运行', exact=True)
        expect(dialog.get_by_role('button', name='开始运行', exact=True)).to_be_enabled()
        dialog.get_by_role('button', name='取消', exact=True).click()
        assert not writes, writes
    finally:
        browser.close()
proof = {'passed': True, 'headless': True, 'recordedCauseReadable': True, 'legacyOwnerEligible': True,
         'originalFailurePreserved': True, 'rerunDialogUsable': True, 'productWrites': writes}
(out / 'live-readonly-proof.json').write_text(json.dumps(proof, indent=2), encoding='utf-8')
print(json.dumps(proof))
