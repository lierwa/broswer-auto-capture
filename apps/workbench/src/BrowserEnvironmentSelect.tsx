import { RadioCards, Select } from "@radix-ui/themes"
import { Chrome, Monitor, EyeOff } from "lucide-react"
import type { BrowserMode } from "@browser-capture/contracts/browser-profile"

export const browserModeLabels: Record<BrowserMode, string> = {
  daily: "日常 Chrome", "dedicated-visible": "专属浏览器 · 可见",
  "dedicated-headless": "专属浏览器 · 无头",
}
const browserModeDescriptions: Record<BrowserMode, string> = {
  daily: "使用日常登录账号，任务在独立窗口中执行。",
  "dedicated-visible": "使用 B-A-T 专属账号，可看到浏览器操作。",
  "dedicated-headless": "使用同一套专属账号，在后台运行，不显示窗口。",
}
const browserModeIcons = { daily: Chrome, "dedicated-visible": Monitor, "dedicated-headless": EyeOff }
export function recordedBrowserLabel(browser: { mode?: BrowserMode | undefined } | undefined) {
  return browser?.mode ? browserModeLabels[browser.mode] : "历史记录未注明模式"
}
export function BrowserEnvironmentSelect({ value, onChange, disabled, visibleRequired = false, presentation = "select" }: {
  value: BrowserMode; onChange(mode: BrowserMode): void; disabled?: boolean; visibleRequired?: boolean
  presentation?: "select" | "choices"
}) {
  if (presentation === "choices") return <RadioCards.Root className="browser-environment-choices" columns="1" gap="2"
    aria-label="浏览器环境" value={value} disabled={disabled ?? false} onValueChange={mode => onChange(mode as BrowserMode)}>
    {Object.entries(browserModeLabels).map(([mode, label]) => {
      const Icon = browserModeIcons[mode as BrowserMode]
      return <RadioCards.Item key={mode} value={mode} disabled={visibleRequired && mode === "dedicated-headless"}>
        <Icon size={20} aria-hidden="true" />
        <span className="browser-environment-choice-copy"><strong>{label}</strong>
          <span>{browserModeDescriptions[mode as BrowserMode]}</span></span>
        <span className="browser-environment-choice-indicator" aria-hidden="true" />
      </RadioCards.Item>
    })}
  </RadioCards.Root>
  return <Select.Root value={value} disabled={disabled ?? false} onValueChange={mode => onChange(mode as BrowserMode)}>
    <Select.Trigger aria-label="浏览器环境" />
    <Select.Content>{Object.entries(browserModeLabels).map(([mode, label]) =>
      <Select.Item key={mode} value={mode} disabled={visibleRequired && mode === "dedicated-headless"}>{label}</Select.Item>
    )}</Select.Content>
  </Select.Root>
}
