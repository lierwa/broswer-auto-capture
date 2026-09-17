import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { z } from "zod"
import { digestJson } from "@browser-capture/runtime"
import { createApplication } from "../src/app.js"
import { hybridSourceMediaType, readHybridSourceArtifact } from "../src/upstream-browser/hybrid-artifact.js"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { browserUseTask } from "../src/upstream-browser/task-request.js"
import { confirmedDraft, preexecutionModel, waitFor } from "./task-chain-test-support.js"
import { openActionContextSite, type OracleEffect, type OracleEvent,
  type OracleRecord } from "./fixtures/action-context-site.js"
import { assertActionContextFixtureContract } from "./fixtures/action-context-contract.js"
import { acceptanceInput, assertDecisionContextContract, formalSemantics, inputSchema, requirement,
  scriptedSubject, type ActionContextAcceptanceInput as AcceptanceInput } from "./fixtures/action-context-driver.js"
import { assertLocalEventGraph } from "./fixtures/action-context-evidence-contract.js"
import { hybridFixture, hybridPlan } from "./fixtures/hybrid-compilation.js"
import { projectRoot } from "./helpers.js"

type Fact = { kind: string; value: unknown }
type Action = { id: string; name: string; args: Record<string, unknown>; resultRef: { digest: string } | null;
  preObservationRef: string | null; postObservationRef: string | null }
type Observation = { id: string; facts: Fact[] }
type ActualEvent = { sequence: number; documentId: string; scope: Record<string, unknown>;
  event: Record<string, unknown>; graph: EventGraph; limitations: string[] }
type EventGraph = { targetRef: string | null; target?: Record<string, unknown>;
  composedPath: Array<Record<string, unknown>>;
  nodes: Array<{ id: string; tag: string; parentRef: string | null; childrenRefs: string[];
    attributes: Record<string, string> }> }

const outputSchema = { type: "object" as const, properties: { status: { type: "string" as const, maxLength: 20 } },
  required: ["status"], additionalProperties: false }

test("A acceptance fixture exposes every conformance boundary before Chromium starts", async () => {
  const site = await openActionContextSite()
  try {
    await assertActionContextFixtureContract(site)
    assertDecisionContextContract()
    const steps = new Set(scriptedSubject(acceptanceInput(site)).stepIds)
    for (const required of ["scroll-page", "scroll-container", "read-dropdown-options", "select-air-express",
      "confirm-dialog", "prompt-dialog", "open-html-modal", "close-html-modal", "open-child-tab",
      "switch-to-opener", "switch-to-child", "close-child-tab"]) assert.ok(steps.has(required), required)
    const scalarFacts = parseTrace({ trace: { actions: [], observations: [{ id: "o-0001", facts: [
      { kind: "url", value: "https://fixture.invalid/" }, { kind: "monotonic_ms", value: 1 },
      { kind: "browser_context", value: {} },
    ] }] } }).observations[0]!.facts
    assert.deepEqual(scalarFacts.map((fact) => fact.value), ["https://fixture.invalid/", 1, {}])
  }
  finally { await site.close() }
})

const savedEvidencePath = process.env.BAT_ACTION_CONTEXT_EVIDENCE

