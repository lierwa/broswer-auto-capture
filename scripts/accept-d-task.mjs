import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"
import { createServer } from "node:net"
import { createInterface } from "node:readline"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

if (process.env.BAT_D5_TSX_BOOTSTRAPPED !== "1") {
  const child = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url)], {
    cwd: process.cwd(), stdio: "inherit", env: { ...process.env, BAT_D5_TSX_BOOTSTRAPPED: "1" }, windowsHide: true,
  })
  process.exit(child.status ?? 1)
}

const { createAI, localStore } = await import("@agent-platform/ai-connect/server")
const { taskChainSchema, parseTaskValue, nodePorts } = await import("../packages/contracts/src/task-chain/index.ts")
const { TaskChainRuntime, digestJson, executableChainDigest, functionRuntimeDiagnostics } =
  await import("../packages/runtime/src/task-chain/index.ts")
const { ProductStore } = await import("../apps/api/src/database/store.ts")
const { createAIModelProvider } = await import("../apps/api/src/ai/model.ts")
const { systemPromptForSemanticOperation } = await import("../apps/api/src/upstream-browser/hybrid-v2.ts")

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-")
const outputDir = path.join(root, "work", "d-task", stamp)
await mkdir(outputDir, { recursive: true })
const evidencePath = path.join(outputDir, "acceptance.json")
const evidence = { schemaVersion: "bat.d-acceptance/v1", accepted: false, startedAt: new Date().toISOString(),
  checkout: { commit: git("rev-parse", "HEAD"), branch: git("branch", "--show-current") }, mode: "headless",
  tasks: [], blockers: [], cleanup: { viteClosed: false, browserClosed: false, adapterClosed: false,
    aiClosed: false, storeClosed: false, quickjs: null },
  diagnostics: { providerAttempts: [], browserFailures: [], browserReads: [] }, finishedAt: null }
let vite, browser, store, ai

try {
  const port = await freePort(), origin = `http://127.0.0.1:${port}`
  vite = startVite(port)
  await waitHttp(origin)
  browser = await startBrowserBridge(outputDir)
  const deterministic = buildCardChain()
  const cardRuns = await runPair(deterministic.chain, [
    { url: `${origin}/d-task?sample=card-a` }, { url: `${origin}/d-task?sample=card-b` },
  ], browser.capabilities())
  evidence.tasks.push(taskEvidence("controlled-function-branch", deterministic.chain, cardRuns, {
    functionSourceDigest: sha256(deterministic.source), branchPorts: deterministic.ports,
    browserScreenshots: [await browser.screenshot("controlled-card-verification")],
  }))

  const aiContext = await prepareRealModel()
  store = aiContext.store; ai = aiContext.ai
  const llmCapability = explicitLlmCapability(aiContext.prepared)

  const semantic = buildSemanticChain(aiContext.selection.modelId)
  const semanticRuns = await runPair(semantic.chain, [
    { url: `${origin}/d-task?sample=semantic-a` }, { url: `${origin}/d-task?sample=semantic-b` },
  ], { ...browser.capabilities(), llm: llmCapability })
  evidence.tasks.push(taskEvidence("controlled-explicit-llm", semantic.chain, semanticRuns, {
    systemPromptDigest: sha256(semantic.prompt), branchPorts: semantic.ports,
    browserScreenshots: [await browser.screenshot("controlled-semantic-verification")],
  }))

  const github = buildGithubChain(aiContext.selection.modelId)
  const githubRuns = await runPair(github.chain, [
    { url: "https://github.com/browser-use/browser-use/issues?q=is%3Aissue%20is%3Aopen%20sort%3Aupdated-desc" },
    { url: "https://github.com/browser-use/browser-use/issues?q=is%3Aissue%20is%3Aopen%20browser%20sort%3Aupdated-desc" },
  ], { ...browser.capabilities(), llm: llmCapability })
  evidence.tasks.push(taskEvidence("github-browser-use-issues", github.chain, githubRuns, {
    systemPromptDigest: sha256(github.prompt), branchPorts: github.ports,
    browserScreenshots: [await browser.screenshot("github-verification")],
  }))
  evidence.accepted = evidence.tasks.every((task) => task.runs.every((run) => run.status === "completed"))
  assert.equal(evidence.accepted, true, "d5_task_not_completed")
} catch (error) {
  evidence.blockers.push({ code: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.split("\n").slice(0, 8) : undefined })
} finally {
  if (browser) {
    const closed = await browser.close().catch(() => false)
    evidence.cleanup.browserClosed = closed; evidence.cleanup.adapterClosed = closed
  }
  if (vite) evidence.cleanup.viteClosed = await stopProcess(vite).then(() => true, () => false)
  if (ai) { await ai.close(); evidence.cleanup.aiClosed = true }
  if (store) { await store.close(); evidence.cleanup.storeClosed = true }
  evidence.cleanup.quickjs = functionRuntimeDiagnostics()
  evidence.finishedAt = new Date().toISOString()
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n")
  process.stdout.write(`D5 evidence: ${evidencePath}\n`)
}
if (!evidence.accepted) process.exitCode = 1

