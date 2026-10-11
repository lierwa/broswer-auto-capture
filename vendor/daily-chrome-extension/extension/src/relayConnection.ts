/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export function debugLog(...args: unknown[]): void {
  const enabled = false; // WHY：原始命令、页面和凭据不得进入扩展 console。
  if (enabled) {
    // eslint-disable-next-line no-console
    console.log('[Extension]', ...args);
  }
}

type ProtocolCommand = {
  id: number;
  method: string;
  params?: any;
};

type ProtocolResponse = {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: string;
};

// Allow-listed chrome.* commands the relay may invoke. They are resolved
// reflectively and the positional params are spread into the call.
import { closeOwnedTarget } from './closeOwnedTarget';
import { startHeartbeat, type HeartbeatHandle } from './upstream/browser-skill/heartbeat';

const ALLOWED_CHROME_COMMANDS = new Set([
  'bat.closeOwnedTarget',
  'chrome.debugger.attach',
  'chrome.debugger.detach',
  'chrome.debugger.sendCommand',
  'chrome.tabs.create',
  'chrome.tabs.remove',
  'chrome.tabs.update',
  'chrome.windows.update',
]);

// chrome.* events the extension forwards to the relay (positional params).
const CHROME_EVENT_METHODS = [
  'chrome.debugger.onEvent',
  'chrome.debugger.onDetach',
  'chrome.tabs.onCreated',
  'chrome.tabs.onRemoved',
];

export class RelayConnection {
  private _ws: WebSocket;
  // Tabs whose debugger we have explicitly attached for this connection.
  private _attachedTabs = new Set<number>();
  // 扩展只准入自身创建的目标及其 popup；分组/窗口相同不能授予目标所有权。
  private _ownedTabs = new Set<number>();
  private _taskWindowId?: number;
  private _ownedWindows = new Set<number>();
  private _eventListeners: Array<{ remove: () => void }> = [];
  private _closed = false;
  private _keepalive?: HeartbeatHandle;
  private _connectPageId?: number;

  onclose?: () => void;
  ontabattached?: (tabId: number) => void;
  ontabdetached?: (tabId: number) => void;

  get attachedTabs(): ReadonlySet<number> {
    return this._attachedTabs;
  }

  constructor(ws: WebSocket) {
    this._ws = ws;
    this._installEventForwarders();
    this._ws.onmessage = this._onMessage.bind(this);
    this._ws.onclose = () => this._onClose();
  }

  // Signals readiness after the optional initial-tab attachments. An empty
  // model is ready too: the operation creates its own owned target later.
  didInitialize(authorizationToken?: string): void {
    this._sendMessage({ method: 'extension.initialized',
      params: authorizationToken ? [{ token: authorizationToken }] : [] });
    // WHY：直接复用BrowserSkill保活组件；仅将心跳事件映射为原Playwright协议。
    this._keepalive ??= startHeartbeat({ send: () => this._sendMessage({ method: 'extension.keepalive', params: [] }),
      onActiveChange: callback => { callback(true); return () => {}; } });
  }

  async releaseConnectPage(tabId: number): Promise<void> {
    this._connectPageId = tabId;
    await this._closeConnectPage();
  }

