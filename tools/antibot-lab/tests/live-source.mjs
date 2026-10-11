import { directory as labData } from '../locations.mjs'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import path from 'node:path'

const base=labData,out=path.join(base,'reports',`source-${Date.now()}`)
await mkdir(out)
const ip='127.88.52.2',forged='192.0.2.55'
function request(port,method,url,headers={},body='') {
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path:url,method,localAddress:ip,
      headers:{...headers,...(body?{'Content-Length':Buffer.byteLength(body)}:{})}},res=>{
      let value='';res.setEncoding('utf8');res.on('data',chunk=>value+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:value}))
    });req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('timeout')));req.end(body)
  })
}
const created=await request(4188,'POST','/api/cases',{Origin:'http://127.0.0.1:4188','Content-Type':'application/json'},'{"kind":"catalog"}')
assert.equal(created.status,201)
const {id}=JSON.parse(created.body),host=`${id}.localhost:4184`,pathname=`/case/${id}/auth-probe`
const attempts=[]
for(const extra of [{},{'X-Forwarded-For':forged,'X-Real-IP':forged,Forwarded:`for=${forged};proto=https`,'CF-Connecting-IP':forged}]) {
  const response=await request(4184,'POST',pathname,{Host:host,Origin:`http://${host}`,'Content-Type':'application/json',...extra},
    JSON.stringify({account:'synthetic-source',device:'synthetic-normal',proof:'pass'}))
  attempts.push({spoofed:Object.keys(extra).length>0,status:response.status})
  assert.equal(response.status,200)
}
await delay(300)
const lines=async file=>(await readFile(path.join(base,'logs',file),'utf8')).trim().split('\n').map(JSON.parse)
const source=(await lines('observations.jsonl')).filter(row=>row.site===id)
const gateway=(await lines('access.jsonl')).filter(row=>row.RequestPath===pathname)
await writeFile(path.join(out,'result.json'),JSON.stringify({caseId:id,attempts,source:source.map(r=>({ip:r.source_ip,outcome:r.outcome})),
  gateway:gateway.map(r=>({ip:r.ClientHost,status:r.DownstreamStatus})),scope:'real loopback source; untrusted forwarding header rejection',
  globalReputationProven:false,browserCreated:false},null,2))
assert.equal(source.length,2);assert.equal(gateway.length,2)
assert.ok(source.every(r=>r.source_ip===ip));assert.ok(gateway.every(r=>r.ClientHost===ip))
console.log(JSON.stringify({out,passed:true,attempts:attempts.length}))
