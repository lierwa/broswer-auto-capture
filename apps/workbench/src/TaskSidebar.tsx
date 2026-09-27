import { useState } from "react"
import { Button, Dialog, DropdownMenu, IconButton, TextField } from "@radix-ui/themes"
import { Archive, ArchiveRestore, Ellipsis, PanelLeftClose, Plus, Search, Trash2 } from "lucide-react"
import { taskStatusLabels, type TaskSummary } from "./taskContract.js"
import type { useTasks } from "./useTasks.js"

type Tasks = ReturnType<typeof useTasks>
export function TaskSidebar({ model, close, onSelect, afterCreate }: { model: Tasks;
  close: () => void; onSelect: (id: string) => void; afterCreate: () => void;
}) {
  const [search, setSearch] = useState("")
  const [archived, setArchived] = useState(false)
  const tasks = model.tasks.filter((task) => task.archived === archived && task.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  return <div className="task-sidebar-content"><header className="task-sidebar-heading"><span className="sidebar-brand">B</span><strong>浏览器工作台</strong><IconButton variant="ghost" color="gray" aria-label="收起任务列表" onClick={close}><PanelLeftClose aria-hidden="true" size={17} /></IconButton></header>
    <Button className="new-task" variant="soft" disabled={model.busy || !model.ready} onClick={() => void model.action({ type: "create" }).then((ok) => { if (ok) { setArchived(false); afterCreate() } })}><Plus aria-hidden="true" size={16} />新建需求</Button>
    <TextField.Root size="2" name="task-search" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务…" aria-label="搜索任务"><TextField.Slot><Search aria-hidden="true" size={14} /></TextField.Slot></TextField.Root>
    <div className="task-list-label">{archived ? "已归档" : "最近任务"}</div>
    <nav className="task-list" aria-label="需求任务列表">{tasks.map((task) => <div className="task-list-item" data-selected={task.id === model.selected} key={task.id}>
      <button className="task-select" type="button" aria-label={`打开任务：${task.title}`} aria-current={task.id === model.selected ? "page" : undefined} onClick={() => onSelect(task.id)}><span className="task-name">{task.title}</span>
        <span className="task-status" data-tone={taskTone(task.status)}><i aria-hidden="true" />{taskStatusLabels[task.status]}</span>
      </button>
      {task.id !== model.selected && <TaskMenu task={task} model={model} />}
    </div>)}{model.ready && tasks.length === 0 && <p className="task-list-empty">{search ? "没有匹配的任务" : archived ? "暂无归档任务" : "从一个新需求开始"}</p>}</nav>
    <footer className="task-sidebar-footer"><Button variant="ghost" color="gray" onClick={() => setArchived(!archived)}>{archived ? <ArchiveRestore aria-hidden="true" size={15} /> : <Archive aria-hidden="true" size={15} />}{archived ? "返回最近任务" : "已归档任务"}</Button></footer>
  </div>
}

export function TaskMenu({ task, model }: { task: TaskSummary; model: Tasks }) {
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [title, setTitle] = useState(task.title)
  return <><DropdownMenu.Root><DropdownMenu.Trigger><IconButton className="task-more" size="1" variant="ghost" color="gray" aria-label={`${task.title}的更多操作`}><Ellipsis aria-hidden="true" size={16} /></IconButton></DropdownMenu.Trigger>
    <DropdownMenu.Content><DropdownMenu.Item onSelect={() => { setTitle(task.title); setRenaming(true) }}>重命名</DropdownMenu.Item><DropdownMenu.Item disabled={["running", "planning", "queued", "executing"].includes(task.status) || model.busy} onSelect={() => void model.action({ type: "archive", id: task.id, archived: !task.archived })}>{task.archived ? "恢复任务" : "归档任务"}</DropdownMenu.Item><DropdownMenu.Separator /><DropdownMenu.Item color="red" disabled={model.busy} onSelect={() => setDeleting(true)}><Trash2 aria-hidden="true" size={14} />永久删除</DropdownMenu.Item></DropdownMenu.Content>
  </DropdownMenu.Root><Dialog.Root open={renaming} onOpenChange={setRenaming}><Dialog.Content className="dialog-scroll" maxWidth="400px"><Dialog.Title>重命名任务</Dialog.Title><form className="rename-task" onSubmit={(event) => { event.preventDefault(); void model.action({ type: "rename", id: task.id, title }).then((ok) => { if (ok) setRenaming(false) }) }}><TextField.Root name="task-title" autoComplete="off" aria-label="任务名称" value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} /><div className="dialog-actions"><Button variant="soft" color="gray" type="button" onClick={() => setRenaming(false)}>取消</Button><Button disabled={!title.trim() || model.busy}>{model.busy ? "正在保存…" : "保存名称"}</Button></div></form></Dialog.Content></Dialog.Root>
    <Dialog.Root open={deleting} onOpenChange={(open) => { if (!model.busy) setDeleting(open) }}><Dialog.Content maxWidth="400px"><Dialog.Title>永久删除任务？</Dialog.Title><Dialog.Description size="2">“{task.title}”的需求、草稿、运行记录和私有会话将被删除，无法撤销。</Dialog.Description>{model.error && <p role="alert">{model.error}</p>}<div className="dialog-actions"><Button variant="soft" color="gray" disabled={model.busy} onClick={() => setDeleting(false)}>取消</Button><Button color="red" disabled={model.busy} onClick={() => void model.remove(task).then((ok) => { if (ok) setDeleting(false) })}>{model.busy ? "正在删除…" : "确认永久删除"}</Button></div></Dialog.Content></Dialog.Root></>
}

function taskTone(status: TaskSummary["status"]) {
  if (["running", "planning", "queued", "executing"].includes(status)) return "active"
  if (status === "failed") return "danger"
  if (["confirmed", "review"].includes(status)) return "success"
  return "neutral"
}
