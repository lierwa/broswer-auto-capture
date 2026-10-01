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

  async listen(_port?: number, _host?: string, _pathname?: string): Promise<string> {
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    this.host = `ws://127.0.0.1:${(this.server.address() as { port: number }).port}`;
    return this.host;
  }

  close(): Promise<void> {
    this.closing ??= (async () => {
      this.redirects.clear();
      for (const client of this.sockets.clients) client.terminate();
      await new Promise<void>(resolve => this.sockets.close(() => resolve()));
      this.server.closeAllConnections();
      await new Promise<void>(resolve => this.server.close(() => resolve()));
    })();
    return this.closing;
  }
}
