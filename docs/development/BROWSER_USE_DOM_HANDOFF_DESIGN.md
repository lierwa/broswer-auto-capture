# b-u 动作与 DOM 证据交付方案

日期：2026-09-16。状态：**方案已进入开发交接；本轮仅完成文档，工具尚未实施。**

目标：看到一次动作，能够沿明确引用找到当时页面、目标、父节点、子节点和集合位置；w-u 据此形成可复跑查询，而不是复制临时编号或样本标题。

本方案细化 [混合编译计划](WORKFLOW_USE_HYBRID_COMPILER_PLAN.md) 的 H3/H4 输入面。用户现已授权新会话先实现前置工具、整理相关旧补丁，再回归主线。执行顺序和验收以 [前置工具开发计划](BROWSER_USE_DOM_TOOLS_IMPLEMENTATION.md) 为准；本文保留动作矩阵与源码证据，不代表旧 gate 新增通过。

## 0. 用户已明确的范围与第一阶段前提

**24 类动作保留为覆盖清单，先实现现有数据足够的动作配套工具，缺数据的暂缓。** 工具保持通用；列表、按钮是结构定位的例子，原任务用于验收，不能写成网站专用脚本。具体首批范围见开发计划第 3 节。

第一阶段按用户前提：在相同页面流程和对应展示状态下，目标区域的 DOM 结构、条目内部层次与控件关系保持一致。页面可以异步创建/替换 DOM 节点；同一阶段结构一致并不要求复用同一个内存对象、backend ID 或交互编号。结构改版、跨布局自愈不是本阶段开发目标。

在这个前提下，**同一起点及前置流程 → 同一展示状态 → 相同结构路径 → 正确的本次目标**应成为必须通过的确定性验收。标题、内容和浏览器临时编号变化，不能造成定位到历史样本。不能再以“网页千变万化”回避这个限定问题。

记录必须回答：目标是什么、父/子/祖先是谁、在集合中是什么位置、实际点击条目本身还是条目内的子节点、由哪些先前操作到达当前页面并展示这个控件。按钮文字可作附带证据或明确的业务输入，不能代替这些结构关系。

### 0.1 统一工具层与动作适配层

以下为工具职责划分，复用原生公开能力；不是新增第二个浏览器执行框架，也不要求给每个动作各写一套 DOM 算法。

| 通用配套工具 | 输入 → 输出 | 24 类动作怎样使用 |
| --- | --- | --- |
| 动作记录适配 | 最终注册表、原生动作/结果 → 有执行状态的动作记录 | 每个注册动作有对应记录规则；不能只对 click 处理，其余丢弃 |
| 页面与结构采集 | 当次原生页面/selector_map/DOM 节点 → 可读取的局部树、frame、焦点、集合与状态 | 元素动作带目标结构；页面、文件、结束动作按第 2 节记录各自上下文 |
| 前置过程关联 | 动作前后状态及原结果 → 到达页面、展开区域、展示目标的动作引用和条件 | navigate→click 展开→wait 就绪→input 等顺序按原生记录保留；交给现有图执行 |
| 定位描述构建 | 真实目标、父子/集合关系、已确认选择规则 → 可执行的结构路径/集合相对路径 | 相同结构由统一路径查询处理；每个网站的路径放在任务数据，不写入平台源码 |
| 复跑定位与动作适配 | 本次页面状态、定位描述、运行输入 → 本次 Element/集合/文件或 tab，再调用原生动作 | click、input、select 等共用元素解析；无 DOM 动作用各自原生对象；不退回模型猜目标 |
| 后态与结果核验 | 原生结果、声明变化、当前结构状态 → 完成/等待/失败以及新来源 | 判断控件出现、列表加载、输入生效、页面切换等；复用现有有界检查 |

每类动作都需有录制输入、上下文提取、复跑对象解析、原生调用和结果核验的明确对应。已有产品未开放的文件/脚本动作也必须设计和记录其适配/权限边界，但此表不自动授权执行这些副作用或放开任意脚本。

### 0.2 条目根与实际操作子节点必须分开保存

