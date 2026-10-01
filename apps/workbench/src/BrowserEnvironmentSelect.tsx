import { Select } from "@radix-ui/themes"
import type { BrowserMode } from "@browser-capture/contracts/browser-profile"

export const browserModeLabels: Record<BrowserMode, string> = {
  daily: "日常 Chrome", "dedicated-visible": "专属 Profile · 可见浏览器",
  "dedicated-headless": "专属 Profile · 无头浏览器",
}
export function recordedBrowserLabel(browser: { mode?: BrowserMode | undefined } | undefined) {
  return browser?.mode ? browserModeLabels[browser.mode] : "历史记录未注明模式"
}
export function BrowserEnvironmentSelect({ value, onChange, disabled, visibleRequired = false }: {
  value: BrowserMode; onChange(mode: BrowserMode): void; disabled?: boolean; visibleRequired?: boolean
}) {
  return <Select.Root value={value} disabled={disabled ?? false} onValueChange={mode => onChange(mode as BrowserMode)}>
    <Select.Trigger aria-label="浏览器环境" />
    <Select.Content>{Object.entries(browserModeLabels).map(([mode, label]) =>
      <Select.Item key={mode} value={mode} disabled={visibleRequired && mode === "dedicated-headless"}>{label}</Select.Item>
    )}</Select.Content>
  </Select.Root>
}
