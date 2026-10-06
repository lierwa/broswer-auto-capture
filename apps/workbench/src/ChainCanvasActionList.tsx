import { ChainNodeTypeIcon } from "./ChainNodeTypeIcon.js"
import type { CanvasListItem, CanvasRoute } from "./chainCanvasList.js"
import type { StageActionRow } from "./ChainCanvasNodes.js"
import { StatusIcon, toneLabel } from "./ChainRunStatus.js"
import type { ChainRunTone } from "./chainWorkbenchProjection.js"
import type { ReactNode } from "react"

type Props = { items: CanvasListItem[]; actions: StageActionRow[]; onInspect(id: string): void; label: string }

export function CanvasActionList({ items, actions, onInspect, label }: Props) {
  const byId = new Map(actions.map(action => [action.id, action]))
  return <ol className="chain-stage-actions" aria-label={label}>
    {items.map(item => {
      const action = byId.get(item.id)!
      return <li key={item.id} className={item.body ? "chain-loop" : "chain-action"} data-tone={action.tone}>
        {item.body ? <>
          <button type="button" className="nodrag chain-loop-heading" data-node-id={action.id}
            aria-label={`查看动作：${action.title}`} aria-pressed={action.selected === true}
            title={[action.type, action.statusLabel, ...action.context ?? []].join("；")}
            onClick={event => { event.stopPropagation(); onInspect(action.id) }}>
            <ChainNodeTypeIcon action={action} /><strong title={action.title}>{action.title}</strong>
            <span className="chain-loop-fact">{(action.eventStatus === "planned" || action.eventStatus === "started"
              || ["failure", "waiting", "ended", "success"].includes(action.tone))
              && <StatusIcon tone={action.tone} label={action.statusLabel} />}</span>
          </button>
          <LoopBody tone={action.tone} label={action.title}>
            <CanvasActionList items={item.body} actions={actions} onInspect={onInspect} label={`${action.title}的循环体`} />
          </LoopBody>
        </> : <ActionButton action={action} onInspect={onInspect} />}
        {item.routes.length > 0 && <ul className="chain-action-routes" aria-label={`${action.title}的去向`}>
          {item.routes.map(route => <RouteRow key={route.port} route={route} source={action}
            target={byId.get(route.targetId ?? "")} onInspect={onInspect} />)}
        </ul>}
      </li>
    })}
  </ol>
}

/** WHY：计划逐项调用与链内循环共用已有循环体显示；仅显示真实范围，不捏造 IR 节点。 */
export function LoopBody({ children, tone, label, next = "下一轮" }: {
  children: ReactNode; tone: ChainRunTone; label: string; next?: string
}) {
  return <div className="chain-loop-body" data-return-tone={tone}>
    {children}<span className="chain-loop-return" title={`返回：${label}`} aria-label={`返回：${label}`}>
      <span>{next}</span></span>
  </div>
}

function ActionButton({ action, onInspect }: { action: StageActionRow; onInspect(id: string): void }) {
  return <button type="button" className="nodrag chain-action-select" data-node-id={action.id} data-tone={action.tone}
    aria-label={`查看动作：${action.title}`} aria-pressed={action.selected === true}
    title={[action.type, action.statusLabel ?? toneLabel(action.tone), action.durationLabel].filter(Boolean).join(" · ")}
    onClick={event => { event.stopPropagation(); onInspect(action.id) }}>
    <span className="chain-action-index">{action.ordinal}</span><ChainNodeTypeIcon action={action} />
    <span className="chain-action-name" title={action.title}>{action.title}</span>
    <StatusIcon tone={action.tone} label={action.statusLabel} />
  </button>
}

function RouteRow({ route, source, target, onInspect }: { route: CanvasRoute; source: StageActionRow;
  target: StageActionRow | undefined; onInspect(id: string): void }) {
  const selection = source.branches?.find(row => row.port === route.port)?.selection
    ?? (source.outcome ? source.outcome === route.port ? "selected" : "unselected" : "pending")
  const tone: ChainRunTone = route.inline && target ? target.tone
    : selection === "selected" ? "success" : selection === "unselected" ? "unselected" : "idle"
  const targetId = route.targetId
  const targetType = target ?? route.targetType
  return <li data-port={route.port} data-selection={selection} data-tone={tone}>
    <span className="chain-route-label" title={route.detail}>{route.label}</span>
    <button type="button" className="nodrag chain-route-target" data-node-id={route.inline ? targetId : undefined}
      data-target-id={targetId} data-tone={tone} aria-pressed={target?.selected === true}
      aria-label={`${route.inline ? "查看动作" : "查看去向"}：${route.target}`} disabled={!targetId}
      title={`${route.detail}；${route.inline ? "" : "接"}${target?.ordinal ?? ""} ${route.target}`}
      onClick={event => { event.stopPropagation(); if (targetId) onInspect(targetId) }}>
      <span className="chain-action-index">{target?.ordinal}</span>
      {targetType ? <ChainNodeTypeIcon action={targetType} /> : <span aria-hidden="true" />}
      <span className="chain-action-name" title={route.target}>{route.target}</span>
      <StatusIcon tone={tone} label={route.inline ? target?.statusLabel
        : selection === "selected" ? "本次已采用此去向" : selection === "unselected" ? "本次未进入此去向" : "尚未判定"} />
    </button>
  </li>
}
