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

import { createHash } from 'node:crypto';

/**
 * WebSocket server that bridges Playwright MCP and Chrome Extension.
 *
 * Endpoints:
 * - /cdp/guid - Full CDP interface for Playwright MCP
 * - /extension/guid - Extension connection
 *
 * The protocol version advertised to the extension can be overridden with the
 * PWTEST_EXTENSION_PROTOCOL env variable, and the connection timeout with
 * PWTEST_EXTENSION_CONNECT_TIMEOUT (both used in tests).
 */

import { openChrome } from './chromeLauncher.js';

import { ws, WSServer } from './wsServer.js';
import { ManualPromise } from './manualPromise.js';
import { monotonicTime } from './time.js';
import { raceAgainstDeadline } from './timeoutRunner.js';

const playwrightExtensionId = ''; // B-A-T 必须显式提供其独立扩展身份。
import { logUnhandledError } from './log.js';
import { ExtensionProtocolV2 } from './cdpRelayV2.js';
import { CDPOwnerScopes } from './cdpOwnerScopes.js';
import * as protocol from './protocol.js';
import { z } from 'zod';

type RawData = Buffer | string;
import type { ExtensionCommandV2, ExtensionEventsV2 } from './protocol.js';
import type { CDPMessage } from './browserModel.js';
type WebSocket = any;


// WHY：原 debug 含原始消息/页面，产品保持关闭。
const debugLogger = (..._args: unknown[]) => {};

const extensionConnectionTimeout = +(process.env.PWTEST_EXTENSION_CONNECT_TIMEOUT ?? 30_000);
const authorizationSchema = z.tuple([z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()]);

type CDPCommand = {
  id: number;
  sessionId?: string;
  method: string;
  params?: any;
};

type CDPResponse = CDPMessage;

export class CDPRelayServer {
  private _wsServer: WSServer;
  private _wsHost!: string;
  private _browserChannel: string;
  private _executablePath: string | undefined;
  private _customUserDataDir: string | undefined;
  private _profileDirectory: string | undefined;
  private _cdpPath: string;
  private _extensionPath: string;
  private _cdpConnection: WebSocket | null = null;
  private _scopes = new CDPOwnerScopes();
  private _extensionConnection: ExtensionConnection | null = null;
  private _protocolVersion: number;
  private _token: string | undefined;
  private _handler: ExtensionProtocolV2;
  private _extensionConnectionPromise = new ManualPromise<void>();
  private _taskCreationDispatched = false;

  constructor(browserChannel: string, executablePath?: string, customUserDataDir?: string, profileDirectory?: string,
    private options?: { token?: string; extensionId: string; requestAuthorization?: boolean; requestPopup?: (url: string) => void;
      requestBackground?: () => void }) {
    this._browserChannel = browserChannel;
    this._executablePath = executablePath;
    this._customUserDataDir = customUserDataDir;
    this._profileDirectory = profileDirectory;
    this._protocolVersion = parseInt(process.env.PWTEST_EXTENSION_PROTOCOL ?? protocol.VERSION.toString(), 10);
    this._token = this.options?.token;

    const sendCommand = (method: string, params: any): Promise<any> => {
      if (!this._extensionConnection)
        throw new Error('Extension not connected');
      // WHY：记录实际发往扩展的创建，不把 SDK 的“打算创建”当成窗口已存在。
      if (method === 'chrome.tabs.create' && this._extensionConnection.isOpen())
        this._taskCreationDispatched = true;
      return this._extensionConnection.send(method as keyof ExtensionCommandV2, params);
    };
    this._handler = new ExtensionProtocolV2(sendCommand);
    this._handler.connectOverCDP(msg => { this._sendToCDPClient(msg); this._scopes.event(msg); });

    // WHY：端口随服务重启变化；已授权 Profile 的不可猜测路径稳定，原 owner 可验证是同一授权传输。
    const uuid = this.options?.token ? createHash('sha256')
      .update(`bat-daily-cdp:${this.options.token}:${profileDirectory ?? ''}`).digest('hex') : crypto.randomUUID();
    this._cdpPath = `/devtools/browser/${uuid}`; // 沿用 B-A-T 既有 loopback endpoint 合同。
    this._extensionPath = `/extension/${uuid}`;

    void this._extensionConnectionPromise.catch(logUnhandledError);
    this._wsServer = new WSServer({
      allowedOrigin: this.options?.extensionId ? `chrome-extension://${this.options.extensionId}` : undefined,
      onRequest: (request, response) => {
        response.statusCode = 404;
        response.end();
      },
      onHeaders: () => {},
      onUpgrade: () => undefined,
      isAllowedPathname: pathname => pathname === this._cdpPath || pathname === this._extensionPath
        || pathname.startsWith(`${this._cdpPath}/`) && this._scopes.accepts(pathname.slice(this._cdpPath.length + 1)),
      onConnection: (request, url, ws) => {
        debugLogger(`New connection to ${url.pathname}`);
        if (url.pathname.startsWith(this._cdpPath))
          this._handlePlaywrightConnection(ws, url.pathname.slice(this._cdpPath.length + 1) || undefined);
        else if (request.headers.origin === `chrome-extension://${this.options?.extensionId}`)
          this._handleExtensionConnection(ws);
        else
          ws.close(1008, 'Extension origin required');
        return undefined;
      },
    });
  }

