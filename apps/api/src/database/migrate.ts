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
  if (version === 3) return
  if (version !== 0 && version !== 1 && version !== 2) throw new Error("数据库版本高于当前程序，已停止启动以保护数据。")
  // WHY：结构变更也必须整体提交，不能让部分建表成为成功迁移标记。
  connection.transaction(() => {
    if (version === 0) connection.exec(schema)
    if (version === 1) connection.exec(versionOneToTwo)
    connection.exec(`CREATE TABLE browserRuns (runId TEXT PRIMARY KEY, taskId TEXT NOT NULL REFERENCES tasks(id),
      createdAt TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)));
      CREATE INDEX browser_runs_task ON browserRuns(taskId,createdAt);
      PRAGMA user_version = 3;`)
  })()
}
