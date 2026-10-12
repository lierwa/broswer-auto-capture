// Published IR projection and historical records only. Browser ownership belongs to the managed runner.
export { BrowserError, commandSchema, browserInspectionSchema,
  type BrowserCommand, type BrowserFailure,
  type BrowserInspection } from "./contracts.js"
export { BrowserJournal } from "./journal.js"
export * from "./task-chain-adapter.js"
export { pageSchema, publicUrl, type BrowserPage } from "./page.js"
export { readTargetSchema, targetReadResultSchema, extractTarget } from "./structured-read.js"
