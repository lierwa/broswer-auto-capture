import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { CONTRACT_VERSION, type TaskExecution } from '@browser-capture/contracts'
import { ProductStore } from '../src/database/store.js'
import { TaskContractRepository } from '../src/task-chain/repository.js'
import { browserResourceRecords, recoverExecutionResources } from '../src/task-chain/resource-recovery.js'
import { executionResourcePredicate } from '../src/database/execution-resource-index.js'

async function fixture() {
  const base=path.resolve('work'), directory=await mkdtemp(path.join(base,'bat-resource-query-'))
  const store=await ProductStore.open(directory),repository=new TaskContractRepository(store)
  const taskId=store.taskAction({type:'create',requestId:randomUUID()}), now=new Date().toISOString(), digest='a'.repeat(64)
  function create(status: TaskExecution['status']='completed', handoff?: TaskExecution['browserHandoff'], cleanup?: TaskExecution['cleanup']) {
    const id=randomUUID()
    repository.saveExecution({contractVersion:CONTRACT_VERSION,kind:'execution',id,taskId,
      authorizationId:randomUUID(),plan:{id:randomUUID(),version:1,digest},
      requirement:{id:randomUUID(),version:1,revision:1,digest},input:null,inputDigest:digest,
      browser:{mode:'daily',headless:false},status,sequence:0,currentStepId:null,currentRunId:null,
      steps:[],output:null,reason:'test',createdAt:now,updatedAt:now,
      ...(handoff?{browserHandoff:handoff}:{}),...(cleanup?{cleanup}: {})})
    return repository.execution(taskId,id)
  }
  const raw=new Database(path.join(directory,'workbench.sqlite'))
  return {store,repository,taskId,now,create,raw,async close(){raw.close();await store.close();assert.equal(path.dirname(directory),base);await rm(directory,{recursive:true})}}
}

// WHY：巡检只需要资源事实；已结束的大业务输出不能进入同步主线程读取。
test('已结束历史不进入资源候选，候选投影不携带业务正文',async()=>{
 const f=await fixture()
 try {
  f.create();assert.deepEqual(browserResourceRecords(f.store,'daily'),[])
  const pending=f.create('cleanup_required',undefined,{status:'pending',attempt:1,code:null,evidenceDigest:null,updatedAt:f.now})
  const records=browserResourceRecords(f.store,'daily')
  assert.equal(records.length,1);assert.equal(records[0]!.id,pending.id)
  assert.equal('output' in records[0]!,false);assert.equal('steps' in records[0]!,false)
  assert.deepEqual(browserResourceRecords(f.store,'dedicated'),[])
  const plan=f.raw.prepare(`EXPLAIN QUERY PLAN SELECT id FROM taskExecutions WHERE ${executionResourcePredicate}`).all()
  assert.match(JSON.stringify(plan),/task_execution_browser_resources/)
 }finally{await f.close()}
})

// WHY：inspect的持久化结果可能已不在候选索引中；只能按本次owner记录继续收尾。
test('inspect已结束后不再end；仍活跃的失败执行按最新序列end',async()=>{
 const f=await fixture()
 try {
  const owner=randomUUID(), handoff:TaskExecution['browserHandoff']={status:'active',purpose:'delivery',leaseId:owner,
   ownerId:owner,targetDigest:'b'.repeat(64),reason:null,updatedAt:f.now}
  const closed=f.create('failed',handoff), remaining=f.create('failed',handoff), actions:string[]=[], endSequences:number[]=[]
  await recoverExecutionResources(f.store,'daily',randomUUID(),async()=>{throw Error('unexpected cleanup')},async(_task,c)=>{
   actions.push(`${c.executionId}:${c.action}`)
   if(c.action==='inspect') {
    const record=f.repository.execution(f.taskId,c.executionId)
    f.repository.saveExecution({...record,sequence:1,browserHandoff:{...record.browserHandoff,
     status:c.executionId===closed.id?'ended':'active'}})
   }else endSequences.push(c.expectedSequence)
  })
  assert.deepEqual(actions.filter(x=>x.startsWith(closed.id)),[`${closed.id}:inspect`])
  assert.deepEqual(actions.filter(x=>x.startsWith(remaining.id)),[`${remaining.id}:inspect`,`${remaining.id}:end`])
  assert.deepEqual(endSequences,[1])
 }finally{await f.close()}
})

// WHY：资源索引是body的派生事实；事务回滚和外部写入必须即时一致。
test('候选跟随body写入与回滚，清理仍使用原命令和expectedSequence',async()=>{
 const f=await fixture()
 try {
  const record=f.create(),body={...record,status:'cleanup_required',cleanup:{status:'pending',attempt:1,code:null,evidenceDigest:null,updatedAt:f.now}}
  const change=()=>f.raw.prepare('UPDATE taskExecutions SET body=? WHERE id=?').run(JSON.stringify(body),record.id)
  assert.throws(()=>f.store.db.transaction(tx=>{
   tx.run(sql`UPDATE taskExecutions SET body=${JSON.stringify(body)} WHERE id=${record.id}`)
   assert.equal(browserResourceRecords(f.store).length,1);throw Error('rollback')
  }),/rollback/)
  assert.deepEqual(browserResourceRecords(f.store),[])
  change();const commands:unknown[]=[]
  await recoverExecutionResources(f.store,'daily',randomUUID(),async(_id,c)=>{commands.push(c)},async()=>{throw Error('unexpected handoff')})
  assert.equal(commands.length,1);assert.deepEqual((commands[0] as any).executionId,record.id)
  assert.equal((commands[0] as any).type,'cleanup_execution');assert.equal((commands[0] as any).expectedSequence,0)
  commands.length=0
  await recoverExecutionResources(f.store,'daily',randomUUID(),async(_id,c)=>{commands.push(c)},async()=>{},()=>true)
  assert.equal(commands.length,0)
 }finally{await f.close()}
})
