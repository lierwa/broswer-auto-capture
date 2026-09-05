import { Dialog, IconButton } from "@radix-ui/themes"
import { X } from "lucide-react"
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react"

function subscribe(callback: () => void) {
  const media = matchMedia("(max-width: 1199px)")
  media.addEventListener("change", callback)
  return () => media.removeEventListener("change", callback)
}
export function DetailPane({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const narrow = useSyncExternalStore(subscribe, () => matchMedia("(max-width: 1199px)").matches, () => false)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open || narrow) return
    const trigger = document.activeElement as HTMLElement | null
    close.current?.focus()
    return () => { if (trigger?.isConnected) trigger.focus() }
  }, [open, narrow])
  if (narrow) return <Dialog.Root open={open} onOpenChange={(value) => { if (!value) onClose() }}><Dialog.Content className="detail-surface detail-drawer" maxWidth="min(92vw, 540px)">
    <header className="detail-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close><IconButton variant="ghost" color="gray" aria-label={`关闭${title}`}><X size={18} /></IconButton></Dialog.Close></header>
    <Dialog.Description className="sr-only">当前任务的{title}，关闭后返回原工作区。</Dialog.Description>{children}
  </Dialog.Content></Dialog.Root>
  if (!open) return null
  return <aside className="detail-surface detail-pane" aria-label={title} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose() } }}>
    <header className="detail-heading"><h2>{title}</h2><IconButton ref={close} variant="ghost" color="gray" aria-label={`关闭${title}`} onClick={onClose}><X size={18} /></IconButton></header>{children}
  </aside>
}
