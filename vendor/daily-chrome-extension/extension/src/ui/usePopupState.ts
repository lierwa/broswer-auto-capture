import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { getOrCreateAuthToken } from './authToken';
import { popupSchema } from '../popupProtocol';

const hostSchema = z.object({ paired: z.boolean(), connected: z.boolean(), busy: z.boolean(), profileDirectory: z.string().nullable(),
  profiles: z.array(z.object({ id: z.string(), name: z.string() })),
  popupRequest: z.object({ url: z.string(), profileName: z.string(), profileDirectory: z.string(), openPopup: z.boolean() }).nullable(),
});
type Snapshot = { popup: z.infer<typeof popupSchema> | null; host: z.infer<typeof hostSchema> | null; offline: boolean };
async function message(type: string, extra: Record<string, unknown> = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...extra });
  if (!response?.success) throw new Error(response?.error ?? '操作未完成，请重试。');
  return response;
}

export function usePopupState() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ popup: null, host: null, offline: false });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const mounted = useRef(false), reading = useRef(false), acting = useRef(false);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    if (reading.current || acting.current) return;
    reading.current = true;
    const current = revision.current;
    try {
      let popup = popupSchema.parse(await message('bat.getPopupStatus'));
      // WHY：持久偏好来自扩展，不必等待宿主网络；未知状态不能被投影成 OFF。
      if (mounted.current && current === revision.current) setSnapshot(previous => ({ ...previous, popup }));
      let host: Snapshot['host'] = null;
      try {
        const response = await fetch(popup.workbenchOrigin + '/api/browser/daily-chrome',
          { signal: AbortSignal.timeout(2500), cache: 'no-store' });
        if (response.ok) host = hostSchema.parse(await response.json());
      } catch { /* 离线不等于撤销授权。 */ }
      if (host?.popupRequest) await message('bat.receiveRequest', { request: host.popupRequest });
      if (host) await message('bat.syncHost', { state: { ...host,
        profileName: host.profiles.find(item => item.id === host.profileDirectory)?.name ?? null } });
      popup = popupSchema.parse(await message('bat.getPopupStatus'));
      if (mounted.current && current === revision.current) setSnapshot({ popup, host, offline: !host });
    } catch (error) {
      if (mounted.current && current === revision.current) setError(error instanceof Error ? error.message : '无法读取连接状态。');
    } finally { reading.current = false; }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void message('bat.syncToken', { token: getOrCreateAuthToken() }).then(refresh,
      () => { if (mounted.current) setError('无法读取扩展设置，请重新加载扩展。'); });
    const timer = setInterval(() => void refresh(), 800);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => { setError(''); }, [snapshot.popup?.pending?.requestId]);

  async function act(type: string, enabled?: boolean) {
    if (acting.current) return;
    acting.current = true;
    revision.current++;
    setBusy(type); setError('');
    if (enabled !== undefined) setOptimistic(enabled);
    try {
      await message(type, enabled === undefined ? {} : { enabled });
      // 用操作后的后台快照回填，避免旧轮询让开关短暂跳回。
      const popup = popupSchema.parse(await message('bat.getPopupStatus'));
      if (mounted.current) setSnapshot(previous => ({ ...previous, popup }));
      if (type === 'bat.openWorkbench') window.close();
    } catch (error) { setError(error instanceof Error ? error.message : '操作未完成，请重试。'); }
    finally { acting.current = false; setOptimistic(null); setBusy(''); }
  }
  return { ...snapshot, busy, error, enabled: optimistic ?? snapshot.popup?.enabled, act };
}
