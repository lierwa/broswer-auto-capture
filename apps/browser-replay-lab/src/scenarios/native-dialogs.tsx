import { useEffect } from "react"
import { Button, Card, Flex, Text } from "@radix-ui/themes"
import type { ScenarioId } from "../scenario-contract.js"

export function NativeDialogScenario({ scenarioId, activate, dialog }: {
  readonly scenarioId: ScenarioId
  readonly activate: () => void
  readonly dialog: () => void
}) {
  useEffect(() => {
    if (scenarioId !== "beforeunload-declared") return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [scenarioId])
  const trigger = () => {
    dialog()
    if (scenarioId === "native-alert-declared") { window.alert("declared fixture alert"); activate() }
    else if (scenarioId === "native-confirm-unexpected") {
      if (window.confirm("unexpected fixture confirmation")) activate()
    } else if (scenarioId === "native-prompt-unexpected") {
      if (window.prompt("unexpected fixture prompt", "") !== null) activate()
    } else if (scenarioId === "beforeunload-declared") {
      activate()
      window.location.assign(`/frame/overlay?from=${encodeURIComponent(location.href)}`)
    }
  }
  return <Card className="native-console">
    <Flex direction="column" gap="4" align="start">
      <Text className="eyebrow" size="1">NATIVE BROWSER BOUNDARY</Text>
      <Text size="5" weight="bold">The page cannot style or conceal this event.</Text>
      <Button color="amber" size="4" data-testid="business-target" onClick={trigger}>Trigger native boundary</Button>
    </Flex>
  </Card>
}
