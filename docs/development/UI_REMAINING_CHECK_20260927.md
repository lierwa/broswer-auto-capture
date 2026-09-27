# UI 剩余局部核验（2026-09-27）

范围：U18/U19/U20/U35 的只读图查看、键盘入口与主题，以及 U28/U33 人工等待提醒的隔离状态场景；保留先前记录，不代表正式新任务验收。

## 修改前依据

Product Alignment:
- natural-language task: 用户查看任意浏览器任务编译后的动作与运行状态。
- reusable chain boundary: 原 TaskChain 与 TaskDraft，不新增执行图。
- runtime inputs: 不变。
- dynamic task outputs: 不变。
- generic platform capability used: 只读图查看与键盘可访问动作详情。
- replay model calls: 不变，普通节点不调用模型。
- site/task-specific code added: no

Reuse Assessment:
- capability: 画布中键盘打开动作详情。
- existing implementation in repository: React Flow 12.11.6、原生按钮、现有本地节点选择状态。
- mature candidates and pinned versions: 已安装 @xyflow/react 12.11.6。
- selected implementation: 保留 React Flow，动作标题使用原生 button。
- reused public surface: React Flow 自定义节点 data；原生 button 的 Enter/Space 点击语义。
- B-A-T-owned adapter and remaining gap: 当前 onNodeClick 只接鼠标，动作卡没有键盘可用的详情入口；新增回调只更新已有本地选择状态。
- license/runtime/platform fit: 现有 MIT 依赖与 React/Windows 浏览器组合不变，不新增依赖。
- browser/runtime/state ownership conflicts: 无新浏览器、无运行状态写入、无草稿写入。
- replay model calls: 0。
- rejected candidates and evidence: 无替换库；不自行编写第二套键盘导航。
- focused validation: 所属节点渲染/点击回调与冻结图投影测试，Workbench 类型检查。

