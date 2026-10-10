import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { analyze, classifyScore } from '../../../work/antibot-service/runtime/motion/package/src/analyzer.js'

const base = 'work/antibot-service'
const source = await readFile(`${base}/runtime/motion/package/src/analyzer.js`)
assert.equal(createHash('sha256').update(source).digest('hex'), '67a2ae0f578a221499b68dbbbbc5a5e097122ba32715959dd8465f68422012de')
const input = (await readFile(`${base}/reports/motion-phase2-labelled-input.jsonl`, 'utf8')).trim().split('\n').map(JSON.parse)
const counts = {}, rows = []
for (const item of input) {
  const data = { m: item.points, c: [], k: [], s: [], tc: [], ac: [], gy: [], or: [], ev: [], bc: [], bl: [],
    ttfi: item.points[0]?.[2] ?? 0, dur: item.duration, meta: {} }
  const result = analyze(data), verdict = classifyScore(result.score)
  const group = counts[item.label] ??= { records: 0, human: 0, suspicious: 0, bot: 0, clockInvalid: 0 }
  group.records++; group[verdict]++
  if (result.categories.contract.penalty) group.clockInvalid++
  rows.push({ record: item.record, label: item.label, samples: item.points.length, score: result.score, verdict,
    categories: result.categories, reasons: result.reasons })
}
const report = { version: 'motion-attestation@1.1.0', thresholds: 'original classifyScore, unchanged',
  method: 'phase2-last500-per-record; no training or tuning', counts,
  falsePositive: counts.human.bot + counts.human.suspicious,
  falseNegative: counts.advancedbot.human + counts.moderatebot.human,
  validity: 'cross-collector-partial', acceptedForBlocking: false,
  limits: ['Missing movementX changes coordinate contract; raw dataset integers not fabricated into subpixels',
    'Other interaction channels unavailable, empty arrays are missing, not measured negative',
    'User/device grouping not available; no independent-user generalization claim',
    'CC BY-NC-SA dataset is research-only and not bundled in product'], rows }
await writeFile(`${base}/reports/motion-dataset-labelled-calibration.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ counts, falsePositive: report.falsePositive, falseNegative: report.falseNegative,
  validity: report.validity, acceptedForBlocking: false }))
