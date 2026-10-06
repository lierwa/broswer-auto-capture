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

/**
 * Browser-side tab model used by the v2 relay. Owns the mapping between
 * chrome tab ids and CDP session ids, and is the single place that
 * translates between the chrome.* dialect spoken by the extension and the
 * CDP dialect spoken by Playwright.
 *
 * Lifecycle:
 *  1. Extension connects and, after the user allows, pushes a
 *     `chrome.tabs.onCreated` for each initial tab followed by
 *     `extension.initialized`. The model records these as "known" tabs
 *     without attaching yet.
 *  2. The relay observes `ready()` resolving and unpauses the Playwright ws.
 *  3. Playwright sends `Target.setAutoAttach` → model calls
 *     `enableAutoAttach()`, which attaches to every known tab and emits
 *     `Target.attachedToTarget` for each.
 *  4. Subsequent tab creates / debugger detaches / removes flow through the
 *     same model inputs and are translated into CDP events on the fly.
 */

import { logUnhandledError } from './log.js';

import type { DebuggerSession, Debuggee, Tab } from './protocol.js';

export type CDPMessage = {
  id?: number;
  sessionId?: string;
  method?: string;
  params?: any;
  result?: any;
  error?: { code?: number; message: string };
};

export type SendCommand = (method: string, params: any) => Promise<any>;
export type SendToCDPClient = (message: CDPMessage) => void;

type TabSession = {
  tabId: number;
  sessionId: string;
  targetInfo: any;
  // Child CDP sessionIds (workers, oopifs, ...) belonging to this tab,
  // tracked via Target.attachedToTarget / Target.detachedFromTarget events.
  childSessions: Set<string>;
};

export class BrowserModel {
  private _sendToExtension: SendCommand;
  // Set only while a Playwright CDP connection is attached (see
  // `connectOverCDP`). Before that, any attempt to emit to Playwright is a
  // no-op — the model is observation-only during the extension handshake.
  private _sendToCDPClient: SendToCDPClient | null = null;
  // Tabs observed via chrome.tabs.onCreated, whether or not the debugger is attached yet.
  private _knownTabs = new Map<number, Tab>();
  // Subset of _knownTabs we've attached the debugger to and assigned a sessionId.
  private _tabSessions = new Map<number, TabSession>();
  // WHY：控制会话失效与物理页面释放是不同事实；此映射只用于原拥有者清理。
  private _detachedTabs = new Map<string, number>();
  private _closedTargets = new Set<string>();
  private _autoAttach = false;
  private _nextSessionId = 1;
  private _announcedSessions = new Set<string>();
  private _borrowedSessions = new Map<string, TabSession>();
  private _runtimeReplayed = new Set<number>();

  constructor(sendToExtension: SendCommand) {
    this._sendToExtension = sendToExtension;
  }

  // Wires the model's CDP output sink. Called by the handler once the
  // extension handshake is done and a Playwright CDP client is ready to
  // receive events. Before this call the model is observation-only —
  // `Target.attachedToTarget` etc. would be answered into a black hole.
  connectOverCDP(sendToCDPClient: SendToCDPClient): void {
    this._sendToCDPClient = sendToCDPClient;
    this._announcedSessions.clear();
    this._borrowedSessions.clear();
    this._runtimeReplayed.clear();
  }
  prepareOwnerConnection(targets: string[]) {
    for (const session of this._tabSessions.values()) if (targets.includes(session.targetInfo?.targetId)) {
      this._announcedSessions.delete(session.sessionId);
      this._runtimeReplayed.delete(session.tabId);
    }
  }

  private _emit(message: CDPMessage): void {
    this._sendToCDPClient?.(message);
  }

  // ─── Extension → model inputs ─────────────────────────────────────────

  onTabCreated(tab: Tab): void {
    if (tab.id === undefined)
      return;
    this._knownTabs.set(tab.id, tab);
    if (this._autoAttach)
      void this._attachTab(tab.id).catch(logUnhandledError);
  }

