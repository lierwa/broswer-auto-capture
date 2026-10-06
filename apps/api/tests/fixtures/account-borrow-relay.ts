import path from "node:path"
import { createInterface } from "node:readline"
import { DailyChromeExtension } from "../../src/browser/daily-extension.js"
import { appendFileSync } from "node:fs"
import { CDPRelayServer } from "../../../../vendor/daily-chrome-extension/cdpRelay.js"

const prototype = CDPRelayServer.prototype as unknown as {
  _handleCDPCommand(method: string, params: Record<string, unknown>, sessionId?: string): Promise<unknown> }
const original = prototype._handleCDPCommand
prototype._handleCDPCommand = async function(method, params, sessionId) {
  appendFileSync(path.join(process.cwd(), "work/account-rebuild-20261003/cdp-target-trace.jsonl"),
    JSON.stringify({ method, sessionId, targetId: params?.targetId, detachSession: params?.sessionId }) + "\n")
  return original.call(this, method, params, sessionId)
}

// WHY：只替换测试Profile路径；所有授权、原relay和扩展操作仍走产品组件。
const profile = process.env.BAT_TEST_PROFILE!
const manager = new DailyChromeExtension(process.cwd(), path.join(profile, "bat-test-data"), () => {})
const location = manager as unknown as { dataRoot(): string; executable(): Promise<string> }
location.dataRoot = () => profile
location.executable = async () => process.env.BAT_TEST_EXECUTABLE!
manager.profiles = async () => [{ id: "Default", name: "Owned account borrow fixture" }]
const write = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n")
write({ ready: true })
for await (const line of createInterface({ input: process.stdin })) {
  const command = JSON.parse(line)
  if (command.op !== "pair") throw new Error("unsupported_fixture_command")
  const paired = manager.pair({ profileDirectory: "Default" })
  let waiting = true
  void paired.finally(() => { waiting = false }).catch(() => {})
  while (waiting) {
    const state = await manager.snapshot()
    if (state.popupRequest) { write({ popupRequest: state.popupRequest }); break }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  try { await paired; write({ paired: true, cdpUrl: await manager.endpoint() }) }
  catch { write({ paired: false }) }
}
manager.close()
