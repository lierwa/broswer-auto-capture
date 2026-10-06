import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';

export const ws = createRequire(import.meta.url)('ws');
type Options = {
  allowedOrigin?: string | undefined;
  onRequest(request: IncomingMessage, response: ServerResponse): void;
  onHeaders(...args: any[]): void;
  onUpgrade(...args: any[]): unknown;
  isAllowedPathname(pathname: string): boolean;
  onConnection(request: IncomingMessage, url: URL, socket: any): unknown;
};

// WHY：只适配上游私有 HTTP 包装；CDP、session、握手均留在固定原 relay。
export class WSServer {
  private server = createServer((request, response) => this.request(request, response));
  private sockets = new ws.WebSocketServer({ noServer: true });
  private redirects = new Map<string, string>();
  private popupRequests = new Map<string, { url: string; reject: (reason?: 'paused') => void }>();
  private host = '';
  private closing?: Promise<void>;

  constructor(private options: Options) {
    this.server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', this.host || 'http://127.0.0.1');
      const origin = request.headers.origin;
      if (!this.options.isAllowedPathname(url.pathname) || !this.validHost(request)
          || (origin && origin !== this.options.allowedOrigin)) {
        socket.destroy();
        return;
      }
      this.sockets.handleUpgrade(request, socket, head, (client: any) => this.options.onConnection(request, url, client));
    });
  }

  private validHost(request: IncomingMessage) {
    return request.headers.host === new URL(this.host).host;
  }

  private request(request: IncomingMessage, response: ServerResponse) {
    const popup = this.popupRequests.get(request.url ?? '');
    // WHY：工作台只能看到随机地址；原 token 仅交给同 ID 扩展，不能成为网页/API 状态。
    const extensionId = this.options.allowedOrigin?.replace('chrome-extension://', '');
    if (popup && this.validHost(request) && request.headers['x-bat-extension'] === extensionId
        && (!request.headers.origin || request.headers.origin === this.options.allowedOrigin)) {
      response.setHeader('Cache-Control', 'no-store');
      if (request.method === 'DELETE') {
        this.popupRequests.delete(request.url!);
        response.writeHead(204); response.end(); popup.reject(request.headers['x-bat-decline-reason'] === 'paused' ? 'paused' : undefined);
        return;
      }
      if (request.method === 'GET') {
        const url = new URL(popup.url);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ mcpRelayUrl: url.searchParams.get('mcpRelayUrl'),
          clientName: JSON.parse(url.searchParams.get('client')!).name,
          protocolVersion: Number(url.searchParams.get('protocolVersion')),
          token: url.searchParams.get('token') ?? undefined,
          persistAuthorization: url.searchParams.get('persistAuthorization') === '1' }));
        return;
      }
    }
    const target = this.redirects.get(request.url ?? '');
    // 无 CORS；只有原 relay 随机路径的浏览器跳转，没有新增 token 或授权协议。
    if (target && request.method === 'GET' && this.validHost(request) && !request.headers.origin) {
      response.writeHead(302, { Location: target, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      response.end();
      return;
    }
    this.options.onRequest(request, response);
  }

  browserRedirect(extensionUrl: string) {
    const target = new URL(extensionUrl);
    const relay = new URL(target.searchParams.get('mcpRelayUrl')!);
    const route = `/connect${relay.pathname}`;
    this.redirects.set(route, extensionUrl);
    return this.host.replace(/^ws:/, 'http:') + route;
  }

  popupRequest(extensionUrl: string, reject: (reason?: 'paused') => void) {
    const route = `/popup/${crypto.randomUUID()}`;
    this.popupRequests.set(route, { url: extensionUrl, reject });
    return this.host.replace(/^ws:/, 'http:') + route;
  }

  async listen(_port?: number, _host?: string, _pathname?: string): Promise<string> {
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    this.host = `ws://127.0.0.1:${(this.server.address() as { port: number }).port}`;
    return this.host;
  }

  close(): Promise<void> {
    this.closing ??= (async () => {
      this.redirects.clear();
      this.popupRequests.clear();
      for (const client of this.sockets.clients) client.terminate();
      await new Promise<void>(resolve => this.sockets.close(() => resolve()));
      this.server.closeAllConnections();
      await new Promise<void>(resolve => this.server.close(() => resolve()));
    })();
    return this.closing;
  }
}
