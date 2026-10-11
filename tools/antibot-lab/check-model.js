// WHY：只投影原判据；身份结论是本次检测结果，不授予原盾的通行身份或 Cookie。
const bot = [
  ['detectAppVersion','浏览器版本中的自动化标记'],['detectDocumentAttributes','文档自动化属性'],['detectErrorTrace','自动化错误栈'],
  ['detectEvalLengthInconsistency','脚本引擎一致性'],['detectFunctionBind','原生函数绑定'],['detectLanguagesLengthInconsistency','语言列表一致性'],
  ['detectNotificationPermissions','通知权限一致性'],['detectPluginsArray','插件对象结构'],['detectPluginsLengthInconsistency','插件数量一致性'],
  ['detectProcess','运行环境进程标记'],['detectUserAgent','浏览器标识中的机器人特征'],['detectWebDriver','WebDriver 自动化标记'],
  ['detectWebGL','图形渲染器自动化特征'],['detectWindowExternal','外部自动化对象'],['detectWindowSize','窗口尺寸特征'],
  ['detectMimeTypesConsistent','MIME 类型一致性'],['detectProductSub','浏览器产品标记'],['detectDistinctiveProperties','已知自动化框架属性']
];
const integrity = [['creepWebglMirror','WebGL 镜像一致性'],['creepWorker.platform','Worker 操作系统'],['creepWorker.userAgent','Worker 浏览器标识'],['creepWorker.hardwareConcurrency','Worker 处理器并发数'],['creepWorker.deviceMemory','Worker 设备内存']];
const identity = [['user-agent','User-Agent'],['brands','浏览器品牌与版本'],['mobile','移动设备标记'],['platform','操作系统'],['architecture','处理器架构'],['bitness','系统位数'],['model','设备型号'],['platformVersion','系统版本'],['wow64','兼容运行模式'],['fullVersionList','完整版本列表'],['formFactors','设备形态']];
const behavior = [['trusted','输入事件来源'],['keystroke-interval','按键间隔'],['keystroke-entropy','按键节奏变化'],['scroll-teleport','滚动连续性'],['typing-cadence','键盘按下与释放节奏']];
export const groupNames = ['自动化特征','环境一致性','请求身份','交互行为'];
const sources = ['BotD 2.0.0','CreepJS 10aa6724','HTTP / JS 身份对照','Kitsune f0a22b3 / FCaptcha 1.43.0'];
export const catalog = [bot,integrity,identity,behavior].flatMap((items,group) => items.map(([id,name]) => {
  const category = group < 2 ? 'browser-marker' : group === 2 ? 'request-identity' : id === 'trusted' ? 'input' : 'input-behavior';
  return {id,name,group,category,key:category+':'+id,source:id === 'trusted'?'DOM Event.isTrusted · 事件类型':sources[group]};
}));
export const labels = {clear:'未发现异常',flagged:'命中异常',advisory:'依据待核验',unavailable:'不可测',excluded:'不适用',failed:'检测失败',pending:'等待检测'};
export function createMeasurement() {
  return {values:new Map(),batches:new Set(),mode:'automatic',behaviorPhase:'idle',pageId:null,runId:null,
    failed:false,timedOut:false,health:null,updated:null,timing:/** @type {null | Array<Record<string,unknown>>} */(null),
    flow:/** @type {null | {submitted:boolean}} */ (null),verification:{status:'pending'},
    input:{events:0,untrusted:0,hidden:0,dropped:0,byType:{}}};
}
function merge(state,signal) {
  const category = signal.category === 'environment-health' ? 'browser-marker' : signal.category;
  const key = category+':'+signal.detector;
  if (!catalog.some(item => item.key === key)) return;
  const old = state.values.get(key);
  // WHY：同一页面的阳性锁存，后续批次的阴性不能抹去已观察异常；重新检测创建独立页面。
  if (old?.valid && ['detected','mismatch'].includes(old.outcome)) return;
  state.values.set(key,{valid:signal.valid === true,outcome:signal.outcome});
}
function unattributedInput(state) {
  const counted=Object.values(state.input.byType).reduce((sum,n)=>sum+n.untrusted,0);
  return state.input.byType.unknown?.untrusted > 0 || state.input.untrusted > counted;
}
export function acceptReceipt(state,receipt) {
  if (!state.pageId || receipt?.page !== state.pageId || !receipt.report || typeof receipt.batch !== 'string'
    || state.batches.has(receipt.batch)) return false;
  state.batches.add(receipt.batch);state.updated = new Date().toISOString();
  if (receipt.environment) state.health = receipt.environment;
  if(Array.isArray(receipt.report.timing))state.timing=receipt.report.timing;
  for (const signal of receipt.report.signals ?? []) {
    merge(state,signal);
    if (signal.category === 'input-behavior' && signal.detector === 'measurement') {
      for (const id of ['keystroke-interval','keystroke-entropy','scroll-teleport']) merge(state,{...signal,detector:id});
    }
  }
  if (receipt.environment && receipt.environment !== 'measured') {
    for (const row of catalog.filter(row => row.group === 0)) merge(state,{category:row.category,detector:row.id,valid:false,outcome:receipt.environment});
  }
  const input = receipt.report.input;
  for (const key of ['events','untrusted','hidden','dropped']) {
    const value = input?.[key];
    if (Number.isSafeInteger(value) && value >= 0) state.input[key] += value;
  }
  for (const [type,counts] of Object.entries(input?.byType ?? {})) {
    if (!['input','change','click','keydown','keyup','compositionstart','compositionend','paste','focus','blur','visibilitychange','unknown'].includes(type)) continue;
    if (![counts?.events,counts?.untrusted].every(value => Number.isSafeInteger(value) && value >= 0)
      || counts.untrusted > counts.events) continue;
    const total = state.input.byType[type] ??= {events:0,untrusted:0};
    total.events += counts.events;total.untrusted += counts.untrusted;
  }
  // WHY：只消费原五类输入判据；Chrome 原 IME 结束经延迟队列也可保持 isTrusted=false。
  // 组合、粘贴与焦点上下文保留原计数，不增设异常；缺类型仍待核验，原强阳性仍锁存。
  const types=['input','change','click','keydown','keyup'];
  const direct=types.some(type=>state.input.byType[type]?.untrusted > 0);
  const sampled=types.some(type=>state.input.byType[type]?.events > 0),unknown=unattributedInput(state);
  if (state.input.events) merge(state,{category:'input',detector:'trusted',valid:direct || sampled || unknown,
    outcome:direct?'detected':unknown?'observed':sampled?'clear':'excluded'});
  return true;
}
function rowStatus(state,row,value) {
  if (value?.valid && ['detected','mismatch'].includes(value.outcome)) return 'flagged';
  if (value?.valid && value.outcome === 'clear') return 'clear';
  if (value?.valid && value.outcome === 'observed') return 'advisory';
  if (value?.outcome === 'excluded') return 'excluded';
  if (['error','invalid'].includes(value?.outcome)) return 'failed';
  if (row.group === 3 && state.behaviorPhase === 'idle') return 'pending';
  if (value || state.failed || state.timedOut) return 'unavailable';
  return 'pending';
}
function reason(row,status,outcome,state) {
  if (status === 'clear') return row.id === 'trusted' ? '纳入判定的输入、按键与点击未命中脚本事件' : row.group === 2 ? '请求信息与浏览器声明一致' : '原判据未命中对应异常';
  if (status === 'flagged') return row.group === 3 && row.id !== 'trusted' ? '原行为判据命中参考线索，不单独判为 Bot' : row.id === 'trusted' ? '检测到脚本派发的输入事件' : row.id === 'detectWebDriver' ? '检测到 WebDriver 自动化标记' : outcome === 'mismatch' ? '请求信息与浏览器声明不一致' : '原检测器命中自动化特征';
  if (status === 'advisory') return '部分事件类型缺失，无法按原输入判据核验';
  if (status === 'excluded') return row.id === 'trusted'?'仅有输入法、粘贴或焦点上下文，尚无适用输入样本'
    :row.id==='typing-cadence'?'原检测器不分析粘贴形成的按键样本':'旧采集记录缺少可计算的逐键时间';
  if (status === 'failed') return outcome === 'invalid' ? '样本或测量数据无效' : '检测器未能取得有效结果';
  if (status === 'pending') return row.group === 3 ? '等待输入、滚动并提交' : '正在等待本项检测回执';
  if (outcome === 'timeout') return '检测器响应超时，未取得有效结果';
  if (outcome === 'incomplete') return '按下与释放的键盘样本尚不完整';
  return row.group === 3 ? '有效交互样本不足' : row.group === 2 ? '浏览器未提供可对照的请求信息' : '未取得有效测量回执';
}
export function tally(rows) {
  return rows.reduce((counts,row) => {counts[row.status]++;return counts;},
    {clear:0,flagged:0,advisory:0,unavailable:0,excluded:0,failed:0,pending:0});
}
export function measurementReport(state) {
  const signals = catalog.map(row => {
    const value = state.values.get(row.key),status = rowStatus(state,row,value);
    return {...row,status,valid:['clear','flagged','advisory'].includes(status),outcome:value?.outcome ?? null,reason:reason(row,status,value?.outcome,state)};
  });
  const automatic = signals.filter(row => row.group < 3),auto = tally(automatic),counts = tally(signals);
  const evidence = signals.filter(row => row.status === 'flagged' && (row.group < 3 || row.id === 'trusted'));
  const active = state.mode === 'interactive' ? signals : automatic;
  const missing = automatic.some(row => ['unavailable','failed'].includes(row.status));
  const autoRunning = auto.pending > 0 && !state.failed && !state.timedOut;
  const waiting = state.mode === 'interactive' && state.behaviorPhase === 'idle';
  const running = autoRunning || state.behaviorPhase === 'running' || state.verification.status === 'pending';
  const failed = state.failed || state.verification.status === 'failed' || active.some(row => row.status === 'failed');
  // WHY：节奏是可选原线索，缺样本不冒充已测；有效真人结论仍需服务端本次挑战与完成事实。
  const incomplete = missing || unattributedInput(state) || state.input.dropped > 0
    || ['partial','error','timeout'].includes(state.health)
    || (state.mode === 'interactive' && state.behaviorPhase === 'done' && !state.flow);
  const accepted = state.verification.status === 'accepted' && state.verification.challengeAccepted === true
    && state.verification.protectedRequestAccepted === true && state.verification.allowlisted === false;
  const verdict = evidence.length ? 'bot' : failed || incomplete ? 'unknown' : running || waiting ? 'pending' : accepted ? 'human' : 'unknown';
  const phase = failed ? 'failed' : running ? 'running' : waiting ? 'waiting_interaction' : 'complete';
  const status = evidence.length ? 'detected' : failed || incomplete ? 'unavailable' : running || waiting ? 'pending' : 'clear';
  return {version:3,schemaVersion:3,mode:'verified-observation',scope:state.mode === 'automatic' ? 'automatic' : 'automatic+interactive',
    runId:state.runId,pageId:state.pageId,updated:state.updated,status,phase,verdict,counts,signals,
    evidence:evidence.map(row => row.key),health:{environment:state.health,transportFailed:state.failed,timedOut:state.timedOut,dropped:state.input.dropped},
    input:{...state.input,byType:Object.fromEntries(Object.entries(state.input.byType).map(([type,counts]) => [type,{...counts}]))},
    verification:{...state.verification},flow:state.flow,timing:state.timing,
    excluded:['transport-fingerprint','ip-reputation','long-term-frequency','account-session-association'],
    classification:'This visit passed the native bot challenge and declared flow; detector assessment, not operator identity authentication or universal admission.'};
}
