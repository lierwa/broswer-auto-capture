export type RunTone = "idle" | "success" | "running" | "waiting";

export type StageSample = {
  id: string;
  title: string;
  summary: string;
  actionIds: string[];
  exitSummary?: string;
};

export type ActionSample = {
  id: string;
  stageId: string;
  kind: string;
  title: string;
  summary: string;
  precondition: string;
  postcondition: string;
};

export const stages: StageSample[] = [
  {
    id: "open-source",
    title: "进入内容来源",
    summary: "打开已确认来源，等待页面可操作",
    actionIds: ["navigate", "source-ready"],
  },
  {
    id: "search-content",
    title: "搜索《凡人修仙传》",
    summary: "定位搜索框，输入任务参数并提交",
    actionIds: ["find-search", "focus-search", "type-query", "submit-search", "wait-results", "verify-results"],
    exitSummary: "异常出口 2",
  },
  {
    id: "choose-result",
    title: "选择目标内容",
    summary: "在结果中确认匹配项并打开",
    actionIds: ["find-result", "open-result", "detail-ready"],
    exitSummary: "业务分支 1",
  },
  {
    id: "start-playback",
    title: "开始播放",
    summary: "启动播放并确认播放器已进入播放态",
    actionIds: ["find-play", "click-play", "verify-playing"],
  },
];

export const actions: ActionSample[] = [
  { id: "navigate", stageId: "open-source", kind: "导航", title: "打开已确认来源", summary: "使用需求版本保存的来源入口", precondition: "来源授权有效", postcondition: "目标页面已打开" },
  { id: "source-ready", stageId: "open-source", kind: "等待", title: "等待页面可操作", summary: "观察页面交互就绪事实", precondition: "页面已打开", postcondition: "页面可交互" },
  { id: "find-search", stageId: "search-content", kind: "定位", title: "定位搜索框", summary: "按已验证目标描述重新解析", precondition: "页面可交互", postcondition: "搜索框唯一可用" },
  { id: "focus-search", stageId: "search-content", kind: "聚焦", title: "聚焦搜索框", summary: "把键盘输入目标切换到搜索框", precondition: "搜索框唯一可用", postcondition: "搜索框已聚焦" },
  { id: "type-query", stageId: "search-content", kind: "输入", title: "输入任务参数", summary: "输入《凡人修仙传》", precondition: "搜索框已聚焦", postcondition: "查询词已写入" },
  { id: "submit-search", stageId: "search-content", kind: "按键", title: "提交搜索", summary: "按 Enter", precondition: "查询词已写入且搜索框保持聚焦", postcondition: "搜索结果区域可消费" },
  { id: "wait-results", stageId: "search-content", kind: "等待", title: "等待搜索结果", summary: "有界观察结果区域", precondition: "搜索已经提交", postcondition: "结果区域已就绪" },
  { id: "verify-results", stageId: "search-content", kind: "验证", title: "确认结果列表", summary: "验证结果页而非全局语义判断", precondition: "结果区域已就绪", postcondition: "阶段出口 results-ready 可达" },
  { id: "find-result", stageId: "choose-result", kind: "定位", title: "找到匹配内容", summary: "依据已确认目标筛选结果", precondition: "结果列表可消费", postcondition: "目标结果唯一" },
  { id: "open-result", stageId: "choose-result", kind: "点击", title: "打开目标结果", summary: "点击已验证目标", precondition: "目标结果唯一", postcondition: "详情页开始打开" },
  { id: "detail-ready", stageId: "choose-result", kind: "等待", title: "确认详情页", summary: "等待播放器页面可消费", precondition: "详情页开始打开", postcondition: "播放入口可用" },
  { id: "find-play", stageId: "start-playback", kind: "定位", title: "定位播放入口", summary: "重新解析已验证目标", precondition: "详情页可消费", postcondition: "播放入口唯一" },
  { id: "click-play", stageId: "start-playback", kind: "点击", title: "启动播放", summary: "点击播放入口", precondition: "播放入口唯一", postcondition: "播放器状态开始变化" },
  { id: "verify-playing", stageId: "start-playback", kind: "验证", title: "确认正在播放", summary: "读取播放器运行事实", precondition: "播放器状态开始变化", postcondition: "链路完成出口可达" },
];

export function actionsForStage(stageId: string) {
  return actions.filter((action) => action.stageId === stageId);
}
