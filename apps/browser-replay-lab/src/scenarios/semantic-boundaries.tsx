import { useState } from "react"
import { Button, Card, Flex, Popover, Text, TextField } from "@radix-ui/themes"
import { BusinessSurface } from "../components/BusinessSurface.js"
import type { ScenarioId } from "../scenario-contract.js"

export function SemanticScenario({ scenarioId, activate, prepare }: {
  readonly scenarioId: ScenarioId
  readonly activate: () => void
  readonly prepare: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  if (scenarioId === "business-confirmation") return <Card className="semantic-card">
    <Flex direction="column" gap="4" align="start">
      <Text className="eyebrow" size="1">TASK-OWNED CONFIRMATION</Text>
      <Text size="6" weight="bold">Delete the staged record?</Text>
      <Button color="red" data-testid="business-confirmation" onClick={() => { setConfirmed(true); activate() }}>
        Confirm required action
      </Button>
      <Text>{confirmed ? "Business confirmation recorded" : "Awaiting the declared task action"}</Text>
    </Flex>
  </Card>
  if (scenarioId === "login-captcha-permission") return <Card className="semantic-card">
    <Flex direction="column" gap="4">
      <Text className="eyebrow" size="1">HUMAN CONTROL REQUIRED</Text>
      <Text size="6" weight="bold">Authentication boundary</Text>
      <TextField.Root placeholder="One-time code" data-testid="human-input" />
      <Button disabled data-testid="business-target">Continue after user verification</Button>
    </Flex>
  </Card>
  if (scenarioId === "legitimate-popover") return <Card className="semantic-card">
    <Popover.Root defaultOpen>
      <Popover.Trigger><Button data-testid="menu-trigger">Open task menu</Button></Popover.Trigger>
      <Popover.Content data-testid="legitimate-popover"><Flex direction="column" gap="3">
        <Text weight="bold">This menu is part of the task.</Text>
        <Button data-testid="business-target" onClick={activate}>Choose required option</Button>
      </Flex></Popover.Content>
    </Popover.Root>
  </Card>
  return <BusinessSurface onActivate={activate} />
}
