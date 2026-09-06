import { Dialog, IconButton } from "@radix-ui/themes"
import { GripVertical, X } from "lucide-react"
import { Resizable } from "re-resizable"
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react"

function subscribe(callback: () => void) {
  window.addEventListener("resize", callback)
  return () => window.removeEventListener("resize", callback)
}

export function ResizableDrawer({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const viewport = useSyncExternalStore(subscribe, () => window.innerWidth, () => 1200)
  const [preferredWidth, setWidth] = useState(560)
  const trigger = useRef<HTMLElement | null>(null)
  const maximum = Math.min(1100, viewport <= 600 ? viewport : viewport - 32)
  const minimum = Math.min(360, maximum)
  const clamp = (value: number) => Math.max(minimum, Math.min(maximum, value))
  const width = clamp(preferredWidth)
  // WHY：Radix 管理模态焦点，成熟 resize 组件管理鼠标/触摸拖拽；宽度偏好独立于需求版本。
  const handle = <IconButton variant="ghost" color="gray" className="drawer-resize-grip" aria-label={`调整${title}宽度`}
    title="拖动调宽；方向键微调，Home 最窄，End 最宽" onKeyDown={(event) => {
      const next = { ArrowLeft: width + 32, ArrowRight: width - 32, Home: minimum, End: maximum }[event.key]
      if (next === undefined) return
      event.preventDefault(); setWidth(clamp(next))
    }}><GripVertical size={16} /></IconButton>
  return <Dialog.Root open={open} onOpenChange={(value) => { if (!value) onClose() }}>
    <Dialog.Content className="draft-drawer" maxWidth="100vw" onOpenAutoFocus={() => { trigger.current = document.activeElement as HTMLElement }}
      onCloseAutoFocus={(event) => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus() }}>
      <Resizable className="detail-surface draft-drawer-body" size={{ width, height: "100dvh" }} minWidth={minimum} maxWidth={maximum}
        enable={{ left: true }} handleComponent={{ left: handle }} handleStyles={{ left: { left: 0, width: 12, zIndex: 1 } }}
        onResizeStop={(_event, _direction, element) => setWidth(clamp(element.offsetWidth))}>
        <header className="detail-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close><IconButton variant="ghost" color="gray" aria-label={`关闭${title}`}><X size={18} /></IconButton></Dialog.Close></header>
        <Dialog.Description className="sr-only">审阅{title}；可拖动左边缘调整宽度，关闭后返回对话。</Dialog.Description>
        {children}
      </Resizable>
    </Dialog.Content>
  </Dialog.Root>
}
