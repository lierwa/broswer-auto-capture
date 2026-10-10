/* The report renders original detector outcomes; it is not an identity or probability model. */
(() => {
  const $ = selector => document.querySelector(selector);
  const bot = [
    ['detectAppVersion','浏览器版本中的自动化标记'], ['detectDocumentAttributes','文档自动化属性'],
    ['detectErrorTrace','自动化错误栈'], ['detectEvalLengthInconsistency','脚本引擎一致性'],
    ['detectFunctionBind','原生函数绑定'], ['detectLanguagesLengthInconsistency','语言列表一致性'],
    ['detectNotificationPermissions','通知权限一致性'], ['detectPluginsArray','插件对象结构'],
    ['detectPluginsLengthInconsistency','插件数量一致性'], ['detectProcess','运行环境进程标记'],
    ['detectUserAgent','浏览器标识中的机器人特征'], ['detectWebDriver','WebDriver 自动化标记'],
    ['detectWebGL','图形渲染器自动化特征'], ['detectWindowExternal','外部自动化对象'],
    ['detectWindowSize','窗口尺寸特征'], ['detectMimeTypesConsistent','MIME 类型一致性'],
    ['detectProductSub','浏览器产品标记'], ['detectDistinctiveProperties','已知自动化框架属性'],
  ];
  const identity = [['user-agent','User-Agent'], ['brands','浏览器品牌与版本'], ['mobile','移动设备标记'],
    ['platform','操作系统'], ['architecture','处理器架构'], ['bitness','系统位数'], ['model','设备型号'],
    ['platformVersion','系统版本'], ['wow64','兼容运行模式'], ['fullVersionList','完整版本列表'], ['formFactors','设备形态']];
  const groups = [
    { id:'browser', icon:'01', title:'浏览器自动化特征', description:'BotD · 已知自动化标记与环境特征',
      signals:bot.map(([name,label]) => ['browser-marker',name,label]) },
    { id:'integrity', icon:'02', title:'环境一致性', description:'CreepJS · 图形镜像与页面 / Worker 对照',
      signals:[['browser-marker','creepWebglMirror','WebGL 镜像一致性'],
        ...[['platform','操作系统'],['userAgent','浏览器标识'],['hardwareConcurrency','处理器并发数'],['deviceMemory','设备内存']]
          .map(([name,label]) => ['browser-marker','creepWorker.'+name,'Worker '+label])] },
    { id:'identity', icon:'03', title:'请求身份一致性', description:'HTTP 请求头与浏览器声明的 11 项逐一对照',
      signals:identity.map(([name,label]) => ['request-identity',name,label]) },
    { id:'behavior', icon:'04', title:'交互行为', description:'原生事件标记与 Kitsune 时序线索 · 统计项仅供参考',
      signals:[['input','trusted','输入事件来源'], ['input-behavior','keystroke-interval','按键间隔'],
        ['input-behavior','keystroke-entropy','按键节奏变化'], ['input-behavior','scroll-teleport','滚动连续性']] },
  ];
  const rows = new Map(), values = new Map();
  let packets = 0, failed = false, timedOut = false, health = null, updated = null, pageId = null;
  const counts = { events:0, untrusted:0, hidden:0, dropped:0 };
  function build() {
    for (const group of groups) {
      const details = document.createElement('details'); details.className = 'signal-group'; details.id = 'group-'+group.id;
      details.innerHTML = `<summary><span class="group-icon">${group.icon}</span><div class="group-copy"><h3>${group.title}</h3><p>${group.description}</p></div><span class="group-badge"></span><span class="chevron" aria-hidden="true">+</span></summary><div class="signal-list"></div>`;
      for (const [category,detector,label] of group.signals) {
        const row = document.createElement('div'); row.className = 'signal-row';
        row.innerHTML = `<span class="signal-name">${label}<code>${detector}</code></span><span class="signal-state">等待检测</span>`;
        details.querySelector('.signal-list').append(row);
        rows.set(category+':'+detector, row.querySelector('.signal-state'));
      }
      $('#signal-groups').append(details);
    }
  }
  function state(key) {
    const value = values.get(key);
    if (value?.valid) return ['detected','mismatch'].includes(value.outcome) ? 'detected' : 'clear';
    if (value) return 'unavailable';
    return failed || timedOut ? 'unavailable' : 'pending';
  }
  function displaySignal(key) {
    const current = state(key), value = values.get(key);
    if (current === 'detected') return key.startsWith('input-behavior') ? '可疑 · 参考线索' : '命中可疑信号';
    if (current === 'clear') return key === 'input:trusted' ? '已观察事件均为原生' : '未命中异常';
    if (value?.outcome === 'error' || value?.outcome === 'invalid') return '测量失败';
    if (key.startsWith('input') && !failed) return '样本不足 / 待交互';
    return current === 'pending' ? '检测中…' : '不可用 / 未测到';
  }
  function updateGroups() {
    for (const group of groups) {
      const states = group.signals.map(([category,detector]) => state(category+':'+detector));
      const measured = states.filter(s => s === 'clear' || s === 'detected').length;
      const flagged = states.filter(s => s === 'detected').length;
      const badge = $('#group-'+group.id+' .group-badge');
      badge.textContent = flagged ? flagged+' 项可疑' : measured+'/'+states.length+' 已测';
      badge.dataset.tone = flagged ? 'detected' : measured === states.length ? 'clear' : 'pending';
    }
    for (const [key,node] of rows) { node.textContent = displaySignal(key); node.dataset.state = state(key); }
  }
  function render() {
    updateGroups();
    const all = [...rows.keys()].map(key => ({ key, status:state(key), ...values.get(key) }));
    const clear = all.filter(item => item.status === 'clear').length;
    const flagged = all.filter(item => item.status === 'detected').length, measured = clear+flagged;
    const automaticMissing = all.some(item => !item.key.startsWith('input') && item.status === 'unavailable');
    const incomplete = failed || timedOut || automaticMissing || counts.dropped > 0 || health === 'partial' || health === 'error';
    const tone = flagged ? 'detected' : incomplete ? 'unavailable' : packets ? 'clear' : 'pending';
    const title = flagged ? '发现可疑信号' : incomplete ? '部分检测未完成' : packets ? '已测项未发现异常' : '正在观察浏览器';
    const text = flagged ? `有 ${flagged} 项信号值得关注，展开下方报告查看来源。可疑信号不直接等于机器人。`
      : incomplete ? '有检测缺失或失败，请查看具体项目。缺失项不会计为通过。'
      : packets ? '当前已测信号未命中异常。继续交互可补充行为检测，这不代表真人身份认证。'
      : '自动检查即将开始。交互检测将在你操作后补充。';
    $('.verdict').dataset.tone = tone; $('#verdict-title').textContent = title; $('#verdict-copy').textContent = text;
    $('#clear-count').textContent = clear; $('#flag-count').textContent = flagged; $('#waiting-count').textContent = all.length-measured;
    $('#ring-count').textContent = measured; $('.ring').style.setProperty('--angle',(measured/all.length*360)+'deg');
    $('#result-mark').textContent = flagged ? '!' : incomplete ? '—' : packets ? '✓' : '…';
    $('#live-label').textContent = failed ? '采集失败' : packets ? '交互持续更新' : '正在采集';
    $('#event-counter').textContent = counts.events+' 个事件';
    if (updated) $('#report-time').textContent = '最近更新 '+new Date(updated).toLocaleTimeString('zh-CN',{hour12:false});
    $('#download').disabled = !packets && !failed && !timedOut;
    globalThis.__batCheckReport = { version:1, mode:'observation', updated, status:tone, counts:{clear,flagged,unavailable:all.length-measured},
      health:{environment:health,transportFailed:failed,timedOut,dropped:counts.dropped}, signals:all,
      input:{...counts}, excluded:['transport-fingerprint','ip-reputation','long-term-frequency','account-session-association','challenge'],
      scope:'Signal report only; not human identity, bot probability, or full shield admission.' };
  }
  function mergeSignal(signal) {
    const category = signal.category === 'environment-health' ? 'browser-marker' : signal.category;
    const key = category+':'+signal.detector;
    if (!rows.has(key)) return;
    const old = values.get(key);
    // WHY：同一页面已经触发的异常不被后续正常批次冲掉；刷新才开始独立检测。
    if (old?.valid && ['detected','mismatch'].includes(old.outcome)) return;
    values.set(key, {valid:signal.valid,outcome:signal.outcome});
  }
  document.addEventListener('bat:measurement', event => {
    const receipt = event.detail;
    if (receipt.page !== pageId || !receipt.report) return;
    packets++; updated = new Date().toISOString();
    if (receipt.environment) health = receipt.environment;
    for (const signal of receipt.report.signals) mergeSignal(signal);
    if (receipt.environment && receipt.environment !== 'measured') {
      for (const [name] of bot) {
        const key = 'browser-marker:'+name, value = values.get(key);
        if (!value?.valid || value.outcome === 'clear') values.set(key,{valid:false,outcome:receipt.environment});
      }
    }
    for (const key of Object.keys(counts)) counts[key] += receipt.report.input[key];
    if (counts.events) mergeSignal({ category:'input',detector:'trusted',valid:true,outcome:counts.untrusted ? 'detected' : 'clear' });
    render();
  });
  function failure(message) {
    failed = true; $('#failure').hidden = false; $('#failure').textContent = message; render();
  }
  document.addEventListener('bat:measurement-error', () => failure('检测回执未送达。请检查本地服务后重新检测；本次已测结果保留，未测项目不计为通过。'));
  $('#restart').addEventListener('click', event => { event.currentTarget.disabled = true; event.currentTarget.textContent = '重新检测中…'; location.reload(); });
  $('#interaction-form').addEventListener('submit', event => {
    event.preventDefault();
    $('#interaction-feedback').textContent = '交互已结束，等待检测回执…';
    const before = packets;
    setTimeout(() => {
      const flagged = [...values.entries()].filter(([key,value]) => key.startsWith('input') && value.valid && value.outcome === 'detected').length;
      $('#interaction-feedback').textContent = failed || packets === before ? '交互回执尚未确认，请查看上方采集状态。'
        : flagged ? `已收到交互回执，有 ${flagged} 项参考线索命中。请展开「交互行为」查看。`
        : '已收到交互回执；不足的样本仍会标为待交互。请展开「交互行为」查看。';
      $('#group-behavior').open = true;
    }, 1800);
  });
  $('#download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(globalThis.__batCheckReport,null,2)],{type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'shield-report-'+Date.now()+'.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  });
  async function start() {
    build(); render();
    try {
      const response = await fetch('/measurement/check/session',{method:'POST',credentials:'same-origin'});
      if (!response.ok) throw Error('session_unavailable');
      const session = await response.json(); pageId = session.page;
      const script = document.createElement('script'); script.src = '/measurement/check/collector.js';
      script.dataset.case = session.id; script.dataset.page = session.page;
      script.dataset.endpoint = '/measurement/check/telemetry/'+session.id;
      script.onerror = () => failure('采集脚本无法加载，本次检测不完整。请检查服务后重新检测。');
      document.body.append(script);
      setTimeout(() => {
        const automatic = groups.slice(0,3).flatMap(group => group.signals);
        timedOut = automatic.some(([category,detector]) => !values.has(category+':'+detector));
        render();
      },25000);
    } catch { failure('无法开始检测。请检查本地检测服务后重新检测，当前没有有效结论。'); }
  }
  void start();
})();