  onTabRemoved(tabId: number): void {
    const targetId = this._tabSessions.get(tabId)?.targetInfo?.targetId;
    if (targetId) this._closedTargets.add(targetId);
    for (const [target, tab] of this._detachedTabs) if (tab === tabId) {
      this._closedTargets.add(target);
      this._detachedTabs.delete(target);
    }
    this._knownTabs.delete(tabId);
    this._detachTab(tabId);
  }

  onDebuggerEvent(source: DebuggerSession, method: string, params: any): void {
    if (source.tabId === undefined)
      return;
    const tabSession = this._tabSessions.get(source.tabId);
    if (!tabSession)
      return;
    // Track child CDP sessions so we can route subsequent commands for
    // them to the correct tab. Target.attachedToTarget introduces a new
    // sessionId belonging to the same tab; Target.detachedFromTarget
    // releases it.
    const childSessionId = (params as { sessionId?: string } | undefined)?.sessionId;
    if (method === 'Target.attachedToTarget' && childSessionId)
      tabSession.childSessions.add(childSessionId);
    else if (method === 'Target.detachedFromTarget' && childSessionId)
      tabSession.childSessions.delete(childSessionId);
    // Top-level CDP events for the tab use the tab's relay sessionId.
    // Child CDP sessions (workers, oopifs) keep their own sessionId.
    const sessionId = source.sessionId || tabSession.sessionId;
    this._emit({ sessionId, method, params });
    // WHY：原生选取事件属于具体已批准tab；只投递给该tab的临时借用，detach后停止。
    if (!source.sessionId && ['Overlay.inspectNodeRequested', 'Overlay.inspectModeCanceled'].includes(method)) {
      for (const [alias, borrowed] of this._borrowedSessions) {
        if (borrowed === tabSession) this._emit({ sessionId: alias, method, params });
      }
    }
  }

  onDebuggerDetach(source: Debuggee): void {
    if (source.tabId !== undefined) {
      const targetId = this._tabSessions.get(source.tabId)?.targetInfo?.targetId;
      if (targetId) this._detachedTabs.set(targetId, source.tabId);
      this._detachTab(source.tabId);
    }
  }

  // ─── Playwright → model commands ──────────────────────────────────────

  // Turn auto-attach on and attach to every tab we already know about.
  // Called in response to Playwright's `Target.setAutoAttach` on the root session.
  async enableAutoAttach(): Promise<void> {
    this._autoAttach = true;
    // WHY：失去控制的旧tab只保留清理权，不因其它运行的discovery再次接管。
    const detached = new Set(this._detachedTabs.values());
    const tabIds = [...this._knownTabs.keys()].filter(tabId => !detached.has(tabId));
    await Promise.all(tabIds.map(tabId => this._attachTab(tabId).catch(logUnhandledError)));
  }

  async createTarget(url: string | undefined, newWindow?: boolean): Promise<{ targetId: string | undefined }> {
    const tab = await this._sendToExtension('chrome.tabs.create', [{ url, newWindow }]);
    if (tab?.id === undefined)
      throw new Error('Failed to create tab');
    this._knownTabs.set(tab.id, tab);
    const tabSession = await this._attachTab(tab.id);
    return { targetId: tabSession.targetInfo?.targetId };
  }

  async closeTarget(targetId: string | undefined): Promise<{ success: boolean }> {
    const tabSession = targetId ? this._findTabSession(s => s.targetInfo?.targetId === targetId) : undefined;
    const tabId = tabSession?.tabId ?? (targetId ? this._detachedTabs.get(targetId) : undefined);
    if (tabId === undefined) {
      if (!targetId) return { success: false };
      if (this._closedTargets.has(targetId)) return { success: true };
      // WHY：owner 已由 relay 核验；重启丢失内存映射时直接复用 Chrome 的原生 targetId/tabId 事实。
      const result = await this._sendToExtension('bat.closeOwnedTarget', [targetId]);
      if (result?.success === true) this._closedTargets.add(targetId);
      return { success: result?.success === true };
    }
    await this._sendToExtension('chrome.tabs.remove', [tabId]);
    // WHY：原生 remove 成功 ACK 可先于 onRemoved；沿用原幂等入口，避免枚举已关闭的 debugger。
    this.onTabRemoved(tabId);
    return { success: true };
  }