  async start(): Promise<void> {
    this._wsHost = await this._wsServer.listen(0, undefined, '');
  }

  cdpEndpoint(owner?: string, targets: string[] = []) {
    if (owner) this._scopes.register(owner, targets);
    return `${this._wsHost}${this._cdpPath}${owner ? `/${owner}` : ''}`;
  }

  extensionEndpoint() {
    return `${this._wsHost}${this._extensionPath}`;
  }

  // WHY：仅宿主首次配置消费原令牌，状态/API/CDP 均不得返回它。
  authorizationToken(): string | undefined {
    return this.isConnected() ? this._token : undefined;
  }

  async establishExtensionConnection(clientName: string) {
    debugLogger('Establishing extension connection');
    if (this.options?.requestBackground) this.options.requestBackground();
    else await this._openConnectPageInBrowser(clientName);
    debugLogger('Waiting for incoming extension connection');
    // Without a token the user has to approve the connection in the browser, which can take arbitrarily long.
    const deadline = this._token ? monotonicTime() + extensionConnectionTimeout : 0;
    const { timedOut } = await raceAgainstDeadline(async () => {
      await this._extensionConnectionPromise;
      await this._handler.ready();
      // WHY：原 WebSocket/令牌握手证明连接；零目标为空闲连接，不要求额外引导窗口。
      // 原模型继续 autoAttach 后续 operation 创建的目标，不枚举个人标签。
      await this._handler.handleCDPCommand('Target.setAutoAttach', { autoAttach: true, flatten: true }, undefined);
    }, deadline);
    if (timedOut) {
      const profile = this._profileDirectory ? ` "${this._profileDirectory}"` : '';
      throw new Error(`Playwright extension did not connect within ${extensionConnectionTimeout / 1000}s after opening the connect page. Make sure the extension is installed in the Chrome profile${profile} and PLAYWRIGHT_MCP_EXTENSION_TOKEN matches its token.`);
    }
    debugLogger('Extension connection established');
  }

  private async _openConnectPageInBrowser(clientName: string) {
    const mcpRelayEndpoint = `${this._wsHost}${this._extensionPath}`;
    const url = new URL(`chrome-extension://${this.options?.extensionId ?? playwrightExtensionId}/connect.html`);
    url.searchParams.set('mcpRelayUrl', mcpRelayEndpoint);
    const client = {
      name: clientName,
      // Not used anymore.
      version: undefined,
    };
    url.searchParams.set('client', JSON.stringify(client));
    url.searchParams.set('protocolVersion', this._protocolVersion.toString());
    if (this._token)
      url.searchParams.set('token', this._token);
    else if (this.options?.requestAuthorization)
      url.searchParams.set('persistAuthorization', '1');
    const href = url.toString();
    if (this.options?.requestPopup) {
      this.options.requestPopup(this._wsServer.popupRequest(href, reason => {
        this._extensionConnectionPromise.reject(new Error(reason === 'paused' ? 'daily_chrome_connection_paused' : 'daily_chrome_authorization_rejected'));
      }));
      return;
    }
    // WHY：已有授权复用原 Chrome launcher 直接握手；工作台不再是运行连接的必经中转。
    this.openPage(this._wsServer.browserRedirect(href));
  }

