export function fixturePage(round: number) {
  const numbers = round === 1 ? [4, 7, 2] : round === 2 ? [11, 4, 7] : [2, 13, 7]
  const rows = [...numbers.map(n => ({ n, available: true })), { n: 99, available: false }]
  if (round === 2) rows.reverse()
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>B-A-T 本地操作对照</title>
  <link rel="icon" href="data:,"><style>
  body{font:20px/1.6 system-ui,sans-serif;background:#f3f5f7;color:#182532;margin:60px auto;max-width:760px;padding:24px}
  main{padding:32px;background:white;border-radius:16px}h1{font-size:28px}button{display:block;width:100%;padding:16px;margin:12px 0;text-align:left;font-size:20px;border:1px solid #ccd4dc;border-radius:8px;background:white;cursor:pointer}
  button:hover{background:#edf4fb}#status{padding:16px;background:#eef3f7;border-radius:8px}small{color:#526272}</style>
  <main><small>本机测试 · 虚构资料 · 第 ${round} / 3 轮</small><h1>请打开版本号最大的已发布资料</h1>
  <p>只需点击一个选项。“预告未发布”不算已发布。点击后请等待采集完成。</p>
  <section>${rows.map(row => `<button data-version="${row.n}" data-available="${row.available}">资料版本 ${row.n} · ${row.available ? "已发布" : "预告未发布"}</button>`).join("")}</section>
  <p id="status">等待操作</p><small>无需登录，不会访问购物网站。窗口会在本轮结束后自动关闭。</small></main>
  <script type="module" src="/client.js"></script></html>`
}

export const clientScript = `
const base = location.pathname, status = document.querySelector('#status');
let started = false, chosen = false;
const post = (suffix, body) => fetch(base + suffix, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
addEventListener('securitypolicyviolation', e => post('/violation', {directive:e.effectiveDirective}));
for (const button of document.querySelectorAll('button')) button.addEventListener('click', async event => {
  if (chosen || started) return;
  chosen = true;
  await post('/action', {version:Number(button.dataset.version),trusted:event.isTrusted});
  status.textContent = '已选择，正在采集，请稍候…';
});
async function collect() {
  started = true;
  status.textContent = '正在采集本机检测结果，请稍候…';
  const start = performance.now();
  let timer;
  let result;
  try {
    result = await Promise.race([
      (async () => {const {default: Scanner} = await import('/probe.js');
        return {status:'observed', fingerprint:await new Scanner().collectFingerprint({encrypt:false}), elapsedMs:performance.now()-start};})(),
      new Promise(resolve => {timer=setTimeout(() => resolve({status:'unavailable',reason:'probe_timeout'}),15000);})
    ]);
  } catch { result = {status:'invalid',reason:'probe_error'}; }
  finally { clearTimeout(timer); }
  const response = await post('/result', result);
  status.textContent = response.ok ? '本轮已保存。请等待下一轮窗口；第三轮结束后即可回到聊天。' : '保存失败，请回到聊天告知。';
}
async function poll() {
  if (started) return;
  try {const gate = await (await fetch(base+'/gate')).json(); if (gate.collect) return collect();} catch {}
  setTimeout(poll, 250);
}
poll();
`
