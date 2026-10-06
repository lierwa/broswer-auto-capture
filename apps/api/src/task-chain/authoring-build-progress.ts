import { z } from "zod"
import type { TaskAuthoringJob } from "@browser-capture/contracts"
import { hybridPrefixCompilationSchema } from "../upstream-browser/hybrid-prefix-schema.js"

type Build = NonNullable<NonNullable<TaskAuthoringJob["authoring"]>["build"]>
const compilation = hybridPrefixCompilationSchema.pick({ coverage: true, gaps: true }).strip()
const actions = z.array(z.object({ id: z.string(), name: z.string() }))

/** WHY：进度来自同一已验正编译包，不能用当前可见前缀的节点数冒充全部动作。 */
export function compilationProgress(source: z.infer<typeof compilation>, trace: { actions: { id: string; name?: unknown }[] }): NonNullable<Build["compilation"]> {
  const names = new Map(trace.actions.map(action => [action.id, action.name]))
  const pending = source.coverage.filter(row => row.disposition === "not_compilable")
  const compiled = source.coverage.filter(row => row.disposition === "compiled").length
  const issues = source.coverage.flatMap(row => {
    const reasons = source.gaps.filter(gap => gap.actionRefs.includes(row.actionRef)).map(gap => gap.reason)
    if (row.disposition === "not_compilable" && !reasons.length) reasons.push("compilation_dependency_pending")
    const name = names.get(row.actionRef) ?? "browser_action"
    return [...new Set(reasons)].map(reason => ({ actionRef: row.actionRef,
      actionName: typeof name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(name) ? name : "browser_action",
      reason: safeCode(reason, "compilation_evidence_missing") }))
  }).slice(0, 500)
  return { observedActions: source.coverage.length, compiledActions: compiled, pendingActions: pending.length,
    excludedActions: source.coverage.length - compiled - pending.length, issues }
}

/** 历史快照只读投影；不补造来源，不改写旧 job。 */
export function storedCompilationProgress(build: Build): Build["compilation"] {
  if (build.compilation) return build.compilation
  try {
    const value = z.object({ canonicalRequest: z.string(), response: z.object({ compilation }) })
      .parse(JSON.parse(build.payload))
    const trace = z.object({ trace: z.object({ actions }) }).parse(JSON.parse(value.canonicalRequest)).trace
    return compilationProgress(value.response.compilation, trace)
  } catch { return undefined }
}

function safeCode(value: string, fallback: string) {
  return value.length <= 200 && /^[A-Za-z0-9_:.-]+$/.test(value) ? value : fallback
}
