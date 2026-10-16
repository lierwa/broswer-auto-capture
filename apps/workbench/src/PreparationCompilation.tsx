import type { TaskWorkspaceSnapshot } from "@browser-capture/contracts"

type Build = NonNullable<NonNullable<TaskWorkspaceSnapshot["activity"]>["build"]>
type Status = NonNullable<TaskWorkspaceSnapshot["activity"]>["compilationStatus"]
const actions: Record<string, string> = { click: "点击目标", navigate: "打开页面", input: "输入内容",
  go_back: "返回页面", switch: "切换标签页", close: "关闭标签页", find_elements: "查找页面元素",
  bat_read_fields: "读取页面信息", extract: "读取页面信息", scroll: "滚动页面" }

export function compilationIssueLabel(reason: string) {
  if (reason === "collection_selection_read_required") return "缺少动态条目选择的读取依据"
  if (reason.startsWith("natural_binding_evidence_missing:")) return "缺少可复用的动作输入绑定"
  if (reason === "prefix_consumer_boundary_crossed") return "动作后的页面状态未得到证明"
  if (reason === "compilation_dependency_pending") return "等待后续读取或方法证据"
  return "动作的复跑证据尚未闭合"
}

export function PreparationCompilation({ build, status }: { build?: Build | undefined; status?: Status }) {
  const progress = build?.compilation
  if (!progress && !status) return null
  return <section aria-label="动作记录与编译进度">
    {status?.status === "failed" && <p>最新动作来源已保存，链路编译仍有缺口，暂不能发布。
      {build ? " 画布保留上一份有效候选。" : " 当前尚无有效候选。"}</p>}
    {status?.status === "pending" && <p>最新动作来源已保存，正在生成对应链路。
      {status.stale && build ? " 画布仍显示上一份候选。" : ""}</p>}
    {progress && build && <p>已记录 {status?.observedActions ?? progress.observedActions} 个动作，已生成 {build.nodes.length} 个节点。
      {progress.pendingActions > 0 && ` ${progress.pendingActions} 个动作尚未编译。`}</p>
    }
    {progress && progress.issues.length > 0 && <>
      <p>浏览器试做与链路编译分别记录。以下缺口仍会阻止发布：</p>
      <ul>{progress.issues.slice(0, 6).map((issue, index) => <li key={`${issue.actionRef}:${index}`}>
        第 {Number(issue.actionRef.slice(2))} 个动作 · {actions[issue.actionName] ?? "浏览器动作"}：{compilationIssueLabel(issue.reason)}
      </li>)}</ul>
    </>}
  </section>
}
