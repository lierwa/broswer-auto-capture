import { registerAgentUI } from "@agent-platform/ai-connect/ui-contracts"
import { createContentUI } from "@agent-platform/ai-connect-react/chat"

// WHY：渲染注册表与发给服务端的 capability 必须来自同一次组合，避免客户端维护两份启用事实。
export const interviewAgentUI = registerAgentUI(createContentUI())
