import { z } from "zod"
import type { JsonValue, TaskAuthoringJob } from "@browser-capture/contracts"

export function reusablePlanCandidate(jobs: TaskAuthoringJob[], key: string): JsonValue | undefined {
  for (const job of jobs.toReversed()) {
    if (job.type !== "chain" || job.key !== key || job.status !== "failed" || job.authoring?.stage !== "planning"
      || job.audit?.purpose !== "chain_exploration_and_compilation") continue
    const invocationId = job.audit.events.findLast((event) => event.type === "generation.completed")?.invocationId
    if (!invocationId) continue
    const text = job.audit.events.flatMap((event) => event.invocationId === invocationId && event.type === "text.delta"
      ? [event.text] : []).join("")
    try { return z.json().parse(JSON.parse(text)) } catch { continue }
  }
  return undefined
}
