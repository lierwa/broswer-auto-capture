import type Database from "better-sqlite3"

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
  if (version === 9) return
  if (typeof version !== "number" || version < 0 || version > 8) throw new Error("数据库版本高于当前程序，已停止启动以保护数据。")
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
    // WHY：来源证据已归属计划，旧计划无法在不猜测事实的前提下升级；只重置开发期业务链，保留访谈、模型选择和浏览器 Profile。
    if (version < 9) connection.exec(`DELETE FROM chains;
      DELETE FROM executions;
      DELETE FROM plans;
      DELETE FROM browserRuns WHERE json_extract(body,'$.purpose')='source_research';
      DELETE FROM operations WHERE scope LIKE 'research:%' OR scope LIKE 'plan:%';
      DROP TABLE researchRuns;
      PRAGMA user_version = 9;`)
  })()
}