  async activateTarget(targetId: string | undefined): Promise<void> {
    const session = this._findTabSession(value => value.targetInfo?.targetId === targetId);
    if (!session)
      throw new Error('daily_chrome_target_not_authorized');
    const tab = await this._sendToExtension('chrome.tabs.update', [session.tabId, { active: true }]);
    await this._sendToExtension('chrome.windows.update', [tab.windowId, { focused: true }]);
  }

  async getTargets(): Promise<any[]> {
    // WHY：原 SDK 会先 discovery 再枚举；只能返回上游已获准并实际 attach 的任务目标。
    return Promise.all([...this._tabSessions.values()].map(async session =>
      ({ ...await this._currentTargetInfo(session), attached: true })));
  }

  attachTarget(targetId: string | undefined): { sessionId: string } {
    const session = this._findTabSession(value => value.targetInfo?.targetId === targetId);
    if (!session)
      throw new Error('daily_chrome_target_not_authorized');
    // TRADE-OFF：复用原扩展已经拥有的 debugger session，不向个人 target 再发 attach。
    // WHY：B-U 在 discovery 完成后才注册 attached 监听；显式 attach 必须重新通知原 session。
    this._emit({ method: 'Target.attachedToTarget', params: {
      sessionId: session.sessionId, targetInfo: { ...session.targetInfo, attached: true }, waitingForDebugger: false,
    } });
    return { sessionId: session.sessionId };
  }

  async getTargetInfo(sessionId: string | undefined, targetId?: string): Promise<any> {
    const session = sessionId ? this._borrowedSessions.get(sessionId) ?? this._findTabSession(s => s.sessionId === sessionId)
      : targetId ? this._findTabSession(s => s.targetInfo?.targetId === targetId)
      : this._tabSessions.values().next().value;
    return session ? this._currentTargetInfo(session) : undefined;
  }

  private async _currentTargetInfo(session: TabSession): Promise<any> {
    // WHY：原模型快照只在 attach 时获取；W-U URL 合同需要原生最新事实，不能拿缓存改判成功。
    const result = await this._sendToExtension('chrome.debugger.sendCommand', [
      { tabId: session.tabId }, 'Target.getTargetInfo',
    ]);
    session.targetInfo = result.targetInfo;
    return session.targetInfo;
  }

  // Forward a browser-level CDP command (Storage.*, Browser.*, etc.) that is
  // not associated with a specific tab. chrome.debugger.sendCommand requires a
  // target, so we route through any attached tab; the command itself is
  // browser-scoped and returns the same result regardless of which tab is used.
  async sendBrowserCommand(method: string, params: any): Promise<any> {
    const tabSession = this._tabSessions.values().next().value;
    if (!tabSession)
      throw new Error(`No attached tab to forward browser-level command: ${method}`);
    return await this._sendToExtension('chrome.debugger.sendCommand', [
      { tabId: tabSession.tabId },
      method,
      params,
    ]);
  }