  // 原 launcher 的公共薄入口：Chrome Singleton 负责打开/复用指定 Profile；不新建驱动。
  openPage(href?: string): void {
    openChrome(this._browserChannel, this._executablePath, this._customUserDataDir, this._profileDirectory, href);
  }

  // 宿主已校验扩展Origin和原授权token；同一socket直接进入原协议，不增加CDP网关。
  acceptBackgroundConnection(socket: WebSocket): void { this._handleExtensionConnection(socket); }

  async extensionReady(): Promise<void> {
    await this._extensionConnectionPromise;
    await this._handler.ready();
  }

  async close(): Promise<void> {
    this._closeConnections('Server stopped');
    await this._wsServer.close();
  }

  isConnected(): boolean {
    return this._extensionConnection?.isOpen() ?? false;
  }

  stop(): void {
    this._closeConnections('Server stopped');
    void this._wsServer.close().catch(logUnhandledError);
  }

  private _closeConnections(reason: string) {
    this._closeCDPConnection(reason);
    this._closeExtensionConnection(reason);
  }

  private _handlePlaywrightConnection(ws: WebSocket, owner?: string): void {
    if (!this.isConnected() && !this._canVerifyUnstartedTask()) {
      debugLogger('Rejecting Playwright connection: extension not connected');
      ws.close(1000, 'Extension not connected');
      return;
    }
    if (!owner && this._cdpConnection) {
      debugLogger('Rejecting second Playwright connection');
      ws.close(1000, 'Another CDP client already connected');
      return;
    }
    if (owner) {
      this._scopes.connect(ws, owner);
      // WHY：SDK 重连需要原生 attached/Runtime 事实重发；只重置这个 owner 的通知，不重 attach。
      this._handler.prepareOwnerConnection(this._scopes.ownedTargets(owner));
    }
    else this._cdpConnection = ws;
    ws.on('message', async (data: RawData) => {
      try {
        await this._handlePlaywrightMessage(JSON.parse(data.toString()), ws, owner);
      } catch (error: any) {
        // WHY：CDP消息可能携带认证Cookie；诊断只保存错误类别，不打印请求/参数/错误正文。
        debugLogger('Error while handling Playwright message', error?.name ?? 'Error');
      }
    });
    ws.on('close', () => {
      // WHY：B-A-T 的交付/人工恢复沿原租约更换 SDK 连接；原扩展保留自身已准入目标。
      // 客户端独立断开；撤销/服务退出才关闭原 extension 与所有客户端。
      if (this._cdpConnection === ws)
        this._cdpConnection = null;
      this._scopes.disconnect(ws);
      debugLogger('Playwright WebSocket closed');
    });
    ws.on('error', (error: Error) => {
      debugLogger('Playwright WebSocket error:', error);
    });
    debugLogger('Playwright MCP connected');
  }

  private _canVerifyUnstartedTask(): boolean {
    // TRADE-OFF：仅原 relay 的未派发证据可用于原 owner；新 relay 的空列表不具有这个证明力。
    return !!this._extensionConnection && !this.isConnected()
      && (this._taskCreationDispatched === false
        || this._taskCreationDispatched === undefined && this._extensionConnection.hasSentCommands === false);
  }

  private _closeExtensionConnection(reason: string) {
    this._extensionConnection?.close(reason);
    if (!this._extensionConnectionPromise.isDone())
      this._extensionConnectionPromise.reject(new Error(reason));
  }

