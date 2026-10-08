import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { probe } from "./antibot-m0/artifact.js"
import { compare, modes, type Sample } from "./antibot-m0/report.js"

const sampleSchema = z.object({ id: z.uuid(), mode: z.enum(modes), round: z.number().int().min(1).max(3),
  environment: z.string(), business: z.enum(["passed", "failed", "not_run"]), commands: z.number().int().nonnegative(),
  modelCalls: z.number().int().nonnegative(), cleanup: z.boolean(), documentRequests: z.number().int().nonnegative(),
  probeSubmissions: z.number().int().nonnegative(), finding: z.object({ status: z.enum(["observed", "unavailable", "invalid"]),
    rules: z.array(z.object({ name: z.string(), mechanism: z.string(), state: z.enum(["observed", "unavailable", "invalid", "unknown"]),
      detected: z.boolean().nullable(), severity: z.enum(["low", "medium", "high"]).nullable(), input: z.boolean().nullable(), reason: z.string() })),
  }).passthrough() })
const parent = path.resolve("work", "antibot-m0")
const directories = process.argv.slice(2).map(value => path.resolve(value))
if (!directories.length || directories.some(value => !value.startsWith(parent + path.sep))) throw Error("m0_local_run_directories_required")
const samples: Sample[] = []
for (const directory of directories) {
  const manifest = z.object({ probe: z.object({ bundleSha256: z.literal(probe.bundleSha256) }), headless: z.literal(false),
    profilePolicy: z.literal("fresh") }).parse(JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")))
  void manifest
  samples.push(...z.array(sampleSchema).parse(JSON.parse(await readFile(path.join(directory, "samples.json"), "utf8"))) as Sample[])
}
const report = { ...compare(samples), sourceRuns: directories.map(value => path.relative(parent, value)) }
const output = path.join(parent, `comparison-${Date.now()}.json`)
await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" })
console.log(JSON.stringify({ output, baseline: report.baseline, groups: report.groups }))
