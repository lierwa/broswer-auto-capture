import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button, Card, Flex, Text } from "@radix-ui/themes"
import { XIcon } from "lucide-react"
import { BusinessSurface } from "../components/BusinessSurface.js"
import type { ScenarioConfig, ScenarioId } from "../scenario-contract.js"

const portalIds = new Set<ScenarioId>([
  "portal-modal-recorded", "portal-modal-absent", "portal-modal-unexpected", "delayed-close-button",
  "duplicate-close-buttons", "repeated-interstitial", "sticky-cookie-banner", "chat-widget-overlap",
  "transparent-pointer-overlay", "target-replaced-after-close",
])

export function OverlayScenario({ config, peerOrigin, activate, prepare }: {
  readonly config: ScenarioConfig
  readonly peerOrigin: string | null
  readonly activate: () => void
  readonly prepare: () => void
}) {
  const [visible, setVisible] = useState(config.variant !== "absent")
  const [closeReady, setCloseReady] = useState(config.variant !== "delayed")
  const [generation, setGeneration] = useState(0)
  const shadowHost = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (config.variant !== "delayed") return
    const timeout = window.setTimeout(() => setCloseReady(true), 650)
    return () => window.clearTimeout(timeout)
  }, [config.variant])

  useEffect(() => {
    if (config.scenarioId !== "shadow-dom-overlay" || !shadowHost.current) return
    const root = shadowHost.current.shadowRoot ?? shadowHost.current.attachShadow({ mode: "open" })
    root.innerHTML = `<style>:host{position:fixed;inset:0;z-index:50}.veil{position:absolute;inset:0;background:#0b0d10e8;display:grid;place-items:center}
      button{font:700 16px Georgia;padding:14px 20px;border:0;background:#e9ff70;color:#10130b;cursor:pointer}</style>
      <div class="veil"><button data-testid="preparation-action">Release shadow boundary</button></div>`
    const button = root.querySelector("button")
    const close = () => { prepare(); setVisible(false) }
    button?.addEventListener("click", close)
    return () => button?.removeEventListener("click", close)
  }, [config.scenarioId, prepare])

  const close = () => {
    prepare()
    if (config.scenarioId === "target-replaced-after-close") setGeneration((value) => value + 1)
    if (config.variant === "repeated") {
      setVisible(false)
      window.setTimeout(() => setVisible(true), 0)
    } else setVisible(false)
  }

  if (config.scenarioId === "same-origin-iframe-overlay") {
    return <FrameOverlay sameOrigin activate={activate} prepare={prepare} />
  }
  if (config.scenarioId === "cross-origin-iframe-overlay") {
    return <FrameOverlay sameOrigin={false} peerOrigin={peerOrigin} activate={activate} prepare={prepare} />
  }
  if (config.scenarioId === "shadow-dom-overlay") {
    return <><BusinessSurface onActivate={activate} />{visible && <div ref={shadowHost} data-testid="shadow-host" />}</>
  }

  const obstruction = visible && portalIds.has(config.scenarioId)
    ? createPortal(<Obstruction scenarioId={config.scenarioId} closeReady={closeReady} close={close} />, document.body)
    : null
  return <>
    <BusinessSurface onActivate={activate} generation={generation} />
    {obstruction}
  </>
}

function Obstruction({ scenarioId, closeReady, close }: {
  readonly scenarioId: ScenarioId
  readonly closeReady: boolean
  readonly close: () => void
}) {
  const transparent = scenarioId === "transparent-pointer-overlay"
  const banner = scenarioId === "sticky-cookie-banner"
  const chat = scenarioId === "chat-widget-overlap"
  const duplicate = scenarioId === "duplicate-close-buttons"
  return <div className={["obstruction", banner && "banner", chat && "chat", transparent && "transparent"]
    .filter(Boolean).join(" ")} data-testid="obstruction">
    {!transparent && <Card className="obstruction-card">
      <Flex direction="column" align="start" gap="3">
        <Text className="eyebrow" size="1">CONTROLLED INTERFERENCE</Text>
        <Text size="5" weight="bold">A deterministic obstruction owns the hit point.</Text>
        {closeReady
          ? <Flex gap="2"><Button data-testid="preparation-action" onClick={close}><XIcon size={16} /> Clear once</Button>
              {duplicate && <Button data-testid="preparation-action" onClick={close}>Clear alternative</Button>}</Flex>
          : <Text data-testid="preparation-pending">Preparation control is arming…</Text>}
      </Flex>
    </Card>}
  </div>
}

function FrameOverlay({ sameOrigin, peerOrigin, activate, prepare }: {
  readonly sameOrigin: boolean
  readonly peerOrigin?: string | null
  readonly activate: () => void
  readonly prepare: () => void
}) {
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const allowedOrigin = sameOrigin ? location.origin : peerOrigin
      if (event.origin !== allowedOrigin) return
      if (event.data === "bat-frame-prepared") prepare()
      if (event.data === "bat-frame-activated") activate()
    }
    window.addEventListener("message", receive)
    return () => window.removeEventListener("message", receive)
  }, [activate, peerOrigin, prepare, sameOrigin])
  const base = sameOrigin ? "" : peerOrigin ?? "http://127.0.0.1:1"
  const src = `${base}/frame/interactive?mode=${sameOrigin ? "same" : "cross"}`
  return <div className="frame-stage">
    <iframe title={sameOrigin ? "same-origin obstruction" : "cross-origin obstruction"}
      src={src} className="obstruction-frame" data-testid="obstruction-frame" />
  </div>
}

export function FrameDocument() {
  const [visible, setVisible] = useState(location.pathname === "/frame/interactive")
  const notify = (value: string) => window.parent.postMessage(value, "*")
  return <main className="frame-document">
    <Card className="frame-business"><Flex direction="column" gap="3" align="start">
      <Text className="eyebrow" size="1">FRAME DOCUMENT</Text>
      <Text weight="bold">Isolated frame business surface</Text>
      <Button data-testid="frame-business-target" onClick={() => notify("bat-frame-activated")}>Execute framed target</Button>
    </Flex></Card>
    {visible && <div className="frame-inner-overlay"><Button data-testid="frame-preparation-action"
      onClick={() => { notify("bat-frame-prepared"); setVisible(false) }}>Release frame obstruction</Button></div>}
  </main>
}
