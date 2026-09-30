import type { ChainNode, JsonValue, NodeValueRecord, TaskExecutionEvent, TaskExecutionEventBatch } from "@browser-capture/contracts"
import { executionSegment, nodeExecutionEvents } from "./chainExecutionFacts.js"
import { actionInputSources, actionPresentation, namedInputBindings, schemaTypeLabel,
  type PresentationChain } from "./chainNodePresentation.js"
import { ResultValue } from "./ExecutionPresentation.js"

export function ChainNodeExecution({ event, batch, node, chain, destinations = [], preparing = false }: {
  event: TaskExecutionEvent | undefined; batch: TaskExecutionEventBatch | null;
  node?: ChainNode; chain: PresentationChain; destinations?: string[]; preparing?: boolean
}) {
  const nodes = chain.nodes
  const segment = executionSegment(event, batch)
  const input = segment.started?.event.execution?.input ?? segment.finished?.event.execution?.input
  const output = segment.finished?.event.execution?.output
  const inputs = node ? namedInputBindings(node, nodes, chain) : []
  const named = input?.status === "recorded" && input.value !== null && typeof input.value === "object"
    && !Array.isArray(input.value) ? input.value : null
  const fixedCollection = node?.kind === "loop" && node.iteration.mode === "each"
    && ["input", "constant"].includes(node.iteration.collection.source)
  const firstInput = fixedCollection ? nodeExecutionEvents(node.id, batch).find(item => item.runId === event?.runId
    && item.event.status === "started")?.event.execution?.input : undefined
  const frames = event?.event.execution?.loops
  return <div className="chain-node-values"><section><h4>{node?.kind === "function" ? "具名参数" : "输入"}</h4>
    {!preparing && (!named || !inputs.length) && <ExecutionValue record={input}
      missing={event ? "本次输入内容未记录" : "本次尚无执行记录"} />}
    {inputs.length > 0 ? <ul className="chain-input-values">{inputs.map((item) => <li key={item.name}>
      <div className="chain-input-heading"><strong>{item.name}</strong><small>{item.type}</small></div>
      <p className="chain-value-source">{item.source}</p>
      {item.binding.source === "constant" && (!named || !Object.hasOwn(named, item.name))
        && <ReadableValue value={item.binding.value} />}
      {!preparing && named && (Object.hasOwn(named, item.name) ? <ReadableValue value={named[item.name]!} />
        : <span>本次参数值未记录</span>)}
    </li>)}</ul> : node && <p className="chain-value-source">{actionInputSources(node, nodes)}</p>}
    {named && inputs.length > 0 && Object.keys(named).some((key) => !inputs.some((item) => item.name === key))
      && <ReadableValue value={Object.fromEntries(Object.entries(named).filter(([key]) => !inputs.some((item) => item.name === key)))} />}
    {fixedCollection && firstInput && firstInput !== input && <section><h4>首次固定集合输入</h4>
      <ExecutionValue record={firstInput} missing="首次集合内容未记录" /></section>}
    </section><section><h4>输出</h4>{!preparing && <ExecutionValue record={output}
      missing={segment.finished ? "本次节点输出未记录" : "本次尚无完成输出"} />}
      <p className="chain-value-source">{destinations.length ? `输出去向：${destinations.join("；")}` : "没有已记录的后续使用动作"}</p>
      {node?.kind === "function" && <details><summary>返回要求 · {node.outputContract?.schema.type ?? "未记录"}</summary>
        <p>{node.outputContract?.schema ? schemaTypeLabel(node.outputContract.schema, true) : "此版本返回要求未记录"}</p></details>}
    </section>{frames?.length ? <p className="chain-value-source">{frames.map(frame =>
      loopPosition(frame.nodeId, frame.index, nodes)).join("；")}</p> : null}</div>
}

function loopPosition(nodeId: string, index: number, nodes: readonly ChainNode[]) {
  const node = nodes.find((item) => item.id === nodeId)
  const title = node ? actionPresentation(node).title : "循环"
  return `${title} · ${node?.kind === "loop" && node.iteration.mode === "each"
    ? `集合位置第 ${index + 1} 项` : `第 ${index + 1} 轮`}`
}

function ExecutionValue({ record, missing }: { record: NodeValueRecord | undefined; missing: string }) {
  if (!record || record.status === "missing") return <p>{missing}</p>
  if (record.status === "truncated") return <p>值超出记录限额，未保存完整内容</p>
  if (record.status === "redacted") return <><p>敏感内容已脱敏，完整值未记录</p>{Object.hasOwn(record, "value")
    ? <ReadableValue value={record.value!} /> : null}</>
  if (!Object.hasOwn(record, "value")) return <p>{missing}</p>
  return <ReadableValue value={record.value!} />
}

function ReadableValue({ value }: { value: JsonValue }) {
  return <div className="chain-readable-value"><ResultValue value={value} /></div>
}
