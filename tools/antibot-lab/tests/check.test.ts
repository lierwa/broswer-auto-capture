import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { checkReceipt, checkRoute } from '../check.ts'

// 保护公开报告边界：只返回原检测结果，不能泄露IP/指纹/会话，缺失不能变成阴性。
test('visitor projection preserves adverse/unavailable signals and strips raw observation data', () => {
  const report = checkReceipt([
    { category:'browser-marker',detector:'detectWebDriver',valid:'true',outcome:'detected',
      source_ip:'192.0.2.1',session:'secret-session',raw:'secret-fingerprint' },
    { category:'environment-health',detector:'creepWebglMirror',valid:'false',outcome:'error' },
    { category:'request-identity',detector:'platform',valid:'true',outcome:'mismatch' },
    { category:'input',trusted:'false',hidden:'true',event_type:'input' },
  ],[{trusted:false,hidden:true},{trusted:true,hidden:false}],3)
  assert.deepEqual(report,{signals:[
    {category:'browser-marker',detector:'detectWebDriver',valid:true,outcome:'detected'},
    {category:'environment-health',detector:'creepWebglMirror',valid:false,outcome:'error'},
    {category:'request-identity',detector:'platform',valid:true,outcome:'mismatch'},
  ],input:{events:2,untrusted:1,hidden:1,dropped:3}})
  assert.deepEqual(checkReceipt([],[],0),{signals:[],input:{events:0,untrusted:0,hidden:0,dropped:0}})
})

// 防跨站创建/自动GET建档；入口可独立使用，不依赖B-A-T runtime。
test('diagnostic session creation requires a same-origin POST', async () => {
  let created = 0
  const server = createServer((req,res) => {
    void checkRoute('',req,res,'/measurement/check/session',() => { created++; return {id:'owned',page:'page'} })
  })
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}`
  try {
    for (const options of [{}, {method:'POST'}, {method:'POST',headers:{Origin:'https://unrelated.invalid'}}]) {
      const response = await fetch(url,options); assert.equal(response.status,403); await response.text()
    }
    assert.equal(created,0)
    const response = await fetch(url,{method:'POST',headers:{Origin:url}})
    assert.equal(response.status,201); assert.deepEqual(await response.json(),{id:'owned',page:'page'})
    assert.equal(created,1); assert.equal(response.headers.get('cache-control'),'no-store')
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
