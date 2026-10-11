// No key values, input contents, clipboard, graphics fingerprint or external upload.
{
const timingSample = field => ({field,keyCount:0,intervals:[],dwellTimes:[],starts:[],pending:0,invalid:false,excluded:false,
  context:{imePairs:0,physicalPairs:0,auxiliaryReleases:0,unpaired:0,skipped:0,composition:0,downClockInvalid:false}});
const pairingFault = (entry,event,reason) => {
  entry.data.invalid=true;
  // 首个失败只留配对状态；不记录按键值/code、输入内容或剪贴板，且不参与评分。
  entry.data.context.fault ??= {reason,at:event.timeStamp,down:event.type==='keydown',process:event.keyCode===229,
    composing:!!event.isComposing,codePresent:!!event.code,pending:entry.pending.size,
    imePending:[...entry.pending.values()].filter(p=>p.ime).length,releases:entry.releases.size,trace:entry.history.slice()};
};
const keyIdentity = event => {
  if(event.code && event.code!=='Unidentified')return event.code;
  if(event.isTrusted!==true)return null;
  return event.keyCode===229?'$ime':Number.isInteger(event.keyCode) && event.keyCode>0 && event.keyCode<256?'$vk:'+event.keyCode:null;
};
const modifierIdentity = event => {
  const names=['Shift','Control','Alt','Meta','CapsLock','NumLock','ScrollLock'],physical=event.code?.replace(/(Left|Right)$/,'');
  return names.includes(physical)?physical:names.includes(event.key)?event.key:null;
};
const recordTiming = (entry,event) => {
  const data=entry.data,at=event.timeStamp,down=event.type==='keydown';
  // WHY：IME的key可变为Process，物理code仍能明确指出Shift；修饰键不属于输入节奏样本。
  const modifier=modifierIdentity(event);
  if(!Number.isFinite(at) || at<0) {data.invalid=true;if(down)data.context.downClockInvalid=true;return;}
  const controlAt=entry.modifiers.get('Control') ?? entry.controlRelease;
  if(modifier!=='Control')entry.controlRelease=null;
  if(entry.deferredRelease) {
    const waiting=entry.deferredRelease;entry.deferredRelease=null;
    // WHY：229辅助释放须由紧邻的已按下修饰键up确认；否则保留真错误，不凭IME忽略释放。
    if(!down && modifier && event.isTrusted===true && modifier===waiting.modifier && at>=waiting.at)
      data.context.skipped++;
    else pairingFault(entry,event,'modifier-release-mismatch');
  }
  if(modifier) {
    if(event.isTrusted===true && !event.repeat) {
      if(down) {entry.modifiers.set(modifier,at);entry.controlRelease=null;if(modifier==='Control')entry.controlSpaceUsed=false;}
      else {
        if(modifier==='Control' && controlAt!==undefined && controlAt!==null && at>=controlAt)entry.controlRelease=at;
        entry.modifiers.delete(modifier);
      }
    }
    data.context.skipped++;return;
  }
  if(event.repeat) {data.context.skipped++;return;}
  const process=event.keyCode===229 && event.isTrusted===true;
  // 原生Windows空code的普通空格仍有稳定虚拟键身份；真实down/up同值才可配对。
  const code=keyIdentity(event);
  if(down && (event.ctrlKey || event.metaKey || event.altKey)) {
    if(event.isTrusted===true && event.ctrlKey && (code==='Space' || code==='$vk:32'))entry.controlSpaceUsed=true;
    if(code)entry.ignored.add(code);data.context.skipped++;return;
  }
  if(!down && entry.ignored.delete(code)) {data.context.skipped++;return;}
  if(down) {
    // 同键新down终止旧辅助up；其它已知键滚动输入不抹掉该键的原生释放凭据。
    entry.releases.delete(code);entry.releases.delete('$ime');
    if(data.keyCount===100) {if(code)entry.ignored.add(code);data.context.skipped++;return;}
    const last=data.starts.at(-1);
    if(last!==undefined && at<last) {data.invalid=true;data.context.downClockInvalid=true;return;}
    data.starts.push(at);data.keyCount++;
    if(last!==undefined)data.intervals.push(at-last);
    if(!code) {data.context.unpaired++;return;}
    if(code==='$ime' && entry.lostIme) {entry.lostIme++;data.context.unpaired++;return;}
    if(entry.pending.has(code)) {
      // WHY：无物理键身份的重叠229无法唯一配对；不猜释放、不补hold。
      if(code==='$ime') {entry.pending.delete(code);entry.lostIme+=2;data.context.unpaired+=2;}
      else pairingFault(entry,event,'duplicate-down');
      return;
    }
    entry.pending.set(code,{at,ime:process || event.isComposing,code:event.code || null});return;
  }
  if(process && entry.lostIme) {entry.lostIme--;entry.releases.set('$ime',{code:null,at});return;}
  let token=code,pair=entry.pending.get(token);
  if(!pair && event.isTrusted===true && entry.pending.size===1) {
    const [candidate,value]=entry.pending.entries().next().value;
    // IME结束可恢复普通keyup；仅缺键身份且唯一待释放时配对，已知不同物理键不能代配。
    if(value.ime && (!event.code || candidate==='$ime') && (process || candidate==='$ime')) {token=candidate;pair=value;}
  }
  if(pair) {
    entry.pending.delete(token);
    if(at<pair.at) {pairingFault(entry,event,'release-before-down');return;}
    data.dwellTimes.push(at-pair.at);
    // 组合可在按住期间开始；两个端点任一明确为原生IME，键身份和真实时刻仍须配对。
    const imePair=pair.ime || (event.isTrusted===true && (process || event.isComposing));
    data.context[imePair?'imePairs':'physicalPairs']++;
    // WHY：Windows IME的一次键对之后还会发一个实际键释放；只消费紧随其后的同键辅助up。
    if(imePair)entry.releases.set(token,{code:pair.code,at});return;
  }
  const releaseToken=entry.releases.has(code)?code:!event.code?'$ime':null;
  const release=entry.releases.get(releaseToken);
  if(event.isTrusted===true && !process && release &&
      (!event.code || event.code===release.code) && at>=release.at) {
    entry.releases.delete(releaseToken);data.context.auxiliaryReleases++;return;
  }
  // WHY：Windows Ctrl+Space被IME消费down却可保留up；仅原生Space和仍按住/紧邻释放的Control可确认此上下文。
  // 不补down/hold、不忽略其它孤立释放；实际Space键对已在上方配对，原检测器及阈值不变。
  if(event.isTrusted===true && !process && (code==='Space' || code==='$vk:32') &&
      !entry.controlSpaceUsed && controlAt!==undefined && controlAt!==null && at>=controlAt) {
    entry.controlSpaceUsed=true;data.context.skipped++;return;
  }
  if(process && !event.code && !entry.pending.size && entry.modifiers.size===1) {
    entry.deferredRelease={at,modifier:entry.modifiers.keys().next().value};return;
  }
  if(!code) {data.context.unpaired++;return;}
  pairingFault(entry,event,'unmatched-release');
};
const captureCadence = (changed, scope) => {
  const entries=new Map(),history=[],identities=new Map();let current,pasted=false;
  const accepts=element=>element?.tagName==='TEXTAREA' && (entries.has(element) || entries.size<8) &&
    (!scope || (Array.isArray(scope)?scope.includes(element):scope===element));
  const get=element=>{
    if(!entries.has(element))entries.set(element,{data:timingSample(entries.size),history,pending:new Map(),ignored:new Set(),modifiers:new Map(),controlRelease:null,controlSpaceUsed:false,lostIme:0,releases:new Map(),deferredRelease:null});
    return entries.get(element);
  };
  const trace=event=>{
    if(!Number.isFinite(event.timeStamp) || event.timeStamp<0)return;
    const token=keyIdentity(event);
    if(token && !identities.has(token) && identities.size<256)identities.set(token,identities.size+1);
    // 只在首错配附带最近32事件；页内匿名键编号只表示同键关系，禁止发送code、键值或输入文本。
    // [类型,真实时刻,字段,匿名同键编号,标志,修饰键]；紧凑元组避免诊断突破原16KiB请求界限。
    const flags=(event.code && event.code!=='Unidentified'?1:0)|(event.keyCode===229?2:0)|(token?.startsWith('$vk:')?4:0)|
      (event.isTrusted===true?8:0)|(event.isComposing?16:0)|(event.repeat?32:0)|(event.ctrlKey || event.metaKey || event.altKey?64:0);
    history.push([event.type,event.timeStamp,entries.get(event.target)?.data.field ?? -1,identities.get(token) ?? 0,flags,modifierIdentity(event)]);
    if(history.length>32)history.shift();
  };
  for(const type of ['keydown','keyup'])document.addEventListener(type,event=>{
    const token=keyIdentity(event),modifier=modifierIdentity(event),all=[...entries.values()];
    // WHY：UI Events允许Tab的down/up目标不同；释放归唯一真实按下的字段，不按新焦点拆键对。
    const owners=type==='keyup'?all.filter(e=>e.pending.has(token) || e.ignored.has(token) || (modifier && e.modifiers.has(modifier))):[];
    const auxiliary=type==='keyup' && !owners.length?all.filter(e=>e.releases.has(token)):[];
    const owner=owners.length===1?owners[0]:auxiliary.length===1?auxiliary[0]:null;
    if(!owner && !accepts(event.target))return;
    current=owner ?? get(event.target);trace(event);recordTiming(current,event);changed();
  },{capture:true,passive:true});
  for(const type of ['paste','compositionstart','compositionend'])document.addEventListener(type,event=>{
    if(type==='paste')pasted=true; // 原FCaptcha全页粘贴门保留；另两项仍可测真实keydown。
    if(!accepts(event.target))return;
    current=get(event.target);if(type!=='paste')trace(event);
    if(type==='compositionstart')current.data.context.composition++;
    // 组合边界不清空正在按住的真实键；end后的up仍可完成配对。
    changed();
  },{capture:true,passive:true});
  for(const type of ['blur','focus'])document.addEventListener(type,event=>{
    if(!entries.has(event.target) && !accepts(event.target))return;
    if(entries.has(event.target))entries.get(event.target).controlRelease=null;
    trace(event);
    // 保留未释放数量，不把失焦误造为释放或清除已测证据。
    changed();
  },true);
  const copy=entry=>({...entry.data,excluded:pasted,starts:[...entry.data.starts],
    intervals:[...entry.data.intervals],dwellTimes:[...entry.data.dwellTimes],context:{...entry.data.context},
    pending:entry.pending.size+entry.lostIme+(entry.deferredRelease?1:0)});
  return ()=>current?{...copy(current),...(Array.isArray(scope)?{samples:[...entries.values()].slice(0,8).map(copy)}:{})}:undefined;
};

(() => {
  const id = document.currentScript.dataset.case;
  const page = document.currentScript.dataset.page, endpoint = document.currentScript.dataset.endpoint || '/shield/telemetry/' + id;
  let events = [], environment, integrity, workerIntegrity, highEntropy = null, highEntropyValidity, dropped = 0;
  const read = fn => { try { return fn(); } catch { return null; } };
  const keys = [], scroll = { count: 0, maxDelta: 0, wheelCount: 0, scrollKey: false, maxTouchPoints: read(() => navigator.maxTouchPoints ?? null) };
  const scrollPositions = new WeakMap();
  let behaviorDirty = false, pendingFlush = null;
  const fields = ['sample-english','sample-text'].map(id => document.getElementById(id));
  // WHY：中英文分别保留真实键对，不跨字段拼接时刻；输入法走同一原检测器。
  const cadenceTarget=fields[0],cadence = captureCadence(() => { behaviorDirty = true; },fields.every(Boolean)?fields:cadenceTarget);
  const flowInputs=[0,0],composing=new Set();let flowScrolled=false;
  const flow = submitted => fields.every(Boolean) ? {
    english:(fields[0].value.match(/[A-Za-z]/g)??[]).length,chinese:(fields[1].value.match(/\p{Script=Han}/gu)??[]).length,
    englishInputs:flowInputs[0],chineseInputs:flowInputs[1],composing:composing.size>0,scrolled:flowScrolled,submitted
  } : undefined;
  for(const [index,field] of fields.entries()) if(field) {
    field.addEventListener('input',event => {if(event.isTrusted) flowInputs[index]=Math.min(1_000_000,flowInputs[index]+1);behaviorDirty=true;});
    field.addEventListener('compositionstart',() => {composing.add(field);behaviorDirty=true;});
    field.addEventListener('compositionend',() => {composing.delete(field);behaviorDirty=true;});
  }
  const types = ['input', 'change', 'click', 'keydown', 'keyup', 'compositionstart', 'compositionend', 'paste', 'focus', 'blur', 'visibilitychange'];
  function flush(final = false, submitted = false) {
    if (pendingFlush) return final ? pendingFlush.then(() => flush(true,submitted)) : pendingFlush;
    pendingFlush = send(final,submitted).finally(() => { pendingFlush = null; });
    return pendingFlush;
  }
  async function send(final = false, submitted = false) {
    if (!final && !events.length && !environment && !integrity && !workerIntegrity && !dropped && !behaviorDirty) return;
    const identity = environment ? { userAgent: read(() => navigator.userAgent),
      hints: read(() => navigator.userAgentData?.toJSON() ?? null), highEntropy, highEntropyValidity } : undefined;
    const timing=cadence();
    const packet = { version: 1, page, batch: crypto.randomUUID(), events: events.splice(0, 64), environment, identity, integrity, workerIntegrity,
      behavior: { keys: timing?.starts ?? [...keys], scroll: { ...scroll }, cadence: timing },flow:flow(submitted),dropped };
    environment = undefined; integrity = undefined; workerIntegrity = undefined; dropped = 0; behaviorDirty = false;
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error('telemetry_rejected');
      const receipt = await response.json();
      document.dispatchEvent(new CustomEvent('bat:measurement', { detail: receipt }));
      return receipt;
    } catch {
      // Failure stays visible; no silent retry loop or claim of healthy measurement.
      globalThis.__batShieldTelemetry = { status: 'failed', page };
      document.dispatchEvent(new CustomEvent('bat:measurement-error', { detail: { page } }));
    }
  }
  for (const type of types) document.addEventListener(type, event => {
    if (type === 'keydown') {
      if (!event.repeat && !event.isComposing && event.keyCode !== 229 && event.key !== 'Process'
        && (!cadenceTarget || event.target===cadenceTarget)
        && !cadence()?.excluded) { keys.push(event.timeStamp); if (keys.length > 128) keys.shift(); }
      if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)) scroll.scrollKey = true;
    }
    if (events.length < 64) events.push({ type, trusted: event.isTrusted, hidden: document.hidden });
    else dropped = Math.min(dropped + 1, 1_000_000);
    if (events.length === 64 || type === 'visibilitychange') void flush();
  }, true);
  document.addEventListener('wheel', () => { scroll.wheelCount = Math.min(1_000_000, scroll.wheelCount + 1); behaviorDirty = true; }, { passive: true });
  document.addEventListener('scroll', event => {
    // WHY：scroll 不冒泡，阅读区必须在捕获阶段采样；沿用原阈值，不把点击锚点误当滚轮。
    const target = event.target === document ? document.scrollingElement : event.target;
    if (!(target instanceof Element)) return;
    const position = target.scrollTop, previous = scrollPositions.get(target) ?? 0;
    if(target.id==='reading' && event.isTrusted && position!==previous) flowScrolled=true;
    scroll.count = Math.min(1_000_000, scroll.count + 1);
    scroll.maxDelta = Math.max(scroll.maxDelta, Math.abs(position - previous));
    scrollPositions.set(target, position); behaviorDirty = true;
  }, { passive: true, capture: true });
  addEventListener('pagehide', () => void flush(true));
  if (document.currentScript.dataset.controlled === 'true') globalThis.__batShieldCollector = { page, submit: () => flush(true,true) };
  else document.addEventListener('submit', () => void flush(true), true);
  setInterval(() => void flush(), 1000);
  async function measure(collect, failed) {
    let timer;
    try { return await Promise.race([Promise.resolve().then(collect),
      new Promise(resolve => { timer = setTimeout(() => resolve(failed('timeout')), 15000); })]); }
    catch { return failed('error'); }
    finally { clearTimeout(timer); }
  }
  void (async () => {
    // WHY：任选UA API或某个库挂起不能阻塞其它测量；超时保留未知，迟到值不覆盖已结算结果。
    const ua = measure(async () => {
      const keys = ['architecture','bitness','model','platformVersion','wow64','fullVersionList','formFactors'];
      const values = await navigator.userAgentData?.getHighEntropyValues(keys);
      return { validity: values ? 'measured' : 'unavailable',
        value: values ? Object.fromEntries(keys.map(key => [key, values[key] ?? null])) : null };
    }, validity => ({ validity, value: null }));
    const botd = measure(async () => {
      const { load, measurementHealth } = await import('/measurement/probe/botd.js');
      const detector = await load({ monitoring: false });
      detector.detect();
      const components=detector.getComponents();
      const { unavailable, absent } = measurementHealth(components);
      return { version: '2.0.0', status: unavailable.length ? 'partial' : 'measured', unavailable, absent,
        signals: Object.entries(detector.getDetections()).map(([name, value]) => ({ name, detected: value.bot })) };
    }, status => ({ version: '2.0.0', status, signals: [], unavailable: [] }));
    const version = '10aa6724cd33a1015db1574211890518cd04f0cc';
    void measure(() => import('/measurement/worker/probe.js').then(m => m.workerIntegrity()), validity => ({ version,
      signals: ['platform', 'userAgent', 'hardwareConcurrency', 'deviceMemory'].map(name => ({ name, validity, mismatch: null }))
    })).then(value => { workerIntegrity = value; globalThis.__batShieldWorker = value; return flush(); });
    void measure(() => import('/measurement/creep.js').then(m => m.webglIntegrity()), validity => ({ version, validity, mismatch: null }))
      .then(value => { integrity = value; globalThis.__batShieldIntegrity = value; return flush(); });
    const [identityResult, environmentResult] = await Promise.all([ua, botd]);
    highEntropy = identityResult.value; highEntropyValidity = identityResult.validity; environment = environmentResult;
    globalThis.__batShieldTelemetry = { status: environment.status, page };
    await flush();
  })();
})();
}
