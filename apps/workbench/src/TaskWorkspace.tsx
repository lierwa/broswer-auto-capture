import { useMemo, useState } from "react";
import { Tabs } from "@radix-ui/themes";
import {
  Database,
  FileSearch,
  GitBranch,
  MessageSquare,
} from "lucide-react";
import { useInterview } from "./useInterview.js";
import { ChatTimeline } from "./ChatTimeline.js";
import { DraftDialog } from "./DraftDialog.js";
import { ChainView } from "./ChainView.js";
import { Results } from "./Results.js";
import { Plan } from "./Plan.js";
import { TaskChainConnection } from "./taskChainConnection.js";
import type { TaskSummary } from "./taskContract.js";
import type { useModelSettings } from "./useModelSettings.js";

const views = [
  { id: "interview", name: "需求对话", icon: MessageSquare },
  { id: "plan", name: "任务计划", icon: FileSearch },
  { id: "nodes", name: "任务链路", icon: GitBranch },
  { id: "results", name: "运行结果", icon: Database },
];
type WorkspaceModelSettings = Pick<
  ReturnType<typeof useModelSettings>,
  | "accounts"
  | "selection"
  | "loading"
  | "saving"
  | "error"
  | "ready"
  | "save"
  | "load"
>;

export function TaskWorkspace({
  task,
  visible,
  theme,
  otherRunning,
  modelSettings,
}: {
  task: TaskSummary;
  visible: boolean;
  theme: "light" | "dark";
  otherRunning: TaskSummary | undefined;
  modelSettings: WorkspaceModelSettings;
}) {
  const interview = useInterview(task.id);
  const taskChainConnection = useMemo(() => new TaskChainConnection(task.id), [task.id]);
  const [activeTab, setActiveTab] = useState("interview");
  const [version, setVersion] = useState<number | null>(null);
  const blocked = task.archived
    ? "任务已归档，恢复后可以继续对话。"
    : otherRunning
      ? `“${otherRunning.title}”正在处理需求，完成后可发送；你仍可查看或编辑当前任务。`
      : undefined;
  function openDraft(value = interview.state.drafts.at(-1)?.version) {
    if (value) {
      setVersion(value);
      setActiveTab("interview");
    }
  }
  function createPlan() {
    setActiveTab("plan");
    if (interview.state.confirmedVersion) void taskChainConnection.ensure(interview.state.confirmedVersion);
  }
  return (
    <section
      className="task-workspace"
      data-task-id={task.id}
      hidden={!visible}
      aria-label={task.title}
    >
      {blocked && (
        <div className="task-notice" role="status">
          {blocked}
        </div>
      )}
      <div className="task-body">
        <section
          className="panel review-panel"
          aria-label="需求、计划、链路与结果"
        >
          <Tabs.Root
            value={activeTab}
            onValueChange={setActiveTab}
            activationMode="manual"
          >
            <Tabs.List aria-label="工作台视图">
              {views.map(({ id, name, icon: Icon }) => (
                <Tabs.Trigger
                  key={id}
                  value={id}
                  onClick={() => setActiveTab(id)}
                >
                  <Icon size={15} />
                  {name}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content
              value="interview"
              forceMount
              hidden={activeTab !== "interview"}
            >
              <ChatTimeline
                taskId={task.id}
                interview={interview}
                onPlan={createPlan}
                onDraft={openDraft}
                blocked={Boolean(blocked)}
                readOnly={task.archived}
                appearance={theme}
                modelSettings={modelSettings}
              />
            </Tabs.Content>
            <Tabs.Content value="plan" forceMount hidden={activeTab !== "plan"}>
              <Plan
                taskId={task.id}
                connection={taskChainConnection}
                active={visible && activeTab === "plan"}
                readOnly={task.archived}
                confirmedVersion={interview.state.confirmedVersion}
                interviewRevision={interview.state.revision}
                onInterview={() => setActiveTab("interview")}
                onDraft={() => openDraft()}
              />
            </Tabs.Content>
            <Tabs.Content
              value="nodes"
              forceMount
              hidden={activeTab !== "nodes"}
            >
              <ChainView
                connection={taskChainConnection}
                theme={theme}
                active={visible && activeTab === "nodes"}
                onPlan={() => setActiveTab("plan")}
              />
            </Tabs.Content>
            <Tabs.Content
              value="results"
              forceMount
              hidden={activeTab !== "results"}
            >
              <Results
                taskId={task.id}
                readOnly={task.archived}
                connection={taskChainConnection}
                active={visible && activeTab === "results"}
                onPlan={() => setActiveTab("plan")}
              />
            </Tabs.Content>
          </Tabs.Root>
        </section>
        <DraftDialog
          state={interview.state}
          version={version}
          open={visible && activeTab === "interview" && version !== null}
          onVersion={setVersion}
          onConfirm={interview.confirm}
          readOnly={task.archived}
          pending={
            !interview.ready || interview.busy || Boolean(interview.pending)
          }
        />
      </div>
    </section>
  );
}
