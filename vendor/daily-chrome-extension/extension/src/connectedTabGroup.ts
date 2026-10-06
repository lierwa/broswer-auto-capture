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

import { RelayConnection, debugLog } from './relayConnection';

// WHY：任务目标的事实源是 relay 已授权的 debugger attach，不是可由用户拖动的 Chrome 分组。
// 不创建临时组：Chrome 可自动保存组，关闭任务窗口并不保证移除保存记录。
export class ConnectedTabs {
  readonly clientName: string | undefined;
  private readonly _connection: RelayConnection;
  private readonly _onTabUpdatedListener: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => void;
  onclose?: () => void;

  constructor(connection: RelayConnection, selectedTab: chrome.tabs.Tab | undefined,
    clientName: string | undefined, authorizationToken?: string) {
    this.clientName = clientName;
    this._connection = connection;
    connection.onclose = () => this._onConnectionClose();
    connection.ontabattached = tabId => { void this._updateBadge(tabId, true); };
    connection.ontabdetached = tabId => { void this._updateBadge(tabId, false); };
    this._onTabUpdatedListener = (tabId, changeInfo) => {
      if (changeInfo.url !== undefined && connection.attachedTabs.has(tabId))
        void this._updateBadge(tabId, true);
    };
    chrome.tabs.onUpdated.addListener(this._onTabUpdatedListener);
    if (selectedTab) connection.attachTab(selectedTab);
    connection.didInitialize(authorizationToken);
  }

  connectedTabIds(): number[] { return [...this._connection.attachedTabs]; }
  close(reason: string): void { this._connection.close(reason); }
  releaseTab(tabId: number): void {
    if (this._connection.attachedTabs.has(tabId)) this._connection.detachTab(tabId);
  }
  private _onConnectionClose(): void {
    chrome.tabs.onUpdated.removeListener(this._onTabUpdatedListener);
    this.onclose?.();
  }
  private async _updateBadge(tabId: number, connected: boolean): Promise<void> {
    try {
      await Promise.all([
        chrome.action.setBadgeText({ tabId, text: connected ? '✓' : '' }),
        chrome.action.setTitle({ tabId, title: connected ? 'B-A-T 已连接' : '' }),
        ...(connected ? [chrome.action.setBadgeBackgroundColor({ tabId, color: '#4CAF50' })] : []),
      ]);
    } catch { /* 已关闭的任务页无需恢复 badge。 */ }
  }
}

export async function ungroupTabs(tabIds: number[]): Promise<void> {
  try {
    await retryOnDrag(() => chrome.tabs.ungroup(tabIds));
  } catch (error: any) {
    debugLog('Error ungrouping tabs:', error);
  }
}

// Chrome throws "user may be dragging a tab" while a drag is in progress.
// Retry with backoff until it clears (or we give up).
async function retryOnDrag(fn: () => Promise<void>): Promise<void> {
  const delays = [0, 100, 200, 400, 800];
  let lastError: unknown;
  for (const delay of delays) {
    if (delay)
      await new Promise(resolve => setTimeout(resolve, delay));
    try {
      await fn();
      return;
    } catch (error: any) {
      if (!error?.message?.includes('user may be dragging a tab'))
        throw error;
      lastError = error;
    }
  }
  throw lastError;
}