```text
页面 → 结果区域 → list
                    ├─ item[0]  ← 需求“第 1 条”选择到这里
                    │   └─ 内容包装层
                    │       └─ title/link  ← b-u 实际操作目标可能在这里
                    └─ item[1] …
```

- 点整个 item：本次查询 list 的条目集合，取第 1 项，直接操作条目根。
- 点 item.title：查询相同条目集合，取第 1项，再沿保存的条目内部相对结构路径找到 title/link，操作这个子节点。
- 如果 list 与 item 中间有包装层，条目集合查询必须保留这层关系；不能一律把 `list.children[0]` 当成业务 item。
- 通用描述为“页面作用域 + list 查询 + 条目查询 + 选择规则 + 条目内目标路径”。ordinal 可以来自输入，结构路径来自实际观察；不是编写站点专用 JS，也不把模型生成的任意代码交给执行器。

### 0.3 前置过程必须成为复跑依赖

一个按钮可能由前一个按钮展开弹层后才出现，或只有某次导航/翻页完成后才存在。记录 `前置动作引用 → 可观察展示条件 → 当前目标结构`；前置操作按同一流程复跑，就绪后才定位当前目标。仅有目标 XPath 而没有展示过程，不算完整录制。

从 DOM 差分得到的“某节点新出现”只是一条观察；必须与原动作结果及页面状态一起建立依赖，不能单凭时间先后编造额外控制流。状态、排序、输入依赖依旧使用现有 TaskChain/LangGraph 表达，不新增调度器。

## 1. 已核实事实与纠正

- 固定环境为 browser-use **0.13.8**，w-u 基线 `5d2d19fe8835cc86f1bf3e04302a5000d590f249`。本方案不声称覆盖所有 b-u 版本。
- 实际导入 `Tools()` 的默认注册表有 **24** 个动作；当前 `author_tools()` 返回 **18** 个。清单由公开 action schema 获取，不凭手写枚举猜测。[机器清单](evidence/browser-use-dom-handoff/action-inventory.json)
- Agent 构造可调整 screenshot/click 注册；坐标点击是 click 的另一种参数形态。输出模型可改变 done 参数。自定义工具也会增加动作。因此每个来源都必须保存最终 registry 的版本/schema 摘要；24 不是永久上限。
- 原生 history 包含 `state_message`、`state.interacted_element`、动作、结果、URL、tabs 等；**不是只有编号和标题**。
- 真实 LangGraph 记录有 28 步、38 个拟议动作、11 个交互元素，28 步有状态文本；9 步多动作，4 步动作/结果数量不一致。11 个元素均有 XPath，但没有序列化 parent/children。[结构核查](evidence/browser-use-dom-handoff/history-structure-audit.json)
- `state_message` 内页面表示有层级，但上游 serializer 会省略节点、提升子节点、折叠 SVG、限制属性；**文本缩进不等于真实 DOM 父子关系**。
- 运行时 `EnhancedDOMTreeNode` 已有 `parent_node/children_nodes`、frame、shadow、属性和 AX 信息；公开回调传入的 `summary.dom_state.selector_map` 可以把 click.index 对应到此节点。
- 当前新 `capture.py` 主要保存页面摘要、事实和预先声明目标的匹配；`history.py` 不携带状态文本/原生交互结构；`author.py` 不保存原始 history。**已有原生旧 history、新路径裁剪后的 trace、探索当时的内存 DOM 是三种不同数据，不能混称“b-u 留下的数据”。**

Product Alignment:
- natural-language task: 编译包含列表位置选择、表单输入、阅读或页面导航的已确认浏览器任务
- reusable chain boundary: 一个计划步骤的一次探索；下一次以实时页面重新查询同一逻辑目标
- runtime inputs: 页码、序号、填写内容、查询条件等已确认任务输入
- dynamic task outputs: 当前条目/页面字段及操作结果
- generic platform capability used: b-u 原生 Agent/Tools/DOM/回调、w-u fork、既有 TaskChain/LangGraph
- replay model calls: 普通定位和状态验证为 0；开放语义仍只允许显式 LLM 节点
- site/task-specific code added: no

## 2. 全部默认动作与 DOM 对照矩阵