  // Forward a CDP command from Playwright to the tab its sessionId resolves to.
  async sendCommand(sessionId: string, method: string, params: any): Promise<any> {
    // Two cases:
    // 1. sessionId is a relay-level tab session (pw-tab-N) → strip and route by tabId.
    // 2. sessionId is a child CDP session (worker, oopif) → route to its owning tab,
    //    keep the sessionId so the extension forwards it to chrome.debugger.
    let tabSession = this._borrowedSessions.get(sessionId) ?? this._findTabSession(s => s.sessionId === sessionId);
    let cdpSessionId: string | undefined;
    if (!tabSession) {
      tabSession = this._findTabSession(s => s.childSessions.has(sessionId));
      cdpSessionId = sessionId;
    }
    if (!tabSession)
      throw new Error(`No tab found for sessionId: ${sessionId}`);
    if (method === 'Runtime.enable' && !cdpSessionId && !this._runtimeReplayed.has(tabSession.tabId)) {
      // WHY：Chrome debugger仍拥有旧Runtime订阅；新SDK需要原生重发已有执行上下文。
      // 每次连接只作用于已经准入的任务tab，不重attach、不影响个人tab。
      this._runtimeReplayed.add(tabSession.tabId);
      await this._sendToExtension('chrome.debugger.sendCommand', [{ tabId: tabSession.tabId }, 'Runtime.disable', {}]);
    }
    return await this._sendToExtension('chrome.debugger.sendCommand', [
      { tabId: tabSession.tabId, sessionId: cdpSessionId },
      method,
      params,
    ]);
  }

  // ─── Internals ────────────────────────────────────────────────────────

  private async _attachTab(tabId: number): Promise<TabSession> {
    const existing = this._tabSessions.get(tabId);
    if (existing) {
      // WHY：原 debugger 租约仍在，但更换 SDK 后新客户端没有旧 attached 事件。
      // 只重发已准入 session；不再 attach、不枚举个人标签、不扩展所有权。
      if (!this._announcedSessions.has(existing.sessionId)) {
        existing.targetInfo = await this._currentTargetInfo(existing);
        this._announceSession(existing);
      }
      return existing;
    }
    await this._sendToExtension('chrome.debugger.attach', [{ tabId }, '1.3']);
    const result = await this._sendToExtension('chrome.debugger.sendCommand', [
      { tabId },
      'Target.getTargetInfo',
    ]);
    const targetInfo = result?.targetInfo;
    const sessionId = `pw-tab-${this._nextSessionId++}`;
    const tabSession: TabSession = { tabId, sessionId, targetInfo, childSessions: new Set() };
    this._tabSessions.set(tabId, tabSession);
    this._announceSession(tabSession);
    return tabSession;
  }

  hasSession(sessionId: string): boolean {
    return this._borrowedSessions.has(sessionId) || !!this._findTabSession(session => session.sessionId === sessionId);
  }

  borrowTarget(targetId: string, parentSessionId: string): { sessionId: string } {
    const tab = this._findTabSession(session => session.targetInfo?.targetId === targetId);
    if (!tab) throw new Error('daily_chrome_target_not_authorized');
    const sessionId = `pw-borrow-${this._nextSessionId++}`;
    this._borrowedSessions.set(sessionId, tab);
    this._emit({ sessionId: parentSessionId, method: 'Target.attachedToTarget', params: {
      sessionId, targetInfo: { ...tab.targetInfo, attached: true }, waitingForDebugger: false,
    } });
    return { sessionId };
  }

  releaseBorrow(sessionId: string): void {
    this._borrowedSessions.delete(sessionId);
  }

  private _announceSession(session: TabSession): void {
    this._announcedSessions.add(session.sessionId);
    this._emit({
      method: 'Target.attachedToTarget',
      params: {
        sessionId: session.sessionId,
        targetInfo: { ...session.targetInfo, attached: true },
        waitingForDebugger: false,
      },
    });
  }

  private _detachTab(tabId: number): void {
    const tabSession = this._tabSessions.get(tabId);
    if (!tabSession)
      return;
    this._tabSessions.delete(tabId);
    for (const [id, borrowed] of this._borrowedSessions) {
      if (borrowed === tabSession) this._borrowedSessions.delete(id);
    }
    this._emit({
      method: 'Target.detachedFromTarget',
      params: {
        sessionId: tabSession.sessionId,
        targetId: tabSession.targetInfo?.targetId,
      },
    });
  }

  private _findTabSession(predicate: (session: TabSession) => boolean): TabSession | undefined {
    for (const session of this._tabSessions.values()) {
      if (predicate(session))
        return session;
    }
    return undefined;
  }
}
