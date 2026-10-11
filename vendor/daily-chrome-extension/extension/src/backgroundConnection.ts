import { WSTransport } from './upstream/browser-skill/ws-transport';
import { startKeepalive } from './upstream/browser-skill/keepalive';
import { localHttp, tokenSchema } from './popupProtocol';

type Settings = Record<string, unknown>;
const keys = ['bat-auth-token', 'bat-workbench-origin', 'bat-connection-enabled', 'bat-authorized'];

/** WHY：只适配B-A-T已授权token与原控制socket；重连/退避/唤醒由BrowserSkill原组件承担。 */
export class BackgroundConnection {
  private settings: Settings = {};
  private socket?: WebSocket;
  private transport: WSTransport;
  private loaded = false;
  private disposed = false;
  private changed: Settings = {};
  private keepalive: ReturnType<typeof startKeepalive>;

  constructor(private connected: () => boolean, private accept: (socket: WebSocket) => Promise<void>) {
    this.transport = new WSTransport({ url: 'ws://127.0.0.1:4173/api/browser/daily-chrome/connection',
      webSocketFactory: url => this.socket = new WebSocket(url) });
    this.transport.onConnectionStateChange(state => {
      if (state === 'connected' && this.allowed())
        this.transport.send({ event: 'bat.authenticate', payload: { token: this.settings['bat-auth-token'] } });
    });
    this.transport.onMessage(frame => {
      if (!('event' in frame)) return;
      if (frame.event === 'bat.authorization_required') {
        void chrome.storage.local.set({ 'bat-authorized': false, 'bat-connection-enabled': false });
        void this.transport.disconnect();
      }
      if (frame.event === 'bat.authorized' && this.socket && this.allowed() && !this.connected())
        void this.accept(this.socket).catch(() => this.transport.disconnect());
    });
    // 原keepalive只唤醒断开的transport；不另加轮询或重连计时器。
    this.keepalive = startKeepalive({ transport: this.transport, shouldConnect: () => this.allowed() && !this.connected(),
      requestConnect: () => this.wake() });
    chrome.runtime.onStartup.addListener(this.wake);
    chrome.storage.onChanged.addListener(this.onChanged);
    void chrome.storage.local.get(keys).then(settings => {
      this.settings = { ...settings, ...this.changed }; this.loaded = true; this.configure();
    });
  }

  private allowed() {
    return !this.disposed && this.loaded && this.settings['bat-connection-enabled'] === true
      && this.settings['bat-authorized'] !== false && tokenSchema.safeParse(this.settings['bat-auth-token']).success;
  }

  private onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return;
    let relevant = false;
    for (const key of keys) if (key in changes) {
      this.settings[key] = this.changed[key] = changes[key].newValue; relevant = true;
    }
    if (relevant && this.loaded) this.configure();
  };

  private configure() {
    const parsed = localHttp.safeParse(this.settings['bat-workbench-origin'] ?? 'http://127.0.0.1:4173');
    if (!parsed.success || !this.allowed()) { void this.transport.disconnect(); return; }
    const url = new URL('/api/browser/daily-chrome/connection', parsed.data); url.protocol = 'ws:';
    if (this.transport.setUrl(url.href)) void this.transport.disconnect().then(this.wake);
    else this.wake();
  }

  wake = () => {
    if (!this.allowed() || this.connected()) return;
    void this.transport.connect().catch(() => {});
  };

  suspend() { void this.transport.disconnect(); }

  dispose() {
    this.disposed = true;
    chrome.runtime.onStartup.removeListener(this.wake); chrome.storage.onChanged.removeListener(this.onChanged);
    this.keepalive.dispose(); void this.transport.disconnect();
  }
}
