import {
  parseTaskValue,
  type ArtifactReference, type JsonValue, type TaskDataContract, type TaskExecutionResult,
  type TaskOutput, type ValueSchema,
} from "@browser-capture/contracts"
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react"
import { Button } from "@radix-ui/themes"
import { useState } from "react"

export function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 size={18} />
  if (["failed", "blocked"].includes(status)) return <AlertTriangle size={18} />
  return <Clock3 size={18} />
}

export function ResultValue({ value }: { value: JsonValue | null }) {
  if (value === null) return <span>空值（null）</span>
  if (value === "") return <span>空字符串</span>
  if (Array.isArray(value)) return value.length ? <ol className="context-value-list">{value.map((item, index) => <li key={index}><ResultValue value={item} /></li>)}</ol> : <span>空列表</span>
  if (typeof value === "object") return !Object.keys(value).length ? <span>空记录</span> : <dl className="context-value-record">{Object.entries(value).map(([key, item]) =>
    <div key={key}><dt>{key}</dt><dd><ResultValue value={item} /></dd></div>)}</dl>
  return <span>{String(value)}</span>
}

export function ExecutionResultView({ result, outputContract }: {
  result: TaskExecutionResult
  outputContract: TaskDataContract | null
}) {
  return <><ResultPayload result={result} outputContract={outputContract} />
    {result.failure && <section className="context-alert"><AlertTriangle size={15} /><div>
      <strong>失败原因</strong><p>{result.failure.reason}</p></div></section>}</>
}

function ResultPayload({ result, outputContract }: {
  result: TaskExecutionResult
  outputContract: TaskDataContract | null
}) {
  if (result.payload.mode === "execution") return <div className="context-result-content" data-result-mode="execution">
    <h4>完成回执</h4>
    <p>完成 {result.payload.completedSteps} / {result.payload.totalSteps} 个步骤；
      保存 {result.payload.evidence.length} 份证据产物。</p>
    {result.payload.evidence.length > 0 && <ArtifactList artifacts={result.payload.evidence} />}
  </div>
  const output = result.payload.output
  if (!output) return <p>本次运行没有结构化结果。</p>
  return <TaskOutputView output={output} outputContract={outputContract} />
}

export function TaskOutputView({ output, outputContract }: { output: TaskOutput; outputContract: TaskDataContract | null }) {
  if (!outputContract) return <UnverifiedOutput output={output} reason="本次历史运行未能精确绑定输出合同，未按当前字段合同解读。" />
  if (output.contract.id !== outputContract.id || output.contract.version !== outputContract.version) {
    return <UnverifiedOutput output={output} reason="结果合同与当前任务版本不一致，未按当前字段合同解读。" />
  }
  if (output.kind === "artifact") return <div className="context-artifact-result"><h4>产物兼容信息</h4>
    <ArtifactList artifacts={[output.artifact]} /></div>
  try {
    const value = parseTaskValue(outputContract, output.value)
    return <SchemaValue schema={outputContract.schema} value={value} root />
  } catch {
    return <UnverifiedOutput output={output} reason="结果值不符合已绑定输出合同，未按正式结果解读。" />
  }
}

function SchemaValue({ schema, value, root = false }: { schema: ValueSchema; value: JsonValue; root?: boolean }) {
  if (schema.type === "array") {
    if (!Array.isArray(value)) return <UnrenderableValue value={value} />
    return <CollectionValue schema={schema.items} values={value} />
  }
  if (schema.type !== "object") return root ? <div className="context-scalar-result"><h4>兼容结果</h4>
    <ResultValue value={value} /></div> : <ResultValue value={value} />
  if (!value || typeof value !== "object" || Array.isArray(value)) return <UnrenderableValue value={value} />
  const fields = [...Object.keys(schema.properties),
    ...Object.keys(value).filter((key) => !Object.hasOwn(schema.properties, key))]
  return <div className="context-record">{root && <h4>单条记录</h4>}
    <dl className="context-value-record">{fields.map((key) => <div key={key}><dt>{key}</dt>
      <dd>{Object.hasOwn(value, key) ? <FieldValue schema={schema.properties[key]} value={value[key]!} /> : "未提供"}</dd></div>)}</dl>
  </div>
}

function CollectionValue({ schema, values }: { schema: ValueSchema; values: JsonValue[] }) {
  const [page, setPage] = useState(0)
  const size = 20, pages = Math.max(1, Math.ceil(values.length / size)), current = Math.min(page, pages - 1)
  return <div className="context-record-list"><h4>已保存记录</h4><p>{values.length} 条记录</p>
    {pages > 1 && <div className="result-pagination"><Button size="1" variant="soft" disabled={current === 0}
      onClick={() => setPage(current - 1)}>上一页</Button><span>第 {current + 1} / {pages} 页</span>
      <Button size="1" variant="soft" disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>下一页</Button></div>}
    <ol className="context-value-list" start={current * size + 1}>{values.slice(current * size, (current + 1) * size).map((value, index) =>
      <li key={current * size + index}><details className="result-record-detail" open={values.length === 1}>
        <summary>记录 {current * size + index + 1}</summary><SchemaValue schema={schema} value={value} /></details></li>)}</ol>
  </div>
}

function FieldValue({ schema, value }: { schema: ValueSchema | undefined; value: JsonValue }) {
  if (schema?.type === "string" && typeof value === "string" && value.length > 100) return <p>{value}</p>
  return schema ? <SchemaValue schema={schema} value={value} /> : <ResultValue value={value} />
}

function UnrenderableValue({ value }: { value: JsonValue }) {
  return <><p>结果值与已绑定合同的展示形状不一致。</p>
    <details className="context-technical"><summary>原始结果</summary><pre>{JSON.stringify(value, null, 2)}</pre></details></>
}

function UnverifiedOutput({ output, reason }: {
  output: TaskOutput; reason: string
}) {
  return <><p>{reason}</p><details className="context-technical"><summary>原始结果</summary>
    <pre>{JSON.stringify(output, null, 2)}</pre></details></>
}

function ArtifactList({ artifacts }: { artifacts: ArtifactReference[] }) {
  return <ol className="context-value-list">{artifacts.map((artifact) => <li key={artifact.artifactId}>
    <dl className="context-value-record"><div><dt>媒体类型</dt><dd>{artifact.mediaType}</dd></div>
      <div><dt>产物 ID</dt><dd>{artifact.artifactId}</dd></div>
      <div><dt>摘要</dt><dd>{artifact.digest}</dd></div></dl>
  </li>)}</ol>
}

export function executionStatus(status: string) {
  return ({ queued: "已排队", running: "正在运行", completed: "运行完成", partial: "部分完成",
    waiting_for_human: "等待人工处理", paused: "已暂停", cleanup_required: "待清理",
    blocked: "运行受阻", failed: "运行失败", cancelled: "已取消", stale: "历史运行" } as Record<string, string>)[status] ?? status
}

export function cleanupStatus(status: string) {
  return ({ not_recorded: "未记录", pending: "清理中", confirmed: "已确认",
    unconfirmed: "待确认" } as Record<string, string>)[status] ?? status
}

export function historicalEventStatus(status: string, outcome: string | null) {
  if (status === "planned") return "已排队"
  if (status === "started") return "正在运行"
  return outcome === "success" ? "成功" : `已结束 · ${outcome ?? "未知出口"}`
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}
