import type { StableChainNodeV2 } from "@browser-capture/contracts"

export const inspectorNode = {
  id: "read",
  label: "读取当前记录",
  kind: "capability",
  capability: { name: "browser.read-fields", version: 2 },
  input: {},
  config: {},
  effect: "read",
  timeoutMs: 1_000,
  outputContract: {
    id: "read-output",
    version: 1,
    dialect: "bat-value-schema/v1",
    schema: { type: "object", properties: {}, required: [], additionalProperties: true },
  },
  writes: [],
} satisfies StableChainNodeV2
