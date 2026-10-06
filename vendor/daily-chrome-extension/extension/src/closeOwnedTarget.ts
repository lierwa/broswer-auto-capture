// B-A-T adapter: the authenticated relay verifies the persisted owner target before this call.
// Native identity: https://developer.chrome.com/docs/extensions/reference/api/debugger#method-getTargets
// Native close: BrowserSkill 3f10983c apps/extension/src/tools/tabs.ts chromeTabMutationApi.remove.
export async function closeOwnedTarget(targetId: unknown): Promise<{ success: boolean }> {
  if (typeof targetId !== 'string' || !targetId || targetId.length > 256)
    throw new Error('daily_chrome_target_required');
  const target = (await chrome.debugger.getTargets()).find(item => item.id === targetId);
  if (!target) return { success: true };
  if (target.type !== 'page' || !Number.isSafeInteger(target.tabId))
    throw new Error('daily_chrome_target_not_page');
  // WHY：原生 targetId 才是持久身份；不依赖丢失的 debugger session，也不按标题、URL或窗口猜归属。
  await chrome.tabs.remove(target.tabId!);
  return { success: !(await chrome.debugger.getTargets()).some(item => item.id === targetId) };
}
