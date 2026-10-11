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

import { debugLog, RelayConnection } from './relayConnection';
import { PendingConnections, openRelayConnection } from './pendingConnection';
import { ConnectedTabs, ungroupTabs } from './connectedTabGroup';
import { PopupBridge } from './popupBridge';
import { BackgroundConnection } from './backgroundConnection';

type PageMessage = {
  type: 'connectionRequested';
  mcpRelayUrl: string;
} | {
  type: 'connectToTab';
  // Picked in the connect page; absent on the token-bypass path where no tab
  // selection happens.
  tab?: chrome.tabs.Tab;
  clientName?: string;
  authorizationToken?: string;
} | {
  type: 'getConnectionStatus';
} | {
  type: 'disconnect';
  connectionId: number;
} | {
  type: 'keepalive';
};

class PlaywrightExtension {
  private _connections = new Map<number, ConnectedTabs>();
  private _lastConnectionId = 0;
  private _pendingConnections = new PendingConnections();
  // Service worker restarts lose all connection state, so any existing
  // Playwright groups are stale. Connections wait on this before reconciling.
  private _cleanupPromise: Promise<void>;
  private _background: BackgroundConnection;

  constructor() {
    chrome.runtime.onMessage.addListener(this._onMessage.bind(this));
    this._background = new BackgroundConnection(() => this._connections.size > 0,
      socket => this._connectOwnedWindow(new RelayConnection(socket), 'B-A-T', undefined));
    new PopupBridge(async (configuration, token) => {
      await this._cleanupPromise;
      if (this._connections.size) throw new Error('当前连接仍在使用，请先断开连接。');
      this._background.suspend();
      const connection = await openRelayConnection(configuration.mcpRelayUrl);
      await this._connectOwnedWindow(connection, configuration.clientName, token);
    }, () => this._connectionStatus(), () => {
      for (const group of this._connections.values()) group.close('User paused connection');
    });
    // WHY：分组标题不能证明 owner；服务重启不按名称处理个人或其它扩展的历史分组。
    this._cleanupPromise = Promise.resolve();
  }

  // Promise-based message handling is not supported in Chrome: https://issues.chromium.org/issues/40753031
  private _onMessage(message: PageMessage, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
    switch (message.type) {
      case 'connectionRequested': {
        const selectorTabId = sender.tab!.id!;
        this._releaseConnectPage(selectorTabId).then(() => {
          this._pendingConnections.create(selectorTabId, message.mcpRelayUrl);
          sendResponse({ success: true });
        });
        return true;
      }
      case 'connectToTab': {
        // Token-bypass (no specific pick) falls back to the connect page itself
        // so `ConnectedTabs` always has a concrete tab to start from. Both
        // sender.tab and UI-supplied tabs come from chrome.tabs.query / runtime
        // message sender, where `id` is always defined.
        this._connectTab(sender.tab!.id!, message.clientName, message.authorizationToken).then(
            () => sendResponse({ success: true }),
            (error: any) => sendResponse({ success: false, error: error.message }));
        return true; // Return true to indicate that the response will be sent asynchronously
      }
      case 'getConnectionStatus':
        sendResponse({
          connections: this._connectionStatus(),
        });
        return false;
      case 'disconnect':
        this._connections.get(message.connectionId)?.close('User disconnected');
        sendResponse({ success: true });
        return false;
      case 'keepalive':
        // Connect page pings us every ~20s so receiving this message resets
        // the MV3 service worker idle timer and keeps the relay WebSocket alive.
        return false;
    }
  }

  private async _connectTab(selectorTabId: number, clientName: string | undefined, authorizationToken?: string): Promise<void> {
    try {
      const settings = await chrome.storage.local.get('bat-connection-enabled');
      if (settings['bat-connection-enabled'] === false) throw new Error('浏览器连接已暂停，请在扩展中开启「允许连接」。');
      await this._cleanupPromise;
      if (this._connections.size)
        throw new Error('daily_chrome_connection_busy');
      this._releaseTab(selectorTabId);

      const connection = await this._pendingConnections.take(selectorTabId);
      if (!connection)
        throw new Error('Pending client connection closed');

      await this._connectOwnedWindow(connection, clientName, authorizationToken);
      await connection.releaseConnectPage(selectorTabId);
    } catch (error: any) {
      debugLog('Failed to connect task window');
      throw error;
    }
  }

  private async _connectOwnedWindow(connection: Awaited<ReturnType<typeof openRelayConnection>>,
    clientName: string | undefined, authorizationToken: string | undefined) {
    // WHY：授权只建立连接，不创建业务页面；窗口由原 operation 创建并登记所有权。
    try {
      const id = ++this._lastConnectionId;
      const group = new ConnectedTabs(connection, undefined, clientName, authorizationToken);
      group.onclose = () => {
        this._connections.delete(id);
        this._background.wake();
      };
      this._connections.set(id, group);

    } catch (error) {
      connection.close('Task window could not be initialized');
      throw error;
    }
  }

  // Chrome may create the connect page inside the active client's group.
  private async _releaseConnectPage(tabId: number): Promise<void> {
    this._releaseTab(tabId);
    await ungroupTabs([tabId]);
  }

  private _releaseTab(tabId: number): void {
    for (const group of this._connections.values())
      group.releaseTab(tabId);
  }

  private _connectionStatus() {
    return [...this._connections].map(([id, group]) => ({ id, clientName: group.clientName,
      connectedTabIds: group.connectedTabIds() }));
  }
}

new PlaywrightExtension();
