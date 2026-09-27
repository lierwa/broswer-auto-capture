import type Database from "better-sqlite3"
import {
  CONTRACT_VERSION, legacyRunnableTaskReleaseSchema, runnableTaskReleaseSchema, taskChainSchema,
  taskDraftSchema, taskExecutionCandidateSchema, taskExecutionSchema, taskPlanSchema,
  type ChainPresentationContent, type RunnableTaskRelease, type TaskChain, type TaskDraftContent,
  type TaskExecution, type VersionReference,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { createChainPresentation } from "../task-chain/presentation.js"

const schema = `
CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, renamed INTEGER NOT NULL, archived INTEGER NOT NULL,
  updatedAt TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), sequence INTEGER NOT NULL CHECK(sequence >= 0),
  confirmedVersion INTEGER, activeTurnId TEXT);
CREATE TABLE messages (taskId TEXT NOT NULL REFERENCES tasks(id), id TEXT NOT NULL, ordinal INTEGER NOT NULL,
  body TEXT NOT NULL CHECK(json_valid(body)), PRIMARY KEY(taskId,id), UNIQUE(taskId,ordinal));
CREATE TABLE drafts (taskId TEXT NOT NULL REFERENCES tasks(id), version INTEGER NOT NULL, revision INTEGER NOT NULL,
  title TEXT NOT NULL, markdown TEXT NOT NULL, brief TEXT CHECK(brief IS NULL OR json_valid(brief)), PRIMARY KEY(taskId,version));
CREATE TABLE turns (taskId TEXT NOT NULL REFERENCES tasks(id), id TEXT NOT NULL, revision INTEGER NOT NULL,
  userMessageId TEXT NOT NULL, assistantMessageId TEXT NOT NULL, status TEXT NOT NULL,
  reason TEXT, createdAt TEXT NOT NULL, completedAt TEXT, PRIMARY KEY(taskId,id), UNIQUE(taskId,revision));
CREATE UNIQUE INDEX one_active_interview ON turns ((1)) WHERE status IN ('running','cancelling');
CREATE TABLE questions (taskId TEXT NOT NULL REFERENCES tasks(id), id TEXT NOT NULL, revision INTEGER NOT NULL,
  question TEXT NOT NULL CHECK(json_valid(question)), status TEXT NOT NULL, answerMessageId TEXT, PRIMARY KEY(taskId,id));
CREATE TABLE decisions (taskId TEXT NOT NULL REFERENCES tasks(id), id TEXT NOT NULL, revision INTEGER NOT NULL,
  kind TEXT NOT NULL, text TEXT NOT NULL, messageId TEXT, questionId TEXT, draftVersion INTEGER, createdAt TEXT NOT NULL, PRIMARY KEY(taskId,id));
CREATE TABLE audits (taskId TEXT NOT NULL REFERENCES tasks(id), ordinal INTEGER NOT NULL, revision INTEGER NOT NULL,
  model TEXT NOT NULL, effort TEXT NOT NULL, invocations INTEGER NOT NULL CHECK(invocations >= 0), PRIMARY KEY(taskId,ordinal));
CREATE TABLE operations (scope TEXT NOT NULL, requestId TEXT NOT NULL, digest TEXT NOT NULL, resultId TEXT NOT NULL, PRIMARY KEY(scope,requestId));
CREATE TABLE imports (id TEXT PRIMARY KEY, digest TEXT NOT NULL, createdAt TEXT NOT NULL);
PRAGMA user_version = 2;
`

// WHY：旧草稿没有可验证的结构化需求，迁移只能保留原文并置空，不能从 Markdown 猜造 brief。
const versionOneToTwo = `
ALTER TABLE drafts ADD COLUMN brief TEXT CHECK(brief IS NULL OR json_valid(brief));
PRAGMA user_version = 2;
`

export function migrate(connection: Database.Database) {
  const version = connection.pragma("user_version", { simple: true })
  if (version === 19) return
  if (typeof version !== "number" || version < 0 || version > 19) throw new Error("数据库版本高于当前程序，已停止启动以保护数据。")
  // WHY：结构变更也必须整体提交，不能让部分建表成为成功迁移标记。
  connection.transaction(() => {
    if (version === 0) connection.exec(schema)
    if (version === 1) connection.exec(versionOneToTwo)
    if (version < 3) connection.exec(`CREATE TABLE browserRuns (runId TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id),
      createdAt TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)));
      CREATE INDEX browser_runs_task ON browserRuns(taskId,createdAt);
      PRAGMA user_version = 3;`)
    if (version < 4) connection.exec(`CREATE TABLE researchRuns (id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), body TEXT NOT NULL CHECK(json_valid(body)));
      CREATE INDEX research_runs_task ON researchRuns(taskId); PRAGMA user_version = 4;`)
    if (version < 5) connection.exec(`CREATE TABLE plans (id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), body TEXT NOT NULL CHECK(json_valid(body)));
      CREATE INDEX plans_task ON plans(taskId);
      CREATE TABLE executions (id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), planId TEXT NOT NULL UNIQUE REFERENCES plans(id),
        status TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)));
      CREATE UNIQUE INDEX one_running_execution ON executions((1)) WHERE status = 'running';
      CREATE UNIQUE INDEX one_pending_task ON executions(taskId) WHERE status IN ('queued','running','awaiting_next_stage','interrupted','manual_required','cleanup_required');
      PRAGMA user_version = 5;`)
    if (version < 6) connection.exec(`CREATE TABLE chains (id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), executionId TEXT NOT NULL REFERENCES executions(id), body TEXT NOT NULL CHECK(json_valid(body)));
      CREATE INDEX chains_execution ON chains(executionId); PRAGMA user_version = 6;`)
    // WHY：复跑属于独立运行；重建表解除每计划一个运行限制，同时保留链路外键与初次授权唯一性。
    if (version < 7) connection.exec(`CREATE TEMP TABLE saved_chains AS SELECT * FROM chains;
      DROP TABLE chains;
      CREATE TABLE executions_v7 (id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), planId TEXT NOT NULL REFERENCES plans(id),
        status TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)));
      INSERT INTO executions_v7 SELECT * FROM executions;
      DROP TABLE executions;
      ALTER TABLE executions_v7 RENAME TO executions;
      CREATE UNIQUE INDEX one_initial_execution ON executions(planId) WHERE COALESCE(json_extract(body,'$.mode'),'initial')='initial';
      CREATE UNIQUE INDEX one_running_execution ON executions((1)) WHERE status='running';
      CREATE UNIQUE INDEX one_pending_task ON executions(taskId) WHERE status IN ('queued','running','awaiting_next_stage','interrupted','manual_required','cleanup_required','drift_paused');
      CREATE TABLE chains (id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), executionId TEXT NOT NULL REFERENCES executions(id), body TEXT NOT NULL CHECK(json_valid(body)));
      INSERT INTO chains SELECT * FROM saved_chains;
      DROP TABLE saved_chains;
      CREATE INDEX chains_execution ON chains(executionId);
      PRAGMA user_version = 7;`)
    if (version < 8) connection.exec(`CREATE TABLE aiSettings (
      subjectId TEXT PRIMARY KEY, selection TEXT NOT NULL CHECK(json_valid(selection))
    ); PRAGMA user_version = 8;`)
    // WHY：旧 payload 无法无损升级；保留原表和原字节，正式运行只读取 v10 新表。
    if (version < 9) connection.exec(`PRAGMA user_version = 9;`)
    if (version < 10) connection.exec(`CREATE TABLE taskContracts (
        recordId TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), kind TEXT NOT NULL,
        entityId TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0), digest TEXT NOT NULL,
        body TEXT NOT NULL CHECK(json_valid(body)), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        UNIQUE(kind,entityId,version));
      CREATE INDEX task_contracts_task_kind ON taskContracts(taskId,kind,version);
      CREATE TABLE taskAuthoringJobs (id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id),
        type TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)));
      CREATE INDEX task_authoring_jobs_task ON taskAuthoringJobs(taskId);
      CREATE TABLE taskExecutions (id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id),
        planId TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)));
      CREATE INDEX task_executions_task ON taskExecutions(taskId);
      CREATE TABLE taskArtifacts (artifactId TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id),
        runId TEXT NOT NULL, mediaType TEXT NOT NULL, digest TEXT NOT NULL,
        body TEXT NOT NULL CHECK(json_valid(body)), createdAt TEXT NOT NULL);
      CREATE INDEX task_artifacts_run ON taskArtifacts(runId);
      PRAGMA user_version = 10;`)
    if (version < 11) connection.exec(`CREATE TABLE originAccessEvents (
        id TEXT PRIMARY KEY, origin TEXT NOT NULL, runId TEXT NOT NULL, action TEXT NOT NULL,
        occurredAt INTEGER NOT NULL CHECK(occurredAt >= 0));
      CREATE INDEX origin_access_events_origin_time ON originAccessEvents(origin,occurredAt);
      CREATE TABLE originAccessBlocks (
        origin TEXT PRIMARY KEY, runId TEXT NOT NULL, reason TEXT NOT NULL,
        blockedUntil INTEGER NOT NULL CHECK(blockedUntil >= 0), updatedAt INTEGER NOT NULL CHECK(updatedAt >= 0));
      PRAGMA user_version = 11;`)
    if (version < 12) connection.exec(`CREATE TABLE taskReleases (
        recordId TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), releaseId TEXT NOT NULL,
        version INTEGER NOT NULL CHECK(version > 0), digest TEXT NOT NULL,
        body TEXT NOT NULL CHECK(json_valid(body)), createdAt TEXT NOT NULL,
        UNIQUE(taskId,version), UNIQUE(releaseId,version));
      CREATE INDEX task_releases_task ON taskReleases(taskId,version);
      CREATE TABLE taskRunPresets (
        taskId TEXT PRIMARY KEY REFERENCES tasks(id), releaseId TEXT NOT NULL, releaseVersion INTEGER NOT NULL CHECK(releaseVersion > 0),
        releaseDigest TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), updatedAt TEXT NOT NULL);
      PRAGMA user_version = 12;`)
    if (version < 13) {
      connection.exec(`CREATE TABLE sourceResolutions (
        taskId TEXT NOT NULL REFERENCES tasks(id), id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0),
        body TEXT NOT NULL CHECK(json_valid(body)), PRIMARY KEY(taskId,id));
      CREATE INDEX source_resolutions_task_revision ON sourceResolutions(taskId,revision);
      `)
      const taskColumns = connection.pragma("table_info(tasks)") as Array<{ name: string }>
      if (!taskColumns.some((column) => column.name === "interviewPolicyVersion")) {
        connection.exec("ALTER TABLE tasks ADD COLUMN interviewPolicyVersion INTEGER NOT NULL DEFAULT 0")
      }
      connection.exec("PRAGMA user_version = 13")
    }
    if (version < 14) connection.exec(`CREATE TABLE taskChainRevisionDrafts (
      id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), baseChainId TEXT NOT NULL,
      status TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), checksum TEXT NOT NULL,
      body TEXT NOT NULL CHECK(json_valid(body)), updatedAt TEXT NOT NULL);
      CREATE INDEX task_chain_revision_drafts_task_updated ON taskChainRevisionDrafts(taskId,updatedAt);
      PRAGMA user_version = 14;`)
    if (version < 15) connection.exec(`CREATE TABLE taskExecutionCleanupAudits (
      id TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id),
      executionId TEXT NOT NULL REFERENCES taskExecutions(id), attempt INTEGER NOT NULL CHECK(attempt > 0),
      source TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), createdAt TEXT NOT NULL,
      UNIQUE(executionId,attempt));
      CREATE INDEX task_execution_cleanup_audits_task_execution
        ON taskExecutionCleanupAudits(taskId,executionId,attempt);
      PRAGMA user_version = 15;`)
    if (version < 16) connection.exec(`CREATE TABLE taskChainPresentations (
      recordId TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id), chainId TEXT NOT NULL,
      chainVersion INTEGER NOT NULL CHECK(chainVersion > 0), chainDigest TEXT NOT NULL,
      presentationDigest TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), createdAt TEXT NOT NULL,
      UNIQUE(chainId,chainVersion));
      CREATE INDEX task_chain_presentations_task_chain
        ON taskChainPresentations(taskId,chainId,chainVersion);
      PRAGMA user_version = 16;`)
    if (version < 17) migrateSimplifiedWorkbench(connection)
    if (version < 18) migrateWorkspaceSequence(connection)
    if (version < 19) connection.exec(`ALTER TABLE operations ADD COLUMN taskId TEXT REFERENCES tasks(id);
      CREATE INDEX operations_task ON operations(taskId);
      PRAGMA user_version = 19;`)
  })()
}

function migrateWorkspaceSequence(connection: Database.Database) {
  // WHY：对象 revision 求和会在 job 替换、草稿删除或发布后回退；数据库写入触发单调序列并随事务提交。
  connection.exec(`CREATE TABLE taskWorkspaceSequences (
    taskId TEXT PRIMARY KEY REFERENCES tasks(id), sequence INTEGER NOT NULL CHECK(sequence >= 0));
    INSERT INTO taskWorkspaceSequences(taskId,sequence) SELECT id,1 FROM tasks;
    CREATE TRIGGER workspace_sequence_task_insert AFTER INSERT ON tasks BEGIN
      INSERT INTO taskWorkspaceSequences(taskId,sequence) VALUES (NEW.id,1);
    END;
    CREATE TRIGGER workspace_sequence_task_update AFTER UPDATE ON tasks BEGIN
      UPDATE taskWorkspaceSequences SET sequence=sequence+1 WHERE taskId=NEW.id;
    END;`)
  for (const table of ["taskContracts", "taskAuthoringJobs", "taskDrafts", "taskReleases", "taskExecutions"] as const) {
    for (const action of ["INSERT", "UPDATE", "DELETE"] as const) {
      const row = action === "DELETE" ? "OLD" : "NEW"
      connection.exec(`CREATE TRIGGER workspace_sequence_${table}_${action.toLowerCase()}
        AFTER ${action} ON ${table} BEGIN
        UPDATE taskWorkspaceSequences SET sequence=sequence+1 WHERE taskId=${row}.taskId;
        END;`)
    }
  }
  connection.exec("PRAGMA user_version = 18")
}

type StoredRow = { body: string }
type LegacyRevision = {
  id: string; taskId: string; revision: number; status: string; baseRelease: VersionReference;
  baseChain: VersionReference; chain: unknown; presentation?: unknown; validation?: {
    records?: Array<{ kind?: string; id?: string }>;
  }; createdAt: string; updatedAt: string;
}

function migrateSimplifiedWorkbench(connection: Database.Database) {
  // WHY：普通工作区只能做定点读取；把排序/并发字段提升为索引列，避免每次轮询反序列化全部历史 body。
  connection.exec(`ALTER TABLE taskAuthoringJobs ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE taskAuthoringJobs ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '';
    UPDATE taskAuthoringJobs SET sequence = json_extract(body,'$.sequence'), updatedAt = json_extract(body,'$.updatedAt');
    CREATE INDEX task_authoring_jobs_current ON taskAuthoringJobs(taskId,status,updatedAt);
    ALTER TABLE taskExecutions ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE taskExecutions ADD COLUMN createdAt TEXT NOT NULL DEFAULT '';
    ALTER TABLE taskExecutions ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '';
    UPDATE taskExecutions SET sequence = json_extract(body,'$.sequence'),
      createdAt = json_extract(body,'$.createdAt'), updatedAt = json_extract(body,'$.updatedAt');
    CREATE INDEX task_executions_current ON taskExecutions(taskId,updatedAt);`)
  connection.exec(`CREATE TABLE taskDrafts (
    taskId TEXT PRIMARY KEY REFERENCES tasks(id), id TEXT NOT NULL UNIQUE,
    revision INTEGER NOT NULL CHECK(revision >= 0), checksum TEXT NOT NULL,
    body TEXT NOT NULL CHECK(json_valid(body)), updatedAt TEXT NOT NULL);
    CREATE TABLE taskExecutionCandidates (
      executionId TEXT PRIMARY KEY REFERENCES taskExecutions(id), taskId TEXT NOT NULL REFERENCES tasks(id),
      draftId TEXT NOT NULL, draftRevision INTEGER NOT NULL CHECK(draftRevision >= 0), draftChecksum TEXT NOT NULL,
      body TEXT NOT NULL CHECK(json_valid(body)), createdAt TEXT NOT NULL);
    CREATE INDEX task_execution_candidates_task ON taskExecutionCandidates(taskId,createdAt);`)

  migrateReleases(connection)
  migrateExecutionBodies(connection)
  migrateReleaseExecutionReferences(connection)
  migrateActiveDrafts(connection)
  migrateExecutionCandidates(connection)

  // WHY：Release、TaskDraft 和 execution-owned snapshot 已经各自冻结展示；旧三表继续存在只会形成第二事实源。
  connection.exec(`DROP TABLE taskRunPresets;
    DROP TABLE taskChainRevisionDrafts;
    DROP TABLE taskChainPresentations;
    PRAGMA user_version = 17;`)
}

function migrateExecutionBodies(connection: Database.Database) {
  const rows = connection.prepare("SELECT id, body FROM taskExecutions ORDER BY rowid")
    .all() as Array<{ id: string; body: string }>
  const update = connection.prepare("UPDATE taskExecutions SET body = ? WHERE id = ?")
  for (const row of rows) update.run(JSON.stringify(parseMigratedExecution(row.body)), row.id)
}

function migrateReleaseExecutionReferences(connection: Database.Database) {
  const rows = connection.prepare("SELECT id, taskId, body FROM taskExecutions ORDER BY rowid")
    .all() as Array<{ id: string; taskId: string; body: string }>
  const release = connection.prepare(`SELECT digest FROM taskReleases
    WHERE taskId = ? AND releaseId = ? AND version = ?`)
  const update = connection.prepare("UPDATE taskExecutions SET body = ? WHERE id = ?")
  for (const row of rows) {
    const execution = parseMigratedExecution(row.body)
    if (!execution.release) continue
    const current = release.get(row.taskId, execution.release.id, execution.release.version) as { digest: string } | undefined
    if (!current) throw new Error("execution_release_migration_missing")
    if (execution.release.digest === current.digest) continue
    // WHY：Release 由引用式旧形状迁成自包含快照后 digest 必然变化；Execution 必须继续精确指向同一发布版本。
    update.run(JSON.stringify(taskExecutionSchema.parse({ ...execution,
      release: { ...execution.release, digest: current.digest } })), execution.id)
  }
}

function migrateReleases(connection: Database.Database) {
  const rows = connection.prepare("SELECT recordId, body FROM taskReleases ORDER BY taskId, version")
    .all() as Array<{ recordId: string; body: string }>
  const update = connection.prepare("UPDATE taskReleases SET digest = ?, body = ? WHERE recordId = ?")
  for (const row of rows) {
    const raw = json(row.body)
    if (runnableTaskReleaseSchema.safeParse(raw).success) continue
    const legacy = legacyRunnableTaskReleaseSchema.parse(raw)
    const plan = storedPlan(connection, legacy.taskId, legacy.plan)
    const content: TaskDraftContent = { plan, steps: legacy.chains.map((item) => {
      const chain = storedChain(connection, legacy.taskId, item.chain)
      return { stepId: item.stepId, chain, presentation: storedPresentation(connection, legacy.taskId, chain) }
    }) }
    const release = runnableTaskReleaseSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "release",
      id: legacy.id, taskId: legacy.taskId, version: legacy.version, requirement: legacy.requirement,
      content, validation: [legacy.validation.sample, legacy.validation.verification], createdAt: legacy.createdAt })
    update.run(digestJson(release), JSON.stringify(release), row.recordId)
  }
}

