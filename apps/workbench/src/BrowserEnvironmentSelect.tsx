import { useId } from "react"
import { RadioCards, Switch } from "@radix-ui/themes"
import { Chrome, Monitor } from "lucide-react"
import type { BrowserMode } from "@browser-capture/contracts/browser-profile"

export const browserModeLabels: Record<BrowserMode, string> = {
  daily: "日常 Chrome", "dedicated-visible": "专属浏览器 · 显示窗口",
  "dedicated-headless": "专属浏览器 · 后台运行",
}
const browserSources = [
  { value: "daily", label: "日常 Chrome", description: "使用日常登录状态", Icon: Chrome },
  { value: "dedicated", label: "专属浏览器", description: "由 B-A-T 管理", Icon: Monitor },
] as const
export function recordedBrowserLabel(browser: { mode?: BrowserMode | undefined } | undefined) {
  return browser?.mode ? browserModeLabels[browser.mode] : "历史记录未注明模式"
}
export function BrowserEnvironmentSelect({ value, onChange, disabled }: {
  value: BrowserMode; onChange(mode: BrowserMode): void; disabled?: boolean
}) {
  const dedicated = value !== "daily"
  // WHY：来源和窗口可见性是两层选择；只映射原三个枚举，不另存一份 UI 配置。
  return <div className="browser-environment-selection">
    <RadioCards.Root className="browser-environment-choices" columns="2" gap="2"
      aria-label="选择浏览器" value={dedicated ? "dedicated" : "daily"} disabled={disabled ?? false}
      onValueChange={source => onChange(source === "daily" ? "daily" : "dedicated-visible")}>
      {browserSources.map(({ value: source, label, description, Icon }) => <RadioCards.Item key={source} value={source} aria-label={label}>
        <span className="browser-environment-choice-title"><Icon size={18} aria-hidden="true" /><strong>{label}</strong></span>
        <span className="browser-environment-choice-description">{description}</span>
      </RadioCards.Item>)}
    </RadioCards.Root>
  </div>
}

export function DedicatedBrowserVisibility({ value, onChange, disabled }: {
  value: BrowserMode; onChange(mode: BrowserMode): void; disabled?: boolean
}) {
  const switchId = useId()
  return <div className="browser-window-setting">
      <Monitor size={21} aria-hidden="true" />
      <div><label htmlFor={switchId}>显示任务窗口</label>
        <p id={`${switchId}-description`}>{value === "dedicated-headless" ? "任务在后台运行" : "在窗口中查看任务操作"}</p></div>
      <Switch id={switchId} radius="full" aria-label="运行时显示浏览器窗口" aria-describedby={`${switchId}-description`} checked={value === "dedicated-visible"}
        disabled={disabled ?? false} onCheckedChange={visible => onChange(visible ? "dedicated-visible" : "dedicated-headless")} />
    </div>
}
