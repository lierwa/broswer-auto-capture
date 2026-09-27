import { ZodError } from "zod"

const MAX_ISSUES = 16
const MAX_UNION_DEPTH = 8
const MAX_PATH_LENGTH = 12
const issueCodes = new Set([
  "invalid_type", "invalid_value", "invalid_format", "invalid_union", "invalid_key", "invalid_element",
  "too_big", "too_small", "not_multiple_of", "unrecognized_keys", "custom",
])
// WHY：只保留协议中固定字段名；输出、输入、页面和任务数据里的动态键一律压成占位符。
const protocolKeys = new Set([
  "output", "request", "response", "history", "localRef", "digest", "sourceSuccess", "sourceValidated",
  "browserCommands", "compilation", "canonicalPayload", "sourcePayloads", "mediaType", "sourceDigests",
  "segments", "controlGraph", "entry", "edges", "terminals", "coverage", "gaps", "canonicalDigest",
  "compilerVersion", "outputAssembly", "resultBinding", "resultBranches", "id", "kind", "operation",
  "name", "version", "actionName", "specification", "container", "fields", "selector", "attribute",
  "includeOrdinal", "requireComplete", "maxItems", "maxInputBytes", "outputSchema", "target", "scope",
  "preconditions", "expectedEffect", "postconditions", "outputs", "proofRefs", "bindings", "sourceRef",
  "schema", "actionRef", "disposition", "ownerSegmentId", "exclusionRule", "evidenceRefs", "reason",
  "resolution", "path", "readPath", "outputPath", "status", "from", "to", "outcome",
])

type SafeIssue = { code: string; path: (string | number)[] }
type IssueLike = { code?: unknown; path?: unknown; errors?: unknown; unionErrors?: unknown }

function issueObject(value: unknown): IssueLike | null {
  return value !== null && typeof value === "object" ? value as IssueLike : null
}

function safePath(path: unknown, prefix: (string | number)[]) {
  const parts = Array.isArray(path) ? path : []
  return [...prefix, ...parts].slice(0, MAX_PATH_LENGTH).map((part) =>
    typeof part === "string" && protocolKeys.has(part) ? part
      : typeof part === "number" && Number.isSafeInteger(part) && part >= 0 ? part : "<key>")
}

/** Flatten Zod unions without persisting messages, received values, dynamic keys, or raw responses. */
export function authorResultIssues(error: unknown): SafeIssue[] {
  if (!(error instanceof ZodError)) return []
  const output: SafeIssue[] = [], seen = new Set<string>()
  const add = (code: string, path: (string | number)[]) => {
    const safe = { code: issueCodes.has(code) ? code : "other", path }
    const key = JSON.stringify(safe)
    if (!seen.has(key) && output.length < MAX_ISSUES) { seen.add(key); output.push(safe) }
  }
  const visit = (raw: unknown, prefix: (string | number)[], depth: number) => {
    if (output.length >= MAX_ISSUES || depth > MAX_UNION_DEPTH) return
    const issue = issueObject(raw)
    if (!issue || typeof issue.code !== "string") return
    const path = safePath(issue.path, prefix)
    if (issue.code !== "invalid_union") { add(issue.code, path); return }
    const branches = Array.isArray(issue.errors) ? issue.errors : issue.unionErrors
    const before = output.length
    if (Array.isArray(branches)) for (const branch of branches.slice(0, MAX_ISSUES)) {
      const children = Array.isArray(branch) ? branch : issueObject(branch)?.errors
      if (Array.isArray(children)) for (const child of children.slice(0, MAX_ISSUES)) visit(child, path, depth + 1)
    }
    if (output.length === before) add("invalid_union", path)
  }
  for (const issue of error.issues.slice(0, MAX_ISSUES)) visit(issue, [], 0)
  return output
}
