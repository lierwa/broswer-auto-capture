import { useEffect, useRef, useState } from "react"
import { Badge, Button, Checkbox, Flex, Select, TextArea, TextField } from "@radix-ui/themes"
import { type CapabilityDescriptor, type ChainNode, type JsonValue, type TaskChain, type TaskDraft } from "@browser-capture/contracts"
import type { BrowserTargetSelectionState } from "@browser-capture/contracts/browser-profile"
import { NodeBindingFields } from "./NodeBindingFields.js"
import { NodeOutputFields } from "./NodeOutputFields.js"
import { actionPresentation, browserActionLabel } from "./chainNodePresentation.js"

export function RevisionNodeEditor({ draft, chain, node, descriptor, targetSelection, busy, onReplaceNode,
  onPickTarget, onCancelTarget }: {
  draft: TaskDraft; chain: TaskChain; node: ChainNode; descriptor: CapabilityDescriptor | null;
  targetSelection: BrowserTargetSelectionState | null; busy: boolean;
  onReplaceNode(node: ChainNode): void; onReplaceCapability?(config: JsonValue): void;
  onPickTarget(): void; onCancelTarget(): void;
}) {
  const [working, setWorking] = useState<ChainNode>(() => structuredClone(node))
  useEffect(() => setWorking(structuredClone(node)), [draft.revision, node.id])
  const update = (patch: Partial<ChainNode>) => setWorking((current) => ({ ...current, ...patch }) as ChainNode)
  const changed = JSON.stringify(working) !== JSON.stringify(node)
  const selection = targetSelection?.draftId === draft.id && targetSelection.chainId === chain.id
    && targetSelection.nodeId === node.id ? targetSelection : null
  const appliedSelection = useRef<string | null>(null)
  const readonly = working.kind === "capability" && !descriptor, disabled = busy || readonly
  useEffect(() => {
    if (working.kind !== "capability" || selection?.status !== "selected" || !selection.id || selection.target === null
      || appliedSelection.current === selection.id) return
    appliedSelection.current = selection.id
    // WHY：目标选择只更新本地待保存节点；一次保存必须同时保留名称、输入和配置。
    setWorking({ ...working, config: setJsonPath(working.config, ["target"], selection.target) })
  }, [selection, working])
  return <div className="revision-node-editor">
    <Flex gap="2" wrap="wrap"><Badge>{actionPresentation(working).type}</Badge>{chain.entry === node.id && <Badge color="green">入口动作</Badge>}</Flex>
    <label className="revision-field"><span>动作名称</span><TextField.Root aria-label="动作名称" value={working.label} disabled={disabled}
      onChange={(event) => update({ label: event.target.value })} /></label>
    {readonly && <p className="revision-readonly">此能力版本没有可用的配置说明，当前仅可查看。</p>}
    <section className="node-config-section"><h4>输入</h4><NodeBindingFields chain={chain} node={working} disabled={disabled} onChange={setWorking} /></section>
    <section className="node-config-section"><h4>输出</h4><NodeOutputFields chain={chain} node={working} disabled={disabled} onChange={setWorking} /></section>
    <section className="node-config-section"><h4>动作设置</h4>
      {"timeoutMs" in working && <label className="revision-field"><span>超时（毫秒）</span><TextField.Root type="number"
        min={working.kind === "function" ? 50 : 1} max={working.kind === "function" ? 5000 : undefined}
        value={String(working.timeoutMs)} disabled={disabled} onChange={(event) => {
          const timeoutMs = Number(event.target.value); if (Number.isInteger(timeoutMs) && timeoutMs > 0) update({ timeoutMs } as Partial<ChainNode>)
        }} /></label>}
      {working.kind === "terminal" && <label className="revision-field"><span>结束说明</span><TextArea value={working.reason}
        disabled={disabled} onChange={(event) => update({ reason: event.target.value } as Partial<ChainNode>)} /></label>}
      {working.kind === "function" && <label className="revision-field"><span>JavaScript 函数</span><TextArea className="revision-code"
        aria-label="JavaScript 函数" value={working.source} disabled={disabled}
        onChange={(event) => update({ source: event.target.value } as Partial<ChainNode>)} /></label>}
      {working.kind === "llm" && <label className="revision-field"><span>固定指令</span><TextArea className="revision-code"
        value={"systemPrompt" in working ? working.systemPrompt : working.instruction} disabled={disabled}
        onChange={(event) => update(("systemPrompt" in working ? { systemPrompt: event.target.value }
          : { instruction: event.target.value }) as Partial<ChainNode>)} /></label>}
      {working.kind === "capability" && descriptor && <CapabilityFields descriptor={descriptor} config={working.config}
        selection={selection} disabled={disabled} onChange={(config) => update({ config } as Partial<ChainNode>)}
        onPickTarget={onPickTarget} onCancelTarget={onCancelTarget} />}
    </section>
    <Button disabled={disabled || !changed || !working.label.trim()} onClick={() => onReplaceNode(working)}>保存动作</Button>
    <p className="revision-hint">保存到本次草稿，发布后用于后续运行。</p>
    <details className="node-config-advanced"><summary>高级信息</summary><p>节点标识：{node.id}</p><pre>{JSON.stringify(working, null, 2)}</pre></details>
  </div>
}