function migrateActiveDrafts(connection: Database.Database) {
  const taskIds = connection.prepare("SELECT DISTINCT taskId FROM taskChainRevisionDrafts WHERE status <> ?")
    .all("published") as Array<{ taskId: string }>
  const insert = connection.prepare(`INSERT INTO taskDrafts(taskId,id,revision,checksum,body,updatedAt)
    VALUES(?,?,?,?,?,?)`)
  for (const { taskId } of taskIds) {
    const row = connection.prepare(`SELECT body FROM taskChainRevisionDrafts
      WHERE taskId = ? AND status <> ? ORDER BY updatedAt DESC LIMIT 1`).get(taskId, "published") as StoredRow | undefined
    if (!row) continue
    const legacy = json(row.body) as LegacyRevision
    const release = migratedRelease(connection, taskId, legacy.baseRelease)
    const chain = taskChainSchema.parse(legacy.chain)
    const content = structuredClone(release.content)
    const index = content.steps.findIndex((step) => step.stepId === chain.stepId)
    if (index < 0) throw new Error("draft_migration_step_missing")
    content.steps[index] = { stepId: chain.stepId, chain,
      presentation: presentationFromUnknown(chain, legacy.presentation) }
    const baseRelease = { id: release.id, version: release.version, digest: digestJson(release) }
    const checksum = digestJson({ requirement: release.requirement, baseRelease, content })
    const records = (legacy.validation?.records ?? []).flatMap((record) => {
      if (record.kind !== "execution" || !record.id) return []
      const execution = storedExecution(connection, taskId, record.id)
      return execution?.status === "completed" && executionMatchesContent(execution, content)
        ? [{ executionId: execution.id, revision: legacy.revision, checksum,
          inputDigest: execution.inputDigest, completedAt: execution.updatedAt }] : []
    })
    const draft = taskDraftSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "task_draft",
      id: legacy.id, taskId, revision: legacy.revision, requirement: release.requirement,
      baseRelease, content, checksum, validation: { records },
      createdAt: legacy.createdAt, updatedAt: legacy.updatedAt })
    insert.run(taskId, draft.id, draft.revision, draft.checksum, JSON.stringify(draft), draft.updatedAt)
  }
}

