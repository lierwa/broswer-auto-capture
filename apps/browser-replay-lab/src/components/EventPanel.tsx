import { Badge, Card, Flex, Grid, Text } from "@radix-ui/themes"
import type { ScenarioObservedFacts } from "../scenario-contract.js"

const fields: readonly [keyof ScenarioObservedFacts, string][] = [
  ["targetDispatches", "Target dispatches"],
  ["preparationDispatches", "Preparations"],
  ["nativeDialogs", "Native dialogs"],
  ["trustedEvents", "Trusted events"],
  ["scrollEvents", "Scroll events"],
  ["businessEffects", "Business effects"],
]

export function EventPanel({ facts }: { readonly facts: ScenarioObservedFacts }) {
  return <Card className="event-panel">
    <Flex justify="between" align="center" mb="4">
      <Text size="2" weight="bold">LIVE FACT STREAM</Text>
      <Badge color="green" variant="soft">ORACLE-BLIND</Badge>
    </Flex>
    <Grid columns={{ initial: "2", sm: "3" }} gap="3">
      {fields.map(([field, label]) => <div className="metric" key={field}>
        <Text size="1" color="gray">{label}</Text>
        <Text size="6" weight="bold">{String(facts[field])}</Text>
      </div>)}
    </Grid>
    <Text as="p" mt="4" size="1" color="gray">last target: {facts.lastEventTarget ?? "—"}</Text>
  </Card>
}
