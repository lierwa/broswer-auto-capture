import { accountDirectorySchema, type AccountDirectory } from "@browser-capture/contracts/account-directory"
export type AccountItem = AccountDirectory["items"][number]
export const statusLabels = { ready: "已登录", expired: "需登录", unconfirmed: "待检查", account_changed: "账号已变化", empty: "未添加" }
export async function accountRequest(body?: unknown, signal?: AbortSignal) {
  const response = await fetch("/api/browser/account-directory", { ...(body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}), ...(signal ? { signal } : {}) })
  if (response.status === 404) throw new Error("账号服务尚未加载，请重试；若仍失败，请重新启动工作台服务。")
  const value: unknown = await response.json()
  if (!response.ok) throw new Error((value as { error?: string }).error ?? "本次操作未完成")
  return accountDirectorySchema.parse(value)
}
const reasons: Record<string, string> = { login_required: "网站需要重新登录", challenge: "请在网站完成验证", network_error: "暂时无法连接网站",
  network_or_response_error: "暂时无法读取网站登录", response_changed: "网站登录接口已变化", page_changed: "请回到网站账号页",
  positive_evidence_missing: "尚未取得有效登录依据", runtime_failed: "检查未完成，请重试", cancelled: "已取消", interrupted: "检查已中断", evidence_missing: "未找到已绑定的登录标识" }
// WHY：旧失败是历史操作事实，不能继续显示已废弃的“返回原任务”流程，也不能改写原数据库记录。
reasons["暂时无法连接原任务窗口进行核验。请返回原任务查看；窗口与账号记录已保留。"] = "上次检查未完成。可重新检查；已保存的账号记录保留。"
export const accountReason = (reason: string | null | undefined) => reason ? reasons[reason] ?? reason : ""
