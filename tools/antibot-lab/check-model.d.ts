// Shared browser/server projection contract. Declarations only; runtime rules live in check-model.js.
export type SignalStatus = 'clear' | 'flagged' | 'advisory' | 'unavailable' | 'excluded' | 'failed' | 'pending'
export interface CatalogRow { id: string; name: string; group: number; category: string; key: string; source: string }
export interface Measurement {
  values: Map<string, { valid: boolean; outcome: string }>; batches: Set<string>;
  mode: string; behaviorPhase: string; pageId: string | null; runId: string | null;
  failed: boolean; timedOut: boolean; health: string | null; updated: string | null;
  timing: Array<Record<string, unknown>> | null; flow: { submitted: boolean } | null;
  verification: { status: string; challengeAccepted?: boolean; protectedRequestAccepted?: boolean; allowlisted?: boolean; [key: string]: unknown };
  input: { events: number; untrusted: number; hidden: number; dropped: number; byType: Record<string, { events: number; untrusted: number }> };
}
export const groupNames: string[]
export const labels: Record<SignalStatus, string>
export const catalog: CatalogRow[]
export function createMeasurement(): Measurement
export function acceptReceipt(state: Measurement, receipt: unknown): boolean
export function tally(rows: Array<{ status: SignalStatus }>): Record<SignalStatus, number>
export function measurementReport(state: Measurement): {
  version: number; schemaVersion: number; mode: string; scope: string; runId: string | null; pageId: string | null;
  updated: string | null; status: string; phase: string; verdict: string; counts: Record<SignalStatus, number>;
  signals: Array<CatalogRow & { status: SignalStatus; valid: boolean; outcome: string | null; reason: string }>;
  evidence: string[]; health: { environment: string | null; transportFailed: boolean; timedOut: boolean; dropped: number };
  input: Measurement['input']; verification: Measurement['verification']; flow: Measurement['flow']; timing: Measurement['timing'];
  excluded: string[]; classification: string;
}
