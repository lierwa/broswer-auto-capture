import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

// WHY：relay 是临时传输地址；只有稳定地址身份或宿主核验过的旧账号 owner 可刷新，不能换 Profile。
export async function dailyWindowTransport(directory: string, ownerId: string,
  endpoint?: () => Promise<string | undefined>, verifyLegacyOwner?: (ownerId: string) => Promise<boolean>) {
  z.uuid().parse(ownerId)
  const root = path.join(directory, "browser-profile"), candidates = [path.join(root, "attached-window-lease.json"),
    path.join(root, "window-leases", "attached-window-lease", `${ownerId}.json`)]
  let lease: { ownerId: string; cdpUrl: string; status: string; ownedTargets: string[]; targetCreationPending?: boolean | undefined } | undefined
  for (const file of candidates) {
    try {
      const value = z.object({ ownerId: z.uuid(), cdpUrl: z.url(), status: z.string(),
        ownedTargets: z.array(z.string()), targetCreationPending: z.boolean().optional() }).passthrough()
        .parse(JSON.parse(await readFile(file, "utf8")))
      if (value.ownerId === ownerId) { lease = value; break }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }
  // 未创建/已结束的原 owner 不需要连接 Chrome；其它 owner 的收据不是本次资源。
  if (!lease || lease.status === "ended" || !lease.ownedTargets.length && lease.targetCreationPending === false) return {}
  const cdpUrl = await endpoint?.()
  // WHY：正式连接尚未恢复不能退回旧relay；旧端口失联或被复用都不是原窗口已关闭的证据。
  if (endpoint && !cdpUrl) throw Error("hybrid_attached_window_connection_unavailable")
  if (!cdpUrl || cdpUrl === lease.cdpUrl) return {}
  const binding = (url: string) => new URL(url).pathname.replace(/\/[0-9a-f-]{36}$/i, "")
  const sameBinding = binding(cdpUrl) === binding(lease.cdpUrl)
  const legacyEndpointVerified = !sameBinding && await verifyLegacyOwner?.(ownerId) === true
  if (!sameBinding && !legacyEndpointVerified) throw Error("hybrid_attached_window_profile_unconfirmed")
  return { cdpUrl, legacyEndpointVerified: sameBinding || legacyEndpointVerified }
}