test("A formal source agrees with an independent browser oracle across document structures", {
  skip: process.env.BAT_REAL_BROWSER_TEST !== "1" && !savedEvidencePath, timeout: 150_000,
}, async () => {
  if (savedEvidencePath) {
    await assertSavedEvidence(savedEvidencePath)
    return
  }
  const site = await openActionContextSite()
  await assertActionContextFixtureContract(site)
  assertDecisionContextContract()
  const directory = await mkdtemp(path.join(tmpdir(), "bat-action-context-"))
  const input = acceptanceInput(site)
  const scripted = scriptedSubject(input)
  const runtime = new PythonUpstreamBrowserRuntime({ root: projectRoot, directory, subject: scripted.subject as never })
  let application: Awaited<ReturnType<typeof createApplication>> | undefined
  let reopened: Awaited<ReturnType<typeof createApplication>> | undefined
  const evidence: Record<string, unknown> = { input }
  try {
    application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel([]),
      upstreamBrowserRuntime: runtime })
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId, { title: formalSemantics.requirementTitle, markdown: requirement(input) })
    const requirementVersion = application.taskChain.snapshot(taskId).requirement!
    const repository = application.taskChain.repository
    const raw = hybridFixture(), plan = hybridPlan(raw)
    plan.taskId = taskId
    plan.requirement = { id: requirementVersion.id, version: requirementVersion.version,
      revision: requirementVersion.revision, digest: digestJson(requirementVersion) }
    plan.inputContract.schema = inputSchema()
    plan.outputContract = { id: "action-context-output", version: 1,
      dialect: "bat-value-schema/v1", schema: outputSchema }
    plan.summary = formalSemantics.planSummary
    plan.authorizationScope = formalSemantics.authorizationScope
    plan.steps[0]!.title = formalSemantics.stepTitle
    plan.steps[0]!.goal = formalSemantics.stepGoal
    plan.steps[0]!.risks = []
    plan.steps[0]!.inputContract = plan.inputContract
    plan.steps[0]!.outputContract = plan.outputContract
    plan.steps[0]!.completion = [{ id: "status", description: "status exists", predicate: {
      operator: "exists", value: { source: "node", nodeId: "perform", path: ["status"] } } }]
    plan.completion = structuredClone(plan.steps[0]!.completion)
    const savedPlan = repository.savePlan(plan)
    assertFormalTaskContract({ requirement: requirementVersion, plan: savedPlan, step: savedPlan.steps[0]!,
      resolvedInput: input })

    application.taskChain.dispatch(taskId, { type: "generate_chain", requestId: randomUUID(),
      plan: { id: savedPlan.id, version: savedPlan.version, digest: digestJson(savedPlan) },
      stepId: "perform", input })
    await waitFor(() => ["completed", "failed"].includes(repository.jobs(taskId)[0]?.status ?? ""), 110_000)
    const job = repository.jobs(taskId)[0]!
    const records = await waitForOracle(site.snapshot, expectedEffects, 10_000)
    const availableSources = sourceBodies(repository, taskId, job.authoring?.exploration)
    Object.assign(evidence, { taskId, job, records, availableSources })
    if (!availableSources.length || !hasEffects(records, expectedEffects)) {
      assert.fail(JSON.stringify({ job: { status: job.status, reason: job.reason, authoring: job.authoring },
        fixtureFailures: scripted.failures, fixtureCalls: scripted.calls, records,
        sources: availableSources.map((source) => ({ success: source.result.sourceSuccess,
          validated: source.result.sourceValidated, actions: (source.result.request as any).trace?.actions,
          gaps: source.result.response.compilation.gaps })) }))
    }

    const sourceReference = z.object({ sources: z.array(z.object({ artifact: z.object({ artifactId: z.string() }) })) })
      .parse(job.authoring?.exploration).sources[0]!
    const row = repository.artifact(taskId, sourceReference.artifact.artifactId)
    const source = readHybridSourceArtifact(row.body)
    evidence.source = source
    assert.equal(source.closed, true)
    assert.equal(source.result.sourceSuccess, true)
    assert.equal(source.result.sourceValidated, true)
    assert.deepEqual(scripted.failures, [])
    const digestBefore = source.result.history.digest

    await application.app.close()
    application = undefined
    reopened = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel([]),
      upstreamBrowserRuntime: runtime })
    const loaded = readHybridSourceArtifact(
      reopened.taskChain.repository.artifact(taskId, sourceReference.artifact.artifactId).body)
    assert.equal(loaded.result.history.digest, digestBefore)
    assert.deepEqual(eventFacts(loaded.result.request), eventFacts(source.result.request))
    assert.deepEqual(actionFacts(loaded.result.request), actionFacts(source.result.request))
    assert.deepEqual(contextFacts(loaded.result.request), contextFacts(source.result.request))
    assertConformance(loaded.result.request, records, input)
    evidence.loaded = loaded
    await persistAcceptanceEvidence("success", { ...evidence,
      fixtureFailures: scripted.failures, fixtureCalls: scripted.calls })
  } catch (error) {
    const records = await site.snapshot().catch(() => [])
    await persistAcceptanceEvidence("failure", { ...evidence, records,
      fixtureFailures: scripted.failures, fixtureCalls: scripted.calls, error: serializeError(error) })
    throw error
  } finally {
    try { if (application) await application.app.close(); if (reopened) await reopened.app.close() }
    finally { await rm(directory, { recursive: true, force: true }); await site.close() }
  }
})

