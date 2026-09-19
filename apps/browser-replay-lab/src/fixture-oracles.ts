import type { ScenarioId, ScenarioOracle } from "./scenario-contract.js"

type Expected = Pick<ScenarioOracle, "expectedStatus" | "expectedCode">

export const expectedByScenario: Readonly<Record<ScenarioId, Expected>> = {
  "clean-baseline": { expectedStatus: "completed", expectedCode: null },
  "native-alert-declared": { expectedStatus: "completed", expectedCode: null },
  "native-confirm-unexpected": { expectedStatus: "failed", expectedCode: "unexpected_native_dialog" },
  "native-prompt-unexpected": { expectedStatus: "failed", expectedCode: "unexpected_native_dialog" },
  "beforeunload-declared": { expectedStatus: "completed", expectedCode: null },
  "portal-modal-recorded": { expectedStatus: "completed", expectedCode: null },
  "portal-modal-absent": { expectedStatus: "completed", expectedCode: null },
  "portal-modal-unexpected": { expectedStatus: "blocked", expectedCode: "target_hit_blocked" },
  "delayed-close-button": { expectedStatus: "completed", expectedCode: null },
  "duplicate-close-buttons": { expectedStatus: "failed", expectedCode: "optional_preparation_ambiguous" },
  "repeated-interstitial": { expectedStatus: "failed", expectedCode: "optional_preparation_ineffective" },
  "sticky-cookie-banner": { expectedStatus: "blocked", expectedCode: "target_hit_blocked" },
  "chat-widget-overlap": { expectedStatus: "blocked", expectedCode: "target_hit_blocked" },
  "transparent-pointer-overlay": { expectedStatus: "blocked", expectedCode: "target_hit_blocked" },
  "same-origin-iframe-overlay": { expectedStatus: "completed", expectedCode: null },
  "cross-origin-iframe-overlay": { expectedStatus: "blocked", expectedCode: "physical_input_scope_unsupported" },
  "shadow-dom-overlay": { expectedStatus: "completed", expectedCode: null },
  "overflow-hidden-lock": { expectedStatus: "failed", expectedCode: "scroll_css_locked" },
  "position-fixed-lock": { expectedStatus: "failed", expectedCode: "scroll_position_fixed_locked" },
  "wheel-prevented": { expectedStatus: "failed", expectedCode: "scroll_event_cancelled" },
  "nested-scroll-container": { expectedStatus: "completed", expectedCode: null },
  "business-confirmation": { expectedStatus: "completed", expectedCode: null },
  "login-captcha-permission": { expectedStatus: "waiting_for_human", expectedCode: null },
  "legitimate-popover": { expectedStatus: "completed", expectedCode: null },
  "target-replaced-after-close": { expectedStatus: "completed", expectedCode: null },
}
