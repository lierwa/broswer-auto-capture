import type { ScenarioConfig, ScenarioId } from "./scenario-contract.js"

export type ScenarioGroup = "baseline" | "native" | "overlay" | "scroll" | "semantic"

export interface ScenarioDefinition {
  readonly scenarioId: ScenarioId
  readonly group: ScenarioGroup
  readonly title: string
  readonly mechanism: string
  readonly defaultConfig: Pick<ScenarioConfig, "phase" | "variant">
}

const define = (
  scenarioId: ScenarioId,
  group: ScenarioGroup,
  title: string,
  mechanism: string,
  variant: ScenarioConfig["variant"] = "present",
): ScenarioDefinition => ({
  scenarioId,
  group,
  title,
  mechanism,
  defaultConfig: { phase: "replay", variant },
})

export const scenarioRegistry: readonly ScenarioDefinition[] = [
  define("clean-baseline", "baseline", "Clean baseline", "Unobstructed physical target"),
  define("native-alert-declared", "native", "Declared alert", "Action-scoped native alert"),
  define("native-confirm-unexpected", "native", "Unexpected confirm", "Undeclared native confirmation"),
  define("native-prompt-unexpected", "native", "Unexpected prompt", "Undeclared native prompt"),
  define("beforeunload-declared", "native", "Declared beforeunload", "Proven navigation boundary"),
  define("portal-modal-recorded", "overlay", "Recorded portal", "Known optional preparation in a React Portal"),
  define("portal-modal-absent", "overlay", "Absent portal", "Previously observed preparation is absent", "absent"),
  define("portal-modal-unexpected", "overlay", "Unexpected portal", "New full-screen obstruction"),
  define("delayed-close-button", "overlay", "Delayed close", "Preparation appears inside its saved deadline", "delayed"),
  define("duplicate-close-buttons", "overlay", "Ambiguous close", "Two equivalent preparation targets"),
  define("repeated-interstitial", "overlay", "Repeated interstitial", "Obstruction returns after one preparation", "repeated"),
  define("sticky-cookie-banner", "overlay", "Sticky banner", "Footer blocks a corner target"),
  define("chat-widget-overlap", "overlay", "Chat overlap", "Floating control intercepts the target"),
  define("transparent-pointer-overlay", "overlay", "Transparent pointer layer", "Invisible element still receives pointer input"),
  define("same-origin-iframe-overlay", "overlay", "Same-origin frame", "Frame/document ownership and coordinate mapping"),
  define("cross-origin-iframe-overlay", "overlay", "Cross-origin frame", "Explicit physical-input scope boundary"),
  define("shadow-dom-overlay", "overlay", "Shadow DOM overlay", "Composed-path target attribution"),
  define("overflow-hidden-lock", "scroll", "Overflow lock", "Root CSS prevents scrolling"),
  define("position-fixed-lock", "scroll", "Fixed body lock", "Fixed body preserves visual coordinates"),
  define("wheel-prevented", "scroll", "Cancelled wheel", "Page prevents the physical wheel event"),
  define("nested-scroll-container", "scroll", "Nested scroller", "Only the intended container can move"),
  define("business-confirmation", "semantic", "Business confirmation", "Task-required destructive confirmation"),
  define("login-captcha-permission", "semantic", "Human boundary", "Authentication and permission stay manual"),
  define("legitimate-popover", "semantic", "Legitimate popover", "Task-required menu must not be dismissed"),
  define("target-replaced-after-close", "semantic", "Replaced target", "Preparation invalidates the old DOM identity"),
] as const

export const scenarioById = new Map(scenarioRegistry.map((scenario) => [scenario.scenarioId, scenario]))