function migrateExecutionCandidates(connection: Database.Database) {
  const rows = connection.prepare("SELECT id, taskId, body FROM taskExecutions ORDER BY rowid")
    .all() as Array<{ id: string; taskId: string; body: string }>
  const insert = connection.prepare(`INSERT INTO taskExecutionCandidates
    (executionId,taskId,draftId,draftRevision,draftChecksum,body,createdAt) VALUES(?,?,?,?,?,?,?)`)
  const update = connection.prepare("UPDATE taskExecutions SET body = ? WHERE id = ?")
  for (const row of rows) {
    const execution = taskExecutionSchema.parse(json(row.body))
    if (execution.release) continue
    const content = executionContent(connection, execution)
    if (!content) continue
    const current = connection.prepare("SELECT body FROM taskDrafts WHERE taskId = ?").get(row.taskId) as StoredRow | undefined
    const draft = current ? taskDraftSchema.parse(json(current.body)) : null
    const reference = draft && executionMatchesContent(execution, draft.content)
      ? { id: draft.id, revision: draft.revision, checksum: draft.checksum }
      : { id: execution.id, revision: 0, checksum: digestJson(content) }
    const candidate = taskExecutionCandidateSchema.parse({ executionId: execution.id, taskId: execution.taskId,
      draft: reference, content, createdAt: execution.createdAt })
    const migrated = taskExecutionSchema.parse({ ...execution, draft: reference })
    insert.run(execution.id, execution.taskId, reference.id, reference.revision, reference.checksum,
      JSON.stringify(candidate), candidate.createdAt)
    update.run(JSON.stringify(migrated), execution.id)
  }
}