async function assertSavedEvidence(evidencePath: string) {
  const saved = z.object({ input: z.record(z.string(), z.unknown()), records: z.array(z.unknown()),
    source: z.unknown(), fixtureFailures: z.array(z.unknown()).optional(), fixtureCalls: z.array(z.unknown()) })
    .passthrough().parse(JSON.parse(await readFile(path.resolve(projectRoot, evidencePath), "utf8")))
  const source = readHybridSourceArtifact(saved.source)
  assert.equal(source.closed, true)
  assert.equal(source.result.sourceSuccess, true)
  assert.equal(source.result.sourceValidated, true)
  if (saved.fixtureFailures) assert.deepEqual(saved.fixtureFailures, [])
  assert.equal(saved.fixtureCalls.length, parseTrace(source.result.request).actions.length)
  assertConformance(source.result.request, saved.records as OracleRecord[], saved.input as AcceptanceInput)
  await assertSavedSourceRoundTrip(source, saved.input as AcceptanceInput)
}

async function assertSavedSourceRoundTrip(rawSource: unknown, input: AcceptanceInput) {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-action-context-reload-"))
  const subject = scriptedSubject(input).subject as never
  let application: Awaited<ReturnType<typeof createApplication>> | undefined
  try {
    application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel([]),
      upstreamBrowserRuntime: new PythonUpstreamBrowserRuntime({ root: projectRoot, directory, subject }) })
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    const source = readHybridSourceArtifact(rawSource)
    const reference = application.taskChain.repository.saveArtifact(taskId, randomUUID(), hybridSourceMediaType,
      z.json().parse(source))
    await application.app.close()
    application = undefined
    application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel([]),
      upstreamBrowserRuntime: new PythonUpstreamBrowserRuntime({ root: projectRoot, directory, subject }) })
    const loaded = readHybridSourceArtifact(application.taskChain.repository.artifact(taskId, reference.artifactId).body)
    assert.equal(loaded.result.history.digest, source.result.history.digest)
    assert.deepEqual(eventFacts(loaded.result.request), eventFacts(source.result.request))
    assert.deepEqual(actionFacts(loaded.result.request), actionFacts(source.result.request))
    assert.deepEqual(contextFacts(loaded.result.request), contextFacts(source.result.request))
  } finally {
    if (application) await application.app.close()
    await rm(directory, { recursive: true, force: true })
  }
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }

function assertFormalTaskContract(task: Parameters<typeof browserUseTask>[0]) {
  const prompt = browserUseTask(task)
  const resolved = z.object({ startUrl: z.string() }).passthrough().parse(task.resolvedInput)
  assert.match(prompt, /Action-context conformance/)
  assert.match(prompt, new RegExp(escapeRegExp(formalSemantics.stepTitle)))
  assert.match(prompt, new RegExp(escapeRegExp(formalSemantics.stepGoal)))
  assert.match(prompt, new RegExp(escapeRegExp(formalSemantics.planSummary)))
  assert.match(prompt, new RegExp(escapeRegExp(formalSemantics.authorizationScope)))
  assert.match(prompt, new RegExp(escapeRegExp(resolved.startUrl)))
  assert.doesNotMatch(prompt, /采集页面标题与链接|读取目标页标题|打开输入中的目标页并返回页面标题/)
}

