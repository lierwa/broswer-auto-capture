import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { root } from './locations.mjs'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const manifest = z.object({ version: z.literal('1.0.0'), wheel: z.literal('bat_request_budget-1.0.0-py3-none-any.whl'),
  wheelSha256: digest, sourceDigest: digest, sourceFiles: z.record(z.string(), digest),
  buildFrontend: z.literal('build==1.2.2.post1'), buildBackend: z.literal('hatchling==1.27.0'),
  dependencies: z.object({ 'pyrate-limiter': z.literal('4.5.0'), filelock: z.literal('3.19.1') }) }).strict()

export async function sharedBudget() {
  const receipt = manifest.parse(JSON.parse(await readFile(path.join(root, 'shared/request-budget.json'), 'utf8')))
  const wheelPath = path.join(root, 'shared', receipt.wheel)
  if (createHash('sha256').update(await readFile(wheelPath)).digest('hex') !== receipt.wheelSha256) throw Error('request_budget_artifact_changed')
  return { ...receipt, wheelPath }
}
