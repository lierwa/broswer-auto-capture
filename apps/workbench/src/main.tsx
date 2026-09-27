import { useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  Dialog,
  DropdownMenu,
  IconButton,
  Theme,
  Tooltip,
} from "@radix-ui/themes";
import { Bell, CircleUserRound, Moon, PanelLeft, Plus, Settings, Sun } from "lucide-react";
import { ModelSettingsDialog } from "@agent-platform/ai-connect-react/components/ModelSettingsDialog";
import "@radix-ui/themes/styles.css";
import "@xyflow/react/dist/style.css";
import "@agent-platform/ai-connect-react/styles.css";
import { useTasks } from "./useTasks.js";
import { TaskSidebar, TaskMenu } from "./TaskSidebar.js";
import { TaskWorkspace } from "./TaskWorkspace.js";
import { useModelSettings } from "./useModelSettings.js";
import { BrowserProfileDialog } from "./BrowserProfileDialog.js";
import { useTaskAttention } from "./useTaskAttention.js";
import "./styles.css";
import "./chat.css";
import "./workbench.css";
import "./chain-workbench.css";

function subscribe(callback: () => void) {
  const media = matchMedia("(max-width: 1099px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function App() {
  const model = useTasks();
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const compact = useSyncExternalStore(
    subscribe,
    () => matchMedia("(max-width: 1099px)").matches,
    () => false,
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => innerWidth >= 1100);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [browserProfileOpen, setBrowserProfileOpen] = useState(false);
  const modelSettings = useModelSettings();
  const task = model.tasks.find((item) => item.id === model.selected);
  const running = model.tasks.find((item) => ["running", "planning", "queued", "executing"].includes(item.status));
  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#181918" : "#f5f3ee");
  }, [theme]);
  function select(id: string) {
    model.select(id);
    if (compact) setSidebarOpen(false);
  }
  const attention = useTaskAttention(model.tasks, model.ready);
  const sidebar = (
    <TaskSidebar
      model={model}
      close={() => setSidebarOpen(false)}
      onSelect={select}
      afterCreate={() => {
        if (compact) setSidebarOpen(false);
      }}
    />
  );
  return (
    <Theme
      appearance={theme}
      accentColor="amber"
      grayColor="sand"
      radius="small"
      scaling="95%"
    >
      <a className="skip-link" href="#main-workspace">跳到主工作区</a>
      <main
        className="app-shell task-layout"
        data-theme={theme}
        data-sidebar={!compact && sidebarOpen}
      >
        {!compact && sidebarOpen && (
          <aside className="task-navigation" aria-label="任务侧栏">
            {sidebar}
          </aside>
        )}
        {compact && (
          <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <Dialog.Content className="task-nav-drawer" maxWidth="300px">
              <Dialog.Title className="sr-only">任务列表</Dialog.Title>
              <Dialog.Description className="sr-only">
                选择任务后切换整套工作区
              </Dialog.Description>
              {sidebar}
            </Dialog.Content>
          </Dialog.Root>
        )}
        <section className="workspace" id="main-workspace" tabIndex={-1}>
          <header className="topbar">
            <div className="task-title-group">
              <Tooltip content={sidebarOpen ? "收起任务列表" : "展开任务列表"}>
                <IconButton
                  variant="ghost"
                  color="gray"
                  aria-label={sidebarOpen ? "收起任务列表" : "展开任务列表"}
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                  <PanelLeft aria-hidden="true" size={18} />
                </IconButton>
              </Tooltip>
              <h1>{task?.title ?? "浏览器工作台"}</h1>
            </div>
            <div className="status-group">
              {attention.visible.length > 0 && <DropdownMenu.Root>
                <DropdownMenu.Trigger><IconButton className="task-attention-trigger" variant="ghost"
                  color="gray" aria-label={attention.actionCount
                    ? `任务提醒，${attention.actionCount} 项待处理` : "任务提醒"}>
                  <Bell aria-hidden="true" size={17} />
                  {attention.actionCount > 0 && <span className="task-attention-count" aria-hidden="true">
                    {attention.actionCount > 9 ? "9+" : attention.actionCount}</span>}
                </IconButton></DropdownMenu.Trigger>
                <DropdownMenu.Content className="task-attention-menu" align="end">
                  <DropdownMenu.Label>任务提醒</DropdownMenu.Label>
                  {attention.visible.map((item) => <DropdownMenu.Item key={`${item.id}:${item.attention!.id}`}
                    onSelect={() => { select(item.id); if (item.attention!.kind !== "action_required") attention.dismiss(item) }}>
                    <span className="task-attention-entry"><strong>{item.title}</strong>
                      <small>{item.attention!.message}</small></span>
                  </DropdownMenu.Item>)}
                </DropdownMenu.Content>
              </DropdownMenu.Root>}
              {task && <TaskMenu task={task} model={model} />}
              <Tooltip content="专用浏览器账号">
                <IconButton variant="ghost" color="gray" aria-label="专用浏览器账号"
                  onClick={() => setBrowserProfileOpen(true)}>
                  <CircleUserRound aria-hidden="true" size={18} />
                </IconButton>
              </Tooltip>
              <Tooltip content="模型设置">
                <IconButton
                  variant="ghost"
                  color="gray"
                  aria-label="模型设置"
                  onClick={() => setModelSettingsOpen(true)}
                >
                  <Settings aria-hidden="true" size={17} />
                </IconButton>
              </Tooltip>
              <Tooltip
                content={theme === "dark" ? "切换为浅色主题" : "切换为深色主题"}
              >
                <IconButton
                  variant="ghost"
                  color="gray"
                  aria-label={
                    theme === "dark" ? "切换为浅色主题" : "切换为深色主题"
                  }
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  {theme === "dark" ? <Sun aria-hidden="true" size={17} /> : <Moon aria-hidden="true" size={17} />}
                </IconButton>
              </Tooltip>
            </div>
          </header>
          {model.error && (
            <div className="task-notice" role="alert">
              {model.error}
              <Button size="1" variant="soft" onClick={model.reload}>
                重新读取任务
              </Button>
              {model.pendingCreate && (
                <Button
                  size="1"
                  disabled={model.busy}
                  onClick={() => void model.action({ type: "create" })}
                >
                  恢复新建请求
                </Button>
              )}
            </div>
          )}
          {model.visited.map((id) => {
            const item = model.tasks.find((entry) => entry.id === id);
            return (
              item && (
                <TaskWorkspace
                  key={id}
                  task={item}
                  visible={id === model.selected}
                  theme={theme}
                  otherRunning={running?.id !== id ? running : undefined}
                  modelSettings={modelSettings}
                />
              )
            );
          })}
          {!model.ready && !model.error && (
            <div className="task-notice" role="status">
              正在读取本地任务
            </div>
          )}
          {model.ready && !task && (
            <section className="workspace-welcome">
              <span className="welcome-mark">
                <Plus aria-hidden="true" size={22} />
              </span>
              <h2>描述你想完成的事</h2>
              <Button
                disabled={!model.ready || model.busy}
                onClick={() => void model.action({ type: "create" })}
              >
                <Plus aria-hidden="true" size={16} />
                新建需求
              </Button>
            </section>
          )}
        </section>
        <ModelSettingsDialog
          open={modelSettingsOpen}
          onOpenChange={setModelSettingsOpen}
          client={modelSettings.client}
          {...(modelSettings.selection
            ? { value: modelSettings.selection }
            : {})}
          onChange={modelSettings.save}
          loading={modelSettings.loading}
          {...(modelSettings.error
            ? { errorMessage: modelSettings.error }
            : {})}
          appearance={theme}
          selectOnConnect
          requiredSurface="agentSession"
        />
        <BrowserProfileDialog open={browserProfileOpen} onOpenChange={setBrowserProfileOpen} />
      </main>
    </Theme>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
