import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { root, linuxArchitecture } from './paths.ts'

const manifest = z.array(z.object({ name: z.string(), url: z.url(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
// WHY：按目标 Linux 架构选择固定材料，拒绝靠 x64 模拟或 URL 猜测替代 arm64 制品。
export async function artifacts(architecture = linuxArchitecture()) {
  const base = manifest.parse(JSON.parse(await readFile(path.join(root, 'artifacts.json'), 'utf8')))
  if (architecture === 'x64') return base
  const overrides = manifest.parse(JSON.parse(await readFile(path.join(root, 'artifacts-arm64.json'), 'utf8')))
  if (new Set(overrides.map(row => row.name)).size !== overrides.length
    || overrides.some(row => !base.some(item => item.name === row.name))) throw Error('artifact_override_invalid')
  return base.map(row => overrides.find(item => item.name === row.name) ?? row)
}
