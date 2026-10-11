import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptReceipt, catalog, createMeasurement, measurementReport } from '../check-model.js'

function state() { return { ...createMeasurement(), pageId:'owned-page', runId:'owned-run' } }
function receipt(signals: object[], batch = 'first') {
  return {page:'owned-page',batch,environment:'measured',report:{signals,input:{events:0,untrusted:0,hidden:0,dropped:0}}}
}
const automatic = catalog.filter(row => row.group < 3).map(row => ({category:row.category,detector:row.id,valid:true,outcome:'clear'}))

// 保证真实回执、页面归属、缺失与阳性锁存；不是复刻检测器的判据测试。
const proof = {status:'accepted',challengeAccepted:true,protectedRequestAccepted:true,allowlisted:false}
test('negative automatic receipts require a real verification before Human; absent and unknown outcomes stay unknown', () => {
  const current = state()
  assert.equal(measurementReport(current).verdict,'pending')
  assert.equal(acceptReceipt(current,{...receipt(automatic),page:'foreign-page'}),false)
  assert.equal(measurementReport(current).counts.clear,0)
  acceptReceipt(current,receipt(automatic))
  assert.equal(measurementReport(current).verdict,'pending')
  current.verification=proof
  assert.equal(measurementReport(current).verdict,'human')
  assert.equal(measurementReport(current).signals.length,39)
  const other = state()
  acceptReceipt(other,receipt(automatic.slice(0,-1)))
  assert.equal(measurementReport(other).verdict,'pending')
  other.timedOut = true
  assert.equal(measurementReport(other).verdict,'unknown')
  const unknown = state()
  acceptReceipt(unknown,receipt([...automatic.slice(1),{category:'browser-marker',detector:'detectAppVersion',valid:true,outcome:'new-unknown-outcome'}]))
  assert.equal(measurementReport(unknown).verdict,'unknown')
})
test('valid positive evidence survives partial health, negative receipts and mode changes; duplicate batches do not count twice', () => {
  const current = state()
  const positive = receipt([{category:'browser-marker',detector:'detectWebDriver',valid:true,outcome:'detected'}])
  positive.environment = 'partial'
  positive.report.input.events = 3
  acceptReceipt(current,positive)
  assert.equal(measurementReport(current).verdict,'bot')
  assert.equal(acceptReceipt(current,positive),false)
  assert.equal(current.input.events,3)
  acceptReceipt(current,receipt(automatic,'second'))
  current.mode = 'interactive';current.failed = true
  const result = measurementReport(current)
  assert.equal(result.verdict,'bot')
  assert.equal(result.phase,'failed')
  assert.deepEqual(result.evidence,['browser-marker:detectWebDriver'])
})
test('behavior concerns cannot authenticate Human or independently declare Bot; exclusions and losses stay explicit', () => {
  const current = state()
  current.mode = 'interactive'
  acceptReceipt(current,receipt(automatic))
  current.verification=proof
  assert.equal(measurementReport(current).phase,'waiting_interaction')
  current.behaviorPhase = 'done'
  current.flow={submitted:true}
  const behavior = catalog.filter(row => row.group === 3).map(row => ({category:row.category,detector:row.id,valid:true,outcome:'clear'}))
  acceptReceipt(current,receipt(behavior,'behavior'))
  assert.equal(measurementReport(current).verdict,'human')
  acceptReceipt(current,receipt([{category:'input-behavior',detector:'typing-cadence',valid:false,outcome:'excluded'}],'excluded'))
  assert.equal(measurementReport(current).verdict,'human')
  acceptReceipt(current,receipt([{category:'input-behavior',detector:'typing-cadence',valid:true,outcome:'detected'}],'weak'))
  assert.equal(measurementReport(current).verdict,'human')
  current.input.dropped = 2;current.mode = 'automatic'
  assert.equal(measurementReport(current).verdict,'unknown')
  assert.equal(measurementReport(current).health.dropped,2)
})

test('numeric timing evidence survives report projection; foreign or duplicate batches cannot replace it or authenticate Human',()=>{
  const current=state(),timing=[{field:0,keyCount:1,starts:[100],intervals:[],dwellTimes:[70],pending:0,invalid:false,excluded:false}]
  const measured={...receipt(automatic,'timing'),report:{signals:automatic,input:{},timing}}
  assert.equal(acceptReceipt(current,measured),true)
  assert.deepEqual(measurementReport(current).timing,timing)
  assert.notEqual(measurementReport(current).verdict,'human')
  for(const r of [{...measured,page:'foreign'}, {...measured,report:{...measured.report,timing:[]}}])
    assert.equal(acceptReceipt(current,r),false)
  assert.deepEqual(measurementReport(current).timing,timing)
})
