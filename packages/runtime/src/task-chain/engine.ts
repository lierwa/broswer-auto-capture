import { Annotation, END, START, StateGraph } from "@langchain/langgraph"

type Driver<T> = Readonly<{
  step(state: T): Promise<void>
  shouldContinue(state: T): boolean
  signal: AbortSignal
  maxTransitions: number
}>

/**
 * WHY：LangGraph 负责异步图推进、循环调度、取消和递归上限，不能再用手写循环替代。
 * TaskRun 是产品公开且版本化的运行事实，由宿主仓储持久化，避免为框架快照再造第二个数据库。
 */
export async function driveTaskChain<T>(initial: T, driver: Driver<T>): Promise<T> {
  // WHY：LangGraph 的 START 必然进入首节点；已暂停或终止的产品状态必须在入图前短路，避免重放副作用。
  if (!driver.shouldContinue(initial)) return initial
  const state = Annotation.Root({
    value: Annotation<T>({ reducer: (_current, update) => update }),
  })
  const graph = new StateGraph(state)
    .addNode("execute-task-node", async ({ value }) => {
      await driver.step(value)
      return { value }
    })
    .addEdge(START, "execute-task-node")
    .addConditionalEdges("execute-task-node", ({ value }) => driver.shouldContinue(value)
      ? "execute-task-node" : END)
    .compile()
  const recursionLimit = Math.max(64, driver.maxTransitions * 3 + 32)
  const result = await graph.invoke({ value: initial }, { signal: driver.signal, recursionLimit })
  return result.value
}
