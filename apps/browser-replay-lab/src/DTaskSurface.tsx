import { Badge, Box, Card, Flex, Heading, Text, Theme } from "@radix-ui/themes"

const samples = {
  "card-a": { title: "Navigator Keyboard", brand: "Northstar", shop: "Northstar Official Store",
    price: "¥1,299.00", description: "Full-size wireless keyboard with low-latency browser shortcut keys." },
  "card-b": { title: "Navigator Keyboard Cover", brand: "Northstar", shop: "Everyday Accessories",
    price: "¥2,099.00", description: "Protective silicone cover; accessory only, not a keyboard." },
} as const
const semantics = {
  "semantic-a": ["Wireless keyboard designed for reliable browser navigation.",
    "Protective keyboard sleeve sold separately.", "Remote setup and maintenance service."],
  "semantic-b": ["Annual device support service.", "USB receiver accessory for an existing keyboard.",
    "Complete compact keyboard with browser controls."],
} as const

export function DTaskSurface() {
  const sample = new URLSearchParams(location.search).get("sample") ?? "card-a"
  const card = samples[sample as keyof typeof samples]
  const descriptions = semantics[sample as keyof typeof semantics]
  return <Theme appearance="dark" accentColor="lime" grayColor="sage" radius="large">
    <Box className="lab-shell"><header className="lab-header"><div><Text className="eyebrow" size="1">B-A-T / D5 CONTROLLED TASK</Text>
      <Heading size="7">Stable/v2 controlled acceptance</Heading></div><Badge color="lime">{sample}</Badge></header>
      <main className="scenario-stage">{card ? <Card className="d-card" data-sample={sample}>
        <Flex direction="column" gap="2"><Heading className="d-title" size="5">{card.title}</Heading>
          <Text className="d-brand">{card.brand}</Text><Text className="d-shop">{card.shop}</Text>
          <Text className="d-price" size="6">{card.price}</Text><Text className="d-description">{card.description}</Text></Flex>
      </Card> : <Flex direction="column" gap="3">{descriptions?.map((description, index) =>
        <Card className="d-semantic" data-candidate-id={`candidate_${index + 1}`} key={description}>
          <Text>{description}</Text></Card>)}</Flex>}</main>
    </Box>
  </Theme>
}
