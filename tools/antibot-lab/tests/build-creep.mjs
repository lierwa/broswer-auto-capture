import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { workerOptions } from './creep-worker-options.mjs'
import { fontDiagnostics } from './creep-font-diagnostics.mjs'

const base = path.resolve('work/antibot-service')
const require = createRequire(path.join(base, 'runtime/creep-build/package.json'))
const { rollup } = require('rollup'), typescript = require('@rollup/plugin-typescript')
const source = '10aa6724cd33a1015db1574211890518cd04f0cc'
// 复用上游Rollup+TypeScript/noCheck构建；保留故意给const赋值的异常探针，不能改源码消掉判据。
const entries = process.argv.includes('--devices') ? [['creep-device-client', 'creep-device-client', 'esm']] : process.argv.includes('--workers') ? [['creep-worker-client', 'creep-worker-client', 'esm'],
  ['creep-worker-source', 'creep-worker-source', 'iife']] : [['creep-entry', 'creep-probe', 'esm']]
for (const [entry, name, format] of entries) {
const bundle = await rollup({ input: `tools/antibot-lab/tests/${entry}.ts`, plugins: [workerOptions(require('typescript')), fontDiagnostics(require('typescript')), typescript({
  tsconfig: false, typescript: require('typescript'), tslib: require.resolve('tslib'),
  compilerOptions: { target: 'ES2022', module: 'ESNext', noCheck: true },
  include: [`tools/antibot-lab/tests/${entry}.ts`, 'tools/antibot-lab/tests/probe-deadline.ts', `work/antibot-service/runtime/creepjs-${source}/src/**/*.ts`],
})] })
const output = path.join(base, `runtime/${name}.js`)
try { await bundle.write({ file: output, format }) } finally { await bundle.close() }
const sha256 = createHash('sha256').update(await readFile(output)).digest('hex')
await writeFile(path.join(base, `runtime/${name}.json`), JSON.stringify({ sha256, source,
  build: 'rollup4.30.1 plugin-typescript12.1.2 typescript5.7.3 tslib2.8.1', upstreamExceptionProbePreserved: true,
  probeDeadlineSha256: createHash('sha256').update(await readFile('tools/antibot-lab/tests/probe-deadline.ts')).digest('hex'),
  fontDiagnosticsSha256: createHash('sha256').update(await readFile('tools/antibot-lab/tests/creep-font-diagnostics.mjs')).digest('hex'),
  workerOptionsSha256: createHash('sha256').update(await readFile('tools/antibot-lab/tests/creep-worker-options.mjs')).digest('hex') }))
console.log(JSON.stringify({ output, sha256 }))
}
