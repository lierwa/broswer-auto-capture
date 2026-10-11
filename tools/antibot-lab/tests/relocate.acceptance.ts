import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { relocate } from '../relocate.ts'
import { configure } from '../settings.ts'
import { directory, root, linuxPath, wsl } from '../paths.ts'

// 保护真实部署回归：错owner拒绝、配置阶段失败回滚、POSIX Hub链接保留、已有状态不倒退。
const from = process.argv[2]
if (!from || !path.isAbsolute(from)) throw Error('explicit_previous_source_required')
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const prepared = await readFile(path.join(directory, 'prepared.json'))
const owner = await readFile(path.join(directory, 'service-owner.json'))
const history = () => JSON.parse(wsl(['/usr/bin/python3', '-I', '-c', `import hashlib,json,sys
from pathlib import Path
base=Path(sys.argv[1]); names=['secrets.json','data/crowdsec.db','data/business.sqlite','data/budget.sqlite','data/challenge-spent.sqlite']
print(json.dumps({name:hashlib.sha256((base/name).read_bytes()).hexdigest() for name in names if (base/name).exists()}))`, linuxPath(directory)], true))
const before = history()
await assert.rejects(() => relocate(path.join(from, 'incorrect-owner')), /relocate_owner_changed/)
await assert.rejects(() => relocate(from, async (...args) => {
  await configure(...args)
  await writeFile(path.join(directory, 'config/owned-failure-control.yaml'), 'temporary control')
  throw Error('owned_configuration_failure')
}), /owned_configuration_failure/)
assert.equal(sha(await readFile(path.join(directory, 'prepared.json'))), sha(prepared))
assert.equal(sha(await readFile(path.join(directory, 'service-owner.json'))), sha(owner))
await assert.rejects(() => readFile(path.join(directory, 'config/owned-failure-control.yaml')), { code: 'ENOENT' })
assert.deepEqual(history(), before)
const result = await relocate(from)
assert.deepEqual(history(), before)
assert.equal(JSON.parse(await readFile(path.join(directory, 'prepared.json'), 'utf8')).checkout, linuxPath(root))
await writeFile(path.join(directory, 'reports/relocate-acceptance.json'), JSON.stringify({ passed: true,
  wrongOwnerRejected: true, actualConfigureFailureRestored: true, addedConfigurationRemoved: true,
  historicalFilesUnchanged: before, sourceChanged: true, evidence: result.evidence }, null, 2))
console.log(JSON.stringify({ passed: true, wrongOwnerRejected: true, actualConfigureFailureRestored: true,
  historicalDataPreserved: true, sourceChanged: true, evidence: result.evidence }))
