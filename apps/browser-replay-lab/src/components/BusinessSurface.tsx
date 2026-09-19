import { Button, Card, Flex, Text } from "@radix-ui/themes"
import { CrosshairIcon } from "lucide-react"

export function BusinessSurface({ onActivate, generation = 0, compact = false }: {
  readonly onActivate: () => void
  readonly generation?: number
  readonly compact?: boolean
}) {
  return <Card className={compact ? "business-card compact" : "business-card"} data-testid="business-surface">
    <Flex direction="column" gap="4" align="start">
      <Text size="1" className="eyebrow">PRIMARY BUSINESS SURFACE · GEN {generation}</Text>
      <Text size="6" weight="bold">Commit the verified action</Text>
      <Text color="gray" size="2">The instrumented target records a business effect only when a real pointer reaches it.</Text>
      <Button size="4" data-testid="business-target" onClick={onActivate}>
        <CrosshairIcon size={18} /> Execute target
      </Button>
    </Flex>
  </Card>
}