async function prepareRealModel() {
  const directory = path.join(root, "data")
  const storeValue = await ProductStore.open(directory)
  let aiValue
  try {
    aiValue = await createAI({ storage: localStore({ directory: path.join(directory, "ai-connect") }) })
    const provider = createAIModelProvider(aiValue, storeValue, "browser-capture-local-user",
      { cwd: root, stateDir: path.join(directory, "pi-agent-session") })
    const selection = provider.selection()
    const prepared = await provider.prepare(selection, new AbortController().signal)
    if (!prepared.generateRuntimeObject) throw new Error("explicit_llm_structured_messages_unavailable")
    return { store: storeValue, ai: aiValue, selection, prepared }
  } catch (error) {
    aiValue?.close(); await storeValue.close(); throw error
  }
}

function explicitLlmCapability(prepared) {
  return async (invocation) => {
    let reportedInvocations = 0
    try {
      const output = await prepared.generateRuntimeObject({ systemPrompt: invocation.node.systemPrompt,
        userInput: invocation.input, jsonSchema: { type: "object", properties: { result: invocation.node.outputContract.schema },
          required: ["result"], additionalProperties: false },
        parse: (raw) => strictResult(raw, invocation.node.outputContract), signal: invocation.signal,
        onEvent: (event) => { if (event.type === "generation.started") reportedInvocations += 1 },
      })
      evidence.diagnostics.providerAttempts.push({ nodeId: invocation.node.id, status: "completed", reportedInvocations })
      return { outcome: "success", output, reportedInvocations }
    } catch (error) {
      evidence.diagnostics.providerAttempts.push({ nodeId: invocation.node.id, status: "failed", reportedInvocations,
        code: error instanceof Error ? error.message : "provider_protocol_error" })
      return { outcome: invocation.signal.aborted ? "cancelled" : "failed", output: null,
        reason: error instanceof Error ? error.message : "provider_protocol_error", reportedInvocations }
    }
  }
}

function strictResult(raw, contract) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length !== 1 || !("result" in raw)) {
    throw new Error("llm_output_shape_invalid")
  }
  try { return parseTaskValue(contract, raw.result) }
  catch { throw new Error("llm_result_invalid") }
}

async function runPair(chain, inputs, capabilities) {
  const chainDigest = executableChainDigest(chain), results = []
  for (const [index, input] of inputs.entries()) {
    const request = { contractVersion: "bat-task-chain/v1", requestId: randomUUID(),
      mode: index === 0 ? "sample" : "verification", input,
      binding: { runId: randomUUID(), invocationId: randomUUID(), taskId: chain.taskId,
        authorizationId: randomUUID(), plan: chain.plan,
        chain: { id: chain.id, version: chain.version, digest: chainDigest }, inputDigest: digestJson(input) } }
    results.push(await new TaskChainRuntime().execute({ chain, request, capabilities }))
  }
  return results
}

