import type { BrowserAccountService } from "../../src/browser/account-service.js"
import type { AccountIdentities } from "../../src/browser/account-identity.js"
import type { AccountWindows } from "../../src/browser/account-windows.js"
import type { AccountTransfers } from "../../src/browser/account-transfer.js"
import type { PlatformChecks } from "../../src/browser/platform-check.js"

/** WHY：隔离验收直接复用原核心做 fixture/清理，不为旧界面保留产品命令分发器。 */
export function accountOwnedCore(accounts: BrowserAccountService) {
  return accounts as unknown as { identities: AccountIdentities; windows: AccountWindows; transfers: AccountTransfers; checks: PlatformChecks }
}