function CapabilityFields({ descriptor, config, selection, disabled, onChange, onPickTarget, onCancelTarget }: {
  descriptor: CapabilityDescriptor; config: JsonValue; selection: BrowserTargetSelectionState | null; disabled: boolean;
  onChange(config: JsonValue): void; onPickTarget(): void; onCancelTarget(): void;
}) {
  return <fieldset className="revision-structured"><legend>{descriptor.displayName}</legend><p>{descriptor.summary}</p>
    {descriptor.editableFields.map((field) => {
      const path = field.path.split(".").slice(1), value = getJsonPath(config, path)
      if (field.control === "browser_target") return <TargetField key={field.path} label={field.label} value={value} selection={selection}
        disabled={disabled} canPick={descriptor.targetMode === "live_browser_picker"} onPickTarget={onPickTarget} onCancelTarget={onCancelTarget} />
      if (field.control === "select") return <label className="revision-field" key={field.path}><span>{field.label}</span>
        <Select.Root {...(typeof value === "string" ? { value } : {})} disabled={disabled}
          onValueChange={(next) => onChange(setJsonPath(config, path, next))}><Select.Trigger />
          <Select.Content>{field.options?.map((option) => <Select.Item key={option.value} value={option.value}>
            {descriptor.family === "browser" ? browserActionLabel(option.value) : option.label}</Select.Item>)}</Select.Content></Select.Root></label>
      if (field.control === "boolean") return <label className="revision-boolean" key={field.path}>
        <Checkbox checked={value === true} disabled={disabled}
          onCheckedChange={(checked) => onChange(setJsonPath(config, path, checked === true))} /><span>{field.label}</span></label>
      if (field.control === "text" || field.control === "number") return <label className="revision-field" key={field.path}>
        <span>{field.label}</span><TextField.Root type={field.control === "number" ? "number" : "text"}
          value={typeof value === "string" || typeof value === "number" ? String(value) : ""} disabled={disabled}
          onChange={(event) => onChange(setJsonPath(config, path,
            field.control === "number" ? Number(event.target.value) : event.target.value))} /></label>
      return <div className="revision-readonly" key={field.path}><strong>{field.label}</strong><p>此字段只读。</p></div>
    })}
  </fieldset>
}

function TargetField({ label, value, selection, disabled, canPick, onPickTarget, onCancelTarget }: {
  label: string; value: JsonValue | undefined; selection: BrowserTargetSelectionState | null; disabled: boolean; canPick: boolean;
  onPickTarget(): void; onCancelTarget(): void;
}) {
  const active = selection && ["opening", "selecting"].includes(selection.status)
  const saved = value && typeof value === "object" && !Array.isArray(value)
  return <div className="revision-target-field"><span>{label}</span><div>
    <Badge color={selection?.status === "selected" ? "green" : active ? "amber" : "gray"}>
      {selection?.status === "opening" ? "正在打开浏览器" : selection?.status === "selecting" ? "等待页面点击"
        : selection?.status === "selected" ? `已选择 ${selection.tag}` : saved ? "已保存页面目标" : "尚未选择"}</Badge>
    {active ? <Button size="1" variant="soft" color="red" disabled={disabled} onClick={onCancelTarget}>取消选择</Button>
      : <Button size="1" variant="soft" disabled={disabled || !canPick} onClick={onPickTarget}>在浏览器中选择</Button>}</div>
    {selection?.error && <small>{targetSelectionError(selection.error)}</small>}</div>
}

function getJsonPath(value: JsonValue, path: string[]): JsonValue | undefined {
  let current: JsonValue | undefined = value
  for (const part of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined
    current = current[part]
  }
  return current
}

export function setJsonPath(value: JsonValue, path: string[], next: JsonValue): JsonValue {
  if (!path.length) return next
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {}
  const [head, ...tail] = path
  return { ...source, [head!]: setJsonPath(source[head!] ?? {}, tail, next) }
}

function targetSelectionError(error: NonNullable<BrowserTargetSelectionState["error"]>) {
  return ({ target_selection_start_failed: "专用浏览器未能打开。", target_selection_failed: "没有取得可复跑的目标，请重试。",
    target_selection_timeout: "等待点击超时，请重新选择。", target_selection_cancelled: "目标选择已取消。",
    target_selection_cleanup_unconfirmed: "目标已取得，但浏览器资源清理未确认；请先重试关闭。" } as const)[error]
}
