import { Button, Flex, Select, TextField } from "@radix-ui/themes"
import { useState } from "react"
import type { ChainNode, TaskChain, ValueBinding, ValueSchema } from "@browser-capture/contracts"
import { ValueSchemaForm, initialValue } from "./ValueSchemaForm.js"
import { bindingChoices, defaultSchema, editableInputs, replaceInputs, schemaTypeLabels, valueSchema, type BindingChoice } from "./nodeConfigurationModel.js"

export function NodeBindingFields({ chain, node, disabled, onChange }: {
  chain: TaskChain; node: ChainNode; disabled: boolean; onChange(node: ChainNode): void;
}) {
  const inputs = editableInputs(node), choices = bindingChoices(chain, node)
  const [name, setName] = useState("")
  if (!inputs) return <p className="revision-hint">此动作没有可单独配置的输入。</p>
  const update = (key: string, binding: ValueBinding) => onChange(replaceInputs(node, { ...inputs, [key]: binding }))
  const validName = /^[A-Za-z_][A-Za-z0-9_-]{0,79}$/.test(name) && !Object.hasOwn(inputs, name)
    && !["__proto__", "constructor", "prototype"].includes(name)
  return <div className="node-binding-fields">
    {!Object.keys(inputs).length && <p className="revision-hint">此动作没有输入参数。</p>}
    {Object.entries(inputs).map(([key, binding]) => <fieldset className="revision-structured" key={key}><legend>{inputLabel(node, key)}</legend>
      <BindingField name={inputLabel(node, key)} binding={binding} choices={choices} disabled={disabled}
        allowTypeChange={node.kind === "function"} onChange={(next) => update(key, next)} />
      {node.kind === "function" && <Button size="1" variant="ghost" color="red" disabled={disabled} onClick={() => {
        const next = { ...inputs }; delete next[key]; onChange(replaceInputs(node, next))
      }}>移除此输入</Button>}
    </fieldset>)}
    {node.kind === "function" && <Flex gap="2"><TextField.Root placeholder="新输入名称" aria-label="新输入名称" value={name}
      disabled={disabled} onChange={(event) => setName(event.target.value)} /><Button size="2" variant="soft"
        disabled={disabled || !validName} onClick={() => { update(name, { source: "constant", value: "" }); setName("") }}>添加输入</Button></Flex>}
  </div>
}

function BindingField({ name, binding, choices, disabled, allowTypeChange, onChange }: {
  name: string; binding: ValueBinding; choices: BindingChoice[]; disabled: boolean; onChange(binding: ValueBinding): void;
  allowTypeChange: boolean;
}) {
  const selected = binding.source === "constant" ? "constant" : JSON.stringify(binding)
  const known = choices.some((item) => item.key === selected)
  const fallback = binding.source === "variable" ? `运行变量 · ${binding.name}` : "现有引用（当前不可选）"
  return <div className="node-binding-field"><Select.Root value={selected} disabled={disabled} onValueChange={(key) => {
    if (key === "constant") onChange({ source: "constant", value: "" })
    else { const found = choices.find((item) => item.key === key); if (found) onChange(found.binding) }
  }}><Select.Trigger aria-label={`${name}输入来源`} /><Select.Content>
      <Select.Item value="constant">固定值</Select.Item>
      {choices.map((item) => <Select.Item key={item.key} value={item.key}>{item.label}</Select.Item>)}
      {binding.source !== "constant" && !known && <Select.Item value={selected} disabled>{fallback}</Select.Item>}
    </Select.Content></Select.Root>
    {binding.source === "constant" && <>{allowTypeChange && <Select.Root value={valueSchema(binding.value).type} disabled={disabled}
      onValueChange={(type) => onChange({ source: "constant", value: initialValue(defaultSchema(type as ValueSchema["type"])) })}>
      <Select.Trigger aria-label={`${name}固定值类型`} /><Select.Content>{Object.entries(schemaTypeLabels).map(([type, label]) =>
        <Select.Item key={type} value={type}>{label}</Select.Item>)}</Select.Content></Select.Root>}
      <ValueSchemaForm label={name} contract={{ id: "node-editor", version: 1,
      dialect: "bat-value-schema/v1", schema: valueSchema(binding.value) }} value={binding.value} disabled={disabled}
      onChange={(value) => onChange({ source: "constant", value })} /></>}
    {binding.source !== "constant" && <p className="revision-hint">运行时读取所选数据，无需手动复制。</p>}
  </div>
}

function inputLabel(node: ChainNode, key: string) {
  if (node.kind !== "capability" || !node.capability.name.startsWith("browser.")) return key
  return ({ url: "网址", text: "输入内容", clear: "输入前清空", seconds: "等待时长（秒）",
    targetOrdinal: "目标位置", keys: "按键", value: "选项值", direction: "方向", amount: "距离" } as Record<string, string>)[key] ?? key
}
