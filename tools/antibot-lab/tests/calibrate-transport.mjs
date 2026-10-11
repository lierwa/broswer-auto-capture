import { directory as labData } from '../locations.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import path from 'node:path'

// Replay actual first-hop observations into the native rule; no JA4 implementation or score engine here.
const base = labData, sample = path.resolve(process.argv[2])
assert.ok(sample.startsWith(base + '/reports/'), 'owned-capture-required')
const out = path.join(base, 'reports', `transport-rule-${Date.now()}`)
await mkdir(out)
const source = await readFile(path.join(sample, 'transport.json'), 'utf8')
assert.ok(JSON.parse(source).candidate.cookieContinuous)
function fields(filter, names) {
  return execFileSync('tshark', ['-r', path.join(sample, 'network.pcapng'), '-o',
    `tls.keylog_file:${path.join(sample, 'sslkeys.log')}`, '-Y', filter, '-T', 'fields',
    ...names.flatMap(name=>['-e',name])], {encoding:'utf8',stdio:['ignore','pipe','pipe']})
    .trim().split('\n').filter(Boolean).map(line=>line.split('\t'))
}
const hellos = fields('tls.handshake.type == 1', ['tcp.stream','tls.handshake.ja4'])
assert.ok(hellos.length >= 4 && hellos.every(row=>/^t\w+_\w+_\w+$/.test(row[1])))
const fingerprints = new Map(hellos)
const references = fields('http.request.method && http.request.uri contains "sample=reference"', ['tcp.stream','http.request.uri'])
const candidates = fields('http2.headers.path contains "sample=candidate"', ['tcp.stream','http2.headers.path'])
assert.equal(references.length,3);assert.equal(candidates.length,3)
const native = candidates.map(([stream])=>fingerprints.get(stream))
const mixed = references.map(([stream])=>fingerprints.get(stream))
assert.ok([...native,...mixed].every(Boolean))
const family = fp=>fp.split('_').slice(0,2).join('_')
assert.equal(new Set(native.map(family)).size,1)
assert.ok(mixed.every(fp=>family(fp)!==family(native[0])))
const {base:linuxBase} = JSON.parse(await readFile(path.join(base,'prepared.json'),'utf8'))
const cli = `${linuxBase}/runtime/crowdsec/crowdsec-v1.8.1/cmd/crowdsec-cli/cscli`
const alerts = ()=>JSON.parse(execFileSync(cli,['-c',`${linuxBase}/config/config.yaml`,'alerts','list','-l','0','-o','json'],{encoding:'utf8'})||'[]')??[]
const groups = [
  {name:'reference-mixed',ip:'127.88.50.2',values:[native[0],...mixed],expected:true},
  {name:'candidate-native',ip:'127.88.50.3',values:[native[0],...native],expected:false},
  // Native Chrome extension hash varies normally; its cipher/ALPN family remains the same.
  {name:'native-normal-variation',ip:'127.88.50.4',values:hellos.map(row=>row[1]).filter(fp=>family(fp)===family(native[0])),expected:false},
]
assert.ok(groups[2].values.length >= 2)
const prior=alerts();assert.ok(groups.every(g=>!prior.some(a=>a.source?.value===g.ip)),'source-state-contaminated')
for(const group of groups) {
  for(const fp of group.values) await appendFile(path.join(base,'logs/observations.jsonl'),JSON.stringify({
    at:new Date().toISOString(),source_ip:group.ip,session:path.basename(out)+'/'+group.name,site:'owned-transport',
    valid:'true',category:'transport',ua:'same-observed-browser-UA',tls_family:family(fp),
  })+'\n')
}
await delay(3000)
const observed=alerts()
const results=groups.map(g=>({...g,values:undefined,count:g.values.length,
  actual:observed.some(a=>a.source?.value===g.ip&&a.scenario==='bat-lab/protocol-continuity')}))
await writeFile(path.join(out,'result.json'),JSON.stringify({source:sample,scope:'replay-of-real-first-hop-capture',
  nativeRequests:candidates.length,referenceRequests:references.length,results,
  syntheticSourceMapping:true,humanIdentityProven:false,liveContinuousCapture:false},null,2))
for(const result of results) assert.equal(result.actual,result.expected,result.name)
console.log(JSON.stringify({out,passed:true,groups:results.length}))