  private _closeCDPConnection(reason: string) {
    this._scopes.close(reason);
    if (this._cdpConnection?.readyState === ws.OPEN)
      this._cdpConnection.close(1000, reason);
  }

  private _handleExtensionConnection(ws: WebSocket): void {
    if (this._extensionConnection) {
      ws.close(1000, 'Another extension connection already established');
      return;
    }
    this._extensionConnection = new ExtensionConnection(ws);
    this._extensionConnection.onclose = reason => {
      debugLogger('Extension WebSocket closed:', reason);
      this._handler.onExtensionDisconnect(reason);
      this._closeCDPConnection(`Extension disconnected: ${reason}`);
    };
    this._extensionConnection.onmessage = (method, params) => {
      if (method !== 'extension.initialized') {
        this._handler.handleExtensionEvent(method, params);
        return;
      }
      if (!Array.isArray(params))
        throw new Error('Invalid initialization configuration');
      if (params.length) {
        if (!this.options?.requestAuthorization || this._token)
          throw new Error('Unexpected authorization configuration');
        this._token = authorizationSchema.parse(params)[0].token;
      }
      // 首次交接结束后只向原协议映射器发送原始空初始化事件，不进入 CDP 或页面事实。
      this._handler.handleExtensionEvent('extension.initialized', []);
    };
    this._extensionConnectionPromise.resolve();
  }

  private async _handlePlaywrightMessage(message: CDPCommand, client = this._cdpConnection, owner?: string): Promise<void> {
    debugLogger('← Playwright:', `${message.method} (id=${message.id})`);
    const { id, sessionId, method, params } = message;
    try {
      // 历史 target 集保留清理权；默认读目标只能来自原模型当前仍存在的 target。
      const implicitTarget = owner && method === 'Target.getTargetInfo' && !params?.targetId
        && (!sessionId || sessionId === 'bat-browser-root');
      const liveTargets = implicitTarget ? (await this._handleCDPCommand('Target.getTargets', {}, undefined)).targetInfos : [];
      const scopedParams = owner ? this._scopes.parameters(owner, method, params, sessionId, liveTargets) : params;
      if (owner) this._scopes.check(owner, method, scopedParams, sessionId);
      let result = await this._handleCDPCommand(method, scopedParams, sessionId);
      if (owner) {
        result = this._scopes.response(owner, method, scopedParams, result);
        if (method === 'Target.createTarget') await this._handler.handleCDPCommand('Target.attachToTarget', { targetId: result.targetId }, undefined);
      }
      client?.send(JSON.stringify({ id, ...(sessionId ? { sessionId } : {}), result }));
    } catch (e) {
      debugLogger('Error in the extension:', e);
      client?.send(JSON.stringify({
        id,
        ...(sessionId ? { sessionId } : {}),
        error: { message: (e as Error).message }
      }));
    }
  }

  private async _handleCDPCommand(method: string, params: any, sessionId: string | undefined): Promise<any> {
    // WHY：Playwright公开 new_cdp_session 先借用 browser root；Chrome debugger只有tab。
    // 沿原relay的root分派，不创建/attach新的浏览器目标，也不扩大已准入tab范围。
    if (sessionId === 'bat-browser-root' && method === 'Target.attachToTarget')
      return this._handler.borrowCDPSession(params?.targetId);
    if (sessionId === 'bat-browser-root')
      sessionId = undefined;
    if (!this.isConnected()) {
      if (method === 'Target.getTargets' && !sessionId && this._canVerifyUnstartedTask())
        return { targetInfos: [] };
      // 原 AttachedWindow 核验先读取静态 Browser 版本；它不派发 Chrome 命令。
      if (method !== 'Browser.getVersion' || sessionId || !this._canVerifyUnstartedTask())
        throw new Error('daily_chrome_extension_disconnected');
    }
    switch (method) {
      case 'Target.attachToBrowserTarget': {
        if (sessionId) throw new Error('daily_chrome_browser_root_invalid');
        return { sessionId: 'bat-browser-root' };
      }
      case 'Target.detachFromTarget': {
        if (!sessionId && params?.sessionId === 'bat-browser-root') return {};
        break;
      }
      case 'Browser.getVersion': {
        return {
          protocolVersion: '1.3',
          product: 'Chrome/Extension-Bridge',
          userAgent: 'CDP-Bridge-Server/1.0.0',
        };
      }
      case 'Browser.setDownloadBehavior': {
        return { };
      }
    }
    const handled = await this._handler.handleCDPCommand(method, params, sessionId);
    if (handled)
      return handled.result;
    return await this._handler.forwardToExtension(method, params, sessionId);
  }

