// Wire-protocol shapes mirroring bsk-protocol (see crates/bsk-protocol/schema/*.json). The
// daemon serialises Rust structs via serde; these TS types intentionally
// stay structural (interface, not class) so the same JSON parses on both
// sides without extra adapters.

export type RpcId = string;

export type ErrorCode =
  | "unknown_method"
  | "unsupported"
  | "invalid_params"
  | "not_found"
  | "permission_denied"
  | "timeout"
  | "cdp_failed"
  | "protocol_error"
  | "cancelled"
  | "version_too_old"
  | "multiple_browsers_online"
  | "no_browser_connected";

/** Stable `RpcError.data.reason` values for CLI hint selection. */
export type RpcErrorReason =
  | "ui_lookup_failed"
  | "task_unavailable"
  | "target_unavailable"
  | "task_stopping"
  | "ui_deadline"
  | "preview_busy"
  | "agent_window_scope"
  | "element_not_visible"
  | "input_not_ready"
  | "input_outcome_unknown"
  | "input_paint_unconfirmed"
  | "input_cleanup_failed"
  | "ref_not_found"
  | "ref_kind_unsupported"
  | "visual_capture_stale"
  | "visual_capture_invalid"
  | "visual_coordinate_invalid"
  | "visual_target_changed"
  | "visual_pixel_budget_exceeded"
  | "selector_not_found"
  | "target_not_fillable"
  | "fill_value_invalid"
  | "fill_target_changed"
  | "fill_focus_lost"
  | "fill_value_mismatch"
  | "fill_failed"
  | "target_not_select"
  | "option_not_found"
  | "single_select_value_count"
  | "tab_not_active"
  | "restricted_tab_url"
  | "cdp_extension_access_denied"
  | "borrow_conflict"
  | "borrow_in_progress"
  | "user_denied"
  | "confirmation_timeout"
  | "confirmation_ui_unavailable"
  | "borrow_outcome_unknown"
  | "screenshot_capture_failed"
  | "renderer_read_timeout"
  | "user_cancelled"
  | "page_hidden"
  | "navigation"
  | "watchdog_timeout"
  | "stale_frame"
  | "loading_stalled"
  | "file_input_probe_failed"
  | "file_input_not_activated"
  | "set_file_input_failed"
  | "upload_mechanism_unsupported"
  | "file_drop_target_unavailable"
  | "file_drop_failed"
  | "download_capture_failed"
  | "transfer_outcome_unknown"
  | "transfer_timeout"
  | "cleanup_failed";

export type TransferEffectState = "none" | "committed" | "unknown";
export type TransferCleanupState = "complete" | "failed";

export interface RpcErrorData {
  reason?: RpcErrorReason;
  effect_state?: TransferEffectState;
  phase?: string;
  cleanup_state?: TransferCleanupState;
  [key: string]: unknown;
}

export interface RpcError {
  code: ErrorCode;
  message: string;
  data?: RpcErrorData;
}

export interface RequestFrame {
  id: RpcId;
  method: string;
  params?: unknown;
}

export interface OkResponseFrame {
  id: RpcId;
  result: unknown;
}

export interface ErrResponseFrame {
  id: RpcId;
  error: RpcError;
}

export type ResponseFrame = OkResponseFrame | ErrResponseFrame;

export interface EventFrame {
  event: string;
  payload?: unknown;
}

export type ProtocolFrame = RequestFrame | ResponseFrame | EventFrame;

export function isRequestFrame(f: ProtocolFrame): f is RequestFrame {
  return typeof (f as RequestFrame).method === "string";
}

export function isResponseFrame(f: ProtocolFrame): f is ResponseFrame {
  return (
    typeof (f as ResponseFrame).id === "string" &&
    ("result" in (f as object) || "error" in (f as object))
  );
}

export function isEventFrame(f: ProtocolFrame): f is EventFrame {
  return typeof (f as EventFrame).event === "string";
}

export interface InteractionPolicy {
  borrow_confirmation: "always" | "never";
  request_help: "enabled" | "disabled";
}

export interface BrowserPeerInfo {
  name: string;
  version: string;
}

export interface HandshakeParams {
  audit_enabled?: boolean;
  client: string;
  version: string;
  protocol_version: string;
  instance_id: string;
  browser: BrowserPeerInfo;
  label: string;
  /**
   * **Deprecated** — legacy app-semver floor for old daemons. New code
   * sends `"0.0.0"` and ignores on read.
   */
  min_compatible_peer?: string;
  /** Lowest daemon **protocol** version this extension accepts. */
  min_compatible_protocol?: string;
}

export interface HandshakeResult {
  audit_version?: number;
  audit_ready?: boolean;
  server: string;
  version: string;
  protocol_version: string;
  /** Deprecated legacy app-semver floor; absent on newer daemons. */
  min_compatible_peer?: string;
  /** Protocol floor advertised by the daemon; absent on legacy daemons. */
  min_compatible_protocol?: string;
}

export type ConnectionState = "disconnected" | "connecting" | "connected" | "version_skew";
