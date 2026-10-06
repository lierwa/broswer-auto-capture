// 真实组件 + 真实浏览器配置 API；运行命令仅捕获，不启动任务或模型。
import { useState } from "react"
import { createRoot } from "react-dom/client"
import { Button, Theme } from "@radix-ui/themes"
import { taskChainCommandSchema, type TaskWorkspaceSnapshot } from "@browser-capture/contracts"
import { dataContract, extractionFixture, reference } from "../../../../packages/contracts/tests/task-chain-fixtures.js"
import { BrowserEnvironmentDialog } from "../../src/BrowserEnvironmentDialog.js"
import { ChainRunDialog } from "../../src/ChainRunDialog.js"
import { TaskChainConnection } from "../../src/taskChainConnection.js"
import "@radix-ui/themes/styles.css"
import "../../src/styles.css"
import "../../src/workbench.css"
import "../../src/chain-workbench.css"

const commands: unknown[] = []
Object.assign(window, { __browserSettingsCommands: commands })
const connection = new TaskChainConnection(extractionFixture.plan.taskId)
connection.dispatch = async command => { commands.push(taskChainCommandSchema.parse(command)); return true }
const plan = { ...extractionFixture.plan, browserHandoff: "keep_open" as const,
  inputContract: dataContract("environment-input", { type: "string", minLength: 1 }) }
const content = { plan, steps: [] }
// 夹具仅提供这两个组件读取的工作区字段；不作为有效发布链或业务执行的证明。
const workspace = { release: { reference: reference(plan.id), value: { id: plan.id, version: 1, content } },
  draft: { id: plan.id, revision: 1, checksum: "b".repeat(64), content }, draftReadiness: null } as unknown as TaskWorkspaceSnapshot

function Screen() {
  const [settings, setSettings] = useState(false), [run, setRun] = useState(false)
  const [mode, setMode] = useState<"run" | "trial">("run"), [theme, setTheme] = useState<"dark" | "light">("dark")
  return <Theme appearance={theme} accentColor="amber" grayColor="sand" radius="small" scaling="95%">
    <div className="app-shell" data-theme={theme} style={{ display: "block", padding: 32 }}>
      <Button onClick={() => setSettings(true)}>打开浏览器设置</Button>
      <Button onClick={() => { setMode("run"); setRun(true) }}>打开运行确认</Button>
      <Button onClick={() => { setMode("trial"); setRun(true) }}>打开试跑确认</Button>
      <Button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>切换主题</Button>
      <BrowserEnvironmentDialog open={settings} onOpenChange={setSettings} />
      <ChainRunDialog open={run} onOpenChange={setRun} workspace={workspace} connection={connection} mode={mode} />
    </div>
  </Theme>
}
createRoot(document.getElementById("root")!).render(<Screen />)
