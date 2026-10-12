// Explicit live acceptance: all Chrome/profile/authorization state belongs to this fixture.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import Fastify from 'fastify';
import { DailyChromeExtension } from '../src/browser/daily-extension.ts';
import { mountDailyChromeExtension } from '../src/browser/daily-extension-routes.ts';
import { mountDailyChromeBackground } from '../src/browser/daily-extension-background.ts';
import { Cdp, devtoolsPort, evaluate, waitDom, waitExit, pause } from './minimum-product-loop-workbench.js';

const root = process.cwd(), parent = path.join(root, 'work/bsk-removal-20261012');
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(path.join(parent, 'connection-live-'));
const local = path.join(directory, 'chrome-owned'), profile = path.join(local, 'Google/Chrome/User Data');
const hostData = path.join(directory, 'host-owned');
const executable = path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe');
let app, manager, child, browser, worker, popup, port = 0, chromePort, extensionId, phase = 'start';
const clients = [], proof = { directory, phases: [], personalChromeTouched: false };
async function until(predicate, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() >= end) throw Error('fixture_wait_timeout:' + phase); await pause(100); }
}
async function host() {
  manager = new DailyChromeExtension(root, hostData, () => {}, process.platform, undefined,
    { ...process.env, PROGRAMFILES: process.env.PROGRAMFILES, LOCALAPPDATA: local });
  // Headless's new Local State lacks desktop profile.info_cache; only this explicitly owned fixture profile exists.
  manager.profiles = async () => [{ id: 'Default', name: 'Owned compatibility fixture' }];
  app = Fastify();
  const close = await mountDailyChromeBackground(app, manager);
  mountDailyChromeExtension(app, manager, () => {});
  app.get('/', () => '<title>Owned connection acceptance</title>Local fixture');
  app.addHook('preClose', async () => { manager.close(); await close(); });
  await app.listen({ host: '127.0.0.1', port });
  port = app.server.address().port;
}
async function connect(url) { const client = await Cdp.connect(url); clients.push(client); return client; }
async function entries() { return fetch(`http://127.0.0.1:${chromePort}/json/list`).then(r => r.json()); }
async function findTarget(predicate) {
  let target;
  await until(async () => Boolean(target = (await entries()).find(predicate)), 10_000);
  return target;
}
async function attachWorker() {
  const target = await findTarget(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://' + extensionId));
  worker = await connect(target.webSocketDebuggerUrl);
  await worker.send('Runtime.enable');
  await worker.send('Runtime.runIfWaitingForDebugger');
  await waitDom(worker, 'typeof chrome!=="undefined" && Boolean(chrome.storage?.local)', 8000);
}
async function chrome(first = false, inspectPaused = false) {
  await mkdir(profile, { recursive: true });
  // Remove only stale owned debugging-port receipt, otherwise a cold launch may read the old port.
  await rm(path.join(profile, 'DevToolsActivePort')).catch(e => { if (e.code !== 'ENOENT') throw e; });
  child = spawn(executable, [...(first ? ['--headless=new'] : []), '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--enable-unsafe-extension-debugging', '--user-data-dir=' + profile,
    ...(first ? [`http://127.0.0.1:${port}/`] : ['--no-startup-window'])], { windowsHide: true, stdio: 'ignore' });
  chromePort = await devtoolsPort(profile);
  const info = await fetch(`http://127.0.0.1:${chromePort}/json/version`).then(r => r.json());
  browser = await connect(info.webSocketDebuggerUrl);
  // Chromium deliberately removes INSTALLED_VIA_CDP registrations at startup. Reinstall this
  // fixture extension without changing its stored authorization/pause state. Desktop unpacked
  // installation persistence is outside this CDP fixture's evidence boundary.
  extensionId = (await browser.send('Extensions.loadUnpacked', { path: path.join(root, 'work/daily-chrome-extension/extension') })).id;
  assert.equal(extensionId, await manager.extensionIdentity());
  if (inspectPaused) await browser.send('Target.createTarget', { url: `chrome-extension://${extensionId}/status.html` });
  await attachWorker();
}
async function openPopup() {
  await evaluate(worker, 'void chrome.action.openPopup();true');
  const target = await findTarget(t => t.url === `chrome-extension://${extensionId}/status.html`);
  popup = await connect(target.webSocketDebuggerUrl);
  await waitDom(popup, 'Boolean(document.querySelector(".bat-switch"))', 8000);
}
async function toggle(enabled) {
  await waitDom(popup, '!document.querySelector(".bat-switch").disabled', 8000);
  const state = await evaluate(popup, 'document.querySelector(".bat-switch").getAttribute("aria-checked")');
  if (state !== String(enabled)) {
    const point = await evaluate(popup, '(()=>{const r=document.querySelector(".bat-switch").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await popup.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await popup.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  }
  await waitDom(popup, `document.querySelector('.bat-switch').getAttribute('aria-checked')==='${enabled}'`, 8000);
}
async function stopChrome() {
  if (browser) await browser.send('Browser.close').catch(() => {});
  for (const client of clients.splice(0)) client.close();
  if (child) await waitExit(child);
  browser = worker = popup = undefined;
}
async function pageIds() { return (await evaluate(worker, '(async()=>(await chrome.tabs.query({})).map(tab=>tab.id))()')).sort(); }
try {
  await host(); await chrome(true);
  phase = 'first-authorization';
  await evaluate(worker, `(async()=>{await chrome.storage.local.set({'bat-workbench-origin':'http://127.0.0.1:${port}'});return true})()`);
  const before = await pageIds();
  let pairingError;
  const pairing = manager.pair({ profileDirectory: 'Default' }).then(value => ({ value }), error => { pairingError = error; return { error }; });
  await until(async () => { if (pairingError) throw pairingError; return Boolean((await manager.snapshot()).popupRequest); }, 8000);
  assert.equal((await manager.snapshot()).paired, false);
  await openPopup(); await toggle(true);
  const paired = await pairing; if (paired.error) throw paired.error;
  assert.equal(paired.value.paired, true);
  assert.equal((await manager.snapshot()).connected, true);
  assert.deepEqual(await pageIds(), before);
  proof.phases.push({ phase, passed: true, createdTabs: 0 });
  if (!process.argv.includes('--pause-only')) {
  phase = 'disconnect-reconnect';
  await manager.disconnect();
  await until(async () => (await manager.snapshot()).connected);
  assert.deepEqual(await pageIds(), before);
  proof.phases.push({ phase, passed: true, createdTabs: 0 });
  phase = 'host-restart';
  await app.close(); await host();
  await until(async () => (await manager.snapshot()).connected);
  assert.deepEqual(await pageIds(), before);
  proof.phases.push({ phase, passed: true, createdTabs: 0 });
  }
  phase = 'pause-browser-restart';
  await openPopup(); await toggle(false);
  await until(async () => !(await manager.snapshot()).connected);
  proof.phases.push({ phase: 'paused', passed: true });
  await stopChrome(); phase = 'paused-cold-worker-discovery'; await chrome(false, true);
  assert.equal(await evaluate(worker, '(async()=>(await chrome.storage.local.get("bat-connection-enabled"))["bat-connection-enabled"])()'), false);
  assert.equal((await manager.snapshot()).paired, true);
  assert.equal((await manager.snapshot()).connected, false);
  proof.phases.push({ phase, passed: true });
  phase = 'resume-and-cold-start';
  // A native popup needs an active owned tab; use the fixture page, then close it before the cold start.
  await browser.send('Target.createTarget', { url: `http://127.0.0.1:${port}/` });
  await openPopup(); await toggle(true);
  await until(async () => (await manager.snapshot()).connected);
  await stopChrome(); await chrome();
  await until(async () => (await manager.snapshot()).connected);
  assert.equal((await pageIds()).length, 0);
  proof.phases.push({ phase, passed: true, createdTabs: 0 });
  phase = 'revoke';
  await manager.revoke();
  assert.equal((await manager.snapshot()).paired, false);
  assert.equal((await manager.snapshot()).connected, false);
  proof.phases.push({ phase, passed: true });
  proof.passed = true;
} catch (error) {
  proof.passed = false; proof.failure = { phase, reason: String(error) }; process.exitCode = 1;
  proof.targets = await entries().then(items => items.map(item => ({ type: item.type,
    location: new URL(item.url || 'about:blank').origin + new URL(item.url || 'about:blank').pathname }))).catch(() => []);
} finally {
  if (app) await app.close();
  await stopChrome();
  for (const target of [local, hostData]) {
    if (path.dirname(target) !== directory || (await lstat(target).catch(() => null))?.isSymbolicLink()) throw Error('cleanup_owner_mismatch');
    await rm(target, { recursive: true, maxRetries: 10, retryDelay: 100 }).catch(e => { if (e.code !== 'ENOENT') throw e; });
  }
  proof.cleanup = { browserExited: child?.exitCode !== null, hostClosed: true, profileAndCredentialsPermanentlyDeleted: true };
  await writeFile(path.join(directory, proof.passed ? 'passed.json' : 'first-failure.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
}