function assertConformance(request: unknown, records: OracleRecord[], input: AcceptanceInput) {
  const trace = parseTrace(request), actions = trace.actions, facts = trace.observations.flatMap((item) => item.facts)
  const clicks = actions.filter((action) => action.name === "click")
  assert.equal(clicks.length, 17)
  assert.equal(actions[0]!.args.url, input.startUrl)
  assert.equal(actions.find((action) => action.name === "input")!.args.text, input.value)
  const repeated = clicks.slice(-3)
  assert.deepEqual(repeated.map((action) => action.args), [repeated[0]!.args, repeated[0]!.args, repeated[0]!.args])
  assertActionFactCompleteness(actions, facts)

  const clickCases = [{ caseId: "hit-a" }, { caseId: "hit-b" },
    { caseId: "shadow", oracleAction: "shadow-open" },
    { caseId: "shadow", oracleAction: "shadow-closed" }, { caseId: "frame-same-a" },
    { caseId: "frame-same-b" }, { caseId: "frame-cross" }, { caseId: "navigation" },
    { caseId: "dialog", oracleAction: "confirm-dialog" },
    { caseId: "dialog", oracleAction: "prompt-dialog" },
    { caseId: "dialog", oracleAction: "html-modal" },
    { caseId: "dialog", oracleAction: "html-modal-close" },
    { caseId: "popup", oracleAction: "popup-open" },
    { caseId: "popup-child", oracleAction: "popup-child" },
    { caseId: "final", occurrence: 0 }, { caseId: "final", occurrence: 1 }]
  clicks.slice(0, -1).forEach((action, index) => assertOracleParity(
    action, facts, records, clickCases[index]!.caseId, ["click"], clickCases[index]))
  assert.equal(eventsFor(facts, repeated[2]!.id).length, 0)
  assert.equal(dispatchFor(facts, repeated[2]!.id).eventCapture.status, "missing")

  const inputAction = actions.find((action) => action.name === "input")!
  const keyAction = actions.find((action) => action.name === "send_keys")!
  assertOracleParity(inputAction, facts, records, "input", ["beforeinput", "input", "change"],
    { oracleAction: "input-text" })
  assertOracleParity(keyAction, facts, records, "input",
    ["keydown", "keypress", "keyup", "beforeinput", "input", "change"],
    { oracleAction: "enter-key", inferActualAction: false })
  assert.equal(effectValues(records, "input-value").at(-1), input.value)
  assert.equal(effectValues(records, "enter-value").at(-1), input.value)

  const scrolls = actions.filter((action) => action.name === "scroll")
  assert.equal(scrolls.length, 2)
  assert.deepEqual(scrolls[0]!.args, { down: true, pages: 1 })
  assert.equal(typeof scrolls[1]!.args.index, "number")
  assertOracleParity(scrolls[0]!, facts, records, "scroll", ["scroll"], { oracleAction: "page-scroll" })
  assertOracleParity(scrolls[1]!, facts, records, "scroll", ["scroll"], { oracleAction: "container-scroll" })
  assert.ok(Number(effectValues(records, "page-scroll")[0]) > 0)
  assert.ok(Number(effectValues(records, "container-scroll")[0]) > 0)
  assert.deepEqual(effectValues(records, "lazy-inserted"), ["Loaded after scroll"])

  const optionsAction = actions.find((action) => action.name === "dropdown_options")!
  const selectAction = actions.find((action) => action.name === "select_dropdown")!
  assert.equal(optionsAction.args.index, selectAction.args.index)
  assert.equal(selectAction.args.text, "Air Express")
  assertOracleParity(selectAction, facts, records, "select", ["input", "change"],
    { oracleAction: "native-select" })
  assert.deepEqual(eventsFor(facts, selectAction.id).map((event) => event.event.isTrusted), [false, false])
  assert.equal(effectValues(records, "select-value").at(-1), "change:false:air")

  assert.deepEqual(effectValues(records, "confirm-result"), ["true"])
  assert.deepEqual(effectValues(records, "prompt-result"), ["null"])
  assert.deepEqual(dialogDelta(clicks[8]!, trace.observations), ["[confirm] confirm-token"])
  assert.deepEqual(dialogDelta(clicks[9]!, trace.observations), ["[prompt] prompt-token"])

  const popupClick = clicks[12]!, childClick = clicks[13]!
  const popupBefore = contextFor(popupClick, trace.observations, "pre")
  const popupAfter = contextFor(popupClick, trace.observations, "post")
  assert.equal(popupAfter.tabs.length, popupBefore.tabs.length + 1)
  assert.equal(focusedUrl(popupAfter), input.popupChildUrl)
  const switches = actions.filter((action) => action.name === "switch")
  assert.deepEqual(switches.map((action) => focusedUrl(contextFor(action, trace.observations, "post"))),
    [input.popupUrl, input.popupChildUrl])
  const closeAction = actions.find((action) => action.name === "close")!
  const closeAfter = contextFor(closeAction, trace.observations, "post")
  assert.equal(focusedUrl(closeAfter), input.popupUrl)
  assert.ok(!closeAfter.tabs.some((tab) => tab.url === input.popupChildUrl))
  assertOracleParity(popupClick, facts, records, "popup", ["click"], { oracleAction: "popup-open" })
  assertOracleParity(childClick, facts, records, "popup-child", ["click"], { oracleAction: "popup-child" })

  assert.deepEqual(effectValues(records, "repeat-final"), ["1", "2"])
  for (const effect of expectedEffects.filter((value) => !["repeat-final", "input-value"].includes(value))) {
    assert.equal(records.filter((item) => item.kind === "effect" && item.effect === effect).length, 1, effect)
  }
  const hitA = eventsFor(facts, clicks[0]!.id)
  assert.deepEqual(hitA.map((event) => event.event.isTrusted), [true, false])
  assert.equal(new Set(hitA.map((event) => event.documentId)).size, 1)
  const finalEvents = [...eventsFor(facts, repeated[0]!.id), ...eventsFor(facts, repeated[1]!.id)]
  assert.equal(new Set(finalEvents.map((event) => event.documentId)).size, 1)

  const openShadow = eventsFor(facts, clicks[2]!.id)[0]!, closedShadow = eventsFor(facts, clicks[3]!.id)[0]!
  assert.ok(openShadow.graph.composedPath.some((part) => part.kind === "shadow_root"))
  assert.ok(!closedShadow.graph.nodes.some((node) => node.attributes["data-closed-internal"] === "true"))
  const frameEvents = clicks.slice(4, 7).map((action) => eventsFor(facts, action.id)[0]!)
  assert.ok(frameEvents.every((event) => event.scope.isTop === false && typeof event.scope.frameId === "string"))
  assert.equal(frameEvents[0]!.scope.frameId, frameEvents[1]!.scope.frameId)
  assert.notEqual(frameEvents[0]!.documentId, frameEvents[1]!.documentId)
  assert.notEqual(frameEvents[1]!.scope.frameId, frameEvents[2]!.scope.frameId)

  const inputBindings = facts.filter((fact) => fact.kind === "natural_binding"
    && factRecord(fact).actionRef === inputAction.id && factRecord(fact).argumentPath === "text")
  assert.ok(inputBindings.every((fact) => (factRecord(fact).binding as Record<string, unknown>).source !== "input"))
}