“当前提供”表示当前 hybrid Tools 注册，不代表 compiler 已支持。所有动作均需动作 ID、原参数来源、执行/失败状态、result 引用和前后页面引用；表中只写各自动作特有信息。

| 动作 | 默认主要参数 | 应关联的 DOM / 非 DOM 信息 | w-u 使用方式与必要后态 | 当前提供 |
| --- | --- | --- | --- | --- |
| `search` | query, engine | 搜索输入来源、旧/新页面与 tab；无点击目标树 | 参数化搜索；验证目标页面，不以浏览器原编号绑定 | 是 |
| `navigate` | url, new_tab | URL 来源、原/新 tab、frame/document 身份；无目标树 | 导航并核对地址/页面身份；新 tab 要记录创建关系 | 是 |
| `go_back` | description 可省 | 前后 tab、地址、页面标记与待恢复的列表/表单区域 | 浏览器返回；重新查询并核对筛选、页码、排序等声明状态 | 是 |
| `wait` | seconds | 所等待动作的引用、等待前后同一区域和完成事实 | 归属原动作的有界等待；秒数不能替代“已到第 2 页” | 是 |
| `click` | index；可配置坐标变体 | 目标元素、真实祖先、目标子树、所属表单/列表/弹层、必要同级项 | 按唯一目标/条目位置/输入条件重查；核对导航或局部状态变化 | 是 |
| `input` | index, text, clear | 输入元素、关联 label、表单/弹层祖先；组合输入还含候选区域 | 参数化文本及 clear；核对本次字段值，必要时核对联动状态 | 是 |
| `upload_file` | index, path | file input、表单、accept/multiple；另有授权文件引用 | 文件能力及上传结果；不把开发机绝对路径冻结进链 | 否 |
| `switch` | tab_id | 切换前后 tab 清单、原生 tab ID 到逻辑页面的关联 | 复跑用本次创建/找到的逻辑 tab；不复用历史 tab ID | 是 |
| `close` | tab_id | 被关闭 tab、剩余 tab、关闭后的焦点 | 明确关闭对象，核对消失与焦点；不能误关另一个页面 | 是 |
| `extract` | query, extract_links, extract_images, start_from_char, already_collected | 提取范围、来源页面/区域、实际结果、schema、部分结果/截断标志；字段对应节点 | 可直接读的字段→普通读取；开放语义→显式 LLM；不能仅凭最终文字猜字段归属 | 是 |
| `search_page` | pattern, regex, case_sensitive, context_chars, css_scope, max_results | 查询范围、匹配节点/上下文、总数/截断和元素路径 | 作为页面事实或目标发现依据；只有查询结果序号，不能当点击编号 | 是 |
| `find_elements` | selector, attributes, max_results, include_text | 查询作用域、按 DOM 顺序的匹配项、属性、total/showing；另补真实父子树 | 优先复用现成集合查询；其结果 index 为零基查询序号；children_count 不是子节点树 | 是 |
| `scroll` | down, pages, index 可省 | 页面或指定滚动容器、滚动前后位置/视口、目标可见性、虚拟列表窗口 | 区分发现目标与列表推进；不能盲删，也不能把滚动 N 次当固定页数 | 是 |
| `send_keys` | keys | 当时焦点元素、表单/区域、选中状态与输入法相关实际效果；必要时为页面级 | 快捷键必须绑定焦点/页面条件；Enter 可能提交，不能一律当输入或只读 | 是 |
| `find_text` | text | 文本匹配所在节点、祖先/滚动容器和前后可见性 | 原生动作是滚动到文本；文本必须有来源，不冻结碰巧出现的样本标题 | 是 |
| `screenshot` | file_name 可省 | 截图引用、tab/frame/视口/时刻，不要求目标树 | 区分任务输出与探索辅助；不能仅靠截图坐标建立永久定位 | 否 |
| `save_as_pdf` | file_name 与打印参数 | 页面/打印范围、输出制品引用和结果 | 文件输出能力；需要任务授权与制品核验，不能因为已注册就当普通点击执行 | 是 |
| `dropdown_options` | index | select/组合控件、父表单、选项子节点及 enabled/selected/value/label | 普通有界选项读取；关联到哪个控件必须确定 | 是 |
| `select_dropdown` | index, text | 同上，加实际选中项和触发的页面/字段变化 | 选项来源绑定输入/需求；核验实际选中，不把菜单打开当选择成功 | 是 |
| `write_file` | file_name, content, append 等 | 无必需 DOM；文件输入来源、写入结果、制品引用 | 任务输出则保留能力；纯临时记事只有证明不影响业务输出才可归类辅助 | 否 |
| `replace_file` | file_name, old_str, new_str | 同上，另含被替换版本/内容来源 | 不能一律删除；不明写入保持 gap | 否 |
| `read_file` | file_name | 无必需 DOM；授权文件引用、内容范围、读取结果与后续消费 | 保留真实数据依赖；不能把来源文件读值当常量 | 否 |
| `evaluate` | code | 实际脚本、调用页面、结果及可能副作用；DOM 范围不一定可确定 | 原历史保留；只有明确等价于受控能力才另行评估映射；不将任意脚本作为复跑兜底 | 否 |
| `done` | 默认 text/success/files；结构输出时 data | 最终输出引用、schema、任务判定、所依赖来源；无点击树 | 完成/审计记录，不替代前面动作和结果的证明 | 是 |

