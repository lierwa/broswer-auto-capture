import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { workerOptions } from './creep-worker-options.mjs'
import { fontDiagnostics } from './creep-font-diagnostics.mjs'
import { root, directory as base } from '../locations.mjs'

const require = createRequire(path.join(base, 'runtime/creep-build/package.json'))
const { rollup } = require('rollup'), typescript = require('@rollup/plugin-typescript')
const source = '10aa6724cd33a1015db1574211890518cd04f0cc'
// 复用上游Rollup+TypeScript/noCheck构建；保留故意给const赋值的异常探针，不能改源码消掉判据。
const entries = process.argv.includes('--devices') ? [['creep-device-client', 'creep-device-client', 'esm']] : process.argv.includes('--workers') ? [['creep-worker-client', 'creep-worker-client', 'esm'],
  ['creep-worker-source', 'creep-worker-source', 'iife']] : [['creep-entry', 'creep-probe', 'esm']]
for (const [entry, name, format] of entries) {
const config = path.join(base, 'runtime/creep-build/owned-tsconfig.json')
// WHY：官方插件从tsconfig目录枚举初始文件；cwd在另一盘时不能依赖其空默认program。
await writeFile(config, JSON.stringify({ files: [path.join(root, `tests/${entry}.ts`), path.join(root, 'tests/probe-deadline.ts')],
  include: [`../creepjs-${source}/src/**/*.ts`] }))
const bundle = await rollup({ input: path.join(root, `tests/${entry}.ts`), plugins: [{
  name: 'pinned-creep-location',
  resolveId(id) {
    if (!/^@creep\/[a-zA-Z0-9_/-]+$/.test(id)) return null
    return path.join(base, `runtime/creepjs-${source}/src`, id.slice('@creep/'.length) + '.ts')
  },
}, workerOptions(require('typescript')), fontDiagnostics(require('typescript')), typescript({
  tsconfig: config, typescript: require('typescript'), tslib: require.resolve('tslib'),
  compilerOptions: { target: 'ES2022', module: 'ESNext', noCheck: true },
  include: [path.join(root, `tests/${entry}.ts`), path.join(root, 'tests/probe-deadline.ts'), path.join(base, `runtime/creepjs-${source}/src/**/*.ts`)].map(value => value.replaceAll('\\', '/')),
})] })
const output = path.join(base, `runtime/${name}.js`)
try { await bundle.write({ file: output, format }) } finally { await bundle.close() }
const sha256 = createHash('sha256').update(await readFile(output)).digest('hex')
await writeFile(path.join(base, `runtime/${name}.json`), JSON.stringify({ sha256, source,
  build: 'rollup4.30.1 plugin-typescript12.1.2 typescript5.7.3 tslib2.8.1', upstreamExceptionProbePreserved: true,
  probeDeadlineSha256: createHash('sha256').update(await readFile(path.join(root, 'tests/probe-deadline.ts'))).digest('hex'),
  fontDiagnosticsSha256: createHash('sha256').update(await readFile(path.join(root, 'tests/creep-font-diagnostics.mjs'))).digest('hex'),
  workerOptionsSha256: createHash('sha256').update(await readFile(path.join(root, 'tests/creep-worker-options.mjs'))).digest('hex') }))
console.log(JSON.stringify({ output, sha256 }))
}
