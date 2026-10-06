import type { CDPMessage } from './browserModel.js';

/** WHY：只增加 owner 路由；Chrome debugger、目标创建和 CDP 映射仍使用原协议实现。 */
export class CDPOwnerScopes {
  private targets = new Map<string, Set<string>>();
  private sessions = new Map<string, string>();
  private clients = new Map<any, string>();
  register(owner: string, targets: string[]) {
    if (!/^[0-9a-f-]{36}$/i.test(owner)) throw Error('daily_chrome_owner_invalid');
    const known = this.targets.get(owner) ?? new Set<string>();
    targets.forEach(target => known.add(target)); this.targets.set(owner, known);
  }
  accepts(owner: string) { return this.targets.has(owner); }
  ownedTargets(owner: string) { return [...(this.targets.get(owner) ?? [])]; }
  connect(client: any, owner: string) { this.clients.set(client, owner); }
  disconnect(client: any) { this.clients.delete(client); }
  close(reason: string) { for (const client of this.clients.keys()) client.close(1000, reason); }
  owns(owner: string, target: string) { return this.targets.get(owner)?.has(target) === true; }
  claim(owner: string, target: string) { this.targets.get(owner)?.add(target); }
  parameters(owner: string, method: string, params: any, sessionId?: string, liveTargets: { targetId: string }[] = []) {
    // WHY：Playwright 用无 target 的只读查询完成握手；原 BrowserModel 默认取全局首 tab，
    // 因此必须先限定到本 owner，不能直接放开原 fallback 或把缺失目标的写操作一起放行。
    if (method !== 'Target.getTargetInfo' || params?.targetId || sessionId && sessionId !== 'bat-browser-root') return params;
    const targetId = liveTargets.find(target => this.owns(owner, target.targetId))?.targetId;
    if (!targetId) throw Error('daily_chrome_target_required');
    return { ...params, targetId };
  }
  check(owner: string, method: string, params: any, sessionId?: string) {
    // WHY：Target.closeTarget 等浏览器动作即使带合法 session 仍按 target 路由，不能跳过目标归属。
    if (params?.targetId && !this.owns(owner, params.targetId)) throw Error('daily_chrome_target_not_authorized');
    if (sessionId && sessionId !== 'bat-browser-root') {
      if (this.sessions.get(sessionId) !== owner) throw Error('daily_chrome_session_not_authorized');
      return;
    }
    if (params?.sessionId && params.sessionId !== 'bat-browser-root' && this.sessions.get(params.sessionId) !== owner)
      throw Error('daily_chrome_session_not_authorized');
    const allowed = ['Browser.getVersion', 'Browser.setDownloadBehavior', 'Target.getTargets', 'Target.getTargetInfo',
      'Target.createTarget', 'Target.attachToTarget', 'Target.attachToBrowserTarget', 'Target.detachFromTarget',
      'Target.setAutoAttach', 'Target.setDiscoverTargets', 'Target.activateTarget', 'Target.closeTarget'];
    if (!allowed.includes(method)) throw Error('daily_chrome_browser_command_not_authorized');
    if (['Target.closeTarget', 'Target.activateTarget', 'Target.attachToTarget', 'Target.getTargetInfo'].includes(method)
      && !params?.targetId) throw Error('daily_chrome_target_required');
  }
  response(owner: string, method: string, params: any, result: any) {
    if (method === 'Target.createTarget') this.claim(owner, result.targetId);
    if (method === 'Target.attachToTarget') this.sessions.set(result.sessionId, owner);
    if (method === 'Target.getTargets') return { ...result, targetInfos: result.targetInfos.filter((t: any) => this.owns(owner, t.targetId)) };
    return result;
  }
  event(message: CDPMessage) {
    const info = message.params?.targetInfo, target = info?.targetId ?? message.params?.targetId;
    let owner = message.sessionId ? this.sessions.get(message.sessionId) : undefined;
    owner ??= [...this.targets].find(([, targets]) => targets.has(target) || targets.has(info?.openerId))?.[0];
    if (!owner) return;
    if (target) this.claim(owner, target);
    if (message.method === 'Target.attachedToTarget' && message.params?.sessionId) this.sessions.set(message.params.sessionId, owner);
    for (const [client, scope] of this.clients) if (scope === owner && client.readyState === 1) client.send(JSON.stringify(message));
    if (message.method === 'Target.detachedFromTarget') this.sessions.delete(message.params?.sessionId);
  }
}
