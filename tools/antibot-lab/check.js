import {createMeasurement,acceptReceipt,measurementReport} from './model.js';
import {render,showSignal,toast} from './view.js';
import {initArt} from './art.js';
const $ = selector => document.querySelector(selector);
const state = createMeasurement();
const sample = {scrolled:false,lastTop:0,composing:new Set()};
let submitGeneration = 0;
let reportRequest = null;
function refresh() {render(state.report ?? measurementReport(state),state);updateSampling();}
function failure() {state.failed = true;state.report=null;state.verification={status:'failed'};state.behaviorPhase = 'idle';refresh();}
async function readReport() {
  if (state.failed || !state.runId || reportRequest) return reportRequest;
  const mode=state.mode;
  reportRequest=(async () => {
    const response=await fetch('/measurement/check/report/'+state.runId+'?mode='+mode,{credentials:'same-origin',cache:'no-store'});
    if (!response.ok) throw Error('report_unavailable');
    const report=await response.json();
    if (report.schemaVersion!==3 || report.runId!==state.runId || report.pageId!==state.pageId || report.signals?.length!==39) throw Error('report_invalid');
    if (state.failed || mode!==state.mode) return;
    state.report=report;state.verification=report.verification;state.flow=report.flow;
    if (report.scope==='automatic+interactive' && report.flow) state.behaviorPhase='done';
    refresh();return report;
  })().finally(() => {reportRequest=null;});
  return reportRequest;
}
function restart(interactive = state.mode === 'interactive') {
  const url = new URL('https://localhost:4185/measurement/check');url.search = interactive?'?mode=interactive':'';location.replace(url);
}
function selectMode(mode) {
  if (state.mode === mode) return;
  if (state.behaviorPhase === 'running') {submitGeneration++;state.behaviorPhase = 'idle';}
  state.mode = mode;state.report=null;refresh();void readReport().catch(failure);
}
function updateSampling() {
  const english=($('#sample-english').value.match(/[A-Za-z]/g)??[]).length>=10;
  const chinese=($('#sample-text').value.match(/\p{Script=Han}/gu)??[]).length>=4;
  const keyboard = english && chinese && !sample.composing.size;
  $('#keyboard-feedback').textContent = `英文 ${english?'✓':'待输入'} · 中文 ${chinese?'✓':'待输入'}`+(sample.composing.size?' · 请完成输入法选字':'');
  $('#keyboard-feedback').className = 'sample-feedback '+(keyboard?'ready':'');
  $('#scroll-feedback').textContent = sample.scrolled?'滚动 · 已取得样本':'滚动 · 等待操作';
  $('#scroll-feedback').className = 'sample-feedback '+(sample.scrolled?'ready':'');
  $('#reset-input').hidden = !english && !chinese;
  const automaticPending = (state.report??measurementReport(state)).signals.some(row => row.group < 3 && row.status === 'pending');
  const busy = state.behaviorPhase === 'running';
  $('#submit').disabled = !keyboard || !sample.scrolled || automaticPending || busy || state.failed;
  $('#submit').textContent = busy?'正在检测交互…':'提交并更新结果 →';
  $('#submit-help').textContent = state.failed?'测量连接失败，请重新检测':automaticPending?'等待自动检测结束':busy?'等待本次交互回执':!keyboard?'请完成英文、中文输入':!sample.scrolled?'请滚动阅读区':'可以提交';
}
async function submitInteraction(event) {
  event.preventDefault();if ($('#submit').disabled) return;
  const generation = ++submitGeneration;state.behaviorPhase = 'running';refresh();
  try {
    const collector = globalThis.__batShieldCollector;
    if (collector?.page !== state.pageId) throw Error('collector_unavailable');
    const receipt = await collector.submit();
    if (generation !== submitGeneration) return;
    // WHY：提交完成必须对应本页真实批次；动画、其它批次或固定等待时间不能代替确认。
    if (!receipt || receipt.page !== state.pageId || !state.batches.has(receipt.batch)) throw Error('interaction_receipt_missing');
    await reportRequest;const report=await readReport();
    if (!report?.flow) throw Error('interaction_flow_missing');
    state.behaviorPhase = 'done';refresh();$('#result-stage').scrollIntoView({behavior:'smooth',block:'start'});
  } catch {if (generation === submitGeneration) failure();}
}
document.addEventListener('bat:measurement',event => {if (acceptReceipt(state,event.detail)) void readReport().catch(failure);});
document.addEventListener('bat:measurement-error',event => {if (event.detail?.page === state.pageId) failure();});
$('#restart').addEventListener('click',() => restart());
$('#automatic-tab').addEventListener('click',() => selectMode('automatic'));
$('#interaction-tab').addEventListener('click',() => selectMode('interactive'));
document.querySelectorAll('[role=tab]').forEach(tab => tab.addEventListener('keydown',event => {
  if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault();const mode = tab.id === 'automatic-tab'?'interactive':'automatic';
  $(mode === 'interactive'?'#interaction-tab':'#automatic-tab').focus();selectMode(mode);
}));
$('#next-action').addEventListener('click',() => {
  if (state.failed || state.behaviorPhase === 'done') {restart();return;}
  selectMode('interactive');$('#sample-text').focus({preventScroll:true});$('#interaction-area').scrollIntoView({behavior:'smooth',block:'nearest'});
});
// WHY：采样事实由collector独占；UI只表示输入/选字进度，不维护第二份IME排除器。
for (const field of [$('#sample-english'),$('#sample-text')]) {
  field.addEventListener('input',updateSampling);
  field.addEventListener('compositionstart',() => {sample.composing.add(field);updateSampling();});
  field.addEventListener('compositionend',() => {sample.composing.delete(field);updateSampling();});
}
$('#reading').addEventListener('scroll',event => {
  if ($('#interaction-area').hidden || event.target.scrollTop === sample.lastTop) return;
  sample.lastTop = event.target.scrollTop;sample.scrolled = true;updateSampling();
});
$('#reset-input').addEventListener('click',() => restart(true));
$('#interaction-form').addEventListener('submit',submitInteraction);
$('#skip-interaction').addEventListener('click',() => {selectMode('automatic');$('#result-stage').scrollIntoView({behavior:'smooth'});});
$('#report-rows').addEventListener('click',event => {
  const item = event.target.closest('[data-detail]');
  if (item) showSignal((state.report??measurementReport(state)).signals.find(row => row.key === item.dataset.detail));
});
$('#dialog-close').addEventListener('click',() => $('#signal-dialog').close());
$('#export').addEventListener('click',() => {
  const report = state.report??measurementReport(state),url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const link = document.createElement('a');link.href = url;link.download = 'shield-'+report.runId+'.json';link.click();setTimeout(() => URL.revokeObjectURL(url),1000);
});
$('#copy-json').addEventListener('click',async () => {
  try {await navigator.clipboard.writeText($('#shield-report').textContent);toast('报告已复制');}
  catch {toast('浏览器未允许复制，请使用导出报告');}
});
async function start() {
  initArt();state.mode = new URL(location.href).searchParams.get('mode') === 'interactive'?'interactive':'automatic';refresh();
  try {
    const response = await fetch('/measurement/check/session',{method:'POST',credentials:'same-origin'});
    if (!response.ok) throw Error('session_rejected');
    const session = await response.json();
    if (![session.id,session.page].every(value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value))) throw Error('session_invalid');
    if (session.url) {
      const target=new URL(session.url);if(target.hostname!==session.id+'.shield.localhost' || target.port!=='4185' || target.protocol!=='https:') throw Error('session_origin_invalid');
      if(state.mode==='interactive') target.search='?mode=interactive';location.replace(target);return;
    }
    state.runId = session.id;state.pageId = session.page;refresh();
    const script = document.createElement('script');script.src = '/measurement/check/collector.js';
    script.dataset.case = session.id;script.dataset.page = session.page;script.dataset.controlled = 'true';
    script.dataset.endpoint = '/measurement/check/telemetry/'+session.id;script.onerror = failure;document.head.append(script);
    if (session.verification!=='/shield/verify/'+session.id) throw Error('verification_route_invalid');
    const frame=document.createElement('iframe');frame.title='本次引擎验证';frame.className='engine-verification';frame.tabIndex=-1;
    frame.src=session.verification;frame.addEventListener('load',() => void readReport().catch(failure));document.body.append(frame);
    await readReport();
    const timer=setInterval(() => void readReport().catch(failure),700);addEventListener('pagehide',() => clearInterval(timer),{once:true});
    setTimeout(() => {
      if (measurementReport(state).signals.some(row => row.group < 3 && row.status === 'pending')) {state.timedOut = true;refresh();}
    },25000);
  } catch {failure();}
}
void start();
