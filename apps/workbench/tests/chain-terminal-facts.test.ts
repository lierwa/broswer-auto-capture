import assert from "node:assert/strict"
import test from "node:test"
import type { ChainNode, TaskRun } from "@browser-capture/contracts"
import { startFact, terminalFact } from "../src/chainTerminalFacts.js"

const node = { id: "completed", kind: "terminal", status: "completed" } as Extract<ChainNode, {kind: "terminal"}>
const success = { status: "finished", outcome: "success" } as TaskRun["events"][number]
test("接单后首连失败没有调用时，不伪装成输入仍等待或第一节点失败", () => {
  assert.equal(startFact(null, false, false), "idle")
  assert.equal(startFact(null, false, true), "waiting")
  assert.equal(startFact({ status: "failed", cleanupResume: null }, false, true), "not_entered")
  assert.equal(startFact({ status: "cleanup_required", cleanupResume: {
    status: "failed", reason: "首连未完成", result: null } }, false, true), "not_entered")
  assert.equal(startFact({ status: "failed", cleanupResume: null }, true, true), "bound")
})
test("终点成功事件尚不能证明证据核验后的本次调用完成", () => {
  assert.equal(terminalFact(node, undefined, undefined), "unreached")
  assert.equal(terminalFact(node, success, undefined), "pending")
  assert.equal(terminalFact(node, success, { status: "failed", outcome: { status: "failed", code: "binding_path_missing", reason: "失败", evidence: [] } }), "return_failed")
  assert.equal(terminalFact(node, success, { status: "completed", outcome: { status: "completed", completionEvidence: ["other"], reason: "完成", evidence: [] } }), "return_failed")
  assert.equal(terminalFact(node, success, { status: "completed", outcome: { status: "completed", completionEvidence: ["completed"], reason: "完成", evidence: [] } }), "reached")
})
test("失败声明终点与返回处理失败区分，不拿同status冒充到达", () => {
  const failed = { ...node, id: "failed", status: "failed" as const }
  assert.equal(terminalFact(failed, success, { status: "failed", outcome: { status: "failed", code: "binding_path_missing", reason: "失败", evidence: [] } }), "return_failed")
  assert.equal(terminalFact(failed, success, { status: "failed", outcome: { status: "failed", code: "terminal_failed", reason: "失败", evidence: [] } }), "reached")
})
