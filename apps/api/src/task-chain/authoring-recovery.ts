import { z } from "zod"
import { type JsonValue, type TaskAuthoringJob } from "@browser-capture/contracts"

export function reusablePlanCandidate(jobs: TaskAuthoringJob[], key: string,
  accepts: (candidate: JsonValue) => boolean = () => true): JsonValue | undefined {
  for (const job of jobs.toReversed()) {
    if (job.type !== "chain" || job.key !== key || job.status !== "failed"
      || job.audit?.purpose !== "chain_exploration_and_compilation") continue
    const invocationIds = job.audit.events.filter((event) => event.type === "generation.completed")
      .map((event) => event.invocationId).toReversed()
    for (const invocationId of invocationIds) {
      const text = job.audit.events.flatMap((event) => event.invocationId === invocationId && event.type === "text.delta"
        ? [event.text] : []).join("")
      try {
        const candidate = z.json().parse(JSON.parse(text))
        if (accepts(candidate)) return candidate
      } catch { continue }
    }
  }
  return undefined
}
