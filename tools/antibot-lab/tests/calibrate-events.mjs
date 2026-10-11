import { directory as labData } from '../locations.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import path from 'node:path'

const base=labData,out=path.join(base,'reports',`event-rules-${Date.now()}`)
await mkdir(out)
const names=process.argv.slice(2)
assert.equal(names.length,3)
assert.ok(names.every(name=>/^(input-[a-z0-9_]+|human-[a-f0-9]{32})$/.test(name)))
const json=async(folder,file)=>JSON.parse(await readFile(path.join(base,'reports',folder,file),'utf8'))
const before=await json(names[0],'result.json'),after=await json(names[1],'result.json')
const humanOwner=await json(names[2],'owner.json')
assert.equal(humanOwner.controlConnected,false)
await json(names[2],'complete.json')
const groups=[
  {name:'original-native-clear',events:before.inputEvents,expected:true},
  {name:'candidate-native-clear',events:after.inputEvents,expected:false},
  {name:'explicit-script-dispatch',events:after.scriptedEvents,expected:true},
]
for(let phase=0;phase<3;phase++) {
  const raw=await json(names[2],`phase-${phase}.json`)
  groups.push({name:`human-free-${phase}`,events:raw.audit,expected:false})
}
const {base:linuxBase}=JSON.parse(await readFile(path.join(base,'prepared.json'),'utf8'))
const cli=`${linuxBase}/runtime/crowdsec/crowdsec-v1.8.1/cmd/crowdsec-cli/cscli`
const alerts=()=>JSON.parse(execFileSync(cli,['-c',`${linuxBase}/config/config.yaml`,'alerts','list','-l','0','-o','json'],{encoding:'utf8'})||'[]')??[]
const prior=alerts()
for(const [index,group] of groups.entries()) {
  group.ip=`127.88.54.${index+2}`
  assert.ok(!prior.some(a=>a.source?.value===group.ip),'source-state-contaminated')
  assert.ok(Array.isArray(group.events)&&group.events.length)
  const lines=group.events.map(event=>{
    assert.equal(typeof event.trusted,'boolean')
    return JSON.stringify({at:new Date().toISOString(),source_ip:group.ip,valid:'true',category:'input',
      session:path.basename(out)+'/'+group.name,trusted:String(event.trusted),event_type:event.type})
  })
  await appendFile(path.join(base,'logs/observations.jsonl'),lines.join('\n')+'\n')
}
await delay(3000)
const actual=alerts(),results=groups.map(group=>({name:group.name,ip:group.ip,count:group.events.length,
  rawUntrusted:group.events.filter(e=>!e.trusted).length,expected:group.expected,
  triggered:actual.some(a=>a.source?.value===group.ip&&a.scenario==='bat-lab/scripted-input')}))
await writeFile(path.join(out,'result.json'),JSON.stringify({sources:names,results,
  scope:'native-rule replay of real owned-browser and consented-human event traces',
  rawPreserved:true,syntheticSourceMapping:true,liveInputCollectorEnforcement:false,humanClassifierValidated:false},null,2))
for(const group of results) assert.equal(group.triggered,group.expected,group.name)
console.log(JSON.stringify({out,passed:true,groups:results.length}))