默认不存在单独 `download_file` 动作；当前排除列表里有此名称，不等于本版本提供了它。下载还可能是 click 的实际效果，需根据结果识别。未知/自定义动作保留参数、结果和观察，再做效果与能力准入，不能丢弃。

## 3. 动作怎样对应到准确 DOM

### 3.1 三种编号禁止混用

1. `click.index=47`：**同一观察快照内** selector_map 的交互编号。只用于还原当次目标。
2. `find_elements` 返回 `index=0`：**这次查询结果**的零基序号，不能传给 click 当交互编号。
3. 需求“第 1 条”：任务选择规则。明确按列表顺序计算；适配器只在查询时转换成零基 0。

真实 DOM 身份用“来源快照 + tab/target + frame + backend node”关联。同一 index 或 backend ID 在其他页面/文档不得视作相同目标；结构 hash、XPath 和文本只能参与核对，不能单独作为永久身份。

### 3.2 新探索：在原生动作执行前捕获，结束后捕获后态

复用现有 `register_new_step_callback(summary, model_output, step)` 和 `on_step_end(agent)`；继续使用原生 `max_actions_per_step=1`。不复制 Agent loop，也不在采集回调执行额外业务动作。

```text
已确认任务规则                         原生 Agent 提出动作
       │                                     │
       │                         同一 summary.selector_map[index]
       │                                     ↓
       │                         当时目标 EnhancedDOMTreeNode
       │                          ↙          ↓          ↘
       │                     真实祖先     目标子节点    集合/同级关系
       │                                     ↓
       └────────────────────→ 动作 + 前态结构引用
                                             ↓
                                    原生 Tools 执行动作
                                             ↓
                                  实际结果 + 新页面/局部后态
```

- 先从模型实际看见的 summary 复制结构，再刷新观察。不得先刷新 selector_map 后用旧 index 查新元素。
- 从目标沿 `parent_node` 向上保留列表/表单/弹层的必要边界，同时保留路径上的中间节点；直接序列化节点关系，不用缩进反推。
- 列表选择要保留条目根、目标在条目内的路径、相关兄弟条目及顺序；记录查询覆盖范围。取第 1 项只需证明所查集合前缀没有遗漏，不强迫保留整站 DOM。
- 父子关系分为普通 DOM、iframe 文档、shadow root 边，不能拼成一条跨 frame 的普通 CSS 路径。闭合 shadow/跨源边界没有可执行查询能力时记录具体限制。
- 对 send_keys 捕获焦点；对 scroll 捕获实际滚动容器；对 tabs 操作捕获 tab 关系；不强行给所有动作伪造 DOM 目标。
- 采集时刻、页面身份、结构覆盖/截断信息随快照保存。采集期间发生导航或 frame/document 替换时不能拼接成同一前态；精确身份缺失要如实标注。
- 单步结束不等于异步操作完成。后态可以先是“等待中”，后续原生 wait/observe 提供已声明条件的最终事实；原动作只执行一次。

### 3.3 旧 history：可恢复什么，不能补造什么