function taskEvidence(name, chain, runs, extra) {
  return { name, chain: { id: chain.id, version: chain.version, nodeModel: chain.nodeModel,
    digest: executableChainDigest(chain) }, inputDigests: runs.map((run) => run.binding.inputDigest),
    runs: runs.map((run) => ({ runId: run.binding.runId, mode: run.mode, status: run.status,
      output: run.outputs.result ?? null, browserCommands: run.consumed.browserCommands,
      modelCalls: run.consumed.llmCalls, providerReportedInvocations: run.modelCalls.map((call) => call.reportedInvocations),
      branchPorts: run.events.filter((event) => event.status === "finished" && chain.nodes.find((node) =>
        node.id === event.nodeId)?.kind === "branch").map((event) => event.outcome),
      nodeOutcomes: run.events.filter((event) => event.status === "finished")
        .map((event) => ({ nodeId: event.nodeId, outcome: event.outcome })) })), ...extra }
}

function buildCardChain() {
  const source = `function main(inputs) {
    const price = Number(inputs.record.price.replace(/[^0-9.]/g, ""));
    const official = inputs.record.shop.toLowerCase().includes(inputs.record.brand.toLowerCase());
    const decision = official && price <= 1500 ? "official" : price <= 2000 ? "candidate" : "reject";
    return { decision, normalized: { title: inputs.record.title.trim(), brand: inputs.record.brand.trim(),
      shop: inputs.record.shop.trim(), price } };
  }`
  const readSchema = { type: "object", properties: { title: { type: "string" }, brand: { type: "string" },
    shop: { type: "string" }, price: { type: "string" } }, required: ["title", "brand", "shop", "price"], additionalProperties: false }
  const outputSchema = { type: "object", properties: { decision: { type: "string", enum: ["official", "candidate", "reject"] },
    normalized: { type: "object", properties: { title: { type: "string" }, brand: { type: "string" },
      shop: { type: "string" }, price: { type: "number" } }, required: ["title", "brand", "shop", "price"],
      additionalProperties: false } }, required: ["decision", "normalized"], additionalProperties: false }
  const navigate = capability("navigate", "browser.workflow-step", { url: { source: "input", path: ["url"] } },
    { actionName: "navigate" }, unit())
  const read = capability("read", "browser.read-fields", {}, { specification: { container: ".d-card", maxItems: 1,
    fields: { title: textField(".d-title"), brand: textField(".d-brand"), shop: textField(".d-shop"), price: textField(".d-price") },
    outputSchema: readSchema } }, contract("card-read", readSchema))
  const fn = { id: "decide", label: "规则函数", kind: "function", language: "javascript", source,
    inputs: { record: { source: "node", nodeId: read.id, path: [] } }, timeoutMs: 300,
    outputContract: contract("card-result", outputSchema), writes: [] }
  const values = ["official", "candidate", "reject"]
  const branch = branchNode("route", values, (value) => equalsNode(fn.id, ["decision"], value))
  const done = completed("done", fn.outputContract, { source: "node", nodeId: fn.id, path: [] })
  const failed = failedTerminal()
  const nodes = [navigate, read, fn, branch, done, failed]
  const edges = [...route(navigate, read.id, failed.id), ...route(read, fn.id, failed.id), ...route(fn, branch.id, failed.id),
    ...branchEdges(branch, Object.fromEntries(values.map((value) => [value, done.id])), failed.id)]
  return { source, ports: [...values, "default", "failed"], chain: makeChain("56000000-0000-4000-8000-000000000001",
    "controlled-card", nodes, edges, navigate.id, fn.outputContract, 0, 4) }
}

function buildSemanticChain(model) {
  const operation = { id: "classify-description", clauseRefs: ["semantic-description"], purpose: "classify",
    instruction: "Classify the three descriptions by the primary commercial subject represented by the set.",
    inputDescription: "An ordered JSON array of three objects, each with one description string.",
    resultSchema: { type: "string", enum: ["product", "accessory", "service", "uncertain"] },
    candidateIds: ["product", "accessory", "service", "uncertain"] }
  const prompt = systemPromptForSemanticOperation(operation)
  const readSchema = { type: "array", minItems: 3, maxItems: 3, items: { type: "object",
    properties: { description: { type: "string" } }, required: ["description"], additionalProperties: false } }
  return buildLlmBrowserChain({ id: "57000000-0000-4000-8000-000000000001", stepId: "controlled-semantic", model,
    prompt, resultSchema: operation.resultSchema, readSchema, readSpec: { container: ".d-semantic", maxItems: 3,
      fields: { description: textField(":scope") }, outputSchema: readSchema },
    values: operation.candidateIds, openCandidates: false })
}

