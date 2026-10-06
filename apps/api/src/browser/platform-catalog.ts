import { readFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { platformCatalogSchema } from "@browser-capture/contracts/platform-account"

export async function loadPlatformCatalog(root: string) {
  const directory = path.join(root, "vendor/account-checks")
  const catalog = platformCatalogSchema.parse(JSON.parse(await readFile(path.join(directory, "platforms.json"), "utf8")))
  const hash = createHash("sha256").update(await readFile(path.join(directory, "evidence.py"))).digest("hex")
  if (hash !== catalog.evidenceSha256) throw new Error("account_platform_version_changed")
  return catalog
}
