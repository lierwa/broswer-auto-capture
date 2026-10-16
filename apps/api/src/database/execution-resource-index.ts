import type Database from "better-sqlite3"

// WHY：body仍是唯一权威；SQLite部分索引随原写入和回滚维护，不双写资源状态。
export const executionResourcePredicate = `json_extract(body,'$.status')='cleanup_required' OR
  (json_extract(body,'$.browserHandoff.status') IN ('active','pending','unavailable')
   AND json_extract(body,'$.browserHandoff.leaseId') IS NOT NULL)`

export const authoringResourcePredicate = `status IN ('failed','interrupted','completed')
  AND json_extract(body,'$.cleanup.status')='unconfirmed'`

export function ensureExecutionResourceIndex(connection: Database.Database) {
  connection.exec(`CREATE INDEX IF NOT EXISTS task_execution_browser_resources
    ON taskExecutions(id) WHERE ${executionResourcePredicate}`)
  connection.exec(`CREATE INDEX IF NOT EXISTS task_authoring_browser_resources
    ON taskAuthoringJobs(id) WHERE ${authoringResourcePredicate}`)
}