function migratedRelease(connection: Database.Database, taskId: string, reference: VersionReference) {
  const row = connection.prepare("SELECT body FROM taskReleases WHERE taskId = ? AND releaseId = ? AND version = ?")
    .get(taskId, reference.id, reference.version) as StoredRow | undefined
  if (!row) throw new Error("draft_migration_release_missing")
  return runnableTaskReleaseSchema.parse(json(row.body))
}

function storedPlan(connection: Database.Database, taskId: string, reference: VersionReference) {
  const row = storedContract(connection, taskId, "plan", reference)
  const plan = taskPlanSchema.parse(json(row.body))
  if (digestJson(plan) !== reference.digest) throw new Error("migration_plan_digest_mismatch")
  return plan
}

function storedChain(connection: Database.Database, taskId: string, reference: VersionReference) {
  const row = storedContract(connection, taskId, "chain", reference)
  const chain = taskChainSchema.parse(json(row.body))
  if (executableChainDigest(chain) !== reference.digest) throw new Error("migration_chain_digest_mismatch")
  return chain
}

function storedContract(connection: Database.Database, taskId: string, kind: "plan" | "chain",
  reference: VersionReference) {
  const row = connection.prepare(`SELECT body FROM taskContracts
    WHERE taskId = ? AND kind = ? AND entityId = ? AND version = ?`).get(taskId, kind, reference.id,
      reference.version) as StoredRow | undefined
  if (!row) throw new Error(`migration_${kind}_missing`)
  return row
}

