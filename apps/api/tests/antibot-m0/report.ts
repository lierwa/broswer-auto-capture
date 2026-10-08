import { z } from "zod"

export const modes = ["manual", "positive", "debug-host", "bu-connect", "bu-observe", "bat-execute"] as const
export type Mode = typeof modes[number]
const detection = z.object({ detected: z.boolean(), severity: z.enum(["low", "medium", "high"]) })
const fingerprint = z.object({ signals: z.record(z.string(), z.unknown()), fastBotDetection: z.boolean(),
  fastBotDetectionDetails: z.record(z.string(), detection) }).passthrough()
export const submission = z.discriminatedUnion("status", [
  z.object({ status: z.literal("observed"), fingerprint, elapsedMs: z.number().nonnegative() }),
  z.object({ status: z.enum(["unavailable", "invalid"]), reason: z.enum(["probe_timeout", "probe_error", "module_error"]) }),
])

// WHY：只核验固定上游简单比较规则所需输入，不复制检测判定；复杂规则内部吞错保留 unknown。
export const inputs: Record<string, { mechanism: string; path: string }> = {
  hasWebdriver: { mechanism: "E01", path: "automation.webdriver" },
  hasSeleniumProperty: { mechanism: "E01", path: "automation.selenium" },
  hasPlaywright: { mechanism: "E01", path: "automation.playwright" },
  hasWebdriverIframe: { mechanism: "E01", path: "contexts.iframe.webdriver" },
  hasCDP: { mechanism: "E06", path: "automation.cdp" },
}
function atPath(value: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => current && typeof current === "object"
    ? (current as Record<string, unknown>)[part] : undefined, value)
}
export function analyze(raw: unknown) {
  const parsed = submission.safeParse(raw)
  if (!parsed.success) return { status: "invalid" as const, reason: "submission_schema", rules: [] }
  if (parsed.data.status !== "observed") return { ...parsed.data, rules: [] }
  const fp = parsed.data.fingerprint
  const names = new Set([...Object.keys(fp.fastBotDetectionDetails), ...Object.keys(inputs)])
  const rules = [...names].map(name => {
    const rule = fp.fastBotDetectionDetails[name], definition = inputs[name]
    const value = definition ? atPath(fp.signals, definition.path) : undefined
    const state = !rule ? "unavailable" : !definition ? "unknown" : typeof value === "boolean" ? "observed"
      : value === "ERROR" ? "invalid" : value === undefined || ["INIT", "NA", "SKIPPED"].includes(String(value))
        ? "unavailable" : "invalid"
    return { name, mechanism: definition?.mechanism ?? "unmapped", state,
      detected: rule?.detected ?? null, severity: rule?.severity ?? null,
      input: typeof value === "boolean" ? value : null,
      reason: state === "observed" ? "upstream_boolean_rule_input_valid"
        : state === "unknown" ? "upstream_rule_error_not_observable" : "rule_or_input_unusable" }
  })
  return { status: "observed" as const, reason: null, rules, upstreamDetected: fp.fastBotDetection, elapsedMs: parsed.data.elapsedMs }
}
export type Finding = ReturnType<typeof analyze>
export interface Sample {
  id: string; mode: Mode; round: number; environment: string; finding: Finding;
  business: "passed" | "failed" | "not_run"; commands: number; modelCalls: number;
  cleanup: boolean; documentRequests: number; probeSubmissions: number;
}
function referenceFor(rule: string, manual: Sample[], positive: Sample[]) {
  const observations = (group: Sample[], expected: boolean) => group.every(sample => sample.cleanup
    && sample.documentRequests === 1 && sample.probeSubmissions === 1
    && sample.finding.status === "observed" && sample.finding.rules.some(value => value.name === rule
      && value.state === "observed" && value.detected === expected))
  const roundsPresent = (group: Sample[]) => [1, 2, 3].every(round => group.some(sample => sample.round === round))
  const all = [...manual, ...positive]
  const valid = roundsPresent(manual) && roundsPresent(positive)
    && new Set(all.map(sample => sample.environment)).size === 1
    && new Set(all.map(sample => sample.id)).size === all.length
    && observations(manual, false) && observations(positive, true)
  // WHY：真人选错资料仍然是真人环境证据；任务正确性单独保留，不改写该轮业务失败。
  return { rule, status: valid ? "valid_positive_and_manual_reference" : "incomplete_or_invalid",
    manualSamples: manual.length, positiveSamples: positive.length }
}
export function compare(samples: Sample[]) {
  const groups = modes.map(mode => ({ mode, samples: samples.filter(s => s.mode === mode).length }))
  const differences = Object.keys(inputs).map(rule => {
    const byMode = modes.map(mode => {
      const selected = samples.filter(s => s.mode === mode)
      const observed = selected.map(s => s.finding.rules.find(r => r.name === rule)).filter(r => r?.state === "observed")
      const hits = observed.filter(r => r?.detected).length
      return { mode, total: selected.length, observed: observed.length, hits,
        TP: mode !== "manual" && mode !== "debug-host" ? hits : null,
        FN: mode !== "manual" && mode !== "debug-host" ? observed.length - hits : null,
        FP: mode === "manual" ? hits : null, TN: mode === "manual" ? observed.length - hits : null }
    })
    return { rule, byMode }
  })
  const manual = samples.filter(s => s.mode === "manual")
  const positive = samples.filter(s => s.mode === "positive")
  const ready = groups.every(g => [1, 2, 3].every(round => samples.some(s => s.mode === g.mode && s.round === round)))
    && new Set(samples.map(s => s.id)).size === samples.length
    && samples.every(s => s.cleanup && s.documentRequests === 1 && s.probeSubmissions === 1 && s.modelCalls === 0
      && Object.keys(inputs).every(name => s.finding.rules.some(r => r.name === name && r.state === "observed")))
    // 人工业务选项另行结算；环境正反例有效性不取决于真人是否选对资料。
    && samples.filter(s => s.mode === "bat-execute").every(s => s.business === "passed")
    && positive.every(s => s.finding.rules.some(r => r.name === "hasWebdriver" && r.state === "observed" && r.detected))
    && manual.every(s => s.finding.rules.some(r => r.name === "hasWebdriver" && !r.detected))
    && new Set(samples.map(s => s.environment)).size === 1
  return { schemaVersion: 1, baseline: ready ? "webdriver_baseline_valid_other_rules_uncalibrated" : "incomplete_or_invalid",
    productImprovement: "not_tested", groups, differences,
    registeredReferences: ["hasWebdriver", "hasWebdriverIframe"].map(rule => referenceFor(rule, manual, positive)),
    business: groups.map(group => ({ mode: group.mode,
      passed: samples.filter(sample => sample.mode === group.mode && sample.business === "passed").length,
      failed: samples.filter(sample => sample.mode === group.mode && sample.business === "failed").length })),
    calibration: Object.keys(inputs).map(rule => ({ rule,
      status: rule === "hasWebdriver" || rule === "hasWebdriverIframe"
        ? positive.length >= 3 && positive.every(s => s.finding.rules.some(r => r.name === rule && r.state === "observed" && r.detected))
          ? "positive_responded" : "positive_missing_or_not_responding" : "positive_not_established" })),
    limitations: ["B-U direct connection and B-A-T managed startup are different paths; no single-action causality claimed",
      "Other upstream rule health remains unknown", "No TLS, independent detector, daily browser or platform evidence",
      "Server hits cover this fixture only; browser background traffic is not captured"] }
}
