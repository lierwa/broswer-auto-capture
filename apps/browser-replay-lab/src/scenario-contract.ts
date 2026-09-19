import { z } from "zod"

export const scenarioIds = [
  "clean-baseline",
  "native-alert-declared",
  "native-confirm-unexpected",
  "native-prompt-unexpected",
  "beforeunload-declared",
  "portal-modal-recorded",
  "portal-modal-absent",
  "portal-modal-unexpected",
  "delayed-close-button",
  "duplicate-close-buttons",
  "repeated-interstitial",
  "sticky-cookie-banner",
  "chat-widget-overlap",
  "transparent-pointer-overlay",
  "same-origin-iframe-overlay",
  "cross-origin-iframe-overlay",
  "shadow-dom-overlay",
  "overflow-hidden-lock",
  "position-fixed-lock",
  "wheel-prevented",
  "nested-scroll-container",
  "business-confirmation",
  "login-captcha-permission",
  "legitimate-popover",
  "target-replaced-after-close",
] as const

export const scenarioIdSchema = z.enum(scenarioIds)
export type ScenarioId = z.infer<typeof scenarioIdSchema>

export const scenarioConfigSchema = z.object({
  scenarioId: scenarioIdSchema,
  seed: z.number().int().min(0),
  phase: z.enum(["preexecution", "replay"]),
  variant: z.enum(["absent", "present", "delayed", "repeated"]),
  runId: z.string().min(8).max(128),
})
export type ScenarioConfig = z.infer<typeof scenarioConfigSchema>

const countSchema = z.number().int().nonnegative()
export const scenarioObservedFactsSchema = z.object({
  scenarioId: scenarioIdSchema,
  runId: z.string().min(8).max(128),
  targetDispatches: countSchema,
  preparationDispatches: countSchema,
  nativeDialogs: countSchema,
  trustedEvents: countSchema,
  scrollEvents: countSchema,
  businessEffects: countSchema,
  lastEventTarget: z.string().nullable(),
})
export type ScenarioObservedFacts = z.infer<typeof scenarioObservedFactsSchema>

export const scenarioOracleSchema = scenarioObservedFactsSchema.omit({ runId: true }).extend({
  expectedStatus: z.enum(["completed", "failed", "blocked", "waiting_for_human"]),
  expectedCode: z.string().nullable(),
})
export type ScenarioOracle = z.infer<typeof scenarioOracleSchema>