function storedPresentation(connection: Database.Database, taskId: string, chain: TaskChain) {
  const row = connection.prepare(`SELECT body FROM taskChainPresentations
    WHERE taskId = ? AND chainId = ? AND chainVersion = ?`).get(taskId, chain.id, chain.version) as StoredRow | undefined
  return presentationFromUnknown(chain, row ? json(row.body) : undefined)
}

function presentationFromUnknown(chain: TaskChain, raw: unknown) {
  if (raw && typeof raw === "object") {
    const value = raw as Partial<ChainPresentationContent>
    try { return createChainPresentation(chain, { stages: value.stages ?? [],
      overviewLayout: value.overviewLayout ?? [], focusLayouts: value.focusLayouts ?? [] }) }
    catch { /* 无法验证的旧布局按同一链执行图重新派生，历史链内容不改。 */ }
  }
  return createChainPresentation(chain)
}

function storedExecution(connection: Database.Database, taskId: string, executionId: string) {
  const row = connection.prepare("SELECT body FROM taskExecutions WHERE taskId = ? AND id = ?")
    .get(taskId, executionId) as StoredRow | undefined
  return row ? taskExecutionSchema.parse(json(row.body)) : null
}

function executionContent(connection: Database.Database, execution: TaskExecution) {
  try {
    const plan = storedPlan(connection, execution.taskId, execution.plan)
    return { plan, steps: execution.steps.map((step) => {
      const chain = storedChain(connection, execution.taskId, step.chain)
      return { stepId: step.stepId, chain, presentation: storedPresentation(connection, execution.taskId, chain) }
    }) }
  } catch { return null }
}

function executionMatchesContent(execution: TaskExecution, content: TaskDraftContent) {
  return execution.plan.id === content.plan.id && execution.plan.version === content.plan.version
    && execution.plan.digest === digestJson(content.plan) && execution.steps.length === content.steps.length
    && execution.steps.every((step) => {
      const frozen = content.steps.find((item) => item.stepId === step.stepId)
      return frozen && step.chain.id === frozen.chain.id && step.chain.version === frozen.chain.version
        && step.chain.digest === executableChainDigest(frozen.chain)
    })
}

function json(value: string) { return JSON.parse(value) as unknown }

function parseMigratedExecution(raw: string) {
  const value = json(raw)
  if (record(value)) {
    normalizeLegacyNextAction(value.result)
    if (record(value.cleanupResume)) normalizeLegacyNextAction(value.cleanupResume.result)
  }
  return taskExecutionSchema.parse(value)
}

function normalizeLegacyNextAction(value: unknown) {
  if (record(value) && value.nextAction === "repair") value.nextAction = "rerun"
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
