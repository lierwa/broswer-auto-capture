import { LiveChain } from "./LiveChain.js"
import type { TaskChainConnection } from "./taskChainConnection.js"

export function ChainView({ connection, theme, active, onPlan }: {
  connection: TaskChainConnection; theme: "light" | "dark"; active: boolean; onPlan(): void;
}) {
  return <LiveChain connection={connection} active={active} theme={theme} onPlan={onPlan} />
}
