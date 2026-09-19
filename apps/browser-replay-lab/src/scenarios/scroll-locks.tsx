import { useEffect } from "react"
import { Button, Card, Flex, Text } from "@radix-ui/themes"
import type { ScenarioId } from "../scenario-contract.js"

export function ScrollScenario({ scenarioId, onScrollEvent, activate }: {
  readonly scenarioId: ScenarioId
  readonly onScrollEvent: () => void
  readonly activate: () => void
}) {
  useEffect(() => {
    const previous = { html: document.documentElement.style.cssText, body: document.body.style.cssText }
    const report = () => onScrollEvent()
    const prevent = (event: WheelEvent) => { event.preventDefault(); onScrollEvent() }
    window.addEventListener("scroll", report, true)
    if (scenarioId === "overflow-hidden-lock") {
      document.documentElement.style.overflow = "hidden"
      document.body.style.overflow = "hidden"
    }
    if (scenarioId === "position-fixed-lock") {
      document.body.style.position = "fixed"
      document.body.style.inset = "0"
      document.body.style.width = "100%"
    }
    if (scenarioId === "wheel-prevented") window.addEventListener("wheel", prevent, { capture: true, passive: false })
    return () => {
      document.documentElement.style.cssText = previous.html
      document.body.style.cssText = previous.body
      window.removeEventListener("scroll", report, true)
      window.removeEventListener("wheel", prevent, true)
    }
  }, [onScrollEvent, scenarioId])

  if (scenarioId === "nested-scroll-container") return <Card className="nested-shell">
    <Text className="eyebrow" size="1">NESTED SCROLL DOCUMENT</Text>
    <div className="nested-scroller" data-testid="nested-scroller" onScroll={onScrollEvent}>
      <div className="nested-content"><Text size="5" weight="bold">Scroll this instrument, not the page.</Text>
        <Button data-testid="business-target" onClick={activate}>Commit nested target</Button></div>
    </div>
  </Card>

  return <Flex direction="column" gap="5" className="scroll-stage">
    <Card><Text className="eyebrow" size="1">PHYSICAL WHEEL TEST</Text><Text as="p" size="6" weight="bold">Scroll telemetry spans the full document.</Text></Card>
    <div className="scroll-spacer" />
    <Button data-testid="business-target" onClick={activate}>End-of-document target</Button>
  </Flex>
}
