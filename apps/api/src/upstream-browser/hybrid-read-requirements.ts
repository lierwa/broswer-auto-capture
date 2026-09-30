import { valuePathSchema, type StableChainNodeV2, type ValueBinding } from "@browser-capture/contracts"
import { dataCapabilityConfigSchema } from "@browser-capture/runtime"

function consumerBindings(consumer: StableChainNodeV2 | undefined): ValueBinding[] {
  if (consumer?.kind === "terminal") return consumer.result?.output.kind === "value" ? [consumer.result.output.value] : []
  // 分支、循环或中间函数可能合法处理空集合，不能跨过它们推断必需路径。
  if (consumer?.kind !== "capability") return []
  const bindings = Object.values(consumer.input)
  if (consumer.capability.name !== "data.transform" || consumer.capability.version !== 1) return bindings
  const config = dataCapabilityConfigSchema.safeParse(consumer.config)
  if (!config.success || config.data.operation !== "transform") return bindings
  const args = config.data.arguments
  if (!args.source || !args.paths || !args.mode) return bindings
  const source = consumer.input[args.source], paths = consumer.input[args.paths], mode = consumer.input[args.mode]
  if (source?.source !== "node" || mode?.source !== "constant" || mode.value !== "assemble"
    || paths?.source !== "constant" || !paths.value || typeof paths.value !== "object" || Array.isArray(paths.value)) return bindings
  const entries = Object.entries(paths.value), required = entries.map(([key]) => [...source.path, key])
  if (!entries.length || entries.some(([, path]) => !valuePathSchema.safeParse(path).success)
    || required.some(path => !valuePathSchema.safeParse(path).success)) return bindings
  // WHY：assemble 必取源对象的每个映射键；目标改名/嵌套不改变读取活性，不从输出 schema 猜字段。
  return [...Object.entries(consumer.input).filter(([name]) => name !== args.source).map(([, binding]) => binding),
    ...required.map(path => ({ ...source, path }))]
}

/** WHY：紧接读取的动作既然必用某路径，空数组/缺字段就不是就绪；约束来自绑定，不是样本值。 */
export function applyReadRequirements(nodes: StableChainNodeV2[], edges: Array<{ from: string; to: string; port: string }>) {
  for (const node of nodes) {
    if (node.kind !== "capability" || node.capability.name !== "browser.read-fields") continue
    const nextEdges = edges.filter(edge => edge.from === node.id && edge.port === "success")
    const consumer = nextEdges.length === 1 ? nodes.find(item => item.id === nextEdges[0]!.to) : undefined
    const paths = consumerBindings(consumer).flatMap(binding => binding.source === "node"
      && binding.nodeId === node.id && binding.path.length ? [binding.path] : [])
    if (!paths.length || !node.config || typeof node.config !== "object" || Array.isArray(node.config)) continue
    // WHY：数组 items.required 会误约束所有行；这里只检查已绑定的精确路径，不改模型的 ReadSpec。
    node.config = { ...node.config, requiredPaths: paths }
    for (const producer of nodes) {
      if (producer.kind !== "capability" || producer.capability.name !== "browser.workflow-step"
        || !producer.config || typeof producer.config !== "object" || Array.isArray(producer.config)
        || !Array.isArray(producer.config.postconditions)) continue
      producer.config.postconditions = producer.config.postconditions.map(condition =>
        condition && typeof condition === "object" && !Array.isArray(condition)
          && condition.kind === "read_fields" && condition.consumerRef === node.id
          ? { ...condition, requiredPaths: paths } : condition)
    }
  }
}