1. 从 `history[step].model_output.action[actionIndex]` 定位拟议动作；原生 `interacted_element` 按 action 位置排列，**不是**按 `index` 作为数组下标，也不应寻找本版本没有序列化的 `highlight_index`。
2. 先核对动作执行结果是否可归属。原生 multi_act 会在错误、done、导航或焦点变化后停止，列表中后续动作可能从未执行。数量不符不能 zip 截断，也不能补成功。
3. 从 `state_message` 的页面区域提取版本化展示树候选；动作编号只与同一步匹配。其它 agent_history/file_system 文字中的相同 `[47]` 不得混入。正文可含类似标记，不能把任意正则命中当权威节点。
4. 将交互元素 XPath/属性与展示位置交叉核对。XPath 可说明祖先路径形状，不能补出缺失祖先属性、兄弟节点或完整集合。
5. 优先使用已有 find_elements 查询和结果确定列表候选；它只有 children_count，没有真实 children，且正文/属性可能截断。保存查询、总数和截断情况，不把格式化文本当完整 DOM。
6. 模型的 next_goal/memory 可帮助人工理解，不成为控制合同或成功证明；不依赖模型私有思考文本恢复节点。
7. 后一步状态只有在可证明中间没有未记录动作/页面切换时，才可作为前一步后态候选。多动作步骤不能让所有动作共用一个假想中间 DOM。
8. 在线重新查询所得只是**本次新证据**，不能回填为历史现场。旧数据缺关系时输出“哪个动作缺哪个关系”，优先在下一次正常探索被动补齐，不能默认另建模型补采循环。

## 4. 交付包：保存可使用的数据，不只保存摘要

建议作为来源 artifact 的扩展；沿用现有 artifact/repository，不建立新数据库。这是字段设计，不是已经存在的 API。

| 记录 | 必须表达的内容 |
| --- | --- |
| 来源清单 | b-u 版本、最终 action schema 摘要、任务/计划版本、采集策略版本、脱敏与截断说明 |
| 动作记录 | step/action 位置、动作名及参数来源、拟议/实际执行/失败状态、前后快照引用、结果引用 |
| 页面快照 | tab/frame/document 范围、URL、时间区间、焦点、视口、结构覆盖范围；局部节点图可解析读取 |
| DOM 节点 | 快照内 ID、原生节点关联、tag、批准属性/AX 状态、parent/children、顺序、frame/shadow 边；必要文本带来源 |
| 集合记录 | 容器、条目根集合、查询作用域与顺序、目标项序号、条目内目标、完整/截断范围 |
| 状态变化 | 页码/筛选/排序、弹层开启、值/选项、加载状态、导航/tab 关系、动作结果与业务结果之间的对应 |
| 查询候选 | 容器查询、条目查询、位置或输入条件、条目内相对查询、依赖的任务条款、验证记录和失效条件 |

摘要只用于完整性检查；artifact 必须能够按引用读到脱敏结构本体。对真实父子关系、展示树推测和后来在线验证分别标注来源，不能升格成同等事实。

敏感边界：不复制 cookie/Profile/认证字段，不把整份原始 state_message 倒进 Git/日志。只保留任务相关结构和允许字段；原文如已有仅继续留在本地原来源。脱敏后仍需保持结构关系与占位引用；不以“脱敏”为由把所有有用结构只剩 hash。限额沿现有输入上限制定，实际值要以代表页面测量后冻结；截断必须显式，不能据截断集合证明全量或全局序号。

## 5. 如何形成可复跑的列表查询

先使用已有 find_elements 的 CSS 查询、实际节点路径/属性和真实祖先关系构造有限候选。匹配交给浏览器现有 CSS/DOM 查询，不自写选择器解析器、模糊文本打分或浏览器驱动。

候选必须包含四部分：**在哪个页面/区域 → 哪些是条目 → 按什么规则选条目 → 点条目里的哪个元素。** 不只保存目标元素的一条绝对 XPath。

确认候选的步骤：

