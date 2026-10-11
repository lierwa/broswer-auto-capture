import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { dataDirectory } from '../locations.mjs'

// 保护部署边界：默认/本地配置/环境覆盖均相对盾自身，坏配置不能静默使用另一份数据。
test('data location is independent of caller cwd and rejects invalid configuration', async () => {
  const source = await mkdtemp(path.join(tmpdir(), 'bat-shield-locations-'))
  try {
    assert.equal(dataDirectory(source, {}), path.join(source, '.local'))
    await writeFile(path.join(source, 'local.json'), JSON.stringify({ dataDirectory: 'owned-data' }))
    assert.equal(dataDirectory(source, {}), path.join(source, 'owned-data'))
    assert.equal(dataDirectory(source, { BAT_ANTIBOT_DATA: 'override' }), path.join(source, 'override'))
    assert.throws(() => dataDirectory(source, { BAT_ANTIBOT_DATA: '' }), /lab_data_directory_invalid/)
    for (const value of ['{}', '{"dataDirectory":true}', '{"dataDirectory":"valid","typo":1}', 'broken']) {
      await writeFile(path.join(source, 'local.json'), value)
      assert.throws(() => dataDirectory(source, {}))
    }
  } finally { await rm(source, { recursive: true }) }
})