  private _sendToCDPClient(message: CDPResponse): void {
    debugLogger('→ Playwright:', `${message.method ?? `response(id=${message.id})`}`);
    this._cdpConnection?.send(JSON.stringify(message));
  }
}

type ExtensionResponse = {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: string;
};

class ExtensionConnection {
  private readonly _ws: WebSocket;
  private readonly _callbacks = new Map<number, { resolve: (o: any) => void, reject: (e: Error) => void, error: Error }>();
  private _lastId = 0;

  onmessage?: <M extends keyof ExtensionEventsV2>(method: M, params: ExtensionEventsV2[M]['params']) => void;
  onclose?: (reason: string) => void;

  constructor(ws: WebSocket) {
    this._ws = ws;
    this._ws.on('message', this._onMessage.bind(this));
    this._ws.on('close', this._onClose.bind(this));
    this._ws.on('error', this._onError.bind(this));
  }

  async send<M extends keyof ExtensionCommandV2>(method: M, params: ExtensionCommandV2[M]['params']): Promise<any> {
    if (this._ws.readyState !== ws.OPEN)
      throw new Error(`Unexpected WebSocket state: ${this._ws.readyState}`);
    const id = ++this._lastId;
    this._ws.send(JSON.stringify({ id, method, params }));
    const error = new Error(`Protocol error: ${String(method)}`);
    return new Promise((resolve, reject) => {
      this._callbacks.set(id, { resolve, reject, error });
    });
  }

  isOpen(): boolean { return this._ws.readyState === ws.OPEN; }
  get hasSentCommands(): boolean { return this._lastId > 0; }

  close(message: string) {
    debugLogger('closing extension connection:', message);
    if (this._ws.readyState === ws.OPEN)
      this._ws.close(1000, message);
  }

  private _onMessage(event: RawData) {
    const eventData = event.toString();
    let parsedJson;
    try {
      parsedJson = JSON.parse(eventData);
    } catch (e: any) {
      debugLogger(`<closing ws> Closing websocket due to malformed JSON. eventData=${eventData} e=${e?.message}`);
      this._ws.close();
      return;
    }
    try {
      this._handleParsedMessage(parsedJson);
    } catch (e: any) {
      debugLogger(`<closing ws> Closing websocket due to failed onmessage callback. eventData=${eventData} e=${e?.message}`);
      this._ws.close();
    }
  }

  private _handleParsedMessage(object: ExtensionResponse) {
    if (object.id && this._callbacks.has(object.id)) {
      const callback = this._callbacks.get(object.id)!;
      this._callbacks.delete(object.id);
      if (object.error) {
        const error = callback.error;
        error.message = object.error;
        callback.reject(error);
      } else {
        callback.resolve(object.result);
      }
    } else if (object.id) {
      debugLogger('← Extension: unexpected response', object);
    } else {
      this.onmessage?.(object.method! as keyof ExtensionEventsV2, object.params);
    }
  }

  private _onClose(code: number, reason: Buffer) {
    const message = reason.toString();
    debugLogger(`<ws closed> code=${code} reason=${message}`);
    this._dispose();
    this.onclose?.(message);
  }

  private _onError(event: Error) {
    debugLogger(`<ws error> message=${event.message} `);
    this._dispose();
  }

  private _dispose() {
    for (const callback of this._callbacks.values())
      callback.reject(new Error('WebSocket closed'));
    this._callbacks.clear();
  }
}
