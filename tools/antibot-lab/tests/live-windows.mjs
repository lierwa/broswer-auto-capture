import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import path from 'node:path'

const base = path.join(process.cwd(), 'work/antibot-service'), run = `windows-${Date.now()}`
const out = path.join(base, 'reports', run)
await mkdir(out)
const { base: linuxBase } = JSON.parse(await readFile(path.join(base, 'prepared.json'), 'utf8'))
const cli = `${linuxBase}/runtime/crowdsec/crowdsec-v1.8.1/cmd/crowdsec-cli/cscli`
const invocation = () => execFileSync('systemctl', ['--user','show','bat-antibot-engine.service','--property=InvocationID','--value'], {encoding:'utf8'}).trim()
const engine = invocation(), startedAt = new Date().toISOString(), controller = new AbortController()
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => controller.abort())
const groups = [
  { name:'hour-abnormal', ip:'127.88.40.2', count:65, interval:2000, expected:['bat-lab/hour-budget'] },
  { name:'hour-normal', ip:'127.88.40.3', count:65, interval:65000, expected:[] },
  { name:'day-abnormal', ip:'127.88.40.4', count:300, interval:61000, expected:['bat-lab/day-budget'] },
  { name:'day-normal', ip:'127.88.40.5', count:245, interval:370000, expected:[] },
]
const allAlerts = () => JSON.parse(execFileSync(cli, ['-c', `${linuxBase}/config/config.yaml`, 'alerts','list','-l','0','-o','json'], {encoding:'utf8'}) || '[]') ?? []
const prior = allAlerts()
for (const group of groups) assert.ok(!prior.some(a=>a.source?.value===group.ip), 'source-state-contaminated')
function request(port, method, pathname, ip, headers, content='') {
  return new Promise((resolve,reject) => {
    const req = http.request({host:'127.0.0.1',port,method,path:pathname,localAddress:ip,
      headers:{...headers,...(content?{'Content-Length':Buffer.byteLength(content)}:{})}},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk});res.on('end',()=>resolve({status:res.statusCode,body}))
    })
    req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('timeout')));req.end(content)
  })
}
await writeFile(path.join(out,'owner.json'),JSON.stringify({run,pid:process.pid,base,engine,startedAt,groups,
  purpose:'real-clock-native-CrowdSec-window-validation',modelCalls:0,browserCreated:false,whitelist:false}))
console.log(JSON.stringify({started:true,evidence:out,engine,expectedMaxMs:244*370000}))
async function execute(group) {
  const receipt={...group,startedAt:new Date().toISOString(),attempts:[],status:'running',engine}
  const save=()=>writeFile(path.join(out,group.name+'.json'),JSON.stringify(receipt,null,2))
  try {
    const created=await request(4188,'POST','/api/cases',group.ip,{Host:'127.0.0.1:4188',Origin:'http://127.0.0.1:4188','Content-Type':'application/json'},'{"kind":"catalog"}')
    assert.equal(created.status,201);const {id}=JSON.parse(created.body);receipt.caseId=id
    const host=`${id}.localhost:4184`
    for(let i=0;i<group.count;i++) {
      controller.signal.throwIfAborted();assert.equal(invocation(),engine,'engine-restarted-active-window-invalid')
      const at=new Date().toISOString(),response=await request(4184,'GET',`/case/${id}`,group.ip,{Host:host,'User-Agent':'Owned window calibration'})
      receipt.attempts.push({at,status:response.status});await save();assert.equal(response.status,200,'unexpected-gateway-denial')
      if(i<group.count-1) await delay(group.interval,undefined,{signal:controller.signal})
    }
    await delay(3000,undefined,{signal:controller.signal})
    receipt.alerts=allAlerts().filter(a=>a.source?.value===group.ip)
    const scenarios=[...new Set(receipt.alerts.map(a=>a.scenario))]
    assert.deepEqual(scenarios.sort(),group.expected.sort(),'real-window-verdict-mismatch')
    receipt.status='passed'
  } catch(error) {receipt.status=controller.signal.aborted?'cancelled':'failed';receipt.error=error.message}
  finally {receipt.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({group:group.name,status:receipt.status,error:receipt.error}))}
  return {name:group.name,status:receipt.status}
}
const results=await Promise.all(groups.map(execute))
await writeFile(path.join(out,'finished.json'),JSON.stringify({startedAt,finishedAt:new Date().toISOString(),results,resources:'no-browser; process-exiting'}))
if(results.some(r=>r.status!=='passed')) process.exitCode=1
