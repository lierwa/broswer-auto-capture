import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {mkdtemp,readFile,writeFile,realpath} from 'node:fs/promises';
import https from 'node:https';import path from 'node:path';import {directory} from '../locations.mjs';import {catalog} from '../check-model.js';
if(process.env.BAT_RUN_OWNED_CHECK!=='1')throw Error('owned_website_gate_required');
const out=await mkdtemp(path.join(directory,'reports/verified-http-')),ca=await readFile(path.join(directory,'tls/rootCA.pem'));
async function request(host,route,{method='GET',body,headers={}}={}){
 if(!/^localhost$|^[a-f0-9-]{36}\.shield\.localhost$/.test(host))throw Error('owned_local_host_required');
 return new Promise((resolve,reject)=>{
  const req=https.request({hostname:host,port:4185,path:route,method,ca,
   lookup:(_,options,callback)=>callback(null,options.all?[{address:'127.0.0.1',family:4}]:'127.0.0.1',4),
   headers:{...headers,...body?{'content-length':Buffer.byteLength(body)}:{}}},res=>{
    let value='';res.setEncoding('utf8');res.on('data',part=>value+=part);res.on('end',()=>{let parsed;try{parsed=JSON.parse(value)}catch{parsed=null}resolve({status:res.statusCode,body:parsed})});
   });req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('request_timeout')));req.end(body);
 });
}
const results=[];
const create=async()=>{const r=await request('localhost','/measurement/check/session',{method:'POST',headers:{origin:'https://localhost:4185'}});assert.equal(r.status,201);assert.ok(r.body?.page);return r.body};
const report=async s=>(await request(s.id+'.shield.localhost','/measurement/check/report/'+s.id+'?mode=interactive')).body;
const send=async(s,value,host=s.id+'.shield.localhost')=>request(host,'/measurement/check/telemetry/'+s.id,{method:'POST',headers:{origin:'https://'+host+':4185','content-type':'application/json'},body:JSON.stringify(value)});
const packet=(s,extra={})=>({version:1,page:s.page,batch:randomUUID(),events:[],dropped:0,...extra});
try {
 for(const type of ['input','change','click','keydown','keyup']){
  const s=await create();assert.equal((await send(s,packet(s,{events:[{type,trusted:false,hidden:false}]}))).status,202);
  assert.equal((await report(s)).verdict,'bot');await send(s,packet(s,{events:[{type,trusted:true,hidden:false}]}));
  const retained=await report(s);assert.equal(retained.verdict,'bot');assert.ok(retained.evidence.includes('input:trusted'));
  results.push({case:'script-'+type,passed:true,runId:s.id,verdict:retained.verdict,positiveRetained:true});
 }
 const s=await create(),flow={english:22,chinese:8,englishInputs:28,chineseInputs:9,composing:false,scrolled:true,submitted:true};
 const environment={version:'2.0.0',status:'measured',signals:catalog.filter(r=>r.group===0).map(r=>({name:r.id,detected:false})),unavailable:[]};
 const fake=await send(s,packet(s,{flow,environment,verification:{status:'accepted',challengeAccepted:true,protectedRequestAccepted:true,allowlisted:false}}));
 assert.equal(fake.status,400);assert.notEqual((await report(s)).verdict,'human');results.push({case:'client-forged-verification',passed:true,status:400});
 const other=await create();assert.equal((await request(other.id+'.shield.localhost','/measurement/check/report/'+s.id)).status,403);
 assert.equal((await send(s,packet(s),other.id+'.shield.localhost')).status,403);results.push({case:'cross-session-read-and-write',passed:true,get:403,post:403});
 assert.equal((await send(s,packet(s,{flow,dropped:1}))).status,202);const lost=await report(s);assert.notEqual(lost.verdict,'human');assert.equal(lost.health.dropped,1);
 results.push({case:'dropped-data-retained',passed:true,verdict:lost.verdict,dropped:1});
 const cancelled=await create();assert.equal((await send(cancelled,packet(cancelled,{flow:{...flow,composing:true}}))).status,202);
 const pending=await report(cancelled);assert.equal(pending.flow,null);assert.notEqual(pending.verdict,'human');results.push({case:'unfinished-composition-cannot-complete-flow',passed:true});
 const corrupt=await create();assert.equal((await send(corrupt,packet(corrupt,{flow,behavior:{keys:[100,99],scroll:{count:1,maxDelta:10,wheelCount:1,scrollKey:false,maxTouchPoints:0}}}))).status,202);
 const invalid=await report(corrupt);assert.notEqual(invalid.verdict,'human');assert.ok(invalid.counts.failed>0);results.push({case:'backwards-clock-remains-invalid',passed:true});
 const raw=await create();await request(raw.id+'.shield.localhost','/shield/verify/'+raw.id,{headers:{'X-Bat-Lab-Verification':'forged','X-Bat-Lab-Origin':'forged'}});
 assert.equal((await report(raw)).verification.status,'pending');results.push({case:'client-gateway-header-does-not-grant-proof',passed:true});
 const visit=await create(),host=visit.id+'.shield.localhost';
 const start=()=>request(host,'/measurement/check/session',{method:'POST',headers:{origin:'https://'+host+':4185'}});
 const first=await start(),second=await start();assert.equal(first.body.id,visit.id);assert.equal(first.body.verification,'/shield/verify/'+visit.id);
 assert.notEqual(second.body.id,visit.id);assert.ok(second.body.url.includes('.shield.localhost:4185/measurement/check'));
 results.push({case:'revisit-cannot-reuse-old-run',passed:true,originalRunId:visit.id,newRunId:second.body.id});
 const prior=process.argv.find(arg=>arg.startsWith('--verified-run='))?.slice(15);
 if(prior){
  const own=await realpath(prior);assert.equal(path.dirname(own),await realpath(path.join(directory,'reports')));assert.ok(path.basename(own).startsWith('verified-ime-'));
  const accepted=JSON.parse(await readFile(path.join(own,'committed.json'),'utf8'));const run={id:accepted.runId,page:accepted.pageId};
  assert.equal((await report(run)).verdict,'human');assert.equal((await send(run,packet(run,{verification:{status:'accepted'}}))).status,400);
  const failed=await report(run);assert.equal(failed.verdict,'unknown');assert.equal(failed.health.transportFailed,true);
  await send(run,packet(run));assert.equal((await report(run)).verdict,'unknown');results.push({case:'failure-after-real-acceptance-remains-latched',passed:true,runId:run.id,before:'human',after:'unknown'});
 }
 await writeFile(path.join(out,'result.json'),JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify({passed:true,cases:results.length,evidence:out}));
} catch(error){await writeFile(path.join(out,'failure.json'),JSON.stringify({reason:error.message,completed:results},null,2));throw error}
