import { Button, Checkbox, Flex, Select, TextField } from "@radix-ui/themes"
import { useState } from "react"
import type { ChainNode, TaskChain, ValueSchema } from "@browser-capture/contracts"
import { defaultSchema, outputConsumers, schemaFields, schemaTypeLabels } from "./nodeConfigurationModel.js"

export function NodeOutputFields({ chain, node, disabled, onChange }: {
  chain: TaskChain; node: ChainNode; disabled: boolean; onChange(node: ChainNode): void;
}) {
  const schema = node.outputContract.schema, consumers = outputConsumers(chain, node)
  return <div className="node-output-fields">
    {node.kind === "function" ? <SchemaEditor schema={schema} disabled={disabled} onChange={(next) =>
      onChange({ ...node, outputContract: { ...node.outputContract, schema: next } })} />
      : <dl className="node-output-list">{[{ path: [], schema }, ...schemaFields(schema).filter((field) => field.path.length)]
        .map((field) => <div key={field.path.join(".")}><dt>{field.path.join(".") || "完整输出"}</dt><dd>{schemaTypeLabels[field.schema.type]}</dd></div>)}</dl>}
    <p className="revision-hint">{consumers.length ? `供后续动作使用：${consumers.join("、")}` : "尚无后续动作引用此输出。"}</p>
    {node.kind === "function" && <p className="revision-hint">函数返回值必须符合这里的字段和类型；修改后需重新验证。</p>}
  </div>
}

function SchemaEditor({ schema, disabled, onChange }: { schema: ValueSchema; disabled: boolean; onChange(schema: ValueSchema): void }) {
  const [name, setName] = useState("")
  const validName = name.trim().length > 0 && !["__proto__", "constructor", "prototype"].includes(name)
    && schema.type === "object" && !Object.hasOwn(schema.properties, name)
  return <div className="node-schema-editor"><SchemaType schema={schema} disabled={disabled} onChange={onChange} />
    {schema.type === "array" && <fieldset className="revision-structured"><legend>列表项</legend>
      <SchemaEditor schema={schema.items} disabled={disabled} onChange={(items) => onChange({ ...schema, items })} /></fieldset>}
    {schema.type === "object" && <><div>{Object.entries(schema.properties).map(([key, child]) =>
      <fieldset className="revision-structured" key={key}><legend>{key}</legend>
        <SchemaEditor schema={child} disabled={disabled} onChange={(next) => onChange({ ...schema, properties: { ...schema.properties, [key]: next } })} />
        <Flex gap="3" align="center"><label><Checkbox disabled={disabled} checked={schema.required.includes(key)}
          onCheckedChange={(checked) => onChange({ ...schema, required: checked ? [...schema.required, key] : schema.required.filter((item) => item !== key) })} /> 必填</label>
          <Button size="1" variant="ghost" color="red" disabled={disabled} onClick={() => {
            const properties = { ...schema.properties }; delete properties[key]
            onChange({ ...schema, properties, required: schema.required.filter((item) => item !== key) })
          }}>移除字段</Button></Flex>
      </fieldset>)}</div><Flex gap="2"><TextField.Root placeholder="输出字段名称" aria-label="输出字段名称" value={name}
        disabled={disabled} onChange={(event) => setName(event.target.value)} /><Button size="2" variant="soft" disabled={disabled || !validName}
          onClick={() => { onChange({ ...schema, properties: { ...schema.properties, [name]: { type: "string" } }, required: [...schema.required, name] }); setName("") }}>添加字段</Button></Flex></>}
  </div>
}

function SchemaType({ schema, disabled, onChange }: { schema: ValueSchema; disabled: boolean; onChange(schema: ValueSchema): void }) {
  return <Select.Root value={schema.type} disabled={disabled} onValueChange={(type) => onChange(defaultSchema(type as ValueSchema["type"]))}>
    <Select.Trigger aria-label="数据类型" /><Select.Content>{Object.entries(schemaTypeLabels).map(([type, label]) =>
      <Select.Item key={type} value={type}>{label}</Select.Item>)}</Select.Content></Select.Root>
}