function buildGithubChain(model) {
  const operation = { id: "choose-reliability-issue", clauseRefs: ["github-reliability"], purpose: "rank_candidates",
    instruction: "你将收到按展示顺序排列的三个公开 GitHub issue 候选，只依据输入中的标题和 labels，选择最直接描述浏览器交互可靠性故障的一条。返回 candidate_1、candidate_2、candidate_3 或 none 中的一个；不要解释，不要返回置信度或其他字段。",
    inputDescription: "三个按页面展示顺序排列的公开 issue；每项含稳定 id、title、labels、url。",
    resultSchema: { type: "string", enum: ["candidate_1", "candidate_2", "candidate_3", "none"] },
    candidateIds: ["candidate_1", "candidate_2", "candidate_3", "none"] }
  const prompt = systemPromptForSemanticOperation(operation)
  const item = { type: "object", properties: { id: { type: "string" }, title: { type: "string" },
    labels: { type: "array", items: { type: "string" }, maxItems: 20 }, url: { type: "string" } },
    required: ["id", "title", "labels", "url"], additionalProperties: false }
  const readSchema = { type: "array", minItems: 3, maxItems: 3, items: item }
  return buildLlmBrowserChain({ id: "58000000-0000-4000-8000-000000000001", stepId: "github-issues", model,
    prompt, resultSchema: operation.resultSchema, readSchema, readSpec: {
      container: "li[role='listitem']:has(a[data-testid='issue-pr-title-link'])", maxItems: 3,
      fields: { id: { selector: "a[data-testid='issue-pr-title-link']", attribute: "href", valueType: "string" },
        title: textField("a[data-testid='issue-pr-title-link']"),
        labels: { selector: "a[href*='label%3A'] span[data-component='Text']", attribute: null, valueType: "string", multiple: true,
          maxValues: 20, normalizeWhitespace: true },
        url: { selector: "a[data-testid='issue-pr-title-link']", attribute: "href", resolveUrl: true, valueType: "string" } },
      outputSchema: readSchema }, values: operation.candidateIds, openCandidates: true,
    waitAfterNavigate: true, warmupRead: true })
}

function buildLlmBrowserChain(options) {
  const navigate = capability("navigate", "browser.workflow-step", { url: { source: "input", path: ["url"] } },
    { actionName: "navigate" }, unit())
  const read = capability("read", "browser.read-fields", {}, { specification: options.readSpec }, contract("candidates", options.readSchema))
  const llm = { id: "semantic", label: "显式 LLM", kind: "llm", systemPrompt: options.prompt,
    input: { source: "node", nodeId: read.id, path: [] }, model: options.model, timeoutMs: 120_000,
    outputContract: contract("choice", options.resultSchema), writes: [] }
  const branch = branchNode("route", options.values, (value) => equalsNode(llm.id, [], value))
  const done = completed("done", llm.outputContract, { source: "node", nodeId: llm.id, path: [] })
  const failed = failedTerminal(), wait = options.waitAfterNavigate
    ? capability("settle", "browser.workflow-step", { seconds: { source: "constant", value: 1 } },
      { actionName: "wait" }, unit()) : null
  const warmup = options.warmupRead
    ? capability("warmup-read", "browser.read-fields", {}, { specification: options.readSpec },
      contract("warmup-candidates", options.readSchema)) : null
  const nodes = [navigate, ...(wait ? [wait] : []), ...(warmup ? [warmup] : []), read, llm, branch]
  const destinations = {}
  if (options.openCandidates) {
    options.values.forEach((value, index) => {
      if (value === "none") { destinations[value] = done.id; return }
      const open = capability(`open-${value}`, "browser.workflow-step",
        { url: { source: "node", nodeId: read.id, path: [index, "url"] } }, { actionName: "navigate" }, unit())
      nodes.push(open); destinations[value] = open.id
    })
  } else for (const value of options.values) destinations[value] = done.id
  nodes.push(done, failed)
  const firstRead = warmup?.id ?? read.id
  const edges = [...route(navigate, wait?.id ?? firstRead, failed.id), ...(wait ? route(wait, firstRead, failed.id) : []),
    ...(warmup ? nodePorts(warmup).map((port) => ({ from: warmup.id, port,
      to: port === "success" || port === "missing" ? read.id : failed.id })) : []),
    ...route(read, llm.id, failed.id), ...route(llm, branch.id, failed.id),
    ...branchEdges(branch, destinations, failed.id)]
  for (const node of nodes.filter((item) => item.id.startsWith("open-"))) edges.push(...route(node, done.id, failed.id))
  return { prompt: options.prompt, ports: [...options.values, "default", "failed"],
    chain: makeChain(options.id, options.stepId, nodes, edges, navigate.id, llm.outputContract, 1,
      options.openCandidates ? 6 : 3) }
}

