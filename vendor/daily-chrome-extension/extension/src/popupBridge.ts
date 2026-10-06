import { z } from 'zod';
import { configurationSchema, localHttp, requestSchema, tokenSchema, workbenchSchema } from './popupProtocol';
import type { PopupConfiguration, PopupRequest } from './popupProtocol';
export type { PopupConfiguration } from './popupProtocol';
type Pending = PopupRequest & { configuration: PopupConfiguration };

// WHY：持久偏好只决定是否准入；授权仍由原 token 握手保存，控制仍由原微软扩展承担。
export class PopupBridge {
  private pending?: Pending;
  private connectionAttempt?: Promise<void>;
  private receiving?: Promise<void>;
  private currentUrl?: string;
  private error = '';
  private pausing = false;
  private resumeClaimed = false;
  private hostHasSavedGrant = false;

  constructor(private connect: (configuration: PopupConfiguration, token?: string) => Promise<void>,
    private status: () => unknown[], private disconnect: () => void = () => {}) {
    chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
      if (!sender.url || !localHttp.safeParse(sender.url).success) return false;
      if (!['bat.connectPopup', 'bat.syncWorkbench', 'bat.resumeFailed'].includes(message?.type)) return false;
      this.external(message, new URL(sender.url).origin, sender.tab?.windowId).then(
        result => reply({ success: true, ...result }), () => reply({ success: false }));
      return true;
    });
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      if (!message?.type?.startsWith('bat.')) return false;
      if (sender.id && sender.id !== chrome.runtime.id) return false;
      this.handle(message).then(result => reply({ success: true, ...result }), (error: Error) =>
        reply({ success: false, error: error.message }));
      return true;
    });
  }

  private async external(message: { type: string; request?: unknown; state?: unknown }, origin: string, windowId?: number) {
    if (message.type === 'bat.connectPopup') { await this.receive(message.request, origin, windowId); return {}; }
    const settings = await chrome.storage.local.get('bat-workbench-origin');
    if (settings['bat-workbench-origin'] && settings['bat-workbench-origin'] !== origin) return {};
    if (message.type === 'bat.resumeFailed') {
      this.error = '连接未完成，请在工作台重试连接。';
      this.resumeClaimed = false;
      await chrome.storage.local.set({ 'bat-resume-requested': false });
      return {};
    }
    return this.syncWorkbench(message.state, true);
  }

  private async handle(message: { type: string; token?: unknown; request?: unknown; enabled?: unknown; state?: unknown }) {
    switch (message.type) {
      case 'bat.syncToken': {
        // 原 localStorage token 原样迁移；迁移不能绕过用户保存的 OFF。
        const token = tokenSchema.parse(message.token);
        await chrome.storage.local.set({ 'bat-auth-token': token });
        if (this.pending?.configuration.token === token) await this.autoConnect();
        return {};
      }
      case 'bat.getPopupStatus': return this.snapshot();
      case 'bat.syncHost': return this.syncWorkbench(message.state, false);
      case 'bat.receiveRequest': await this.receive(message.request, undefined, undefined, false); return {};
      case 'bat.setConnectionEnabled': await this.setEnabled(z.boolean().parse(message.enabled)); return {};
      case 'bat.reject': await this.decline(); return {};
      case 'bat.openWorkbench': await this.openWorkbench(); return {};
      default: throw new Error('不支持的扩展操作。');
    }
  }

  private async snapshot() {
    await this.discardExpiredRequest();
    const settings = await chrome.storage.local.get(['bat-workbench-origin', 'bat-connection-enabled', 'bat-authorized',
      'bat-profile-name', 'bat-resume-requested']);
    return { pending: this.pending ? { profileName: this.pending.profileName, requestId: this.pending.url,
      requiresAuthorization: this.pending.configuration.persistAuthorization } : null,
    connecting: Boolean(this.connectionAttempt), connections: this.status(),
    enabled: settings['bat-connection-enabled'] === true, authorized: settings['bat-authorized'] === true,
    profileName: settings['bat-profile-name'] ?? null,
    error: this.error, workbenchOrigin: settings['bat-workbench-origin'] ?? 'http://127.0.0.1:4173' };
  }

  private async syncWorkbench(input: unknown, claimResume: boolean) {
    const state = workbenchSchema.parse(input);
    // WHY：宿主授权可用于发起恢复，但不能据此标记本扩展已授权；原 token 握手仍须匹配。
    this.hostHasSavedGrant = state.paired;
    const settings = await chrome.storage.local.get(['bat-authorized', 'bat-resume-requested', 'bat-connection-enabled']);
    const patch: Record<string, unknown> = {};
    // 撤销沿宿主事实清除显示；首次握手尚在保存时不能误清授权。
    if (!state.paired && !state.busy && !this.pending && !this.connectionAttempt && !this.status().length) {
      if (settings['bat-authorized']) Object.assign(patch, { 'bat-authorized': false, 'bat-connection-enabled': false });
    }
    const resumeRequested = Boolean(claimResume && !this.resumeClaimed && settings['bat-resume-requested']
      && settings['bat-connection-enabled'] && state.paired && !state.busy && !state.connected);
    if (resumeRequested) { this.resumeClaimed = true; patch['bat-resume-requested'] = false; }
    if (Object.keys(patch).length) await chrome.storage.local.set(patch);
    return { resumeRequested };
  }

  private async setEnabled(enabled: boolean) {
    this.error = '';
    if (!enabled) {
      this.pausing = true;
      try {
        await chrome.storage.local.set({ 'bat-connection-enabled': false, 'bat-resume-requested': false });
        await this.connectionAttempt?.catch(() => {});
        this.disconnect();
        await this.decline('paused');
      } finally { this.pausing = false; }
      return;
    }
    await this.discardExpiredRequest();
    const settings = await chrome.storage.local.get('bat-authorized');
    if (!this.pending && !settings['bat-authorized'] && !this.hostHasSavedGrant)
      throw new Error('请先在工作台点击「授权 Chrome」。');
    await chrome.storage.local.set({ 'bat-connection-enabled': true });
    if (this.pending) { await this.approve(); return; }
    this.resumeClaimed = false;
    await chrome.storage.local.set({ 'bat-resume-requested': !this.status().length });
  }

  async receive(input: unknown, origin?: string, windowId?: number, showPopup = true) {
    const request = requestSchema.parse(input);
    await this.discardExpiredRequest();
    if (this.currentUrl === request.url) { await this.receiving; return; }
    if (this.pending || this.connectionAttempt) throw new Error('正在处理另一个连接请求。');
    this.currentUrl = request.url;
    const operation = this.receiveConfiguration(request, origin, windowId, showPopup);
    this.receiving = operation;
    try { await operation; } catch (error) { this.currentUrl = undefined; throw error; }
    finally { if (this.receiving === operation) this.receiving = undefined; }
  }

  private async discardExpiredRequest() {
    const pending = this.pending;
    if (!pending || this.connectionAttempt) return;
    const live = await this.request(pending.url).then(() => true, () => false);
    if (live || this.pending !== pending || this.connectionAttempt) return;
    this.pending = undefined; this.currentUrl = undefined; this.error = '';
    await chrome.action.setBadgeText({ text: '' });
  }

  private async receiveConfiguration(request: PopupRequest, origin?: string, windowId?: number, showPopup = true) {
    const response = await this.request(request.url);
    const configuration = configurationSchema.parse(await response.json());
    const relay = new URL(configuration.mcpRelayUrl), ticket = new URL(request.url);
    if (relay.protocol !== 'ws:' || relay.hostname !== ticket.hostname || relay.port !== ticket.port
      || relay.username || relay.password || !/^\/extension\/[a-f0-9-]+$/.test(relay.pathname)) throw new Error('本机连接地址无效。');
    if (origin) await chrome.storage.local.set({ 'bat-workbench-origin': origin });
    this.error = ''; this.pending = { ...request, configuration }; this.resumeClaimed = false;
    await chrome.storage.local.set({ 'bat-resume-requested': false, 'bat-profile-name': request.profileName });
    // WHY：新授权必须来自本次用户动作，旧 ON 不能批准撤销后的新请求。
    if (!configuration.token) await chrome.storage.local.set({ 'bat-connection-enabled': false, 'bat-authorized': false });
    if (request.openPopup && showPopup) await chrome.action.openPopup(windowId === undefined ? {} : { windowId }).catch(() => {});
    if (configuration.token) { await this.autoConnect(); return; }
    await chrome.action.setBadgeBackgroundColor({ color: '#ffc53d' });
    await chrome.action.setBadgeText({ text: '?' });
  }

  private async autoConnect() {
    const pending = this.pending;
    if (!pending?.configuration.token) return;
    const settings = await chrome.storage.local.get(['bat-auth-token', 'bat-connection-enabled']);
    if (settings['bat-connection-enabled'] === false || this.pausing) {
      if (!pending.openPopup) await this.decline('paused');
      return;
    }
    if (settings['bat-auth-token'] !== pending.configuration.token) {
      this.error = '当前 Chrome 的授权不匹配，请在工作台重新授权。'; return;
    }
    // 未设置偏好的旧版本可沿原 token 升级；已保存的 OFF 永远优先。
    await chrome.storage.local.set({ 'bat-connection-enabled': true });
    await this.approve();
  }

  private async approve() {
    if (this.connectionAttempt || !this.pending || this.pausing) return;
    const pending = this.pending;
    const attempt = Promise.resolve().then(async () => {
      const settings = await chrome.storage.local.get(['bat-auth-token', 'bat-connection-enabled']);
      if (settings['bat-connection-enabled'] !== true || this.pausing) return;
      const token = tokenSchema.parse(settings['bat-auth-token']);
      if (pending.configuration.token && pending.configuration.token !== token) throw new Error('当前 Chrome 的授权不匹配。');
      this.error = '';
      await this.connect(pending.configuration, pending.configuration.persistAuthorization ? token : undefined);
      await chrome.storage.local.set({ 'bat-authorized': true });
      this.pending = undefined;
      await chrome.action.setBadgeText({ text: '' });
    });
    this.connectionAttempt = attempt;
    try { await attempt; } finally { this.connectionAttempt = undefined; }
  }

  private async decline(reason?: 'paused') {
    const pending = this.pending;
    this.pending = undefined;
    if (pending) await this.request(pending.url, 'DELETE', reason).catch(() => {});
    await chrome.action.setBadgeText({ text: '' });
  }

  private async openWorkbench() {
    const settings = await chrome.storage.local.get('bat-workbench-origin');
    const origin = localHttp.parse(settings['bat-workbench-origin'] ?? 'http://127.0.0.1:4173');
    const tabs = await chrome.tabs.query({ url: origin + '/*' });
    if (!tabs[0]?.id) { await chrome.tabs.create({ url: origin }); return; }
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  }

  private async request(url: string, method = 'GET', reason?: 'paused') {
    const response = await fetch(url, { method, headers: { 'x-bat-extension': chrome.runtime.id,
      ...(reason ? { 'x-bat-decline-reason': reason } : {}) }, cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error('本次连接请求已结束，请在工作台再次点击连接。');
    return response;
  }
}