  private async _closeConnectPage(): Promise<void> {
    const tabId = this._connectPageId;
    if (tabId === undefined || this._closed) return;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url?.split('?')[0] !== chrome.runtime.getURL('connect.html')) {
        this._connectPageId = undefined;
        return;
      }
      // WHY：冷启动唯一页关闭会退出Chrome；等原operation建好任务窗口后再收尾。
      if (!(await chrome.tabs.query({})).some(other => other.id !== tabId)) return;
      await chrome.tabs.remove(tabId);
      this._connectPageId = undefined;
    } catch { /* 用户已关页或正在拖动；下一次任务创建时仍可重试，不影响连接。 */ }
  }

  close(message: string): void {
    this._ws.close(1000, message);
    // ws.onclose is called asynchronously, so we call it here to avoid forwarding
    // CDP events to the closed connection.
    this._onClose();
  }

  // Called when the UI adds a tab to the Playwright group, whether as the
  // initial pick from the connect page or from a later drag-in. Simulates a
  // "new tab opened" event; the relay responds by calling
  // chrome.debugger.attach, which flows through _handleCommand and fires
  // ontabattached.
  attachTab(tab: chrome.tabs.Tab): void {
    if (this._closed || this._attachedTabs.has(tab.id!))
      return;
    this._ownedTabs.add(tab.id!);
    this._taskWindowId ??= tab.windowId;
    if (tab.windowId !== undefined)
      this._ownedWindows.add(tab.windowId);
    this._sendMessage({ method: 'chrome.tabs.onCreated', params: [tab] });
  }

  // Called when the UI removes a tab from the Playwright group. We detach the
  // debugger and update bookkeeping. chrome.debugger.detach does not fire
  // onDetach for the caller, so we synthesize one so the relay notices the
  // tab is gone.
  detachTab(tabId: number): void {
    if (this._closed || !this._attachedTabs.has(tabId))
      return;
    this._ownedTabs.delete(tabId);
    chrome.debugger.detach({ tabId }).catch(error => {
      debugLog('Error detaching tab:', error);
    });
    this._notifyTabDetached(tabId);
    this._sendMessage({
      method: 'chrome.debugger.onDetach',
      params: [{ tabId }, 'target_closed'],
    });
  }

  private _notifyTabAttached(tabId: number): void {
    this._attachedTabs.add(tabId);
    this.ontabattached?.(tabId);
  }

  private _notifyTabDetached(tabId: number): void {
    this._attachedTabs.delete(tabId);
    if (!this._attachedTabs.size) this._taskWindowId = undefined;
    this.ontabdetached?.(tabId);
  }

  private _installEventForwarders(): void {
    for (const fullMethod of CHROME_EVENT_METHODS) {
      const target = resolveChromeMember(fullMethod);
      const listener = (...args: any[]) => this._onChromeEvent(fullMethod, args);
      target.obj[target.name].addListener(listener);
      this._eventListeners.push({
        remove: () => target.obj[target.name].removeListener(listener),
      });
    }
  }

  private _onClose() {
    if (this._closed)
      return;
    this._closed = true;
    this._keepalive?.dispose();
    this._keepalive = undefined;
    for (const l of this._eventListeners)
      l.remove();
    this._eventListeners = [];
    for (const tabId of [...this._attachedTabs]) {
      chrome.debugger.detach({ tabId }).catch(() => {});
      this._notifyTabDetached(tabId);
    }
    this.onclose?.();
  }

  // Forwards chrome.* events concerning attached tabs to the relay, then runs
  // shared detach bookkeeping.
  private _onChromeEvent(fullMethod: string, args: any[]): void {
    const tabId = this._tabIdForEventArgs(fullMethod, args);
    if (tabId === undefined || !(fullMethod === 'chrome.tabs.onRemoved' ? this._ownedTabs : this._attachedTabs).has(tabId))
      return;
    if (fullMethod === 'chrome.tabs.onCreated') {
      const tab = args[0] as chrome.tabs.Tab;
      this._ownedTabs.add(tab.id!);
      this._ownedWindows.add(tab.windowId);
    }
    this._sendMessage({ method: fullMethod, params: args });
    // chrome.debugger.onDetach is the single source of truth for detach bookkeeping.
    if (fullMethod === 'chrome.debugger.onDetach') {
      this._notifyTabDetached(tabId);
      // WHY：沿用 B-A-T 原断线失败合同，不由扩展擅自恢复 debugger 会话。
      // WHY：最后一个任务页结束只释放目标；授权连接由显式暂停或宿主关闭结束。
    }
    // WHY：debugger终止不证明物理tab已关闭；原创建者仍需有权完成finally清理。
    if (fullMethod === 'chrome.tabs.onRemoved') {
      this._ownedTabs.delete(tabId);
      if (this._attachedTabs.has(tabId)) this._notifyTabDetached(tabId);
    }
  }

  // Returns the tabId an event refers to, for filtering by _attachedTabs.
  private _tabIdForEventArgs(fullMethod: string, args: any[]): number | undefined {
    switch (fullMethod) {
      case 'chrome.debugger.onEvent':
      case 'chrome.debugger.onDetach':
        return (args[0] as chrome.debugger.Debuggee | undefined)?.tabId;
      case 'chrome.tabs.onCreated': {
        const tab = args[0] as chrome.tabs.Tab;
        // Forward only popups opened by an attached tab; report the opener so cdpRelay
        // can filter / decide. We use the openerTabId for the attached-tab check.
        return tab.openerTabId;
      }
      case 'chrome.tabs.onRemoved':
        return args[0] as number;
    }
    return undefined;
  }

  private _onMessage(event: MessageEvent): void {
    this._onMessageAsync(event).catch(e => debugLog('Error handling message:', e));
  }

  private async _onMessageAsync(event: MessageEvent): Promise<void> {
    let message: ProtocolCommand;
    try {
      message = JSON.parse(event.data);
    } catch (error: any) {
      debugLog(`Error parsing message ${event.data}:`, error);
      this._sendError(-32700, `Error parsing message: ${error.message}`);
      return;
    }

    const response: ProtocolResponse = {
      id: message.id,
    };
    try {
      response.result = await this._handleCommand(message);
    } catch (error: any) {
      debugLog(`Error handling command ${JSON.stringify(message)}:`, error);
      response.error = error.message;
    }
    this._sendMessage(response);
  }

  private async _handleCommand(message: ProtocolCommand): Promise<any> {
    if (!ALLOWED_CHROME_COMMANDS.has(message.method))
      throw new Error(`Unknown method: ${message.method}`);
    const args = (message.params ?? []) as any[];
    if (message.method === 'bat.closeOwnedTarget') return closeOwnedTarget(args[0]);
    if (message.method === 'chrome.tabs.create') {
      const { newWindow, ...properties } = args[0] ?? {};
      const tab = newWindow || this._taskWindowId === undefined
        ? (await chrome.windows.create({ url: properties.url ?? 'about:blank', focused: false })).tabs?.[0]
        : await chrome.tabs.create({ ...properties, windowId: this._taskWindowId });
      if (!tab?.id)
        throw new Error('daily_chrome_task_target_missing');
      this._ownedTabs.add(tab.id);
      this._ownedWindows.add(tab.windowId);
      this._taskWindowId = tab.windowId;
      await this._closeConnectPage();
      return tab;
    }
    if (message.method.startsWith('chrome.debugger.')) {
      const tabId = args[0]?.tabId;
      if (!this._ownedTabs.has(tabId))
        throw new Error('daily_chrome_target_not_authorized');
    }
    if (message.method === 'chrome.tabs.remove' || message.method === 'chrome.tabs.update') {
      const ids = Array.isArray(args[0]) ? args[0] : [args[0]];
      if (ids.some(id => !this._ownedTabs.has(id)))
        throw new Error('daily_chrome_target_not_authorized');
    }
    if (message.method === 'chrome.windows.update' && !this._ownedWindows.has(args[0]))
      throw new Error('daily_chrome_window_not_authorized');
    const result = await invokeChromeMethod(message.method, args);
    // Attach bookkeeping; detach flows through the chrome.debugger.onDetach event.
    if (message.method === 'chrome.debugger.attach') {
      const target = args[0] as chrome.debugger.Debuggee | undefined;
      if (target?.tabId !== undefined)
        this._notifyTabAttached(target.tabId);
    }
    return result ?? {};
  }

  private _sendError(code: number, message: string): void {
    this._sendMessage({
      error: {
        code,
        message,
      },
    });
  }

  private _sendMessage(message: any): void {
    if (this._ws.readyState === WebSocket.OPEN)
      this._ws.send(JSON.stringify(message));
  }
}

// ─── Reflective chrome.* invocation ────────────────────────────────────────

// Resolves chrome.<api>.<member>, shared by command invocation and event
// listener installation.
function resolveChromeMember(fullMethod: string): { obj: any; name: string } {
  const parts = fullMethod.split('.');
  if (parts[0] !== 'chrome' || parts.length < 3)
    throw new Error(`Invalid chrome method: ${fullMethod}`);
  let obj: any = chrome;
  for (let i = 1; i < parts.length - 1; i++) {
    obj = obj?.[parts[i]];
    if (obj === undefined)
      throw new Error(`Unknown chrome path: ${parts.slice(0, i + 1).join('.')}, calling ${fullMethod}`);
  }
  return { obj, name: parts[parts.length - 1] };
}

async function invokeChromeMethod(fullMethod: string, args: any[]): Promise<any> {
  const { obj, name } = resolveChromeMember(fullMethod);
  const fn = obj[name] as (...a: any[]) => any;
  if (typeof fn !== 'function')
    throw new Error(`Not a function: ${fullMethod}`);
  return await fn.apply(obj, args);
}
