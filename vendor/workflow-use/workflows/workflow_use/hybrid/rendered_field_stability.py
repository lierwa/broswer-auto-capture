"""Wait for native finite presentation transitions without changing the page."""

# WHY：业务状态可能先变更，旧/新文字仍在过渡动画中共存。复用 Web Animations
# 的完成信号，不靠站点词表、固定 sleep 或模型判断；无限装饰动画不阻塞读取。
RENDERED_FIELD_STABILITY = """
  const renderedScopes = () => fields.flatMap((field) => {
    if (field.attribute || field.valueSource || field.textSource === 'textContent') return [];
    try {
      const selected = Array.from(this.querySelectorAll(field.selector));
      if (this.matches(field.selector)) selected.unshift(this);
      return selected.slice(0, field.sampleLimit ?? (field.multiple ? field.maxValues + 1 : 2));
    } catch (_) { return []; } // 原投影统一报告非法 selector。
  });
  const activeAnimations = () => {
    const animations = new Set();
    for (const node of renderedScopes()) {
      node.getAnimations({subtree: true}).forEach((animation) => animations.add(animation));
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        parent.getAnimations().forEach((animation) => animations.add(animation));
      }
    }
    return [...animations].filter((animation) =>
      (animation.pending || ['running', 'paused'].includes(animation.playState))
      && Number.isFinite(animation.effect?.getComputedTiming().endTime));
  };
  const settle = async () => {
    for (let pending = activeAnimations(); !expired && pending.length; pending = activeAnimations()) {
      await Promise.allSettled(pending.map((animation) => animation.finished));
      if (expired) return false;
      // finish 事件可能在 promise 之后移除旧节点；等待原生下一帧，再重新查询。
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return true;
  };
  let timer;
  let expired = false;
  const budget = new Promise((resolve) => {
    timer = setTimeout(() => { expired = true; resolve(false); }, 3000);
  });
  try {
    if (!await Promise.race([settle(), budget])) return [null, 'read_animation_timeout'];
  } finally { clearTimeout(timer); }
"""