1. 来源页面上查询结果包含实际点击目标，且目标所在条目及序号符合已确认要求。
2. 容器范围不包含导航栏/其它列表；目标在选中条目内唯一。重复链接、隐藏副本必须用明确范围解决，不能猜一个。
3. 列表顺序明确为 DOM 顺序；若业务视觉顺序与 DOM 顺序不一致，必须有额外可验证依据，不能直接 list[0]。
4. 内容/编号/标题变化后，查询仍取本次正确位置；换样本验证前仅称候选，不宣称永久稳定。
5. 规则失败返回具体缺口，不偷偷从 ordinal 切换到历史标题，也不隐式调用模型重新找路。

候选查询是任务版本数据，可以含该页面 selector；**平台源码不得硬编码站点 selector**。技术定位从探索证据取得，不要求用户预先提供 CSS/XPath。

## 6. “第 2 页第 1 条”的完整例子

下图为说明结构的合成例子，不是从真实页面复制的 selector：

```text
结果区域
├─ 当前筛选与排序
├─ 列表容器
│  ├─ 条目 0
│  │  ├─ 标题链接 ← 当时 click.index=47 对应这个节点
│  │  └─ 元信息
│  └─ 条目 1 …
└─ 分页控件（当前页=2）
```

交付给 w-u 的规则应是：目标页来自已确认输入；列表查询及条目内部链接来自观察结构；ordinal=1 来自需求。历史标题和 href 仅用于核对当次目标身份。

复跑逻辑（概念步骤，不是新增执行 API）：

```text
完成指定筛选/排序
→ 使用本次分页控件到第 2 页
→ 验证页码=2、筛选/排序正确、目标列表已更新并可读取
→ 重新查询当前列表条目，取第 1 项
→ 在该项内部找唯一详情链接；读取本次链接身份
→ 点击；验证进入本次选中的详情
→ 按任务要求返回；验证仍是同样筛选/排序的第 2 页
```

- 页码显示变化但旧列表尚未替换，不算分页完成；只检查 title changed 或“点击成功”不足够。
- 当前任务禁止拼接筛选/分页 URL，因此仍操作分页控件；记录地址用于核验，不把它擅自改成导航捷径。
- 若翻页后前后首项碰巧相同，不能只靠“首项不同”判断加载完成；应使用页面实际提供的页码/加载/区域更新证据组合。
- 虚拟列表的第 1 个已渲染节点不自动等于页面第 1 条；需要窗口位置或逻辑序号证据。
- 页数扩展使用需求明确的重复/停止规则；看到两次翻页本身不授权生成“永远翻两次”的循环。

## 7. 意图、DOM 和模型边界

需求已经写明“第 2 页第 1 条”时，不再要求用户重申这个选择规则，也不要求用户确认 DOM 细节。需求/计划负责业务规则，DOM 交付负责定位实现，w-u 负责绑定两者。

现有普通 Markdown 到结构化规则的接线仍缺失，但**不能让该缺口阻止先证明动作与 DOM 的精确关联**。本草案不把控制意图归属改成模型自由推断，也不扩展模型生成 selector/整图的权限。若后续确需新模型用途，单独提出明确规范变更；不要借此次数据修复悄悄加入。

## 8. 复用和代码处置边界

Reuse Assessment:
- capability: 原生动作到真实 DOM 局部结构的证据关联及可复跑查询绑定
- existing implementation in repository: capture/history/registry、ordinal/css capability、read_fields、来源 artifacts、TaskChain/LangGraph
- mature candidates and pinned versions: b-u 0.13.8 Tools、EnhancedDOMTreeNode、Page/Element、原生 hooks；当前 w-u ElementFinder/converter
- selected implementation: b-u 原生 DOM/查询/动作 API；w-u fork 只做证据裁剪、关联和任务规则映射
- reused public surface: selector_map、parent_node/children_nodes、Agent hooks、Tools action schemas、Page.get_elements_by_css_selector、Element.get_basic_info；已有 CSS 执行依托 DOM.querySelectorAll
- B-A-T-owned adapter and remaining gap: 来源结构 artifact、逻辑集合/相对位置和需求条款绑定；新探索保存局部树、旧文本仅恢复候选；特殊 frame/shadow 的执行面需单独核验
- license/runtime/platform fit: 保持现有 MIT/AGPL/Python 依赖与固定版本；Windows 仍未验证
- browser/runtime/state ownership conflicts: 唯一 Browser 和 Agent；不新增浏览器控制、DOM 解析/选择器引擎、调度器或存储系统
- replay model calls: 普通查询/选择/验证 0；不调用 Page.get_element_by_prompt 兜底
- rejected candidates and evidence: w-u 原 converter 的元素提取仍寻找旧 highlight_index/first-tab 字段，与本版本交互记录不匹配；不直接启用整个旧 converter。state_message 缩进不能替代真实 parent_node。截图坐标/hash 不能替代逻辑集合查询
- focused validation: 第 9 节的动作映射/集合查询反例和业务验证；本轮仅 schema/源码/原记录核查

