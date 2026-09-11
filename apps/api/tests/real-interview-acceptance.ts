// 显式真实采访验收入口；只写 work 下隔离 ProductStore，复用现有 managed AI 存储，不启动浏览器或后续阶段。
import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createAI, localStore, parseModelSelection, type AI } from "@agent-platform/ai-connect/server"
import { CommonContentUIProtocol } from "@agent-platform/ai-connect/ui-contracts"
import { emptyInterview, type InterviewState } from "@browser-capture/contracts/interview"
import { createApplication, SHARED_AI_SUBJECT } from "../src/app.js"
import { assertAcceptanceDraftQuality } from "./interview-acceptance-quality.js"
import { createInterviewMainAuthoring, loadInterviewSkill } from "../src/interview/protocol.js"
import { interviewAcceptanceCases, type InterviewAcceptanceCase } from "./interview-acceptance-cases.js"
import { interviewWeakEvaluationCases } from "./interview-weak-evaluation-cases.js"

const root = fileURLToPath(new URL("../../../", import.meta.url))
if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error(`验收固定使用 Node 24，实际为 ${process.versions.node}`)
const argumentsMap = parseArguments(process.argv.slice(2))
const maximumCalls = argumentsMap.maxCalls === undefined ? undefined : Number(argumentsMap.maxCalls)
if (maximumCalls !== undefined && (!Number.isInteger(maximumCalls) || maximumCalls < 1)) {
  throw new Error("--max-calls 必须是正整数")
}
if (argumentsMap.preflight && (argumentsMap.real || argumentsMap.all || argumentsMap.caseId || argumentsMap.weakId)) {
  throw new Error("--preflight 不得与 --real、--case 或 --all 同时使用")
}
if (argumentsMap.skipIds.length && !argumentsMap.all) throw new Error("--skip 只能与 --all 配合使用")
if (argumentsMap.resume && (!argumentsMap.real || argumentsMap.preflight || argumentsMap.all || !(argumentsMap.caseId || argumentsMap.weakId))) {
  throw new Error("--resume 必须与 --real、单个 --case 配合使用")
}
if (!argumentsMap.preflight && !argumentsMap.real) throw new Error("真实模型验收需要显式 --real")
const targetCount = Number(argumentsMap.all) + Number(Boolean(argumentsMap.caseId)) + Number(Boolean(argumentsMap.weakId))
if (!argumentsMap.preflight && targetCount !== 1) throw new Error("必须且只能指定 --case=<id>、--weak=<A|B> 或 --all")
if (!argumentsMap.useLiveSelection && !argumentsMap.expectedConnection) {
  throw new Error("必须提供 --expected-connection=<connectionId>，或显式使用 --use-live-selection")
}

const liveBase = argumentsMap.userApi ?? "http://127.0.0.1:4175"
const expectedSelection = argumentsMap.useLiveSelection
  ? await readLiveSelection(liveBase)
  : parseModelSelection({
    connectionId: argumentsMap.expectedConnection,
    modelId: argumentsMap.expectedModel ?? "gpt-5.6-terra",
    reasoningEffort: argumentsMap.expectedEffort ?? "medium",
  })
const weakCase = argumentsMap.weakId
  ? interviewWeakEvaluationCases[argumentsMap.weakId.toUpperCase() === "A" ? 0 : argumentsMap.weakId.toUpperCase() === "B" ? 1 : -1]
  : undefined
if (argumentsMap.weakId && !weakCase) throw new Error(`未知弱表达轨迹：${argumentsMap.weakId}`)
const selectedCases = argumentsMap.preflight ? [] : weakCase ? [weakCase] : argumentsMap.all
  ? interviewAcceptanceCases.filter((scenario) => !argumentsMap.skipIds.includes(scenario.id))
  : interviewAcceptanceCases.filter((scenario) => scenario.id === argumentsMap.caseId)
if (!argumentsMap.preflight && !selectedCases.length) throw new Error(`未知验收场景：${argumentsMap.caseId}`)

