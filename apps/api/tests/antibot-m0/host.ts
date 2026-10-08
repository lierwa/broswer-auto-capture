import { spawn } from "node:child_process"
import { readFile, lstat, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

const owner = z.object({ ownerPid: z.number().int().positive(), ownerStarted: z.number(), profile: z.string(),
  chromeSha256: z.string(), os: z.string(), headless: z.literal(false), profilePolicy: z.literal("fresh"),
  controlConnected: z.boolean(), observed: z.boolean(), closed: z.boolean() })
export async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 45000) {
  const end = Date.now() + timeoutMs
  while (!await check()) {
    if (Date.now() > end) throw Error("m0_wait_timeout")
    await new Promise(resolve => setTimeout(resolve, 150))
  }
}
export async function readJson(file: string) { return JSON.parse(await readFile(file, "utf8")) as unknown }

export function startHost(root: string, directory: string, mode: string, url: string) {
  const python = path.join(root, "work", "upstream-browser-hybrid", ".venv", "Scripts", "python.exe")
  const child = spawn(python, [path.join(root, "apps/api/tests/antibot-m0/browser.py"), mode, directory, url], {
    cwd: root, windowsHide: true, stdio: ["pipe", "ignore", "ignore"], env: { ...process.env,
      PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false", BROWSER_USE_CLOUD_SYNC: "false",
      BROWSER_USE_SETUP_LOGGING: "false" },
  })
  let ended = false, failure: Error | undefined
  child.once("error", error => { failure = error; ended = true })
  child.once("close", () => { ended = true })
  return { async ready() {
    await waitFor(async () => {
      if (failure) throw failure
      if (ended) throw Error("m0_host_exited_before_ready")
      try { owner.parse(await readJson(path.join(directory, "ready.json"))); return true }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error }
    })
    return owner.parse(await readJson(path.join(directory, "ready.json")))
  }, async close() {
    if (!ended) child.stdin.end("close\n")
    await waitFor(() => ended, 25000)
    const receipt = owner.parse(await readJson(path.join(directory, "closed.json")))
    if (!receipt.closed) throw Error("m0_host_cleanup_unconfirmed")
    return receipt
  } }
}

async function assertNoLinks(directory: string): Promise<void> {
  if ((await lstat(directory)).isSymbolicLink()) throw Error("m0_cleanup_link")
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error("m0_cleanup_link")
    if (entry.isDirectory()) await assertNoLinks(path.join(directory, entry.name))
  }
}
export async function removeClosedProfile(root: string, directory: string) {
  const receipt = owner.parse(await readJson(path.join(directory, "closed.json")))
  const profile = path.resolve(directory, "profile"), parent = path.resolve(root, "work", "antibot-m0")
  if (!receipt.closed || profile !== path.resolve(receipt.profile)
    || !profile.startsWith(parent + path.sep)) throw Error("m0_cleanup_ownership")
  await assertNoLinks(profile)
  await rm(profile, { recursive: true })
}

export async function removeClosedProductProfile(root: string, directory: string,
  report: { status: string; activeResources: boolean | null }) {
  const profile = path.resolve(directory, "profile"), parent = path.resolve(root, "work", "antibot-m0")
  if (report.status !== "confirmed" || report.activeResources !== false
    || !profile.startsWith(parent + path.sep)) throw Error("m0_product_cleanup_ownership")
  await assertNoLinks(profile)
  await rm(profile, { recursive: true })
}