function makeChain(id, stepId, nodes, edges, entry, outputContract, maxLlmCalls, maxBrowserCommands) {
  return taskChainSchema.parse({ contractVersion: "bat-task-chain/v1", kind: "chain", nodeModel: "stable/v2", id,
    taskId: "59000000-0000-4000-8000-000000000001", version: 2,
    plan: { id: "59000000-0000-4000-8000-000000000002", version: 1, digest: "d".repeat(64) }, stepId,
    name: stepId, inputContract: contract("url-input", { type: "object", properties: { url: { type: "string" } },
      required: ["url"], additionalProperties: false }), outputContract, variables: {}, entry, nodes, edges,
    completion: [{ id: "result", description: "result emitted", predicate: { operator: "equals",
      left: { source: "constant", value: true }, right: { source: "constant", value: true } } }],
    budget: { maxTransitions: 20, maxBrowserCommands, maxActiveMs: 180_000, maxLlmCalls, maxInvocations: 1, maxDepth: 1 },
    reuseBoundary: { description: "same stable/v2 graph for different URL input", assumptions: ["public page contract"],
      invalidationConditions: ["page contract changes"] }, implementationSummary: "D5 formal TaskChain acceptance",
    validation: { status: "candidate", evidence: [] } })
}

function capability(id, name, input, config, outputContract) {
  return { id, label: id, kind: "capability", capability: { name, version: 2 }, input, config,
    effect: name === "browser.workflow-step" ? "idempotent_write" : "read", timeoutMs: 180_000,
    outputContract, writes: [] }
}
function branchNode(id, values, predicate) { return { id, label: id, kind: "branch",
  cases: values.map((value) => ({ id: value, label: value, predicate: predicate(value) })), outputContract: unit(), writes: [] } }
function equalsNode(nodeId, pathValue, value) { return { operator: "equals", left: { source: "node", nodeId, path: pathValue },
  right: { source: "constant", value } } }
function route(node, success, failure) { return nodePorts(node).map((port) => ({ from: node.id, port, to: port === "success" ? success : failure })) }
function branchEdges(node, destinations, failure) { return [...node.cases.map((item) => ({ from: node.id, port: item.id,
  to: destinations[item.id] })), { from: node.id, port: "default", to: failure }, { from: node.id, port: "failed", to: failure }] }
function completed(id, outputContract, value) { return { id, label: id, kind: "terminal", status: "completed", reason: "completed",
  outputContract, writes: [], evidence: [value], result: { name: "result", output: { kind: "value", value }, contract: outputContract } } }
function failedTerminal() { return { id: "failed", label: "failed", kind: "terminal", status: "failed", reason: "failed",
  outputContract: unit(), writes: [], evidence: [{ source: "input", path: [] }] } }
function contract(id, schema) { return { id, version: 1, dialect: "bat-value-schema/v1", schema } }
function unit() { return contract("unit", { type: "null" }) }
function textField(selector) { return { selector, attribute: null, valueType: "string", normalizeWhitespace: true } }
function sha256(value) { return createHash("sha256").update(value).digest("hex") }

