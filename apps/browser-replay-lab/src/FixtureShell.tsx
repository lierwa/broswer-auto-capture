import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge, Box, Flex, Heading, Text, Theme } from "@radix-ui/themes"
import { ActivityIcon, FlaskConicalIcon } from "lucide-react"
import { BusinessSurface } from "./components/BusinessSurface.js"
import { EventPanel } from "./components/EventPanel.js"
import { scenarioConfigSchema, type ScenarioObservedFacts } from "./scenario-contract.js"
import { scenarioById } from "./scenario-registry.js"
import { NativeDialogScenario } from "./scenarios/native-dialogs.js"
import { OverlayScenario } from "./scenarios/overlays.js"
import { ScrollScenario } from "./scenarios/scroll-locks.js"
import { SemanticScenario } from "./scenarios/semantic-boundaries.js"

declare global { interface Window { __BAT_FIXTURE__?: ScenarioObservedFacts } }

export function FixtureShell() {
  const config = useMemo(readConfig, [])
  const definition = scenarioById.get(config.scenarioId)
  if (!definition) throw new Error("fixture_scenario_missing")
  const [facts, setFacts] = useState<ScenarioObservedFacts>({
    scenarioId: config.scenarioId,
    runId: config.runId,
    targetDispatches: 0,
    preparationDispatches: 0,
    nativeDialogs: 0,
    trustedEvents: 0,
    scrollEvents: 0,
    businessEffects: 0,
    lastEventTarget: null,
  })
  const increment = useCallback((field: keyof Pick<ScenarioObservedFacts,
    "targetDispatches" | "preparationDispatches" | "nativeDialogs" | "scrollEvents" | "businessEffects">) => {
    setFacts((value) => ({ ...value, [field]: value[field] + 1 }))
  }, [])
  const activate = useCallback(() => { increment("targetDispatches"); increment("businessEffects") }, [increment])
  const prepare = useCallback(() => increment("preparationDispatches"), [increment])

  useEffect(() => {
    const capture = (event: MouseEvent) => setFacts((value) => ({ ...value,
      trustedEvents: value.trustedEvents + Number(event.isTrusted),
      lastEventTarget: event.target instanceof Element
        ? event.target.getAttribute("data-testid") ?? event.target.localName : null,
    }))
    document.addEventListener("click", capture, true)
    return () => document.removeEventListener("click", capture, true)
  }, [])
  useEffect(() => {
    window.__BAT_FIXTURE__ = facts
    void fetch(`/__bat_fixture/report?runId=${encodeURIComponent(config.runId)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(facts),
    })
  }, [config.runId, facts])

  return <Theme appearance="dark" accentColor="lime" grayColor="sage" radius="large" scaling="100%">
    <Box className="lab-shell">
      <header className="lab-header">
        <Flex align="center" gap="3"><span className="lab-mark"><FlaskConicalIcon size={22} /></span>
          <div><Text className="eyebrow" size="1">B-A-T / D1 PHYSICAL REPLAY LAB</Text>
            <Heading size="7">{definition.title}</Heading></div></Flex>
        <Flex gap="2" wrap="wrap"><Badge color="lime">{definition.group}</Badge><Badge variant="outline">seed {config.seed}</Badge>
          <Badge variant="outline">{config.phase}</Badge><Badge variant="outline">{config.variant}</Badge></Flex>
      </header>
      <main className="lab-grid">
        <section className="scenario-stage">
          <Flex align="center" gap="2" mb="4"><ActivityIcon size={16} /><Text size="2" color="gray">{definition.mechanism}</Text></Flex>
          <Scenario config={config} activate={activate} prepare={prepare}
            dialog={() => increment("nativeDialogs")} scroll={() => increment("scrollEvents")} />
        </section>
        <aside><EventPanel facts={facts} /></aside>
      </main>
    </Box>
  </Theme>
}

function Scenario({ config, activate, prepare, dialog, scroll }: {
  readonly config: ReturnType<typeof readConfig>
  readonly activate: () => void
  readonly prepare: () => void
  readonly dialog: () => void
  readonly scroll: () => void
}) {
  const group = scenarioById.get(config.scenarioId)?.group
  if (group === "native") return <NativeDialogScenario scenarioId={config.scenarioId} activate={activate} dialog={dialog} />
  if (group === "overlay") return <OverlayScenario config={config} peerOrigin={import.meta.env.VITE_FIXTURE_PEER_ORIGIN || null}
    activate={activate} prepare={prepare} />
  if (group === "scroll") return <ScrollScenario scenarioId={config.scenarioId} onScrollEvent={scroll} activate={activate} />
  if (group === "semantic") return <SemanticScenario scenarioId={config.scenarioId} activate={activate} prepare={prepare} />
  return <BusinessSurface onActivate={activate} />
}

function readConfig() {
  const params = new URLSearchParams(window.location.search)
  const scenarioId = params.get("scenarioId") ?? "clean-baseline"
  const definition = scenarioById.get(scenarioId as never)
  return scenarioConfigSchema.parse({
    scenarioId,
    seed: Number(params.get("seed") ?? "1"),
    phase: params.get("phase") ?? definition?.defaultConfig.phase ?? "replay",
    variant: params.get("variant") ?? definition?.defaultConfig.variant ?? "present",
    runId: params.get("runId") ?? "manual-run",
  })
}
