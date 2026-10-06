# 定稿的循环、分支列表接入

Product Alignment:
- natural-language task: 将已确认任务生成的真实链路与单次执行事实展示为主节点和常驻子节点列表。
- reusable chain boundary: 同一不可变 TaskChain；UI 只投影，不建立第二张可执行图。
- runtime inputs: 版本节点、端口、连线、stage 归属，以及指定 execution/step/run 的事件。
- dynamic task outputs: 真实分支选择、当前循环轮次、当前动作和各终点到达事实。
- generic platform capability used: 已有条件/有序分支、each/while 循环、运行审计、React Flow 父卡片。
- replay model calls: UI 为零；执行规则仍由已有 LangGraph runtime 和显式 LLM 节点决定。
- site/task-specific code added: no

Reuse Assessment:
- capability: 嵌套链路的可读投影与状态展示。
- existing implementation in repository: chainControlProjection、chainWorkbenchProjection、React Flow、Dagre、lucide-react、统一主题 token。
- mature candidates and pinned versions: 当前 @xyflow/react 12.11.6、lucide-react 0.544.0、@dagrejs/dagre 3.1.1。
- selected implementation: 复用现有依赖及执行事实；增加纯展示适配。
- reused public surface: React Flow 自定义主节点、Handle、已有节点检查器；lucide 状态图标。
- B-A-T-owned adapter and remaining gap: 按真实 body/出口划分循环范围，按唯一入口组合分支动作，共享汇合点保留引用。
- license/runtime/platform fit: 沿用仓库已采用依赖，不增加运行时或库。
- browser/runtime/state ownership conflicts: 不接触浏览器控制；不新增调度器、检查点或持久化事实源。
- replay model calls: 无新增调用。
- rejected candidates and evidence: 独立子画布/折叠路径会违背架构基准的单图常驻列表要求，不采用。
- focused validation: scoped projection tests、workbench 类型检查、独立 headless 的真实组件截图与实际 runtime 事件验证。

## 展示不变量

- 原型依据：`work/prototypes/chain-controls-20261004-icons/index.html`，只继承布局；不继承演示状态与虚构编号。
- 行状态只用右侧固定列图标；主节点保留一处状态文字。当前动作 loading，完成 check，未进入 minus，未执行 circle。
- 分支标签来自声明，按 case 顺序；选中路径只高亮文字，不加高亮竖线。真实 target 可点击检查。
- 同一动作只拥有一个展示位置；共享汇合点、外来入口和回边是明确引用，不能嵌成重复动作。
- 循环以已声明 body/exits 画范围和回路；缺失可靠定义的历史链路保持真实列表和去向，不猜归属。
- 不显示臆造上限、进度或解释尾注；条件、耗时、失败原因和轮次事实保留在 tooltip/已有检查器。
- 准备中与已发布链路使用同一投影；单次运行/当前轮次隔离，不拿上一轮成功覆盖本轮 pending。

## 编译边界

接入发现的真实缺口：`groupedPresentationContent` 的确定性阶段分组未消费声明的 loop body，也未合并分支直接拥有的独占动作，因此真实生成节点会被拆成多个主卡片。此次补齐准备/发布共用的展示分组，并保持执行 digest；不是用夹具手填一个大 stage 来掩盖入口缺口。

真实自然入口已能通过验证的 repeat_method 生成 loop 和首次/继续分支，也有空集合与可选准备分支；不是所有自然语言 if/else 都有证据生成入口。UI 必须消费实际生成结果，不能根据任务文案补图或修改旧发布版本。通用业务条件生成的缺口与 UI 接入验收分开记录；不得把固定测试图的通过当作新 B-U 自然探索通过。

## 验证记录

- 定点测试：workbench `chain-canvas-controls`、`chain-control-facts`、`chain-workbench-projection` 与 API `chain-presentation` 合计 35/35；另以 test-name-pattern 执行 `hybrid-natural-repeat` 新增的来源/物化/准备分组/runtime/UI 接线用例 1/1。长标题布局估算调整后只复验受影响的 controls/projection 10/10。
- 类型：contracts、API、workbench 的各自 check 均通过。workbench build 通过；Vite 仍有既有大 chunk 提示，不属于运行失败。
- 首次失败独立保留：根 cwd 的 tsx 未带 workbench jsx 配置，3 个旧 SSR 测试报 React is not defined；切换 `--tsconfig apps/workbench/tsconfig.json` 后 25/25。首次新代码 check 发现 Windows 对大小写近似的 `.ts/.tsx` 模块歧义和 exactOptionalPropertyTypes 的 undefined，均修正。新夹具首次手填 presentation 缺少 focusLayouts，随后改为消费正式 createStepChainPresentation，3/3；自然接线用例首次误猜 helper ID，改为读取真实 body.exits 后 1/1。以上均未以最终通过覆盖首败。
- 真实执行器：each 两轮分别 process/default，下一轮撤旧状态，输出与完成可达；动作实际 throw 进入失败，模型调用 0。自然 repeat 三页包含空中间页，真实物化的 loop、首次分支、动态读取、继续条件和输出都直接送进 UI；来源是受控证据样本，不是新 B-U 实站探索。
- headless 生产组件：`apps/workbench/tests/chain-controls-visual.acceptance.py` 通过。只有当前动作一个 loading，所有状态图标右列对齐，状态切换卡片尺寸稳定（470×407），真实 nodeId 打开原检查器，深浅主题无脚本错误。主卡片状态和耗时不重复呈现；循环标题状态留固定槽位以免抖动。
- 实际 Workbench 4173 只读兼容验证通过，产品 POST/写入为 0；浏览器使用全新 headless context，finally 关闭，未启动/连接个人 Chrome。
- 产物：`work/chain-control-integration-20261004/natural-control.json`、`visual-proof.json`、`connected-running-card.png`、深浅主题和现有工作台截图。work 产物不进 Git。
- 运行中服务边界：现有 PID 4860、checkout root 正确，任务处于 cleanup_required；本次保留原服务和既有待清理资源。前端 Vite 热更新已验证；API 新分组和生成标题在下次服务重启后生效。未重启用户服务，未更改旧发布记录。
- 未测/缺口：新的自然需求对话→B-U 实站探索→独立验证→发布→两次运行→重启闭环；任意自然语言业务 if/else 的证据生成仍不是已完成能力。UI 不伪造未生成节点。
