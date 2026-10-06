# 子节点单行与类型图标（2026-10-05）

## 修改前对齐

Product Alignment:
- natural-language task: 每个子节点单行省略；不用点击详情即可辨认现有节点类型，不用文字 tag。
- reusable chain boundary: 保留现有业务主节点、常驻列表、循环范围、分支去向与实际节点身份。
- runtime inputs: 已有 TaskChain 节点 kind/capability、actionPresentation.type 与指定运行事件。
- dynamic task outputs: 不改变链路执行或输出；显示真实节点类型和原有运行状态。
- generic platform capability used: 现有 lucide 图标、CSS 单行省略和节点检查器。
- replay model calls: 新增 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 节点类型视觉映射与单行省略。
- existing implementation in repository: actionPresentation 已生成类型；CanvasActionList 保留真实动作和去向；lucide-react 0.544.0、React Flow 12.11.6、Radix Themes 3.3.0 和主题 token 已使用。
- mature candidates and pinned versions: 保留现有依赖版本；不新增图标库或图框架。
- selected implementation: 一个列表类型图标组件，使用真实 kind/能力引用选择既有图标，名称沿用既有 type。
- reused public surface: lucide-react 图标组件、原生 CSS ellipsis、现有 tooltip/可访问名称与详情。
- B-A-T-owned adapter and remaining gap: 图标仅属 UI 映射；普通动作、循环标题、分支目标共用；取消循环文字 tag。序号、动作名与右侧运行状态保持独立。
- license/runtime/platform fit: 依赖不变，无新许可证/平台边界。
- browser/runtime/state ownership conflicts: 只读 UI，headless 隔离验证，不控制个人 Chrome、不启动任务。
- replay model calls: 新增 0。
- rejected candidates and evidence: 不需要文字 badge、持久类型副本或模型分类；已存在真实类型信息。
- focused validation: 真实 kind 与图标映射、分支内动作、单行 ellipsis、全文详情、运行图标固定列和深浅主题。

## 修改前证据

- 现有 actionPresentation 已区分浏览器动作/读取/Function/数据处理等类型，详情消费同一类型；列表只把 type 放在按钮 title。
- 用户最新要求覆盖上轮“两行”：改为单行省略，完整列表保留；直接显示类型，拒绝文字 tag。
- 当前 checkout master@0fc8ff22，保留已有 dirty work；用户服务 4173/4175 的现有 PID 10968 不重启。

## 验证

- 最小展示改动：单行 CSS ellipsis，图布局估算同步一行；新增一个 21 行 lucide 类型图标组件。序号保留，左侧 14px 图标表示类型，右侧原运行图标/loading 不变；循环文字 tag 删除。
- 图标覆盖现有全部 kind；稳定 capability 节点按真实能力引用区分浏览器、读取、数据处理及一般能力，类型名沿用 actionPresentation，悬停与可访问名称可读。普通动作、循环和分支内动作共用组件。
- 视觉首次失败发现实际遗漏：loop 的结束去向 output-values 位于另一主节点，本阶段的动作 Map 不包含它，因此引用行缺少类型图标。已从既有 routesFor 使用的同一版本图补取目标类型，保留目标 ID、不复制执行状态或动作归属；缺失目标仍不猜类型且保持原禁用行为。
- 现有 4 项 runtime/投影/几何测试首次 4/4 通过。补齐跨主节点类型后，仅复验受影响的身份/归属两项，2/2。定点复验第一次的 Windows npx 正则包含管道，cmd 错误解释为命令；改用无管道字符类后通过，这属于验证命令问题，未改产品代码来迎合它。
- Workbench 类型检查和构建通过；构建只有既有大 chunk 提示。没有根级或全量测试。
- Headless 视觉修正后通过：长普通动作、循环、分支目标和条件单行/实际溢出省略，全文检查器可读；逐个图标的 kind/能力引用与真实来源图节点一致，包括跨主节点引用；无文字类型 tag；右侧运行图标对齐、当前一个 loading、状态切换尺寸稳定、深浅主题一致。
- 现有旧任务只读实测 8 个子节点全部显示类型：浏览器动作、读取、Function、合并数据、组装数据。浏览器窗口/读取/Function 等 SVG 与真实 kind 和能力引用一致，页面错误 0、产品写请求 0。全程 headless、隔离 profile；没有启动正式任务、连接个人 Chrome、重启用户服务、改发布链路或新增模型调用。
- 当前证据与截图在 work/node-type-icons-20261005，首次失败截图/JSON 独立保留。上轮两行证据仍保留在 work/node-ui-20261005；本轮最新规则是一行。本次只读 UI 验证不代表用户联网业务复跑验收。

## 用户后续纠正：子分支过挤（修改前）

Product Alignment:
- natural-language task: 单行与类型图标保留，但子分支不能拥挤；条件和动作层次清楚。
- reusable chain boundary: 原主节点/子节点/循环/分支关系不变。
- runtime inputs: 同一版本真实节点、去向与指定运行事件。
- dynamic task outputs: 输出及执行结论不变。
- generic platform capability used: 原 CSS Grid 与节点展示布局。
- replay model calls: 新增 0。
- site/task-specific code added: no

Reuse Assessment: 继续复用原 Grid/lucide/React Flow 组合；没有新库、新协议、调度或持久状态。调整分支两列、去掉重复箭头、编号独立列、分支行距，以及仅带控制流卡片的宽度；源节点、真实目标与右侧运行状态保留。验证实际长文字、分支列对齐、来源节点和稳定状态尺寸，不以 UI 验证冒充业务运行。

## 子分支间距纠正的结果

- 带控制流的卡片 470→520px，普通业务卡片保持原尺寸；分支使用 84px 条件列与独立目标列，移除每行重复箭头和动作名中的“接”前缀，编号单独对齐。原分支括线、真实目标、可访问去向和原点击行为保留。
- 分支行高 32→36px，上下留白 4px/12px；图布局高度同步。普通/循环/分支名称继续单行省略，类型与运行图标各保留独立列。
- 受影响身份/状态及几何两项 2/2 首次通过；Workbench 构建通过。此次 headless 视觉首次通过：条件列 84px，目标文字列 216/235px，分支行高 36px；真实目标类型、状态列、单 loading、长文字/全文详情、深浅主题和状态几何均通过。
- 现有旧任务仍为 8 个真实子节点，普通卡片保持 300px；页面错误/写请求 0。没有正式业务运行、个人 Chrome 控制或用户服务重启。
- 当前最终证据在 work/node-branch-spacing-20261005。branch-layout-dark.png 使用正式组件与原始来源样本的名称，未追加极端测试长文；另有长文字压力图。用户任务实际图与样本分支图分别保留，不能互相冒充。
