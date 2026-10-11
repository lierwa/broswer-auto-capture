import {groupNames,labels,tally} from './model.js';
import {paintArt} from './art.js';
const $ = selector => document.querySelector(selector);
export function statusMark(row) {
  const label = row.status === 'flagged' && row.group === 3 && row.id !== 'trusted' ? '可疑 · 行为线索' : labels[row.status];
  return `<span class="signal-status ${row.status}">${label}</span>`;
}
function renderStage(report,state) {
  const waiting = report.phase === 'waiting_interaction',running = report.phase === 'running',failed = report.phase === 'failed';
  const titles = {human:'真人 · 本次验证通过',bot:'判定为机器人',unknown:failed?'检测失败，无法判定':'信息不足，无法判定',pending:waiting?'等待交互检测':'正在识别这次访问'};
  const hit = report.signals.find(row => report.evidence.includes(row.key));
  const reasons = {
    human:state.mode === 'interactive' ? '本次引擎验证通过，中英文输入、滚动和提交已完成。' : '本次浏览器检测与引擎验证已通过。',
    bot:hit ? '检测到自动化特征：'+hit.name+'。' : '检测到自动化特征。',
    unknown:failed?'部分检测或引擎验证未完成，请查看下方依据。':'必要检测依据缺失，本次无法给出完整结论。',
    pending:waiting?'输入英文、中文，滚动并提交，完成本次交互。':state.behaviorPhase === 'running'?'正在等待本次交互回执，结果将在本页更新。':'正在检查浏览器环境并完成本次引擎验证。'
  };
  document.body.dataset.verdict = report.verdict;$('#result-stage').dataset.state = report.verdict;
  $('#verdict-title').textContent = titles[report.verdict];$('#verdict-reason').textContent = reasons[report.verdict];
  $('#result-scope').textContent = '当前访问 · '+(state.mode === 'automatic'?'自动检测':'自动 + 交互检测');
  $('#stage-progress').innerHTML = groupNames.slice(0,state.mode === 'automatic'?3:4).map((group,index) => {
    const n = tally(report.signals.filter(row => row.group === index));
    const idle = index === 3 && state.behaviorPhase === 'idle';
    const done = !n.pending && !idle,issue = done && (n.flagged || n.failed || n.unavailable || n.advisory);
    const className = issue?n.flagged || n.failed?'step-alert':'step-incomplete':done?'step-done':!idle?'step-active':'';
    return `<span class="${className}"><i class="step-mark">${issue?'!':done?'✓':idle?'○':'●'}</i>${group}</span>`;
  }).join('');
  const action = $('#next-action');action.disabled = running;
  action.textContent = running?'正在检测…':failed?'重新检测 ↻':state.mode === 'automatic'?'补充交互检测 →':waiting?'完成下方交互 ↓':'再测一次 ↻';
  $('#result-note').textContent = running?'报告正在同步更新':state.mode === 'automatic'?'交互行为尚未提交检测':waiting?'自动检测结果保留在下方':'本次检测已结束';
  paintArt(running?'pending':waiting && report.verdict === 'pending'?'waiting':report.verdict);
}
function renderCategories(report,state) {
  $('#category-summary').classList.toggle('has-behavior',state.mode === 'interactive');
  const icons = ['<rect x="5" y="7" width="18" height="15" rx="4"/><path d="M14 3v4M9 13h2m6 0h2M9 18h10"/>','<rect x="3" y="3" width="9" height="9" rx="1"/><rect x="16" y="16" width="9" height="9" rx="1"/><path d="M18 5h6v6M10 23H4v-6"/>','<path d="M4 6h20M4 14h13M4 22h20m-5-11 4 3-4 3"/>','<path d="m7 3 0 16 4-4 4 8 4-2-4-8h6Z"/>'];
  $('#category-summary').innerHTML = groupNames.slice(0,state.mode === 'automatic'?3:4).map((group,index) => {
    const signals = report.signals.filter(row => row.group === index),n = tally(signals);
    const label = n.flagged?`${n.flagged} 项命中异常`:n.failed?'检测失败':n.pending?'等待检测':n.unavailable?`${n.unavailable} 项不可测`:n.advisory?`${n.advisory} 项依据待核验`:n.excluded?`已完成 · ${n.excluded} 项不适用`:'未发现异常';
    const tone = n.flagged?'bot':n.failed || n.unavailable || n.advisory?'unknown':n.pending?'pending':'human';
    return `<a href="#group-${index}" class="category-result" data-tone="${tone}"><svg viewBox="0 0 28 28" aria-hidden="true">${icons[index]}</svg><div><strong>${group}</strong><p>${label}</p></div><span>${n.clear+n.flagged}<small>/ ${signals.length}</small></span></a>`;
  }).join('');
}
function renderReport(report) {
  $('#report').dataset.status = report.phase;$('#report').dataset.verdict = report.verdict;$('#report').dataset.runId = report.runId ?? '';
  const stage = {running:'正在更新',waiting_interaction:'等待补充交互',failed:'检测失败',complete:'自动检测结束'};
  $('#report-meta').textContent = `自动 34 项 · 交互 5 项 · ${stage[report.phase]}`;
  if (report.scope !== 'automatic' && report.phase === 'complete') $('#report-meta').textContent = '39 项 · 检测结束';
  $('#report-summary').innerHTML = `<span>引擎验证：${report.verification.status==='accepted'?'通过':report.verification.status==='failed'?'未完成':'进行中'}</span>`+Object.entries(report.counts).filter(([,n]) => n > 0).map(([key,n]) => `<span class="${key}"><b>${n}</b>${labels[key]}</span>`).join('');
  $('#report-rows').innerHTML = groupNames.map((group,index) => {
    const rows = report.signals.filter(row => row.group === index).sort((a,b) => Number(b.status === 'flagged')-Number(a.status === 'flagged'));
    return `<tr class="group-heading"><th id="group-${index}" colspan="3" scope="rowgroup">${group}<small>${rows.length} 项${index === 3?' · 节奏仅供参考':''}</small></th></tr>`+rows.map(row =>
      `<tr class="signal-row" data-signal="${row.key}" data-result="${row.status}"><td><button class="signal-name" data-detail="${row.key}">${row.name}</button></td><td class="signal-state">${statusMark(row)}</td><td>${row.reason}</td></tr>`).join('');
  }).join('');
  const json = JSON.stringify(report,null,2);$('#shield-report').textContent = json;$('#raw-report').textContent = json;
  globalThis.__batCheckReport = report;$('#export').disabled = !report.runId;
}
export function render(report,state) {
  renderStage(report,state);renderCategories(report,state);renderReport(report);
  for (const mode of ['automatic','interactive']) {
    const tab = $(mode === 'automatic'?'#automatic-tab':'#interaction-tab');
    tab.setAttribute('aria-selected',String(state.mode === mode));tab.tabIndex = state.mode === mode?0:-1;
  }
  $('#interaction-area').hidden = state.mode !== 'interactive' || state.behaviorPhase === 'done';
}
export function showSignal(row) {
  if (!row) return;
  $('#signal-title').textContent = row.name;
  $('#signal-detail').innerHTML = `<dl><dt>结果</dt><dd>${statusMark(row)}</dd><dt>依据</dt><dd>${row.reason}</dd><dt>检测来源</dt><dd>${row.source}</dd><dt>原始字段</dt><dd><code>${row.key}</code></dd></dl>`;
  $('#signal-dialog').showModal();
}
export function toast(message) {
  $('#toast').textContent = message;$('#toast').hidden = false;setTimeout(() => $('#toast').hidden = true,2400);
}
