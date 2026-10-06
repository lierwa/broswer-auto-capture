import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Skeleton, Switch, Theme } from '@radix-ui/themes';
import { AppWindow, ArrowUpRight, LockKeyhole } from 'lucide-react';
import { usePopupState } from './usePopupState';
import '@radix-ui/themes/styles.css';
import './popup.css';

function BrowserTheme({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(media.matches);
    media.addEventListener('change', update); update();
    return () => media.removeEventListener('change', update);
  }, []);
  return <Theme appearance={dark ? 'dark' : 'light'} accentColor="amber" grayColor="sand"
    radius="small" scaling="95%" className="bat-theme">{children}</Theme>;
}

function PopupApp() {
  const { popup, host, offline, busy, error, enabled, act } = usePopupState();
  const loading = !popup;
  const connected = Boolean(popup?.connections.length && (host?.connected ?? true));
  const granted = Boolean(popup?.authorized && (host?.paired ?? true));
  const working = Boolean(busy || popup?.connecting || enabled && host?.busy);
  const profile = popup?.pending?.profileName ?? popup?.profileName ?? '当前 Chrome';
  const title = loading ? '读取中' : busy && !enabled ? '正在暂停' : working ? '连接中' : connected ? '已连接 Chrome'
    : !enabled ? granted ? '已暂停' : '等待开启' : '未连接';
  const detail = loading ? '正在读取连接设置…' : !enabled && granted ? '授权仍保留，重新开启即可连接。'
    : popup?.pending?.requiresAuthorization ? '开启一次，之后的任务自动连接。'
    : connected && granted ? '日常 Chrome 已连接工作台。'
    : offline ? '打开工作台后即可连接。' : enabled && granted ? '运行任务时自动连接，无需再次授权。'
    : granted ? '开启后即可连接工作台。' : host?.paired ? '开启后复用已保存的授权。' : '请先在工作台点击「授权 Chrome」。';
  const feedback = error || popup?.error;
  const canEnable = Boolean(popup?.pending || granted || host?.paired);
  return <main className="bat-popup" data-connected={connected} aria-busy={working || loading}>
    <header className="bat-header"><strong>B-A-T</strong><span>日常 Chrome</span></header>
    <section className="bat-connection-card" aria-label="浏览器连接">
      <div className="bat-allow-row">
        <div><label htmlFor="allow-connection">允许连接</label>
          <div className="bat-status" role="status"><i className={'bat-status-dot' + (working ? ' is-working' : '')} />{title}</div>
        </div>
        {enabled === undefined ? <Skeleton width="34px" height="20px" aria-label="正在读取连接设置" />
          : <Switch id="allow-connection" size="2" radius="full" className="bat-switch"
            aria-label="允许 B-A-T 连接此浏览器" checked={enabled} disabled={working || !enabled && !canEnable}
            onCheckedChange={next => void act('bat.setConnectionEnabled', next)} />}
      </div>
      <div className="bat-profile"><AppWindow aria-hidden="true" /><div><span>当前浏览器</span><strong title={profile}>{profile}</strong></div></div>
      <p className="bat-state-description">{detail}</p>
    </section>
    <aside className="bat-permissions" aria-label="连接权限"><LockKeyhole aria-hidden="true" />
      <div><strong>仅操作 B-A-T 任务窗口</strong><p>关闭开关暂停控制，授权保留。</p></div>
    </aside>
    {feedback && <p className="bat-feedback" role="alert">{feedback}</p>}
    <footer className="bat-footer"><span>v{chrome.runtime.getManifest().version}</span>
      <Button size="1" variant="ghost" color="gray" disabled={busy === 'bat.openWorkbench'}
        onClick={() => void act('bat.openWorkbench')}>打开工作台<ArrowUpRight aria-hidden="true" /></Button>
    </footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<BrowserTheme><PopupApp /></BrowserTheme>);