| 现有部分 | 后续应保留/改写的方向 |
| --- | --- |
| 原生 Agent、Tools、DOM、Page/Element | 保留；采集回调接入，不重写 loop 或 driver |
| registry / coverage | 保留；按真实 schema 驱动，区分拟议与实际执行，未知动作仍可追踪 |
| capture.py | 改写采集内容：保留可读局部树与集合关系；不再只靠预置 selector 的匹配结果 |
| history.py | 接入原生交互结构与状态文本来源；旧/新证据质量分开；不丢未知动作或造中间状态 |
| author.py 来源保存 | 改写脱敏来源交付；结构可按引用加载，摘要不代替内容；继续 finally 关闭 |
| selection_target / 需求接线 | 拆清业务选择规则与技术 locator；locator 来自证据，不能要求用户先给 selector |
| capability / read | 复用公开查询和动作；增加集合范围/相对查询前先核验公开 API；不写模糊选择引擎 |
| artifact / 宿主 materializer | 仅增加结构来源引用与校验；复用既有持久化和 IR，保持版本可读 |
| 本轮以前通过的样本 | 保留作为局部证据；不能用于宣称此次 DOM 交付已完成 |

## 9. 最小验证与停止条件

24 类动作对照表用于记录覆盖与缺口；先为首批数据足够的动作选择结构样本，不等待全部动作可用。每类记录“步骤/动作位置、是否实际执行、前态、原目标、祖先/集合、前置展示过程、选择依据、结果、后态、缺失字段”。不涉及 DOM 的动作明确填文件/tab/结果等对象。不要先写整套新 schema 再找页面验证。

必须覆盖的反例：

1. 不同快照同一交互编号指向不同元素；不得串页。
2. find_elements.index=0 与 click.index 是不同编号空间；必须通过实际节点关联。
3. 目标链接外有多层包装、其它区域有同名链接；查询仍在正确列表/条目内。
4. 列表重排或所有标题变化，仍取本次第 1 条；不得返回历史 X。
5. 翻页控件先变页码、列表后刷新；不得提前读取旧条目。
6. 多动作因导航/失败截断；未执行项不生成成功节点。
7. 展示树折叠祖先、查询截断、虚拟窗口、frame/shadow 边界；不能假装完整树。它们影响固定结构的数据完整性；不由此扩展出网站改版自愈工程。
8. input/send_keys 焦点与目标不同、弹层重复控件；不能只按文案匹配。
9. 同一列表分别操作 item 根与 item 内 title；中间带包装层时仍命中原本要求的操作节点。
10. 页面异步重建后结构一致但原生节点 ID 全变，仍通过结构关系找到本次节点；展示条件未满足则先等原前置流程完成。

随后沿同一条业务链验证：真实模型完成原任务 → 完整来源保存 → w-u 转换 → 样本复跑 → 至少一个输入变化的同链复跑。结果字段、页面顺序、动作覆盖、模型审计和 finally 一起验收；沿用 H7 门，不把局部列表 demo 算完整通过。

停止并回到设计的证据：公开 DOM/结果无法唯一对应真实动作；关系恢复必须凭文本猜而无法查询核验；换输入必须冻结样本或修改平台站点补丁；需要隐式模型定位或新的浏览器/调度引擎。单个旧 history 缺结构先分类为来源不足，不能未经新探索采集能力核验就宣布整个方向不可行。

## 10. 新会话实施入口

