// Real product host and saved daily-browser authorization; the owned Chrome below is UI-only.
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, writeFile, lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { Cdp, devtoolsPort, evaluate, waitDom, waitExit, pause, launchChrome } from './minimum-product-loop-workbench.js';
import { productBrowserBoundary, assertProductBrowserUnchanged } from './helpers/product-browser-boundary.js';

const root = process.cwd(), parent = path.join(root, 'work/bsk-removal-20261012');
const base = 'http://127.0.0.1:4173', api = 'http://127.0.0.1:4175';
const json = async url => {
  const response = await fetch(url, { headers: { origin: api, 'sec-fetch-site': 'same-origin' } });
  if (!response.ok) throw Error('product_http_' + response.status + ':' + new URL(url).pathname);
  return response.json();
};
async function boundary() {
  const [health, environment, daily] = await Promise.all([
    json(api + '/api/health'), json(api + '/api/browser-environment'), json(api + '/api/browser/daily-chrome'),
  ]);
  return productBrowserBoundary(root, { health, environment, daily });
}

// WHY：先验产品身份，错误即停止；没有重写环境、复制凭据、替换 Profile 或自行配对的后备路径。
const before = await boundary();
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(path.join(parent, 'product-mainflow-'));
const profile = path.join(directory, 'workbench-ui-only');
const proof = { directory, data: path.join(root, 'data'), profile, base, api, before,
  taskBrowser: 'existing-product-daily-extension', uiBrowser: 'isolated-headless-without-extension',
  taskBrowserLaunchedByFixture: false, personalProfileModified: false };
let child, browser, page;
try {
  await mkdir(profile);
  child = launchChrome(profile, process.env.BAT_ACCEPTANCE_BROWSER_EXECUTABLE
    ?? path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'));
  const port = await devtoolsPort(profile);
  browser = await Cdp.connect((await json('http://127.0.0.1:' + port + '/json/version')).webSocketDebuggerUrl);
  const targets = await json('http://127.0.0.1:' + port + '/json/list');
  const target = targets.find(t => t.type === 'page');
  assert.ok(target, 'workbench_ui_target_missing');
  page = await Cdp.connect(target.webSocketDebuggerUrl);
  await page.send('Page.navigate', { url: base });
  await waitDom(page, 'document.querySelector(".new-task")&&!document.querySelector(".new-task").disabled');
  assert.equal(await evaluate(page, 'location.origin'), base);
  assertProductBrowserUnchanged(before, await boundary());
  Object.assign(proof, { uiChromePid: child.pid, chromePort: port, pageSocket: target.webSocketDebuggerUrl, ready: true });
  await writeFile(path.join(directory, 'host.json'), JSON.stringify(proof, null, 2));
  console.log('READY ' + directory);
  while (!await access(path.join(directory, 'stop')).then(() => true, () => false)) await pause(500);
  proof.after = await boundary();
  assertProductBrowserUnchanged(before, proof.after);
} catch (error) {
  proof.failure = String(error); console.error(proof.failure); process.exitCode = 1;
} finally {
  // Only this isolated UI browser is closed. Task windows remain under the product's owner/lease cleanup.
  if (browser) await browser.send('Browser.close').catch(() => {});
  page?.close(); browser?.close();
  if (child) await waitExit(child);
  assert.equal(path.dirname(profile), directory);
  const state = await lstat(profile).catch(() => undefined);
  if (state) { assert.equal(state.isSymbolicLink(), false); await rm(profile, { recursive: true, maxRetries: 5, retryDelay: 200 }); }
  proof.closed = true; proof.uiProfilePermanentlyDeleted = true;
  await writeFile(path.join(directory, 'host-cleanup.json'), JSON.stringify(proof, null, 2));
}
