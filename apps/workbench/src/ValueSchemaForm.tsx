import { Button, Checkbox, Select, TextField } from "@radix-ui/themes"
import type { JsonValue, TaskDataContract, ValueSchema } from "@browser-capture/contracts"

export function initialValue(schema: ValueSchema): JsonValue {
  if (schema.type === "null") return null
  if (schema.type === "boolean") return false
  if (schema.type === "string") return schema.enum?.[0] ?? ""
  if (schema.type === "number" || schema.type === "integer") return schema.minimum ?? 0
  if (schema.type === "array") return Array.from({ length: schema.minItems ?? 0 }, () => initialValue(schema.items))
  const objectSchema = schema as Extract<ValueSchema, { type: "object" }>
  return Object.fromEntries(objectSchema.required.map((key) => [key, initialValue(objectSchema.properties[key]!)]))
}

export function ValueSchemaForm({ contract, value, onChange, disabled = false, label }: {
  contract: TaskDataContract; value: JsonValue; onChange(value: JsonValue): void; disabled?: boolean; label?: string;
}) {
  return <div className="value-form" aria-label="业务输入表单">
    <ValueField schema={contract.schema} value={value} onChange={onChange} disabled={disabled} path={[]} rootLabel={label} />
  </div>
}

function ValueField({ schema, value, onChange, disabled, path, rootLabel }: {
  schema: ValueSchema; value: JsonValue | undefined; onChange(value: JsonValue): void; disabled: boolean; path: string[];
  rootLabel?: string | undefined;
}) {
  const label = path.length ? fieldLabel(path.at(-1)!) : rootLabel ?? "任务输入"
  const name = path.length ? path.join(".") : "task-input"
  if (schema.type === "null" || schema.type === "object" && Object.keys(schema.properties).length === 0)
    return <p className="value-form-empty">{rootLabel ? `${rootLabel}为空。` : "这个任务没有可填写的运行参数。"}</p>
  if (schema.type === "boolean") return <label className="value-boolean"><Checkbox checked={value === true}
    disabled={disabled} onCheckedChange={(checked) => onChange(checked === true)} /> <span>{label}</span></label>
  if (schema.type === "string" && schema.enum) return <label className="value-field"><span>{label}</span>
    <Select.Root value={typeof value === "string" ? value : (schema.enum[0] ?? "")} disabled={disabled}
      onValueChange={(next) => onChange(next)}><Select.Trigger aria-label={label} /><Select.Content>{schema.enum.map((option) =>
        <Select.Item value={option} key={option}>{option}</Select.Item>)}</Select.Content></Select.Root></label>
  if (schema.type === "string") return <label className="value-field"><span>{label}</span><TextField.Root
    name={name} autoComplete="off" value={typeof value === "string" ? value : ""} disabled={disabled}
    minLength={schema.minLength} maxLength={schema.maxLength}
    onChange={(event) => onChange(event.target.value)} /></label>
  if (schema.type === "number" || schema.type === "integer") return <label className="value-field"><span>{label}</span>
    <TextField.Root name={name} autoComplete="off" type="number" inputMode="decimal" value={typeof value === "number" ? String(value) : ""} disabled={disabled}
      min={schema.minimum} max={schema.maximum} step={schema.type === "integer" ? 1 : "any"}
      onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next) }} /></label>
  if (schema.type === "array") {
    const values = Array.isArray(value) ? value : []
    return <fieldset className="value-group"><legend>{label}</legend><div className="value-array">{values.map((item, index) =>
      <div className="value-array-item" key={index}><ValueField schema={schema.items} value={item}
        disabled={disabled} path={[...path, String(index + 1)]}
        onChange={(next) => onChange(values.map((entry, current) => current === index ? next : entry))} />
        <Button type="button" size="1" variant="ghost" color="gray" disabled={disabled || values.length <= (schema.minItems ?? 0)}
          aria-label={`移除${label}第 ${index + 1} 项`}
          onClick={() => onChange(values.filter((_, current) => current !== index))}>移除</Button></div>)}</div>
      <Button type="button" size="1" variant="soft" disabled={disabled || values.length >= (schema.maxItems ?? 20)}
        onClick={() => onChange([...values, initialValue(schema.items)])}>添加一项</Button></fieldset>
  }
  const objectSchema = schema as Extract<ValueSchema, { type: "object" }>
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : {}
  return <fieldset className="value-group"><legend>{label}</legend>{Object.entries(objectSchema.properties).map(([key, child]) => {
    const required = objectSchema.required.includes(key), enabled = required || Object.hasOwn(record, key)
    return <div className="value-object-field" key={key}>{!required && <label className="value-optional"><Checkbox
      checked={enabled} disabled={disabled} onCheckedChange={(checked) => {
        const next = { ...record }; if (checked === true) next[key] = initialValue(child); else delete next[key]; onChange(next)
      }} />填写 {fieldLabel(key)}</label>}{enabled && <ValueField schema={child} value={record[key]} disabled={disabled}
        path={[...path, key]} onChange={(next) => onChange({ ...record, [key]: next })} />}</div>
  })}</fieldset>
}

function fieldLabel(value: string) {
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim()
  return spaced ? spaced[0]!.toLocaleUpperCase() + spaced.slice(1) : "字段"
}