async function startBrowserBridge(output) {
  const python = resolvePython(), child = spawn(python,
    [path.join(root, "vendor", "workflow-use", "workflows", "tests", "d_task_browser_runner.py")], {
      cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env,
        PYTHONPATH: path.join(root, "vendor", "workflow-use", "workflows"), PYTHONDONTWRITEBYTECODE: "1",
        ANONYMIZED_TELEMETRY: "false", BROWSER_USE_SETUP_LOGGING: "false", BAT_D5_OUTPUT: output },
    })
  const pending = [], messages = []
  let count = 0, stderr = ""
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!line.startsWith("BAT_RESPONSE ")) return
    const value = JSON.parse(line.slice("BAT_RESPONSE ".length)), waiter = pending.shift()
    if (waiter) waiter.resolve(value); else messages.push(value)
  })
  child.stderr.on("data", (chunk) => { stderr += String(chunk) })
  child.once("exit", (code) => { for (const waiter of pending.splice(0)) waiter.reject(new Error(`d5_browser_exit:${code}`)) })
  const next = () => messages.length ? Promise.resolve(messages.shift())
    : new Promise((resolve, reject) => pending.push({ resolve, reject }))
  const send = async (command) => {
    child.stdin.write(JSON.stringify(command) + "\n")
    const response = await next()
    count += response.browserCommands ?? 0
    if (!response.ok) {
      evidence.diagnostics.browserFailures.push({ command: command.type, code: response.error })
      throw new Error(response.error)
    }
    return response.output
  }
  const bridge = {
    capabilities: () => ({ browserCommandCount: () => count, capability: async (invocation) => {
      if (invocation.node.capability.name === "browser.workflow-step" && invocation.node.config.actionName === "navigate") {
        await send({ type: "navigate", url: invocation.input.url }); return { outcome: "success", output: null }
      }
      if (invocation.node.capability.name === "browser.workflow-step") {
        await send({ type: "action", actionName: invocation.node.config.actionName, arguments: invocation.input })
        return { outcome: "success", output: null }
      }
      if (invocation.node.capability.name === "browser.read-fields") {
        try {
          const value = await send({ type: "read", specification: invocation.node.config.specification })
          evidence.diagnostics.browserReads.push({ nodeId: invocation.node.id,
            container: invocation.node.config.specification.container, output: value })
          return { outcome: "success", output: value }
        } catch (error) {
          if (error instanceof Error && error.message.includes("Could not find node with given id")) {
            return { outcome: "missing", output: null, reason: "read_cdp_node_stale" }
          }
          throw error
        }
      }
      return { outcome: "failed", output: null, reason: "capability_unsupported" }
    } }),
    screenshot: (name) => send({ type: "screenshot", name }),
    close: async () => {
      if (child.exitCode !== null) return child.exitCode === 0
      child.stdin.write(JSON.stringify({ type: "close" }) + "\n"); await next()
      const code = await new Promise((resolve) => child.once("exit", resolve))
      await writeFile(path.join(outputDir, "browser-runner.stderr.log"), stderr)
      return code === 0
    },
  }
  const ready = await next()
  if (ready.type !== "ready" || ready.headless !== true) throw new Error("d5_browser_not_headless")
  return bridge
}

function resolvePython() {
  const python = path.join(root, "work", "upstream-browser-hybrid", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
  if (!existsSync(python)) throw new Error("hybrid_python_missing")
  return python
}
function startVite(port) { return spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"),
  "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: path.join(root, "apps", "browser-replay-lab"),
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, BAT_FIXTURE_TOKEN: randomUUID().replaceAll("-", "") } }) }
function stopProcess(child) { return new Promise((resolve) => { if (child.exitCode !== null) return resolve()
  const timer = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL") }, 3_000)
  child.once("exit", () => { clearTimeout(timer); resolve() }); child.kill("SIGTERM") }) }
function waitHttp(origin) { return new Promise((resolve, reject) => { const started = Date.now(); const probe = () => {
  const request = http.get(origin, (response) => { response.resume(); response.statusCode < 500 ? resolve() : retry() })
  request.once("error", retry) }; const retry = () => Date.now() - started > 20_000
  ? reject(new Error("d5_fixture_start_timeout")) : setTimeout(probe, 100); probe() }) }
function freePort() { return new Promise((resolve, reject) => { const server = createServer(); server.unref(); server.once("error", reject)
  server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close((error) => error ? reject(error) : resolve(address.port)) }) }) }
function git(...args) { const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true })
  if (result.status !== 0) throw new Error(`git_failed:${args.join(":")}`); return result.stdout.trim() }