type BrowserContext = { focusTargetId: string | null; tabs: Array<{ targetId: string; url: string | null }>;
  closedPopupMessages: string[] }

function contextFor(action: Action, observations: Observation[], phase: "pre" | "post") {
  const id = phase === "pre" ? action.preObservationRef : action.postObservationRef
  const observation = observations.find((item) => item.id === id)
  const fact = observation?.facts.find((item) => item.kind === "browser_context")
  assert.ok(fact, `${action.id}:${phase}:browser_context`)
  return factRecord(fact) as BrowserContext
}

function dialogDelta(action: Action, observations: Observation[]) {
  const before = [...contextFor(action, observations, "pre").closedPopupMessages]
  return contextFor(action, observations, "post").closedPopupMessages.filter((message) => {
    const index = before.indexOf(message)
    if (index < 0) return true
    before.splice(index, 1)
    return false
  })
}

function focusedUrl(context: BrowserContext) {
  return context.tabs.find((tab) => tab.targetId === context.focusTargetId)?.url
}

function assertActionFactCompleteness(actions: Action[], facts: Fact[]) {
  const dispatches = facts.filter((fact) => fact.kind === "native_action_dispatch")
  const results = facts.filter((fact) => fact.kind === "native_action_result")
  assert.equal(dispatches.length, actions.length)
  assert.equal(results.length, actions.length)
  for (const action of actions) {
    const dispatch = dispatchFor(facts, action.id)
    const result = factRecord(results.find((fact) => factRecord(fact).actionRef === action.id)!)
    assert.deepEqual((result.resultRef as { digest: string }).digest, action.resultRef!.digest)
    assert.equal(dispatch.actionRef, action.id)
  }
  assert.ok(results.some((fact) => {
    const result = factRecord(fact).result as Record<string, unknown>
    return result.metadata && typeof result.metadata === "object"
  }))
}

