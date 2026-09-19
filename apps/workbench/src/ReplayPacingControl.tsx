import { Badge, Flex, Slider, Text } from "@radix-ui/themes"

export const DEFAULT_REPLAY_NODE_DELAY_MS = 1600

export function ReplayPacingControl({ value, disabled = false, live = false, onValueChange, onValueCommit }: {
  readonly value: number
  readonly disabled?: boolean
  readonly live?: boolean
  onValueChange(value: number): void
  onValueCommit?(value: number): void
}) {
  const label = value === 0 ? "即时" : `${(value / 1000).toFixed(1)} 秒`
  return <div className="replay-pacing" aria-label="复跑节点节奏控制">
    <Flex justify="between" align="center" gap="3">
      <div><Text as="div" size="2" weight="bold">复跑节点节奏</Text>
        <Text as="div" size="1" color="gray">每个节点开始前留出的观察时间；不计入自动化预算。{live ? "松开后从下一个节点生效。" : ""}</Text></div>
      <Flex align="center" gap="2">{live && <Badge color="amber" variant="soft">运行中可调</Badge>}
        <output className="pacing-value">{label}</output></Flex>
    </Flex>
    <Slider min={0} max={5000} step={200} value={[value]} disabled={disabled}
      onValueChange={([next]) => onValueChange(next ?? value)}
      onValueCommit={([next]) => onValueCommit?.(next ?? value)}
      aria-label="每个节点开始前的观察时间" />
    <Flex className="pacing-scale" justify="between">
      <Text size="1" color="gray">0 · 即时</Text><Text size="1" color="gray">1.6s · 自然</Text>
      <Text size="1" color="gray">3.0s · 慢速</Text><Text size="1" color="gray">5.0s · 逐步观察</Text>
    </Flex>
  </div>
}