用户已授权下一会话开发，当前会话只完成文档和交接。先读 [前置工具开发计划](BROWSER_USE_DOM_TOOLS_IMPLEMENTATION.md)，按 D0–D4 实现、整理相关旧代码，再继续 M1 原任务验证。不得从下方历史记录恢复“全部 24 种一起实现”或“先扩展全部控制形态”的旧顺序。

本文第 2、3、8、11 节作为动作、原生数据、复用和原任务证据索引；不是已经实现的说明。下一会话无需重新访谈已明确的页码/序号/结构假设，也不需要再次询问是否开始开发。

## 11. 原任务动作对照：本轮已经做的只读核查

下列 step/action 均为零基位置，来自同一已保存 history；结构化证据见 [动作对照](evidence/browser-use-dom-handoff/action-dom-examples.json)。原始页面、标题、链接值和 selector 未复制进本表。

| 动作位置 | 已恢复的事实 | 尚不能据此宣称的内容 |
| --- | --- | --- |
| step 17/action 1：click | 原交互编号 8931；按 action 位置找到 A 节点，展示树同编号恰好一处；目标在 nav 下，href 的 page 参数为 2；下一步页面地址 page=2 | 完整父子属性树未保存；仅 URL page=2 不能证明筛选/排序和列表已经完成更新 |
| step 19/action 0：find_elements | 实际返回 0 个匹配项，虽然 result.error 不存在 | **不能把这个 selector 编成已验证列表查询**；无错误返回也可能没有找到东西 |
| step 19/action 1：click | 交互编号 17822，对应详情 A；XPath 后段为 ul/div[1]/div/li/div[1]/h3/a；展示树同编号唯一；结果含点击坐标元数据 | 下一步仍显示列表第 2 页；不能仅凭 Clicked 文本证明已进入详情，也不能把“元数据有坐标”误认成坐标型 action 参数 |
| step 20/action 0：click | 再次点击 17822；对应同样结构的详情 A；下一步状态为详情页面 | 两次点击的即时效果没有逐动作原子快照；不能自动把第一次删掉或生成永久两次点击重试 |
| step 21/action 0：go_back | 从详情执行返回，下一步状态为列表 page=2 | 还要核对筛选、排序及目标列表，不只核对地址 |
| step 25/action 0：click | 再次通过 nav 下 A 翻到 page=2；当时交互编号已变为 30030 | 不能复用之前的 8931；是否能复用同一逻辑分页查询要按结构与状态验证 |

这张表说明：已有记录能准确找回若干**被点击节点及其路径线索**，足够开始有针对性的列表候选恢复；但原本那次列表查询失败，完整父子结构和即时后态没有保存，尚不能说“已有一个验证成功的 list[0] 接口”。下一步的具体对象已经锁定为这个列表容器、条目边界、详情相对链接和分页完成状态，不能再回到泛泛增加摘要/拒绝规则。

## 源码锚点（固定版本）

- b-u 0.13.8 归档 SHA256 `2c868f099a66d8c33c0c346762d9b1c59e7254517bc900d3891e0b84767b977a`；归档内部路径如下，可由固定源码复核，勿读取 node_modules。
- `browser_use/tools/service.py`：Tools 默认注册、find_elements/search_page 的查询与格式化、坐标 click 配置。
- `browser_use/agent/views.py`：AgentHistory.get_interacted_element 按动作位置保存交互节点；model_dump 保存 state_message。
- `browser_use/agent/service.py`：原生前置回调、on_step_end、multi_act 提前停止的执行语义。
- `browser_use/dom/views.py`：EnhancedDOMTreeNode 真实父子/frame/shadow；DOMInteractedElement 序列化不含父子树。
- `browser_use/dom/serializer/serializer.py`：展示时跳过/折叠节点；不能以展示层级充当真实 DOM。
- `browser_use/actor/page.py`：get_elements_by_css_selector 使用 DOM.querySelectorAll/describeNode，返回本次 Element。
- [当前采集器](../../vendor/workflow-use/workflows/workflow_use/hybrid/capture.py)、[history 导入](../../vendor/workflow-use/workflows/workflow_use/hybrid/history.py)、[来源交付](../../vendor/workflow-use/workflows/workflow_use/hybrid/author.py)。