固定版本上游依据：[NodeWrapper](https://github.com/xyflow/xyflow/blob/%40xyflow/react%4012.11.6/packages/react/src/components/NodeWrapper/index.tsx#L118-L130)：键盘选择调用内部 handleNodeClick；仅鼠标入口调用传入的 onClick。现有工作台只在 onNodeClick 更新详情选中状态，故不能据“React Flow 支持键盘”认定详情键盘入口已接通。

## 执行结果

### 实际修改

- `apps/workbench/src/ChainCanvasNodes.tsx`：动作标题变为原生按钮，名称为“查看动作：{动作名称}”；鼠标与键盘激活复用 `onInspect`，停止冒泡，避免双重处理。
- `ChainCanvasGraph.ts` / `LiveChainCanvas.tsx`：投影传递查看回调；只更新本地选择与上下文，不调用 connection/dispatch 或改草稿。
- `LiveChainCanvas.tsx`：复用 React Flow `ariaLabelConfig` 提供只读提示及中文视图控件名称；`deleteKeyCode={null}` 明确关闭删除快捷键。原生阶段展开按钮保留。
- `chain-workbench.css`：标题按钮继承已有字体、文字颜色与全局 `:focus-visible`，不新增主题颜色值。
- 新增 `apps/workbench/tests/chain-canvas-readonly.test.ts`，保护冻结图源、原生详情入口和两主题具名视图控件；原画布投影测试仅补新增回调参数，未重跑整组。

### 首次失败与最终结果

| 顺序 | 命令 / 范围 | 实际结果 |
| --- | --- | --- |
| 1 | `node --import tsx --test apps/workbench/tests/chain-canvas-readonly.test.ts` | 首次 1/3；未指定 Workbench JSX 配置，两个 TSX 渲染用例报 `React is not defined`。属于测试启动方式失败，保留记录。 |
| 2 | `npm run check --workspace @browser-capture/workbench` | 首次通过。 |
| 3 | `npm exec -- tsx --tsconfig apps/workbench/tsconfig.json --test apps/workbench/tests/chain-canvas-readonly.test.ts` | 2/3；图源冻结及详情按钮通过。第三项误将现有上游控件名称 `Zoom In` 写为小写，断言失败。 |
| 4 | 同上，仅 `--test-name-pattern='亮暗画布'` | 增加中文配置后仍 0/1；SSR 不执行 React Flow 更新 store 的 effect，因此不能用 SSR 证明挂载后的中文标签。修正证据边界，不改上游库。 |
| 5 | 同上，仅 `--test-name-pattern='亮暗画布'` | 1/1，通过 light/dark class 与三个原生视图控件非空可访问名称；此前已过两项未重复执行。 |
| 6 | 再次 `npm run check --workspace @browser-capture/workbench` | `ariaLabelConfig` 与 `deleteKeyCode` 公共属性接线通过。重跑原因是第 2 次检查后增加了这两个属性。 |
| 7 | 本组 5 个已有文件的 `git diff --check -- ...` | 通过；只提示既有 LF/CRLF 转换策略。 |

SSR 边界依据：[固定版本 StoreUpdater](https://github.com/xyflow/xyflow/blob/%40xyflow/react%4012.11.6/packages/react/src/components/StoreUpdater/index.tsx#L132-L157) 在 `useEffect` 中合并 `ariaLabelConfig`。

### 单元阶段的证据边界（后续实机结果见下节）

- 上述单元检查没有启动服务、产品浏览器或模型，没有修改数据库，没有跑根级/全量测试。
- 已通过的是纯投影输入不变、真实组件原生按钮与回调、SSR light/dark 透传、具名控件及类型接线。**不是实际 Tab/Enter/Space、缩放、亮暗外观或 UI/API/SQLite 联合验收。** 冻结元数据夹具不是产品持久化的 TaskDraft。
- 后续已在独立 SQLite/真实 UI 客户端完成下列实际操作：阶段展开、Tab/Enter/Space 查看、缩放、主题、API/SQLite 草稿一致及无写请求；具体证据见下节。
- 窄屏与屏幕阅读器实机仍未测；不据本组覆盖关闭 U35 全项。

## 人工等待提醒的精确现有入口（未扩展修改）

- `apps/workbench/src/main.tsx` 110–126：铃铛可访问名称含待处理数量；菜单选择切换任务，action_required 不会被当终态本地 dismiss。
- `apps/workbench/src/useTaskAttention.ts` 10–31：action_required 直接来自服务端任务列表；终态 recent 独立；更新 document.title 数量。
- `apps/workbench/src/useTasks.ts` 29–46：`GET /api/tasks` 每 1500ms 刷新并以服务端 attention 更新提醒。
- `apps/workbench/src/ExecutionActions.tsx` `ExecutionActions`：等待/暂停时“处理后继续”发送同 executionId 和 expectedSequence；`BrowserHandoffActions` 保留原窗口 focus/inspect/end。
- 当前 Workbench tests 中没有人工等待提醒/useTaskAttention 专属用例；不能把之前连接或事件流测试当作提醒实际消失证据。

## 后续实际浏览器局部核验

### 隔离与材料

- 最终修改后只运行一次 `npm run build --workspace @browser-capture/workbench`：通过；Vite 保留大 chunk 提示。
- 脚本：`apps/workbench/tests/chain-canvas-browser.acceptance.ts`，显式 `BAT_RUN_CANVAS_UI=1` 才执行，不在 `*.test.ts` 默认组内。
- 复用 G5 已成功目录 `%TEMP%\bat-g5-real-repeat-kneXYw` 的 `chain.json`、`sample-plan.json`、`run.json`，以 repository API 安装到新临时 SQLite。仅改隔离任务身份/绑定，保留真实链的节点结构。
- 样本与复验记录、waiting/running execution 是**显式隔离状态夹具**。这证明 UI 与服务端持久投影接线，不证明又做了一次真实探索、复跑、自然登录/验证码或 G6 新任务验收。
- 每次使用 `createApplication` + 随机 port 0 + 专用 headless UI Chrome。未触碰正式 `data`、主服务 4175；未拦截/伪造前端请求，未启动产品 Browser 或模型。

### 实际运行顺序与首次失败

公共命令：

```powershell
$env:BAT_RUN_CANVAS_UI='1'
$env:BAT_CANVAS_SOURCE_DIRECTORY=(Join-Path $env:TEMP 'bat-g5-real-repeat-kneXYw')
$env:BAT_ACCEPTANCE_BROWSER_EXECUTABLE='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm exec -- tsx --tsconfig apps/workbench/tsconfig.json apps/workbench/tests/chain-canvas-browser.acceptance.ts
```

| 次序 | 实际结果 | 证据目录（系统 Temp 下） |
| --- | --- | --- |
| 第一次 | 真实 UI 已加载、焦点到“展开动作”，但 Enter 后超时。验收驱动漏发 Enter 字符 `\r`，仅发送 keyDown/keyUp，未产生原生按钮需要的 keypress；修正驱动并增加只读按键事件记录。生产代码未再改。 | `bat-canvas-ui-9Bkj5I`：`result.json`、`failure.png`、`cleanup.json` |
| 第二次 | **画布整组实际通过**。后续提醒也已消失，但测试把 API 的可选 attention 缺省 `undefined` 断言为 `null`，导致整体脚本仍记 failed/attention；保留该失败，不把整个文件改写为 passed。 | `bat-canvas-ui-wJHB78`：完整前后快照、画布按键/主题/缩放事实及截图 |
| 第三次 | 仅补 `BAT_CANVAS_UI_SCOPE='attention'` 重跑提醒段，未重跑已通过的画布段；通过。 | `bat-canvas-ui-Y1IudF`：`result.json`、`combined-proof.json`、提醒截图及清理记录 |

### 通过的具体事实

- Tab 8 次到原生“展开动作”，Enter 展开技术节点；随后 Tab 3 次到“查看动作：打开页面”。Enter 与 Space 都打开同一动作说明；记录有真实 keydown/keypress/keyup，未用 `element.click()` 冒充键盘。
- Delete 未删节点；挂载后的只读提示实际显示“画布只读…”。
- 放大视图从 `scale(0.5)` 变为 `scale(0.6)`；缩小、适应视图按钮可用。
- 亮暗切换经真实鼠标 CDP 事件触发：light 文本/背景分别 `rgb(33, 32, 28)` / `rgb(249, 249, 248)`；dark 分别 `rgb(238, 238, 236)` / `rgb(34, 34, 33)`。React Flow 同步 light/dark；两张截图已目视核对。
- 同一隔离 TaskDraft 的完整 API 与 SQLite body 相等，操作前后完整快照相等：revision `0`、checksum `e8db3bfd52d6be06952691c4a5311496ca81dd6b3a4ffc1b5f349a5b5ecf1e31`、两条验证记录及 `draftReadiness.phase=ready` 均不变，UI 始终“可发布”。HTTP 服务观察到本组查看操作的写请求为 `[]`。
- 在另一个任务画布可见“1 项待处理”铃铛；点击提醒实际切换到等待任务；刷新后提醒及“处理后继续”仍在。repository 将同一隔离 execution 从 waiting_for_human 更新为 running 后，真实 `/api/tasks` 去掉 attention，铃铛计数、标题计数及“处理后继续”都消失。
- 两个最终证据目录的 `cleanup.json` 均为 UI Chrome exit `0`、`serverListening=false`；模型与产品 Browser 调用均 `0`。所有临时目录保留，未尝试递归清理。

### 当前剩余边界

上述 U18/U19/U20/U35 局部实机项及 U28/U33 提醒显示/消失接线已有证据；**自然遇到认证/验证码、点击继续后的真实 Browser 恢复及副作用不重复**由运行时门另外证明。此脚本没有点击“处理后继续”启动产品执行。窄屏和真实屏幕阅读器仍未测；不扩大为全 UI 验收。
