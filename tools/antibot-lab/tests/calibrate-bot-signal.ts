// Fixed upstream heuristic transfer; no model fitting, browser or production installation.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd(), base = path.join(root, 'work/antibot-service')
const candidate = path.join(base, 'upstream/candidate-review/bot-signal-5cda0e5')
const receipt = JSON.parse(await readFile(path.join(candidate, 'source-receipt.json'), 'utf8'))
assert.equal(receipt.commit, '5cda0e5fb6e39840b66d253321cdee2d9b03e757')
for (const item of receipt.files) assert.equal(createHash('sha256')
  .update(await readFile(path.join(candidate, item.path))).digest('hex'), item.sha256)
const { analyzeBehavioralSamples } = await import(pathToFileURL(path.join(candidate, 'src/behavioral/scoring.ts')).href)
type Row = { record: string; label: string; user?: string; points: number[][] }
const inputFile = path.join(base, 'reports/behavior-independent-l0061a33/input.jsonl')
const normalSource = await readFile(inputFile, 'utf8')
const normals: Row[] = normalSource.trim().split('\n').map(line => JSON.parse(line))
assert.equal(normals.length, 2776)
assert.equal(new Set(normals.map(row => row.user)).size, 47)
const out = await mkdtemp(path.join(base, 'reports/behavior-bot-signal-'))

// WHY：复用已校验归档和原segment/增强排除约定，不从标签重采样或生成新轨迹。
const python = String.raw`
import hashlib, json, sys, zipfile
from pathlib import Path
source=Path(sys.argv[1])
for receipt in json.loads((source/'adaptive-receipt.json').read_text()):
    file=source/receipt['file']
    assert hashlib.sha256(file.read_bytes()).hexdigest()==receipt['sha256']
    is_bot='_Bot-' in receipt['file']
    with zipfile.ZipFile(file) as archive:
        for name in sorted(n for n in archive.namelist() if n.endswith('.json') and not n.startswith('__MACOSX/')):
            sample=json.loads(archive.read(name))
            assert sample['label']==(0 if is_bot else 1)
            if sample.get('metadata',{}).get('augmented'): continue
            segments=[sample] if 'mouse' in sample else sample['segments']
            for index,segment in enumerate(segments):
                print(json.dumps(dict(record=hashlib.sha256(name.encode()).hexdigest()[:16]+'-'+str(index),
                    label='bot-'+sample['bot_type'] if is_bot else 'cross-source-human',
                    points=[[r['x'],r['y'],r['t']] for r in segment['mouse']][-500:])))
`
const adapted = spawnSync(path.join(root, 'work/upstream-browser-hybrid/.venv/Scripts/python.exe'),
  ['-c', python, path.join(base, 'upstream/candidate-review/public-behavior-20261009')],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true })
assert.equal(adapted.status, 0, adapted.stderr)
const others: Row[] = adapted.stdout.trim().split('\n').map(line => JSON.parse(line))
const counts: Record<string, Record<string, number>> = {}, results: object[] = []
function evaluate(row: Row) {
  const group = counts[row.label] ??= { records: 0, measured: 0, invalid: 0, unavailable: 0, flagged: 0, clear: 0 }
  group.records!++
  const points = row.points
  const valid = points.every((point, i) => point.length === 3 && point.every(Number.isFinite)
    && (!i || point[2]! > points[i - 1]![2]!))
  const status = !valid ? 'invalid' : points.length < 6 ? 'unavailable' : 'measured'
  group[status]!++
  if (status !== 'measured') return { record: row.record, label: row.label, status }
  // Source lacks trust/delta/screen metadata: isolate x/y/t rules; true is not observed isTrusted evidence.
  const result = analyzeBehavioralSamples({ mouseMoves: points.map(([x, y, t]) => ({ x, y, t, isTrusted: true })),
    scrolls: [], keyPresses: [], clicks: [], touches: [], observationMs: points.at(-1)![2]! - points[0]![2]! })
  group[result.isLegitClient ? 'clear' : 'flagged']!++
  return { record: row.record, label: row.label, user: row.user, status, score: result.suspicionScore,
    flagged: !result.isLegitClient, signals: result.signals.filter((s: { triggered: boolean }) => s.triggered)
      .map((s: { id: string }) => s.id) }
}
for (const row of [...normals, ...others]) results.push(evaluate(row))
const normalGate = Object.entries(counts).filter(([name]) => name.includes('human'))
  .every(([, c]) => c.measured! > 0 && c.flagged! / c.measured! <= .01)
const botGate = Object.entries(counts).filter(([name]) => name.startsWith('bot-'))
  .every(([, c]) => c.measured! > 0 && c.flagged! / c.measured! >= .8)
await writeFile(path.join(out, 'result.json'), JSON.stringify({ source: receipt, counts, results, normalGate, botGate,
  productionAccepted: false, trainedOrTuned: false, originalThreshold: .55, modelCalls: 0,
  normalInputSha256: createHash('sha256').update(normalSource).digest('hex'),
  missingFields: ['isTrusted', 'movementX/Y', 'screen/page coordinates', 'clicks', 'keys', 'touch', 'scroll'],
  scope: 'mouse geometry and timing only; original weighted score is not a calibrated human probability',
  independentNewBlindData: false }, null, 2))
console.log(JSON.stringify({ out, counts, normalGate, botGate, productionAccepted: false }))
