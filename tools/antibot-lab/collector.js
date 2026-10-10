// No key values, input contents, clipboard, graphics fingerprint or external upload.
{
const captureCadence = changed => {
  let target, sample, last, pasted = false;
  const pending = new Map(), modifiers = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock']);
  const reset = element => {
    target = element; last = undefined; pending.clear();
    sample = { keyCount: 0, intervals: [], dwellTimes: [], invalid: false, excluded: pasted };
  };
  const record = event => {
    if (event.target?.tagName !== 'TEXTAREA') return;
    if (target !== event.target) reset(event.target);
    changed();
    if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !event.code) {
      sample.excluded = true; return;
    }
    if (modifiers.has(event.key)) return;
    const at = event.timeStamp;
    if (!Number.isFinite(at) || at < 0) { sample.invalid = true; return; }
    if (event.type === 'keydown') {
      if (pending.has(event.code) || pending.size >= 100) { sample.invalid = true; return; }
      pending.set(event.code, at); sample.keyCount = Math.min(100, sample.keyCount + 1);
      if (last !== undefined) {
        if (at < last) sample.invalid = true;
        else sample.intervals.push(at - last);
        if (sample.intervals.length > 99) sample.intervals.shift();
      }
      last = at;
    } else {
      const down = pending.get(event.code); pending.delete(event.code);
      if (down === undefined || at < down) sample.invalid = true;
      else { sample.dwellTimes.push(at - down); if (sample.dwellTimes.length > 100) sample.dwellTimes.shift(); }
    }
  };
  for (const type of ['keydown', 'keyup']) document.addEventListener(type, record, { capture: true, passive: true });
  for (const type of ['paste', 'compositionstart']) document.addEventListener(type, event => {
    if (type === 'paste') pasted = true; // 保留原规则的整页粘贴排除，换字段不能偷偷恢复判定。
    if (event.target?.tagName === 'TEXTAREA' && target !== event.target) reset(event.target);
    if (sample) { sample.excluded = true; changed(); }
  }, { capture: true, passive: true });
  document.addEventListener('blur', event => {
    if (event.target !== target) return;
    if (pending.size) sample.invalid = true;
    pending.clear(); target = undefined; changed();
  }, true);
  return () => sample ? { ...sample, intervals: [...sample.intervals], dwellTimes: [...sample.dwellTimes], pending: pending.size } : undefined;
};

(() => {
  const id = document.currentScript.dataset.case;
  const page = document.currentScript.dataset.page, endpoint = document.currentScript.dataset.endpoint || '/shield/telemetry/' + id;
  let events = [], environment, integrity, workerIntegrity, highEntropy = null, highEntropyValidity, dropped = 0, sending = false;
  const read = fn => { try { return fn(); } catch { return null; } };
  const keys = [], scroll = { count: 0, maxDelta: 0, wheelCount: 0, scrollKey: false, maxTouchPoints: read(() => navigator.maxTouchPoints ?? null) };
  let lastY = scrollY, behaviorDirty = false;
  const cadence = captureCadence(() => { behaviorDirty = true; });
  const types = ['input', 'change', 'click', 'keydown', 'keyup', 'compositionend', 'paste', 'focus', 'blur', 'visibilitychange'];
  async function flush(final = false) {
    if ((sending && !final) || (!events.length && !environment && !integrity && !workerIntegrity && !dropped && !behaviorDirty)) return;
    sending = true;
    const identity = environment ? { userAgent: read(() => navigator.userAgent),
      hints: read(() => navigator.userAgentData?.toJSON() ?? null), highEntropy, highEntropyValidity } : undefined;
    const packet = { version: 1, page, batch: crypto.randomUUID(), events: events.splice(0, 64), environment, identity, integrity, workerIntegrity,
      behavior: { keys: [...keys], scroll: { ...scroll }, cadence: cadence() }, dropped };
    environment = undefined; integrity = undefined; workerIntegrity = undefined; dropped = 0; behaviorDirty = false;
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet) });
      if (!response.ok) throw Error('telemetry_rejected');
      const receipt = await response.json();
      document.dispatchEvent(new CustomEvent('bat:measurement', { detail: receipt }));
    } catch {
      // Failure stays visible; no silent retry loop or claim of healthy measurement.
      globalThis.__batShieldTelemetry = { status: 'failed', page };
      document.dispatchEvent(new CustomEvent('bat:measurement-error'));
    } finally { sending = false; }
  }
  for (const type of types) document.addEventListener(type, event => {
    if (type === 'keydown') {
      if (!event.repeat && !event.isComposing) { keys.push(event.timeStamp); if (keys.length > 128) keys.shift(); }
      if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)) scroll.scrollKey = true;
    }
    if (events.length < 64) events.push({ type, trusted: event.isTrusted, hidden: document.hidden });
    else dropped = Math.min(dropped + 1, 1_000_000);
    if (events.length === 64 || type === 'visibilitychange') void flush();
  }, true);
  document.addEventListener('wheel', () => { scroll.wheelCount = Math.min(1_000_000, scroll.wheelCount + 1); behaviorDirty = true; }, { passive: true });
  document.addEventListener('scroll', () => {
    scroll.count = Math.min(1_000_000, scroll.count + 1);
    scroll.maxDelta = Math.max(scroll.maxDelta, Math.abs(scrollY - lastY)); lastY = scrollY; behaviorDirty = true;
  }, { passive: true });
  addEventListener('pagehide', () => void flush(true));
  document.addEventListener('submit', () => void flush(true), true);
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
      const { unavailable, absent } = measurementHealth(detector.getComponents());
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
