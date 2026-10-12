import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { directory, linuxArchitecture } from './paths.ts'

export async function verifyPrebuilt(base = directory, architecture = linuxArchitecture(), runtimeOnly = false) {
  const receipt = z.object({ schemaVersion: z.literal(1), platform: z.literal('linux'),
    architecture: z.enum(['x64', 'arm64']), distribution: z.literal('ubuntu-26.04'),
    files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)), hostCaIncluded: z.literal(false) })
    .parse(JSON.parse(await readFile(path.join(base, 'runtime-release.json'), 'utf8')))
  if (receipt.architecture !== architecture) throw Error('runtime_architecture_mismatch')
  for (const [file, digest] of Object.entries(receipt.files)) {
    if (!file.startsWith('assets/')) continue
    const relative = file.slice(7)
    if (!relative || relative.split('/').some(part => part === '..' || !part) || path.isAbsolute(relative)) throw Error('runtime_file_boundary_invalid')
    // WHY：公开数据可按原维护入口刷新；启动仍逐字核验不可变的执行制品。
    if (runtimeOnly && !relative.startsWith('runtime/') && !relative.startsWith('upstream/')) continue
    if (createHash('sha256').update(await readFile(path.join(base, relative))).digest('hex') !== digest)
      throw Error('runtime_artifact_changed:' + relative)
  }
  return receipt
}