function assertOracleParity(action: Action, facts: Fact[], records: OracleRecord[], caseId: string,
  eventTypes: string[], options: { oracleAction?: string; occurrence?: number; inferActualAction?: boolean } = {}) {
  const actual = eventsFor(facts, action.id).filter((event) => eventTypes.includes(String(event.event.type))
    && (!options.oracleAction || options.inferActualAction === false
      || actualOracleAction(event) === options.oracleAction))
    .sort((left, right) => left.sequence - right.sequence)
  let oracle = records.filter((item): item is OracleEvent => item.kind === "event" && item.caseId === caseId
    && eventTypes.includes(item.type) && (!options.oracleAction || item.action === options.oracleAction))
    .sort((left, right) => left.sequence - right.sequence)
  if (options.occurrence !== undefined) oracle = oracle.slice(options.occurrence, options.occurrence + 1)
  assert.deepEqual(actual.map(eventSignature), oracle.map(oracleSignature), `${action.id}:${caseId}`)
  assert.ok(actual.length > 0, `${action.id}:${caseId}:no_event`)
  actual.forEach((event, index) => {
    assertLocalEventGraph(event)
    const marker = event.graph.nodes.find((node) => node.tag === "html")?.attributes["data-oracle-document"]
    if (marker !== undefined) assert.equal(marker, oracle[index]!.documentId)
    else {
      assert.equal(event.graph.target?.kind, "document")
      assert.equal(event.graph.target?.documentId, event.documentId)
      assert.equal(event.scope.url, oracle[index]!.href)
    }
  })
}

function eventSignature(event: ActualEvent) {
  const nodes = new Map(event.graph.nodes.map((node) => [node.id, node.tag]))
  const target = event.graph.targetRef ? nodes.get(event.graph.targetRef) ?? ""
    : graphPartName(event.graph.target, nodes)
  const path = event.graph.composedPath.map((part) => part.kind === "element" ? nodes.get(String(part.ref)) ?? ""
    : part.kind === "shadow_root" ? "#document-fragment" : part.kind === "document" ? "#document"
      : part.kind === "window" ? "window" : "")
  return { type: String(event.event.type), target, trusted: event.event.isTrusted === true, path }
}

function actualOracleAction(event: ActualEvent) {
  if (event.event.type === "scroll" && event.graph.target?.kind === "document") return "page-scroll"
  if (["keydown", "keypress", "keyup"].includes(String(event.event.type))
      && (event.event.data as Record<string, unknown> | undefined)?.key === "Enter") return "enter-key"
  const nodes = new Map(event.graph.nodes.map((node) => [node.id, node]))
  for (const part of event.graph.composedPath) {
    if (part.kind !== "element") continue
    const marker = nodes.get(String(part.ref))?.attributes["data-oracle-action"]
    if (marker) return marker
  }
  return null
}

