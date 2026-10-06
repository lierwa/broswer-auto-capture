import { Select } from "@radix-ui/themes"
import type { BrowserMode } from "@browser-capture/contracts/browser-profile"
import { browserModeLabels } from "./BrowserEnvironmentSelect.js"
import type { useTaskBrowserEnvironment } from "./useTaskBrowserEnvironment.js"

export function TaskBrowserSelect({ environment, disabled, onChange }: {
  environment: ReturnType<typeof useTaskBrowserEnvironment>; disabled?: boolean; onChange?(): void
}) {
  return <div className="run-browser-row"><span>本任务浏览器</span>
    <Select.Root value={environment.state?.mode ?? ""}
      disabled={disabled || environment.busy || !environment.state}
      onValueChange={value => { void environment.select(value as BrowserMode).then(saved => { if (saved) onChange?.() }) }}>
      <Select.Trigger aria-label="本任务浏览器" placeholder="正在读取…" />
      <Select.Content position="popper">
        {Object.entries(browserModeLabels).map(([value, label]) => <Select.Item key={value} value={value}>{label}</Select.Item>)}
      </Select.Content>
    </Select.Root>
    {environment.state?.override === null ? <small>使用全局设置</small> : environment.state &&
      <button type="button" disabled={disabled || environment.busy}
        onClick={() => { void environment.select(null).then(saved => { if (saved) onChange?.() }) }}>恢复全局设置</button>}
  </div>
}
