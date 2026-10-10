import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// WHY：上游检测算法原样保留；在线业务不能注册/注销其SW，故只扩可选加载地址/类型。
export function workerOptions(typescript) {
  return { name: 'owned-creep-worker-options', load(id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/worker/index.ts')) return null
    const source = readFileSync(id, 'utf8')
    if (createHash('sha256').update(source).digest('hex') !== '0599255c8661c1c6fcbe3cf2f069a8c32a03fc21a788be9fcbb9c3e3fd641d61') {
      throw Error('creep_worker_source_changed')
    }
    let code = source.replace('getBestWorkerScope()', "getBestWorkerScope({ scriptSource = './creep.js', dedicatedOnly = false } = {})")
      .replace("\t\tconst scriptSource = './creep.js'", '')
      .replace('await getServiceWorker({ scriptSource }).catch', 'await (dedicatedOnly ? Promise.resolve(null) : getServiceWorker({ scriptSource })).catch')
      .replace('if (!(workerScope || {}).userAgent)', 'if (!dedicatedOnly && !(workerScope || {}).userAgent)')
    const comparisonStart = code.indexOf('\t\tconst workerScopeMatchLie = ')
    const comparisonEnd = code.indexOf('\t\t// prototype lies', comparisonStart)
    const comparison = code.slice(comparisonStart, comparisonEnd)
    if (comparisonStart < 0 || comparisonEnd <= comparisonStart || comparison.split('documentLie(').length !== 5) {
      throw Error('creep_worker_comparison_source_changed')
    }
    // 原四判据不变；只旁收本次同步比较的原事件，不能把模块累计告警当新样本，也不删除旧证据。
    code = code.slice(0, comparisonStart) + `\t\tconst comparisonLies = []
\t\tconst recordComparison = (name, reason) => { documentLie(name, reason); comparisonLies.push(name) }
` + comparison.replaceAll('documentLie(', 'recordComparison(')
      + '\t\tworkerScope.comparisonLies = comparisonLies\n\n' + code.slice(comparisonEnd)
    const start = code.indexOf('\t\tconst getDedicatedWorker = '), end = code.indexOf('\t\tconst getSharedWorker = ', start)
    if (start < 0 || end <= start) throw Error('creep_worker_lifecycle_missing')
    code = code.slice(0, start) + `		const getDedicatedWorker = ({ scriptSource }) => new Promise((resolve) => {
			const dedicatedWorker = ask(() => new Worker(scriptSource))
			if (!hasConstructor(dedicatedWorker, 'Worker')) return resolve(null)
			const finish = (data) => { clearTimeout(timer); dedicatedWorker.terminate(); resolve(data) }
			const timer = setTimeout(() => finish(null), 3000)
			dedicatedWorker.onmessage = (event) => finish(event.data)
			dedicatedWorker.onerror = () => finish(null)
			dedicatedWorker.onmessageerror = () => finish(null)
		})
` + code.slice(end)
    return { code: typescript.transpileModule(code, { compilerOptions: {
      target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext,
    } }).outputText, map: null }
  } }
}