const freshRunId = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`
const workRoot = path.resolve(root, "work")
const directory = argumentsMap.resume ? path.resolve(argumentsMap.resume) : path.join(workRoot, `interview-acceptance-${freshRunId}`)
if (directory !== workRoot && !directory.startsWith(`${workRoot}${path.sep}`)) throw new Error("--resume 只能指向仓库 work 下的隔离验收目录")
const artifactPath = path.join(directory, "acceptance.json")
await mkdir(directory, { recursive: true })

const artifact: AcceptanceArtifact = argumentsMap.resume
  ? JSON.parse(await readFile(artifactPath, "utf8")) as AcceptanceArtifact
  : {
  runId: freshRunId,
  mode: argumentsMap.preflight ? "preflight" : "real",
  runtime: { node: process.versions.node, execPath: process.execPath },
  startedAt: new Date().toISOString(),
  completedAt: null,
  selection: { connectionIdHash: digest(expectedSelection.connectionId), modelId: expectedSelection.modelId, reasoningEffort: expectedSelection.reasoningEffort },
  userStateBefore: null,
  userStateAfter: null,
  userStateUnchanged: null,
  provenance: null,
  cases: [],
}
artifact.mode = argumentsMap.preflight ? "preflight" : "real"
artifact.completedAt = null
delete artifact.failure

let service: Awaited<ReturnType<typeof createApplication>> | undefined
let ai: AI | undefined
let isolatedBase: string | undefined
try {
  const liveSelection = await readLiveSelection(liveBase)
  if (JSON.stringify(liveSelection) !== JSON.stringify(expectedSelection)) throw new Error("正式工作台当前模型选择与验收要求不一致，已停止。")
  artifact.userStateBefore = await digestLiveUserState(liveBase)
  artifact.provenance = await capturePromptProvenance(root)

  ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
  service = await createApplication({
    root,
    directory,
    ai,
    planExecutor: null,
    browserExecutor: async () => { throw new Error("interview_acceptance_browser_forbidden") },
  })
  // WHY：只在隔离 SQLite 中复制已核验的非敏感选择；凭据仍由原 managed AI 存储持有，正式设置不被写入。
  service.store.saveSharedModelSelection(SHARED_AI_SUBJECT, expectedSelection)
  isolatedBase = await service.app.listen({ host: "127.0.0.1", port: 0 })
  process.stdout.write(`RUN ${artifact.runId} ${selectedCases.length} cases${argumentsMap.resume ? " resume" : ""}\n`)
  for (const scenario of selectedCases) {
    const previous = artifact.cases.find((item) => item.id === scenario.id)
    const result = await runScenario(service, isolatedBase, scenario, previous, maximumCalls)
    const index = artifact.cases.findIndex((item) => item.id === scenario.id)
    if (index >= 0) artifact.cases[index] = result
    else artifact.cases.push(result)
    await persistArtifact(artifactPath, artifact)
    process.stdout.write(`CASE ${JSON.stringify(summarizeCase(result))}\n`)
  }
} catch (error) {
  artifact.failure = publicError(error)
} finally {
  if (service) await service.app.close().catch(() => {})
  else ai?.close()
  artifact.userStateAfter = await digestLiveUserState(liveBase).catch((error) => ({ error: publicError(error) }))
  artifact.userStateUnchanged = artifact.userStateBefore !== null
    && JSON.stringify(artifact.userStateBefore) === JSON.stringify(artifact.userStateAfter)
  artifact.completedAt = new Date().toISOString()
  await persistArtifact(artifactPath, artifact)
  process.stdout.write(`${JSON.stringify(summarizeArtifact(artifact))}\nEVIDENCE ${directory}\n`)
}
if (artifact.failure || artifact.cases.some((scenario) => scenario.status !== "passed") || !artifact.userStateUnchanged) process.exitCode = 1

async function runScenario(
  app: NonNullable<typeof service>,
  base: string,
  scenario: InterviewAcceptanceCase,
  previous?: CaseArtifact,
  maximumCalls?: number,
): Promise<CaseArtifact> {
  let taskId: string
  let result: CaseArtifact
  let input: string
  let answer: Answer | undefined
  let resumedCorrection = false
  if (previous) {
    taskId = previous.taskId
    result = { ...previous, status: "running", failure: null, failureKind: null }
    const state = app.store.snapshot(taskId)
    const draft = currentDraft(state)
    if (draft) {
      const correction = scenario.correctionAfterFirstDraft
      const correctionAlreadySent = correction && state.messages.some((message) => message.role === "user" && message.text === correction)
      if (correction && !correctionAlreadySent) {
        input = correction
        answer = undefined
        resumedCorrection = true
      } else {
        try {
          const expected = scenario.finalDraftMustContain ?? scenario.draftMustContain
          assertExpectedTermsWereSent(state, expected)
          assertContains(draft, expected)
          assertAcceptanceDraftQuality(scenario, draft, "final")
          await confirmDraft(base, taskId, state, draft.version)
          if (app.store.snapshot(taskId).confirmedVersion !== draft.version) throw new Error("草稿确认版本未持久化")
          await assertLaterStagesEmpty(base, taskId)
          return { ...result, status: "passed", confirmedVersion: draft.version, finalDraft: draft }
        } catch (error) {
          return { ...result, status: "failed", failure: publicError(error), failureKind: classifyFailure(error) }
        }
      }
    } else {
      const open = state.unresolved.find((item) => item.status === "open")
      if (!open) throw new Error("恢复的隔离任务没有待回答 Question")
      answer = resolveAnswer(scenario, open)
      result.questionKinds.push(answer.kind)
      input = answer.text
    }
  } else {
    const created = await isolatedRequest(base, "POST", "/api/tasks", { type: "create", requestId: randomUUID() })
    if (created.statusCode !== 200) throw new Error(`创建隔离任务失败：${created.statusCode}`)
    taskId = (created.body as { id: string }).id
    result = { id: scenario.id, taskId, status: "running", intentProfile: scenario.intentProfile,
      rounds: [], questionKinds: [], visibleConversation: [], confirmedVersion: null, finalDraft: null, failure: null, failureKind: null }
    input = scenario.initialInput
  }
  try {
    let corrected = resumedCorrection
    let exactRepeatCount = 0
    let previousQuestion = result.rounds.at(-1)?.question ? digest(result.rounds.at(-1)!.question) : null
    const usedFollowUps = new Set(result.rounds.flatMap((item) => {
      const previousAnswer = item.answer
      return previousAnswer?.kind === "selection" && previousAnswer.followUp ? [previousAnswer.followUp] : []
    }))
    const generationLimit = Math.min(scenario.maxRounds ?? 6, maximumCalls ?? Number.POSITIVE_INFINITY)
    for (let generation = result.rounds.length + 1; generation <= generationLimit; generation++) {
      const state = await submitMessage(app, base, taskId, input, answer)
      const round = roundArtifact(state, input, answer)
      result.rounds.push(round)
      result.visibleConversation = visibleConversation(state)
      assertSingleInvocation(round)
      const draft = currentDraft(state)
      if (draft) {
        const expected = corrected ? scenario.finalDraftMustContain ?? scenario.draftMustContain : scenario.draftMustContain
        assertExpectedTermsWereSent(state, expected)
        assertContains(draft, expected)
        assertAcceptanceDraftQuality(scenario, draft,
          corrected || !scenario.correctionAfterFirstDraft ? "final" : "initial")
        if (scenario.correctionAfterFirstDraft && !corrected) {
          corrected = true; input = scenario.correctionAfterFirstDraft; answer = undefined; continue
        }
        if (scenario.confirmDraft !== false) {
          await confirmDraft(base, taskId, state, draft.version)
          const confirmed = app.store.snapshot(taskId)
          if (confirmed.confirmedVersion !== draft.version) throw new Error("草稿确认版本未持久化")
          await assertLaterStagesEmpty(base, taskId)
          result.confirmedVersion = draft.version
        }
        result.finalDraft = draft; result.status = "passed"
        return result
      }
      const open = state.unresolved.find((item) => item.status === "open")
      if (!open) throw new Error("真实轮次既没有可确认草稿，也没有可回答 Question")
      const kind = normalizeQuestion(open.question).kind
      result.questionKinds.push(kind)
      const questionFingerprint = digest(open.question)
      exactRepeatCount = questionFingerprint === previousQuestion ? exactRepeatCount + 1 : 0
      previousQuestion = questionFingerprint
      if (exactRepeatCount >= 2) throw new Error("quality:连续两轮产生完全相同的问题")
      const resolved = resolveAnswer(scenario, open, usedFollowUps)
      if (resolved.kind === "selection" && resolved.followUp) usedFollowUps.add(resolved.followUp)
      input = resolved.text; answer = resolved
    }
    throw new Error(`超过本次${generationLimit}个真实生成轮次仍未形成可确认草稿`)
  } catch (error) {
    const state = app.store.snapshot(taskId)
    result.finalDraft = currentDraft(state) ?? result.finalDraft
    const turn = state.turns.at(-1)
    if (turn && !result.rounds.some((round) => round.revision === turn.revision)) {
      result.rounds.push(roundArtifact(state, input, answer))
    }
    result.visibleConversation = visibleConversation(state)
    result.status = "failed"; result.failure = publicError(error); result.failureKind = classifyFailure(error)
    return result
  }
}

async function submitMessage(app: NonNullable<typeof service>, base: string, taskId: string, text: string, answer?: Answer) {
  const before = app.store.snapshot(taskId)
  const response = await isolatedRequest(base, "POST", `/api/interview?taskId=${encodeURIComponent(taskId)}`,
    { type: "message", requestId: randomUUID(), expectedRevision: before.revision, text,
      ...(answer ? { answer: answer.kind === "selection"
        ? { type: "common_question", questionId: answer.questionId, surfaceSubmit: { displayText: answer.text,
            answers: [{ questionId: answer.questionId, data: { selectedOptionIds: answer.optionIds,
              ...(answer.followUp ? { inputValues: { other: answer.followUp } } : {}) } }] } }
        : { type: "free_text", questionId: answer.questionId, text: answer.text } } : {}) })
  if (response.statusCode !== 202) throw new Error(`采访命令失败：${response.statusCode}`)
  const active = app.store.snapshot(taskId).activeTurnId
  if (!active) throw new Error("采访命令没有创建活动轮次")
  const timedOut = await Promise.race([app.coordinator.waitForIdle().then(() => false), wait(120_000).then(() => true)])
  if (timedOut) {
    app.coordinator.dispatch(taskId, { type: "cancel", turnId: active })
    await app.coordinator.waitForIdle()
    throw new Error("真实采访单轮超过120秒，已停止且未重试")
  }
  const state = app.store.snapshot(taskId)
  if (state.turns.at(-1)?.status !== "succeeded") throw new Error(`真实采访轮次失败：${state.turns.at(-1)?.reason ?? "unknown"}`)
  return state
}

function resolveAnswer(scenario: InterviewAcceptanceCase, item: InterviewState["unresolved"][number], usedFollowUps = new Set<string>()): Answer {
  const question = normalizeQuestion(item.question)
  if (question.kind === "free_form") {
    const rule = scenario.freeTextRules.find((candidate) => includesAny(question.prompt, candidate.promptIncludes))
    if (!rule) throw new Error(`冻结 persona 未定义自由输入事实：${question.prompt}`)
    return { kind: "free_form", questionId: item.id, text: rule.answer,
      source: `prompt_rule:${rule.promptIncludes.join("|")}` }
  }
  if (scenario.answerStrategy === "recommended") {
    const recommended = question.options.filter((option) => option.recommended)
    if (recommended.length !== 1) throw new Error(`真实问题没有唯一推荐方向：${question.prompt}`)
    const recommendedSurfaceText = [question.prompt, recommended[0]!.label, recommended[0]!.description].join(" ")
    const followUp = scenario.recommendedFollowUpRules?.find((rule) => !usedFollowUps.has(rule.value)
      && includesAny(recommendedSurfaceText, rule.promptIncludes))?.value
    return { kind: "selection", mode: question.kind, questionId: item.id,
      labels: [recommended[0]!.label], optionIds: [recommended[0]!.id], ...(followUp ? { followUp } : {}),
      text: followUp ? `${recommended[0]!.label}\n其他补充：${followUp}` : recommended[0]!.label,
      source: "question_recommendation" }
  }
  const matchingRules = scenario.choiceRules.filter((candidate) => includesAny(question.prompt, candidate.promptIncludes))
  const preferred = matchingRules.flatMap((rule) => rule.preferredOptionIncludes)
  const scored = question.options.map((option) => ({ option, score: preferred.filter((term) => includes(option.label + " " + option.description, term)).length }))
    .sort((left, right) => right.score - left.score)
  if (!scored[0] || scored[0].score < 1 || scored[0].score === scored[1]?.score) {
    throw new Error(`冻结 persona 无法唯一回答选择题：${question.prompt}`)
  }
  const rule = matchingRules.find((candidate) => candidate.preferredOptionIncludes.some((term) =>
    includes(scored[0]!.option.label + " " + scored[0]!.option.description, term)))
  const followUp = rule?.followUp
  return { kind: "selection", mode: question.kind, questionId: item.id, labels: [scored[0].option.label], optionIds: [scored[0].option.id],
    ...(followUp ? { followUp } : {}), text: followUp ? `${scored[0].option.label}\n其他补充：${followUp}` : scored[0].option.label,
    source: `unique_semantic_match:${preferred.join("|")}` }
}

function normalizeQuestion(question: InterviewState["unresolved"][number]["question"]) {
  if ("prompt" in question) return { kind: question.options.length ? "choice" as const : "free_form" as const,
    prompt: question.prompt, options: question.options.map((option, index) => ({ id: `option:${index + 1}`, ...option })) }
  if (question.type === "choice" || question.type === "multi_choice") return { kind: question.type, prompt: question.data.stem,
    options: question.data.options.map((option) => ({ id: option.id, label: option.label,
      description: option.subtitle ?? "", recommended: option.recommended ?? false })) }
  return { kind: "free_form" as const, prompt: question.data.stem, options: [] }
}

async function confirmDraft(base: string, taskId: string, state: InterviewState, version: number) {
  const response = await isolatedRequest(base, "POST", `/api/interview?taskId=${encodeURIComponent(taskId)}`,
    { type: "confirm", requestId: randomUUID(), expectedRevision: state.revision, version })
  if (response.statusCode !== 200) throw new Error(`草稿确认失败：${response.statusCode}`)
}

async function assertLaterStagesEmpty(base: string, taskId: string) {
  const states = await Promise.all(["browser", "plan", "chains"].map(async (surface) =>
    (await isolatedRequest(base, "GET", `/api/${surface}?taskId=${encodeURIComponent(taskId)}`)).body))
  const [browser, plan, chains] = states as Array<Record<string, unknown>>
  if (browser?.record || (plan?.records as unknown[])?.length
    || (plan?.executions as unknown[])?.length || (chains?.records as unknown[])?.length) {
    throw new Error("采访验收意外产生了浏览器、计划或链路记录")
  }
}

function roundArtifact(state: InterviewState, input: string, answer?: Answer): RoundArtifact {
  const turn = state.turns.at(-1)!
  const message = state.messages.find((item) => item.id === turn.assistantMessageId)!
  const events = message.aiEvents ?? []
  return { revision: turn.revision, input, answer: answer ?? null, question: message.question, draftVersion: message.draftVersion,
    status: turn.status, startedAt: turn.createdAt, completedAt: turn.completedAt,
    durationMs: turn.completedAt ? Date.parse(turn.completedAt) - Date.parse(turn.createdAt) : null,
    invocationIds: [...new Set(events.flatMap((event) => "invocationId" in event ? [String(event.invocationId)] : []))],
    modelEvents: events.filter((event) => event.type === "generation.started" || event.type === "generation.completed") }
}

function visibleConversation(state: InterviewState) {
  return state.messages.map((message) => ({ role: message.role, text: message.text, status: message.status,
    question: message.question, draftVersion: message.draftVersion }))
}

function assertSingleInvocation(round: RoundArtifact) {
  if (round.invocationIds.length !== 1) throw new Error(`单轮模型 invocation 数量不是1：${round.invocationIds.length}`)
  const completed = round.modelEvents.filter((event): event is { type: "generation.completed"; modelId: string } =>
    typeof event === "object" && event !== null && "type" in event && event.type === "generation.completed" && "modelId" in event)
  if (completed.length !== 1 || completed[0]!.modelId !== expectedSelection.modelId) {
    throw new Error(`单轮模型完成事件与冻结选择不一致：${completed.map((event) => event.modelId).join(",") || "missing"}`)
  }
}

function currentDraft(state: InterviewState) {
  const draft = state.drafts.at(-1)
  return draft?.revision === state.revision ? draft : undefined
}

function assertContains(value: unknown, terms: readonly string[]) {
  const text = JSON.stringify(value).toLocaleLowerCase("zh-CN")
  const missing = terms.filter((term) => !containsSemanticEquivalent(text, term))
  if (missing.length) throw new Error(`草稿丢失冻结意图：${missing.join("、")}`)
}

function assertExpectedTermsWereSent(state: InterviewState, terms: readonly string[]) {
  const userText = state.messages.filter((message) => message.role === "user").map((message) => message.text).join("\n")
    .toLocaleLowerCase("zh-CN")
  const hidden = terms.filter((term) => !containsSemanticEquivalent(userText, term))
  if (hidden.length) throw new Error(`fixture:草稿断言对应事实从未由用户发送：${hidden.join("、")}`)
}

function containsSemanticEquivalent(normalizedText: string, term: string) {
  const normalizedTerm = term.toLocaleLowerCase("zh-CN")
  if (normalizedText.includes(normalizedTerm)) return true
  const compactText = normalizedText.replaceAll(/\s/g, "")
  if (compactText.includes(normalizedTerm.replaceAll(/\s/g, ""))) return true
  if (term === "第一条" && compactText.includes("第1条")) return true
  if (term === "两个人" && compactText.includes("2人")) return true
  return term === "180" && ["3分钟", "03:00", "3 分钟"].some((value) => normalizedText.includes(value))
}

function classifyFailure(error: unknown): CaseArtifact["failureKind"] {
  const message = publicError(error)
  if (message.startsWith("冻结 persona")) return "fixture_needs_input"
  if (message.startsWith("fixture:")) return "harness"
  if (message.startsWith("真实采访轮次失败")) return "model_or_product"
  if (message.startsWith("quality:")) return "quality"
  if (message.startsWith("草稿丢失冻结意图")) return "automatic_assertion"
  return "harness"
}

async function readLiveSelection(base: string) {
  const value = await liveJson(`${base}/api/model-settings`) as { selection?: unknown }
  return parseModelSelection(value.selection)
}

async function digestLiveUserState(base: string) {
  const tasks = await liveJson(`${base}/api/tasks`) as { tasks?: Array<{ id: string }> } | Array<{ id: string }>
  const list = Array.isArray(tasks) ? tasks : tasks.tasks ?? []
  const surfaces = ["interview", "browser", "plan", "chains"]
  const values: string[] = []
  for (const task of [...list].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const surface of surfaces) values.push(`${task.id}:${surface}:${digest(await liveJson(`${base}/api/${surface}?taskId=${task.id}`))}`)
  }
  return { taskCount: list.length, digest: digest(values) }
}

async function liveJson(url: string) {
  const origin = new URL(url).origin
  const response = await fetch(url, { headers: { origin, "sec-fetch-site": "same-origin" }, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`正式工作台只读核验失败：${new URL(url).pathname} ${response.status}`)
  return response.json()
}

async function isolatedRequest(base: string, method: "GET" | "POST", pathname: string, payload?: unknown) {
  const response = await fetch(new URL(pathname, base), {
    method,
    headers: { origin: base, "sec-fetch-site": "same-origin", ...(payload === undefined ? {} : { "content-type": "application/json" }) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    signal: AbortSignal.timeout(10_000),
  })
  return { statusCode: response.status, body: await response.json() as unknown }
}

async function capturePromptProvenance(repositoryRoot: string): Promise<PromptProvenance> {
  const skillPath = path.join(repositoryRoot, ".agents", "skills", "interview-browser-task", "SKILL.md")
  const protocolPath = path.join(repositoryRoot, "apps", "api", "src", "interview", "protocol.ts")
  const skill = loadInterviewSkill(repositoryRoot)
  const prompt = createInterviewMainAuthoring(structuredClone(emptyInterview), skill, {
    schemaVersion: 1,
    packages: [CommonContentUIProtocol],
  }).prompt
  const requiredHostInstructions = ["Enabled Question modes: choice, multi_choice.", "For choice and multi_choice, emit at least 2 meaningful question-option children."]
  const missing = requiredHostInstructions.filter((item) => !prompt.includes(item))
  if (missing.length) throw new Error(`host authoring prompt 缺少冻结协议：${missing.join("、")}`)
  const captureExamples = prompt.match(/<interview-result>[\s\S]*?<\/interview-result>/g) ?? []
  const markdownExamples = prompt.match(/<interview-markdown\b[^>]*>[\s\S]*?<\/interview-markdown>/g) ?? []
  if (captureExamples.length !== 1 || markdownExamples.length !== 1) {
    throw new Error(`草稿指令示例数量无效：capture=${captureExamples.length}, markdown=${markdownExamples.length}`)
  }
  const packagePath = path.join(repositoryRoot, "apps", "api", "package.json")
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { dependencies?: Record<string, string> }
  const vendorSpec = packageJson.dependencies?.["@agent-platform/ai-connect"]
  if (!vendorSpec?.startsWith("file:")) throw new Error("AIConnect 依赖不是可核验的本地 vendor tar")
  const vendorPath = path.resolve(path.dirname(packagePath), vendorSpec.slice("file:".length))
  return {
    vendorTar: path.basename(vendorPath),
    vendorTarSha256: digestBytes(await readFile(vendorPath)),
    skillSha256: digestBytes(await readFile(skillPath)),
    protocolSourceSha256: digestBytes(await readFile(protocolPath)),
    protocolSourceMtime: (await stat(protocolPath)).mtime.toISOString(),
    generatedPromptSha256: digestBytes(Buffer.from(prompt)),
    requiredHostInstructions,
    captureExample: captureExamples[0]!,
    markdownExample: markdownExamples[0]!,
    interviewResultPromptLines: prompt.split("\n").filter((line) => line.includes("interview-result")),
  }
}

function parseArguments(values: string[]) {
  const named = (name: string) => values.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1)
  return { preflight: values.includes("--preflight"), real: values.includes("--real"), all: values.includes("--all"), caseId: named("--case"), weakId: named("--weak"),
    useLiveSelection: values.includes("--use-live-selection"),
    maxCalls: named("--max-calls"),
    skipIds: (named("--skip") ?? "").split(",").filter(Boolean),
    expectedConnection: named("--expected-connection"), expectedModel: named("--expected-model"),
    expectedEffort: named("--expected-effort"), userApi: named("--user-api"), resume: named("--resume") }
}

function includes(value: string, term: string) {
  return value.toLocaleLowerCase("zh-CN").includes(term.toLocaleLowerCase("zh-CN"))
}
function includesAny(value: string, terms: readonly string[]) { return terms.some((term) => includes(value, term)) }
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex") }
function digestBytes(value: Uint8Array) { return createHash("sha256").update(value).digest("hex") }
function wait(milliseconds: number) { return new Promise<void>((resolve) => setTimeout(resolve, milliseconds)) }
function publicError(error: unknown) { return error instanceof Error ? error.message : "unknown_error" }
function summarizeArtifact(value: AcceptanceArtifact) {
  return { runId: value.runId, cases: value.cases.map(summarizeCase),
    userStateUnchanged: value.userStateUnchanged, failure: value.failure ?? null }
}
function summarizeCase(value: CaseArtifact) {
  return { id: value.id, status: value.status, rounds: value.rounds.length, questionKinds: value.questionKinds,
    invocations: value.rounds.reduce((total, round) => total + round.invocationIds.length, 0), failureKind: value.failureKind,
    failure: value.failure }
}
async function persistArtifact(target: string, value: AcceptanceArtifact) {
  await writeFile(target, JSON.stringify(value, null, 2))
}

type Answer = { kind: "selection"; mode: "choice" | "multi_choice"; questionId: string; text: string; labels: string[]; optionIds: string[]; followUp?: string; source: string }
  | { kind: "free_form"; questionId: string; text: string; source: string }
type RoundArtifact = { revision: number; input: string; answer: Answer | null; question: unknown; draftVersion: number | null; status: string;
  startedAt: string; completedAt: string | null; durationMs: number | null; invocationIds: string[]; modelEvents: unknown[] }
type CaseArtifact = { id: string; taskId: string; status: "running" | "passed" | "failed"; intentProfile: string; rounds: RoundArtifact[]; visibleConversation: Array<{ role: string; text: string; status: string; question: unknown; draftVersion: number | null }>;
  questionKinds: string[]; confirmedVersion: number | null; finalDraft: unknown; failure: string | null;
  failureKind: "fixture_needs_input" | "model_or_product" | "quality" | "automatic_assertion" | "harness" | null }
type PromptProvenance = { vendorTar: string; vendorTarSha256: string; skillSha256: string; protocolSourceSha256: string;
  protocolSourceMtime: string; generatedPromptSha256: string; requiredHostInstructions: string[]; captureExample: string;
  markdownExample: string; interviewResultPromptLines: string[] }
type AcceptanceArtifact = { runId: string; mode: "preflight" | "real"; startedAt: string; completedAt: string | null;
  runtime: { node: string; execPath: string };
  selection: { connectionIdHash: string; modelId: string; reasoningEffort: string }; userStateBefore: unknown; userStateAfter: unknown;
  userStateUnchanged: boolean | null; provenance: PromptProvenance | null; cases: CaseArtifact[]; failure?: string }
