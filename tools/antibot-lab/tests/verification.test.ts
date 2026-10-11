import assert from 'node:assert/strict'
import test from 'node:test'
import {DatabaseSync} from 'node:sqlite'
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {catalog} from '../check-model.js'
import {serverReport,acceptance,flowSchema,completeFlow,ownsCheck} from '../verification.ts'
import {verificationConfig} from '../verification-config.ts'
import {directory} from '../locations.mjs'
import type {IncomingMessage} from 'node:http'

const id=randomUUID(),page=randomUUID(),proof={status:'accepted',challengeAccepted:true,protectedRequestAccepted:true,allowlisted:false}
const flow={english:21,chinese:9,englishInputs:27,chineseInputs:9,composing:false,scrolled:true,submitted:true}
function fixture() {
  const db=new DatabaseSync(':memory:')
  db.exec('CREATE TABLE events(id INTEGER PRIMARY KEY,case_id TEXT,at TEXT,action TEXT,value TEXT)')
  const add=(action:string,value:unknown)=>db.prepare('INSERT INTO events(case_id,at,action,value) VALUES(?,?,?,?)').run(id,new Date().toISOString(),action,JSON.stringify(value))
  add('opened',{page})
  return {db,add}
}
const signals=catalog.filter(row=>row.group<3).map(row=>({category:row.category,detector:row.id,valid:true,outcome:'clear'}))
const receipt=(extra:object={})=>({page,batch:randomUUID(),environment:'measured',report:{signals,input:{}},...extra})

// 保护真实信任边界：客户端阴性/提交/假 proof、旧 run 均不能制造服务端真人结论。
test('server requires original accepted proof, valid measurements and the complete bilingual flow',()=>{
  const {db,add}=fixture()
  try {
    add('telemetry',receipt({flow,verification:proof}))
    assert.equal(serverReport(db,id,'interactive').verdict,'pending')
    add('verified',proof)
    assert.equal(serverReport(db,id,'interactive').verdict,'human')
    add('measurement-failed',{reason:'telemetry_rejected'})
    assert.equal(serverReport(db,id,'interactive').verdict,'unknown')
    assert.equal(serverReport(db,id,'interactive').health.transportFailed,true)
    add('telemetry',receipt({flow}))
    assert.equal(serverReport(db,id,'interactive').verdict,'unknown')
    add('telemetry',receipt({report:{signals:[{category:'input',detector:'trusted',valid:true,outcome:'detected'}],input:{}}}))
    assert.equal(serverReport(db,id,'interactive').verdict,'bot')
    add('telemetry',receipt())
    assert.equal(serverReport(db,id,'interactive').verdict,'bot')
  } finally {db.close()}
})
test('IME exclusions and auxiliary composition are retained without vetoing an actual accepted visit',()=>{
  const {db,add}=fixture()
  try {
    add('verified',proof)
    const behavior=catalog.filter(row=>row.group===3).map(row=>({category:row.category,detector:row.id,
      valid:row.id==='trusted'||row.id==='scroll-teleport',outcome:row.id==='trusted'?'observed':row.id==='scroll-teleport'?'clear':'excluded'}))
    add('telemetry',receipt({flow,report:{signals:[...signals,...behavior],input:{events:2,untrusted:1,byType:{input:{events:1,untrusted:0},compositionend:{events:1,untrusted:1}}}}}))
    const report=serverReport(db,id,'interactive')
    assert.equal(report.verdict,'human');assert.equal(report.counts.excluded,3);assert.equal(report.counts.advisory,0)
    assert.equal(report.signals.find(row=>row.id==='trusted')!.status,'clear')
    add('telemetry',receipt({report:{signals:[{category:'input-behavior',detector:'typing-cadence',valid:false,outcome:'invalid'}],input:{}}}))
    assert.equal(serverReport(db,id,'interactive').verdict,'unknown')
  } finally {db.close()}
})
test('missing language, unfinished composition and missing scroll cannot complete a flow; data is bounded',()=>{
  assert.equal(completeFlow(flow),true)
  for(const extra of [{english:0},{chinese:0},{chineseInputs:0},{composing:true},{scrolled:false},{submitted:false}])
    assert.equal(completeFlow({...flow,...extra}),false)
  assert.equal(flowSchema.safeParse({...flow,english:301}).success,false)
  assert.equal(flowSchema.safeParse({...flow,rawText:'private'}).success,false)
  assert.equal(ownsCheck({headers:{host:id+'.shield.localhost:4185'}} as IncomingMessage,id),true)
  assert.equal(ownsCheck({headers:{host:randomUUID()+'.shield.localhost:4185'}} as IncomingMessage,id),false)
})

test('completed automatic evidence does not time out while a person completes the bilingual flow',()=>{
  const {db,add}=fixture()
  try {
    db.prepare("UPDATE events SET at=? WHERE action='opened'").run(new Date(Date.now()-90_000).toISOString())
    assert.equal(serverReport(db,id,'interactive').health.timedOut,true)
    assert.notEqual(serverReport(db,id,'interactive').verdict,'human')
    add('verified',proof);add('telemetry',receipt({flow}))
    const result=serverReport(db,id,'interactive')
    assert.equal(result.verdict,'human');assert.equal(result.health.timedOut,false)
  } finally {db.close()}
})
test('audit keeps the pinned rejection unchanged and adds only the native acceptance hook after it',async()=>{
  const original=await readFile(path.join(directory,'upstream/appsec-bot-challenge-scoring-balanced.yaml'),'utf8')
  const config=verificationConfig(original)
  assert.ok(config.includes(original.trimEnd()))
  assert.ok(config.indexOf('RejectSubmission(')<config.indexOf('LogAccepted('))
  assert.ok(!/GrantChallengeCookie|ExemptFromChallenge|AddRequestScore/.test(config))
  assert.throws(()=>verificationConfig(original.replace('>= 75','>= 76')),/balanced_upstream_changed/)
})
test('acceptance cannot use other hosts, other runs, allowlisted or rejected records',async()=>{
  const base=await mkdtemp(path.join(os.tmpdir(),'shield-audit-'))
  try {
    const {mkdir}=await import('node:fs/promises');await mkdir(path.join(base,'logs'))
    const host=id+'.shield.localhost:4185',log=path.join(base,'logs/crowdsec.log')
    for(const suffix of [':score=75"',':score=0" allowlisted=true']) {
      await writeFile(log,`time="2026-10-11T01:00:00Z" allowlisted=false msg="shield-accepted:${host}/shield/verify/${id}${suffix}\n`)
      assert.equal(await acceptance(base,host,id),null)
    }
    await writeFile(log,`time="2026-10-11T01:00:00Z" allowlisted=false msg="shield-accepted:${host}/shield/verify/${id}:score=0"\n`)
    assert.equal((await acceptance(base,host,id))?.challengeAccepted,true)
    assert.equal(await acceptance(base,randomUUID()+'.shield.localhost:4185',id),null)
    assert.equal(await acceptance(base,host,randomUUID()),null)
  } finally {await rm(base,{recursive:true})}
})
