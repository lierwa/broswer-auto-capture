import { directory as labData } from '../locations.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdtemp, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const base = labData
const upstream = path.join(base, 'upstream/candidate-review/kitsune')
const source = path.join(upstream, 'collector_src_behavioral.ts')
assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'),
  '238f681da2ce6b6a37a926a9214a269ce7215c84bdae59902165a37ec4c9ac87')
const original = await import(pathToFileURL(source).href)
const registry = await readFile(path.join(upstream, 'contracts_rules_registry.yaml'), 'utf8')
for (const [id, threshold] of [['keystroke_entropy_floor', '0.15'], ['keystroke_interval_floor', '30']])
  assert(registry.split(`- id: bh.${id}\n`)[1]?.split('\n  - id:')[0]?.includes(`threshold: ${threshold}\n`))
const out = await mkdtemp(path.join(base, 'reports/joint-calibration-'))
type Event = { type: string; at: number; composing?: boolean; repeat?: boolean; y?: number; scrollKey?: boolean }
function evaluate(label: string, events: Event[]) {
  const times = events.filter(e => e.type === 'keydown' && !e.composing && !e.repeat).map(e => e.at)
  const valid = times.every((t, i) => Number.isFinite(t) && (i === 0 || t >= times[i - 1]!))
  const median = valid ? original.keystrokeIntervalMedian(times) : -1
  const entropy = valid && times.length >= 4 ? original.keystrokeEntropy(times) : null
  return { label, keyCount: times.length, status: !valid ? 'invalid' : median < 0 ? 'unavailable' : 'measured',
    median, entropy, intervalFlagged: median < 0 ? null : median < 30, entropyFlagged: entropy === null ? null : entropy < .15 }
}
const rows = []
for (let phase = 0; phase < 3; phase++) {
  const data = JSON.parse(await readFile(path.join(base, `reports/human-17e48fb750af4fd0b5a18d3420640920/phase-${phase}.json`), 'utf8'))
  rows.push(evaluate(`one-human-free-phase-${phase}`, data.audit))
}
const events = (times: number[]) => times.map(at => ({ type: 'keydown', at }))
const controls = [evaluate('fixed-fast-synthetic', events([0, 5, 10, 15, 20, 25])),
  evaluate('fixed-slow-synthetic', events([0, 200, 400, 600, 800, 1000])),
  evaluate('varied-synthetic', events([0, 140, 370, 455, 890, 1050, 1370])), evaluate('missing', []),
  evaluate('backwards-clock', events([50, 40, 30, 20]))]
assert(controls[0]!.intervalFlagged && controls[0]!.entropyFlagged)
assert(!controls[1]!.intervalFlagged && controls[1]!.entropyFlagged)
assert(!controls[2]!.intervalFlagged && !controls[2]!.entropyFlagged)
assert.equal(controls[3]!.status, 'unavailable'); assert.equal(controls[4]!.status, 'invalid')
const live = process.argv[2] ? JSON.parse(await readFile(path.resolve(process.argv[2]), 'utf8')) as {mode: string; events: Event[]}[] : []
const scroll = live.filter(row => row.mode.endsWith('scroll')).map(row => {
  let previous = 0, max = 0
  for (const event of row.events.filter(e => e.type === 'scroll')) { max = Math.max(max, Math.abs((event.y ?? 0) - previous)); previous = event.y ?? 0 }
  const wheelCount = row.events.filter(e => e.type === 'wheel').length, key = row.events.some(e => e.scrollKey)
  return { mode: row.mode, maxDelta: max, wheelCount, scrollKey: key, flagged: original.isScrollTeleport(max, wheelCount, key, 0) }
})
rows.push(...live.filter(row => !row.mode.endsWith('scroll')).map(row => evaluate(`B-A-T-${row.mode}`, row.events)))
const result = { component: 'Kitsune f0a22b3 original exported functions', rows, controls, scroll,
  scope: 'Local calibration, experimental advisory rules; not a general human classifier',
  normalCounterexamples: { touch: original.isScrollTeleport(1800, 0, false, 1),
    keyboard: original.isScrollTeleport(1800, 0, true, 0), anchorCanTrigger: original.isScrollTeleport(1800, 0, false, 0) },
  limitations: ['One human in three free-operation segments, not independent users',
    'Old human audit has no repeat flag; held-key fast repeats cannot be excluded',
    'Scroll anchor/scrollbar jumps can trigger; not a blocking rule'], trainedOrTuned: false }
await writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify({ evidence: out, ...result }))
