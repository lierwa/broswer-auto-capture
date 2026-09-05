import assert from "node:assert/strict"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { runAuditSchema, type ExecutionEvent, type RunRequest } from "@browser-capture/contracts/run"
import { invokeExplicitLlmGateway } from "../src/audit-boundaries.js"
import {
  OrdinaryRunEngine, type OrdinaryAdapter, type OrdinaryRunDependencies,
} from "../src/ordinary-run.js"

interface TestDatabase {
  directory: string
  path: string
  cleanup(): void
}

function tempDatabase(name: string): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), "capture-runtime-"))
  const path = join(directory, `${name}.sqlite`)
  return {
    directory,
    path,
    cleanup() {
      assert.equal(dirname(path), directory)
      rmSync(directory, { recursive: true })
    },
  }
}

function request(inputs: RunRequest["inputs"]): RunRequest {
  return {
    runId: crypto.randomUUID(),
    workflowId: "3fca9a11-5d6f-4c95-8ad7-2092e4aa6bee",
    workflowVersion: 1,
    inputs,
  }
}

function echoAdapter(calls: string[]): OrdinaryAdapter {
  return {
    async execute(item) {
      calls.push(item.stableKey)
      await Promise.resolve()
      return `saved:${item.value}`
    },
  }
}

async function withEngine<T>(name: string, dependencies: OrdinaryRunDependencies, run: (engine: OrdinaryRunEngine) => Promise<T>) {
  const database = tempDatabase(name)
  const engine = new OrdinaryRunEngine(database.path, dependencies)
  try {
    return await run(engine)
  } finally {
    try {
      engine.close()
    } finally {
      database.cleanup()
    }
  }
}

test("超过默认 25 superstep 的有界普通循环完成且模型事件为零", async () => {
  const calls: string[] = []
  const inputs = Array.from({ length: 30 }, (_, index) => ({ stableKey: `sku-${index}`, value: `商品 ${index}` }))
  await withEngine("long-loop", {
    adapter: echoAdapter(calls),
    async verifyResume() { return { ok: true, detail: "测试恢复 stub" } },
  }, async (engine) => {
    const result = await engine.start(request(inputs))
    assert.equal(result.audit.status, "completed")
    assert.equal(result.audit.modelInvocationIntents, 0)
    assert.equal(result.audit.completedStableKeys.length, 30)
    assert.equal(calls.length, 30)
    assert.equal(result.audit.events.filter((event) => event.type === "ordinary_adapter_completed").length, 30)
  })
})

test("同一运行按稳定键去重", async () => {
  const calls: string[] = []
  await withEngine("dedupe", {
    adapter: echoAdapter(calls),
    async verifyResume() { return { ok: true, detail: "测试恢复 stub" } },
  }, async (engine) => {
    const result = await engine.start(request([
      { stableKey: "sku-a", value: "A-first" },
      { stableKey: "sku-a", value: "A-duplicate" },
      { stableKey: "sku-b", value: "B" },
    ]))
    assert.deepEqual(calls, ["sku-a", "sku-b"])
    assert.deepEqual(result.audit.completedStableKeys, ["sku-a", "sku-b"])
  })
})

test("不同 runId 在同一 SQLite 文件中保持独立", async () => {
  const calls: string[] = []
  await withEngine("independent", {
    adapter: echoAdapter(calls),
    async verifyResume() { return { ok: true, detail: "测试恢复 stub" } },
  }, async (engine) => {
    const first = await engine.start(request([{ stableKey: "same-key", value: "first" }]))
    const second = await engine.start(request([{ stableKey: "same-key", value: "second" }]))
    assert.notEqual(first.binding.runId, second.binding.runId)
    assert.equal(first.results["same-key"], "saved:first")
    assert.equal(second.results["same-key"], "saved:second")
    assert.deepEqual(calls, ["same-key", "same-key"])
  })
})

test("同一引擎拒绝并发 start/resume，而不实现产品队列", async () => {
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  await withEngine("exclusive", {
    adapter: { async execute(item) { await gate; return item.value } },
    async verifyResume() { return { ok: true, detail: "测试恢复 stub" } },
  }, async (engine) => {
    const running = engine.start(request([{ stableKey: "a", value: "A" }]))
    try {
      await assert.rejects(
        engine.start(request([{ stableKey: "b", value: "B" }])),
        /一次只能执行一个 start 或 resume/,
      )
      assert.throws(() => engine.close(), /执行中/)
    } finally {
      release?.()
    }
    assert.equal((await running).audit.status, "completed")
  })
})

test("暂停后恢复会核验 stub，并拒绝更换输入或 workflow 版本", async () => {
  let resumeChecks = 0
  await withEngine("binding", {
    adapter: echoAdapter([]),
    async verifyResume() { resumeChecks += 1; return { ok: true, detail: "浏览器恢复 stub 已核验" } },
  }, async (engine) => {
    const original = request([{ stableKey: "a", value: "A" }, { stableKey: "b", value: "B" }])
    assert.equal((await engine.start(original, { pauseAfterItems: 1 })).audit.status, "paused")
    await assert.rejects(engine.resume({ ...original, inputs: [{ stableKey: "y", value: "Y" }] }), /拒绝更换运行输入/)
    await assert.rejects(engine.resume({ ...original, workflowVersion: 2 }), /拒绝更换 workflow ID 或版本/)
    assert.equal(resumeChecks, 0)
    const resumed = await engine.resume(original)
    assert.equal(resumed.audit.status, "completed")
    assert.equal(resumeChecks, 1)
    assert.equal(resumed.audit.events.some((event) => event.type === "resume_verified"), true)
  })
})