function graphPartName(part: Record<string, unknown> | undefined, nodes: Map<string, string>) {
  if (!part) return ""
  if (part.kind === "element") return nodes.get(String(part.ref)) ?? ""
  if (part.kind === "shadow_root") return "#document-fragment"
  if (part.kind === "document") return "#document"
  if (part.kind === "window") return "window"
  return ""
}

function oracleSignature(event: OracleEvent) {
  return { type: event.type, target: event.target, trusted: event.trusted, path: event.path }
}

function parseTrace(request: unknown) {
  return z.object({ trace: z.object({ actions: z.array(z.object({ id: z.string(), name: z.string(),
    args: z.record(z.string(), z.unknown()), resultRef: z.object({ digest: z.string() }).nullable(),
    preObservationRef: z.string().nullable(), postObservationRef: z.string().nullable() })),
  observations: z.array(z.object({ id: z.string(), facts: z.array(z.object({ kind: z.string(),
    value: z.json() })) })) }) }).parse(request).trace as {
      actions: Action[]; observations: Observation[] }
}

function factRecord(fact: Fact) {
  assert.ok(fact.value && typeof fact.value === "object" && !Array.isArray(fact.value), `${fact.kind}:record`)
  return fact.value as Record<string, unknown>
}

function eventsFor(facts: Fact[], actionRef: string) {
  return facts.filter((fact) => fact.kind === "native_dom_event" && factRecord(fact).actionRef === actionRef)
    .map((fact) => factRecord(fact).actual as ActualEvent)
}

function dispatchFor(facts: Fact[], actionRef: string) {
  return factRecord(facts.find((fact) => fact.kind === "native_action_dispatch"
    && factRecord(fact).actionRef === actionRef)!) as {
    actionRef: string; eventCapture: { status: string; eventExpectation: string; eventCount: number } }
}

const expectedEffects = ["hit-a", "hit-b", "shadow-open", "shadow-closed", "frame-same-a", "frame-same-b",
  "frame-cross", "navigate", "input-value", "enter-value", "page-scroll", "lazy-inserted", "container-scroll",
  "select-input", "select-value", "confirm-result", "prompt-result", "modal-open", "modal-close",
  "popup-opened", "popup-child", "repeat-final"]

function hasEffects(records: OracleRecord[], expected: string[]) {
  return expected.every((effect) => records.some((item) => item.kind === "effect" && item.effect === effect))
}

function effectValues(records: OracleRecord[], effect: string) {
  return records.filter((item): item is OracleEffect => item.kind === "effect" && item.effect === effect)
    .map((item) => item.value)
}

async function waitForOracle(read: () => Promise<OracleRecord[]>, expected: string[], timeout: number) {
  const started = Date.now()
  let records: OracleRecord[] = []
  while (Date.now() - started < timeout) {
    records = await read()
    if (hasEffects(records, expected)) return records
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return records
}

function eventFacts(request: unknown) {
  return parseTrace(request).observations.flatMap((item) => item.facts)
    .filter((fact) => fact.kind === "native_dom_event")
}

function actionFacts(request: unknown) {
  return parseTrace(request).observations.flatMap((item) => item.facts)
    .filter((fact) => fact.kind === "native_action_dispatch" || fact.kind === "native_action_result")
}

function contextFacts(request: unknown) {
  return parseTrace(request).observations.flatMap((item) => item.facts)
    .filter((fact) => fact.kind === "browser_context")
}

function sourceBodies(repository: { artifact(taskId: string, artifactId: string): { body: unknown } },
  taskId: string, exploration: unknown) {
  const parsed = z.object({ sources: z.array(z.object({ artifact: z.object({ artifactId: z.string() }) })) })
    .safeParse(exploration)
  return parsed.success ? parsed.data.sources.map((source) => readHybridSourceArtifact(
    repository.artifact(taskId, source.artifact.artifactId).body)) : []
}


async function persistAcceptanceEvidence(status: "success" | "failure", value: unknown) {
  const directory = path.join(projectRoot, "work", "action-context-acceptance")
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, `latest-${status}.json`), JSON.stringify(value, null, 2), "utf8")
}

function serializeError(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { value: error }
}
