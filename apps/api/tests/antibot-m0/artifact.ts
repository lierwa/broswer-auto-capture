import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export const probe = Object.freeze({ name: "fpscanner", version: "1.0.8",
  commit: "4255cfd8a23fef5ea714147518d8c6ae1e5426d3",
  url: "https://registry.npmjs.org/fpscanner/-/fpscanner-1.0.8.tgz",
  integrity: "v5admnc9Iz4PsODfe+R2nrkQPPRjEW0B3jMoxs3+m1rU3VRNKxrYvXtibwMLfIGstUrQMBjTl/+rfe8XleS5vg==",
  bundleSha256: "75abba497a00625ed053ce7a0bc9353fa5d5c9859cc67438141fe83d8d0946b2" })

// WHY：使用完整性锁定的测试制品，既不运行上游安装脚本，也不把检测库带入产品 runtime。
export async function loadProbe(root: string) {
  const directory = path.join(root, "work", "antibot-m0", "artifact")
  await mkdir(directory, { recursive: true })
  const archive = path.join(directory, "fpscanner-1.0.8.tgz")
  let bytes: Buffer
  try { bytes = await readFile(archive) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    const response = await fetch(probe.url, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw Error("probe_download_failed")
    bytes = Buffer.from(await response.arrayBuffer())
  }
  if (createHash("sha512").update(bytes).digest("base64") !== probe.integrity) throw Error("probe_integrity_mismatch")
  await writeFile(archive, bytes)
  execFileSync("tar", ["-xf", archive, "-C", directory, "package/dist/fpScanner.es.js", "package/LICENSE"], { cwd: root })
  const bundle = await readFile(path.join(directory, "package", "dist", "fpScanner.es.js"))
  if (createHash("sha256").update(bundle).digest("hex") !== probe.bundleSha256) throw Error("probe_bundle_mismatch")
  return bundle
}