test("abort 保留 running/planned checkpoint，核验后用相同幂等键恢复", async () => {
  const database = tempDatabase("abort")
  const keys: string[] = []
  let observedAbort = false
  const original = request([{ stableKey: "slow", value: "slow" }])
  const interrupted = new OrdinaryRunEngine(database.path, {
    adapter: {
      async execute(_item, context) {
        keys.push(context.idempotencyKey)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 2_000)
          context.signal?.addEventListener("abort", () => {
            observedAbort = true
            clearTimeout(timer)
            reject(new DOMException("aborted by test", "AbortError"))
          }, { once: true })
        })
        return "unexpected"
      },
    },
    async verifyResume() { return { ok: true, detail: "中断恢复 stub" } },
  })
  let recovered: OrdinaryRunEngine | undefined
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 25)
    await assert.rejects(interrupted.start(original, { signal: controller.signal }))
    assert.equal(observedAbort, true)
    interrupted.close()

    recovered = new OrdinaryRunEngine(database.path, {
      adapter: { async execute(item, context) { keys.push(context.idempotencyKey); return `resumed:${item.value}` } },
      async verifyResume() { return { ok: true, detail: "中断恢复 stub" } },
    })
    const result = await recovered.resume(original)
    assert.equal(result.audit.status, "completed")
    assert.equal(new Set(keys).size, 1)
    assert.equal(result.audit.events.filter((event) => event.type === "ordinary_adapter_planned").length, 1)
    assert.equal(result.audit.events.filter((event) => event.type === "ordinary_adapter_completed").length, 1)
  } finally {
    try {
      recovered?.close()
    } finally {
      try {
        interrupted.close()
      } finally {
        database.cleanup()
      }
    }
  }
})

test("副作用与 checkpoint 间失败会用同一幂等键重入", async () => {
  const database = tempDatabase("reentry")
  const keys: string[] = []
  const original = request([{ stableKey: "sku-risk", value: "可能已写入" }])
  const crashing = new OrdinaryRunEngine(database.path, {
    adapter: { async execute(_item, context) { keys.push(context.idempotencyKey); throw new Error("模拟副作用后进程失败") } },
    async verifyResume() { return { ok: true, detail: "崩溃恢复 stub" } },
  })
  let recovered: OrdinaryRunEngine | undefined
  try {
    await assert.rejects(crashing.start(original), /模拟副作用后进程失败/)
    crashing.close()
    recovered = new OrdinaryRunEngine(database.path, {
      adapter: { async execute(item, context) { keys.push(context.idempotencyKey); return `recovered:${item.value}` } },
      async verifyResume() { return { ok: true, detail: "崩溃恢复 stub" } },
    })
    const result = await recovered.resume(original)
    assert.equal(result.audit.status, "completed")
    assert.equal(new Set(keys).size, 1)
    assert.equal(result.audit.events.filter((event) => event.type === "ordinary_adapter_planned").length, 1)
    assert.equal(result.audit.events.filter((event) => event.type === "ordinary_adapter_completed").length, 1)
  } finally {
    try {
      recovered?.close()
    } finally {
      try {
        crashing.close()
      } finally {
        database.cleanup()
      }
    }
  }
})

test("显式 LLM 网关的调用意图事件派生一次，不代表供应商计费", async () => {
  const events: ExecutionEvent[] = []
  let gatewayCalls = 0
  const output = await invokeExplicitLlmGateway(
    { async invoke(input) { gatewayCalls += 1; return `classified:${input}` } },
    { nodeId: "classify", model: "injected-test-model", input: "sample" },
    async (event) => { events.push(event) },
  )
  const audit = runAuditSchema.parse({
    runId: crypto.randomUUID(),
    workflowId: "3fca9a11-5d6f-4c95-8ad7-2092e4aa6bee",
    workflowVersion: 1,
    status: "completed",
    completedStableKeys: [],
    events,
  })
  assert.equal(output, "classified:sample")
  assert.equal(gatewayCalls, 1)
  assert.equal(audit.modelInvocationIntents, 1)
})

test("网关调用意图可在实际 invoke 前留存，因此不能作为供应商计费证据", async () => {
  const events: ExecutionEvent[] = []
  let gatewayCalls = 0
  await assert.rejects(invokeExplicitLlmGateway(
    { async invoke() { gatewayCalls += 1; return "unexpected" } },
    { nodeId: "classify", model: "injected-test-model", input: "sample" },
    async (event) => { events.push(event); throw new Error("模拟意图落盘后的进程失败") },
  ), /模拟意图落盘后的进程失败/)

  const audit = runAuditSchema.parse({
    runId: crypto.randomUUID(),
    workflowId: "3fca9a11-5d6f-4c95-8ad7-2092e4aa6bee",
    workflowVersion: 1,
    status: "failed",
    completedStableKeys: [],
    events,
  })
  assert.equal(audit.modelInvocationIntents, 1)
  assert.equal(gatewayCalls, 0)
})

test("close 可重复调用、释放 SQLite 文件并阻止后续运行", async () => {
  const database = tempDatabase("close")
  const engine = new OrdinaryRunEngine(database.path, {
    adapter: echoAdapter([]),
    async verifyResume() { return { ok: true, detail: "测试恢复 stub" } },
  })
  try {
    await engine.start(request([{ stableKey: "a", value: "A" }]))
    engine.close()
    engine.close()
    await assert.rejects(engine.start(request([{ stableKey: "b", value: "B" }])), /运行引擎已关闭/)
    database.cleanup()
    assert.equal(existsSync(database.directory), false)
  } finally {
    engine.close()
    if (existsSync(database.directory)) database.cleanup()
  }
})
