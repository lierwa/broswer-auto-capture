import {open} from 'node:fs/promises'
import type {IncomingMessage,ServerResponse} from 'node:http'
import type {DatabaseSync} from 'node:sqlite'
import {z} from 'zod'
import {createMeasurement,acceptReceipt,measurementReport} from './check-model.js'

export const flowSchema = z.object({english:z.number().int().min(0).max(300),chinese:z.number().int().min(0).max(300),
  englishInputs:z.number().int().min(0).max(1_000_000),chineseInputs:z.number().int().min(0).max(1_000_000),
  composing:z.boolean(),scrolled:z.boolean(),submitted:z.boolean()}).strict()
export function completeFlow(flow: z.infer<typeof flowSchema> | undefined) {
  return !!flow && flow.submitted && !flow.composing && flow.english >= 10 && flow.chinese >= 4
    && flow.englishInputs > 0 && flow.chineseInputs > 0 && flow.scrolled
}
export function ownsCheck(req: IncomingMessage,id: string) {
  return z.uuid().safeParse(id).success && req.headers.host === `${id}.shield.localhost:4185`
}
export function serverReport(db: DatabaseSync,id: string,mode: 'automatic'|'interactive') {
  const opened = db.prepare("SELECT value FROM events WHERE case_id=? AND action='opened' ORDER BY id LIMIT 1").get(id) as {value:string}|undefined
  if (!opened) throw Error('check_not_found')
  const state = {...createMeasurement(),runId:id,pageId:JSON.parse(opened.value).page,mode}
  const timeout={status:'failed',reason:'challenge_timeout'}
  const rows = db.prepare("SELECT action,value FROM events WHERE case_id=? AND action IN ('telemetry','verified','verification-timeout','measurement-failed') ORDER BY id").all(id) as {action:string;value:string}[]
  for (const row of rows) {
    const value = JSON.parse(row.value)
    if (row.action === 'telemetry') {
      acceptReceipt(state,value)
      if (completeFlow(value.flow)) {state.flow=value.flow;state.behaviorPhase='done'}
    } else if (row.action === 'measurement-failed') state.failed=true
    else if (row.action === 'verified') state.verification=value
    else if (state.verification.status !== 'accepted') state.verification=timeout
  }
  const started=db.prepare("SELECT at FROM events WHERE case_id=? AND action='opened' ORDER BY id LIMIT 1").get(id) as {at:string}
  const age=Date.now()-Date.parse(started.at)
  // WHY：25 秒只约束尚缺回执的自动测量，不能把真人随后输入的时间记成测量超时。
  if (age > 25_000 && measurementReport(state).signals.some(row=>row.group<3 && row.status==='pending')) state.timedOut=true
  if (age > 60_000 && state.verification.status !== 'accepted') state.verification=timeout
  return measurementReport(state)
}
export async function acceptance(base: string,host: string,id: string) {
  // WHY：读本次原生接受审计，不用统计次数、客户端状态或上一轮 Cookie 代替验证。
  const file = await open(`${base}/logs/crowdsec.log`,'r')
  try {
    const {size} = await file.stat(),start=Math.max(0,size-1_000_000),buffer=Buffer.alloc(size-start)
    await file.read(buffer,0,buffer.length,start)
    const tag=`msg="shield-accepted:${host}/shield/verify/${id}:score=`
    const row=buffer.toString('utf8').split('\n').reverse().find(line => line.includes(tag)
      && /\ballowlisted=false\b/.test(line) && !/\ballowlisted=true\b/.test(line))
    if (!row) return null
    const score=Number(/:score=(\d+)"/.exec(row)?.[1]),at=/time="([^"\r\n]+)"/.exec(row)?.[1]
    if (!at || !Number.isInteger(score) || score >= 75) return null
    return {status:'accepted',engine:'CrowdSec',version:'1.8.1',policy:'balanced',threshold:75,score,acceptedAt:at,
      challengeAccepted:true,protectedRequestAccepted:true,allowlisted:false}
  } finally {await file.close()}
}
export async function verificationRoute(base: string,req: IncomingMessage,res: ServerResponse,id: string,
  secret: string,record: (id:string,action:string,value:unknown)=>void) {
  if (req.method !== 'GET' || !ownsCheck(req,id) || req.headers['x-bat-lab-verification'] !== secret) {
    res.writeHead(403,{'cache-control':'no-store'});res.end();return
  }
  const proof=await acceptance(base,req.headers.host!,id)
  if (!proof) {res.writeHead(409,{'cache-control':'no-store'});res.end('verification_receipt_missing');return}
  record(id,'verified',proof)
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'})
  res.end(`<!doctype html><meta charset="utf-8"><script>parent.postMessage({type:'shield:verified',runId:'${id}'},location.origin)</script>`)
}
