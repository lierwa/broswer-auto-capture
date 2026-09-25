import type { ChainNode } from "@browser-capture/contracts"

const chainFamilyLabels: Record<ChainNode["kind"], string> = {
  capability: "通用能力", function: "确定性函数", branch: "分支", browser: "浏览器动作", observe: "现场观察",
  data: "数据处理", condition: "条件", loop: "循环", invoke: "链路调用", human: "人工等待", llm: "显式模型",
  checkpoint: "检查点", emit: "发布输出", terminal: "终态",
}

const actionLabels: Record<string, string> = {
  navigate: "打开页面", input: "输入内容", click: "点击目标", wait: "等待条件满足", scroll: "滚动页面",
  go_back: "返回上一页", switch: "切换页面", close: "关闭页面", send_keys: "发送按键",
  upload_file: "上传文件", select_dropdown: "选择选项", drag_drop: "拖放目标",
  dropdown_options: "读取选项", bat_scroll_to: "滚动到目标", bat_wait_for: "等待目标就绪",
}

export function browserActionLabel(action: string) { return actionLabels[action] ?? action }

export function actionPresentation(node: ChainNode) {
  if (node.kind === "terminal") return { type: "结束", description: node.reason, title: terminalPresentation(node).label }
  const action = browserAction(node)
  const type = node.kind === "function" ? "Function" : node.kind === "capability" ? capabilityType(node, action)
    : node.kind === "observe" ? "读取" : chainFamilyLabels[node.kind]
  const description = action ? actionLabels[action] ?? "执行浏览器动作"
    : node.kind === "function" ? "执行 JavaScript，按输入计算结果"
    : type === "读取" ? "读取当前页面数据" : type === "分支" ? "按条件选择后续动作" : type
  return { type, description, title: node.label && node.label !== node.id ? node.label : description }
}

export function terminalPresentation(node: ChainNode) {
  if (node.kind !== "terminal") return { label: node.label, status: "idle" as const }
  const labels: Record<string, string> = { completed: "完成", failed: "失败", blocked: "受阻", cancelled: "已取消",
    missing: "未找到目标", timeout: "超时", human_required: "等待人工" }
  const label = node.label !== node.id ? node.label : labels[node.id] ?? labels[node.status] ?? "结束"
  return { label, status: node.status === "completed" ? "success" as const
    : node.id === "human_required" ? "waiting" as const : node.status === "cancelled" ? "skipped" as const : "failure" as const }
}

function browserAction(node: ChainNode) {
  if (node.kind === "browser") return node.operation
  if (node.kind !== "capability" || !node.config || typeof node.config !== "object" || Array.isArray(node.config)) return null
  return typeof node.config.actionName === "string" ? node.config.actionName : null
}

function capabilityType(node: Extract<ChainNode, { kind: "capability" }>, action: string | null) {
  if (node.capability.name === "browser.read-fields") return "读取"
  if (action === "wait") return "等待"
  return node.capability.name.startsWith("browser.") ? "浏览器动作" : "能力调用"
}
