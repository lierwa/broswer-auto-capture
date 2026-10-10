import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile, writeFile } from "node:fs/promises"
import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { binaries } from "./paths.ts"
import { sourceStatus } from './source-data.ts'
import { geoSourceStatus } from './geo-source.ts'

const exec = promisify(execFile)
const alert = z.object({ id: z.coerce.number(), scenario: z.string(), start_at: z.string().optional(), stop_at: z.string().optional(),
  message: z.string().optional(), remediation: z.boolean().optional() }).passthrough()
async function alerts(base: string) {
  try {
    const { stdout } = await exec(binaries(base).cscli, ["-c", `${base}/config/config.yaml`, "alerts", "list", "-o", "json", "--limit", "100"], { timeout: 10_000, maxBuffer: 2_000_000 })
    const rows = z.array(alert).parse(JSON.parse(stdout) ?? [])
    return { status: "observed", items: rows.map(({ id, scenario, start_at, stop_at, message, remediation }) => ({ id, scenario, start_at, stop_at, message, remediation })) }
  } catch { return { status: "unavailable", items: [] } }
}
async function observations(base: string) {
  try {
    const data = await readFile(`${base}/logs/crowdsec.log`, "utf8")
    // WHY：仅投影上游结论字段；不公开 cookies、完整指纹或原始请求。
    return data.split("\n").filter(line => /challenge submission accepted|on_challenge_submit rejected/.test(line)).slice(-100).map(line => ({
      at: /time="([^"]+)"/.exec(line)?.[1] ?? null,
      result: line.includes("submission accepted") ? "accepted" : "rejected",
      score: /request score (\d+)/.exec(line)?.[1] ?? null,
      signals: /signals="([^"\r\n]{0,1000})"/.exec(line)?.[1] ?? null,
    }))
  } catch { return [] }
}
async function metrics(base: string) {
  try {
    const { stdout } = await exec(binaries(base).cscli, ["-c", `${base}/config/config.yaml`, "metrics", "show", "appsec", "-o", "json"], { timeout: 10_000 })
    const counts = z.record(z.string(), z.record(z.string(), z.number().nonnegative()))
    return { status: "observed", ...z.object({ "appsec-challenge": z.object({ funnel: counts }), "appsec-engine": counts }).parse(JSON.parse(stdout)) }
  } catch { return { status: "unavailable" } }
}
async function requests(base: string) {
  const row = z.object({ RequestHost: z.string(), RequestPath: z.string(), RequestMethod: z.string(),
    DownstreamStatus: z.number(), OriginStatus: z.number().default(0), StartUTC: z.string() })
  try {
    return (await readFile(`${base}/logs/access.jsonl`, "utf8")).trim().split("\n").slice(-600).flatMap(line => {
      try { const value = row.parse(JSON.parse(line)); return [value] } catch { return [] }
    })
  } catch { return [] }
}
export async function snapshot(base: string, db: DatabaseSync) {
  const [detectorAlerts, submissions, detectorMetrics, access] = await Promise.all([alerts(base), observations(base), metrics(base), requests(base)])
  const report = {
    createdAt: new Date().toISOString(), detector: "CrowdSec 1.8.1 / balanced >=75", detectorAlerts, submissions, detectorMetrics, access,
    networkSource: await sourceStatus(base),
    geographySource: await geoSourceStatus(base),
    business: db.prepare("SELECT case_id,at,action,value FROM events ORDER BY id DESC LIMIT 300").all(),
    telemetry: db.prepare(`SELECT c.id AS caseId,
      json_extract(o.value,'$.page') AS pageId,
      COALESCE((SELECT json_extract(t.value,'$.environment') FROM events t WHERE t.case_id=c.id AND t.action='telemetry'
        AND json_extract(t.value,'$.page')=json_extract(o.value,'$.page') AND json_extract(t.value,'$.environment') IS NOT NULL
        ORDER BY t.id DESC LIMIT 1), CASE WHEN julianday('now')-julianday(o.at)>10.0/86400 THEN 'timeout' ELSE 'missing' END) AS environment,
      COALESCE((SELECT json_extract(t.value,'$.integrity') FROM events t WHERE t.case_id=c.id AND t.action='telemetry'
        AND json_extract(t.value,'$.page')=json_extract(o.value,'$.page') AND json_extract(t.value,'$.integrity') IS NOT NULL
        ORDER BY t.id DESC LIMIT 1), CASE WHEN julianday('now')-julianday(o.at)>20.0/86400 THEN 'timeout' ELSE 'missing' END) AS webglIntegrity,
      COALESCE((SELECT json_extract(t.value,'$.workerIntegrity') FROM events t WHERE t.case_id=c.id AND t.action='telemetry'
        AND json_extract(t.value,'$.page')=json_extract(o.value,'$.page') AND json_extract(t.value,'$.workerIntegrity') IS NOT NULL
        ORDER BY t.id DESC LIMIT 1), CASE WHEN julianday('now')-julianday(o.at)>20.0/86400 THEN 'timeout' ELSE 'missing' END) AS workerIntegrity
      FROM cases c JOIN events o ON o.id=(SELECT MAX(e.id) FROM events e WHERE e.case_id=c.id AND e.action='opened')
      ORDER BY c.created DESC LIMIT 100`).all(),
    scope: "本机CrowdSec挑战/处置、完整4183 TLS/H2/H3协议关联、HTTP与页面身份及BotD/WebGL镜像/跨Worker/输入告警。遥测可伪造；partial/error/unavailable/missing/timeout均非完整阴性。Tor仅来源属性，GeoIP仅国家/ASN及软线索；一般行为与全部目标网站验收未完成。",
  }
  await writeFile(`${base}/reports/latest.json`, JSON.stringify(report, null, 2))
  return report
}
