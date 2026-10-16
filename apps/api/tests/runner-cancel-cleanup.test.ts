import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { RunnerProcess } from '../src/upstream-browser/service.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))
// WHY：控制进程退出与浏览器 lease 关闭必须分别证明；真实 child abort，测试不启动浏览器。
test('aborting a managed runner keeps browser cleanup unconfirmed after the exact child exits', async () => {
  const controller = new AbortController()
  const runner = new RunnerProcess(root, controller.signal, undefined, {
    browserMode: 'dedicated-visible', runnerScript: fileURLToPath(new URL('runner-process-child.py', import.meta.url)),
    runnerEnvironment: { BAT_TEST_RUNNER_MODE: 'normal' },
  })
  try {
    await runner.startHybrid({ headless: false, profilePath: path.join(root, 'work/controlled-unused-profile'),
      allowedOrigins: ['https://owned.invalid'], managedWindow: { ownerId: randomUUID(), resume: false } })
    controller.abort(new Error('controlled_cancel'))
    const report = await runner.close()
    assert.equal(report.status, 'unconfirmed')
    assert.equal(report.code, 'cleanup_browser_close_unverified')
    assert.equal(report.activeResources, null)
    assert.equal(report.stages.find(stage => stage.stage === 'browser_close')?.status, 'unconfirmed')
    assert.equal(report.stages.find(stage => stage.stage === 'child_exit')?.status, 'confirmed')
    assert.equal(report.stages.find(stage => stage.stage === 'temporary_directory')?.status, 'confirmed')
    assert.strictEqual(await runner.close(), report)
  } finally { await runner.close() }
})
