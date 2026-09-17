# Field-read interface feedback alignment

Product Alignment:
- natural-language task: 从已确认输出合同的真实路径读取可复跑 DOM 字段，并在参数不符合合同时给模型可修正反馈。
- reusable chain boundary: 仅修正 `bat_read_fields` 现有公开参数说明和合同派生校验失败反馈。
- runtime inputs: `outputPath`、`container`、`fields`；字段项仍只有 `selector` 与可选 `attribute`。
- dynamic task outputs: 已确认 outputSchema 中一个真实目标路径对应的对象、对象数组、标量或标量数组。
- generic platform capability used: 既有 `schema_at_path`、`_read_shape`、`FieldReadMapping` 和 `ReadSpec` 派生与校验。
- replay model calls: 0；修复不新增模型调用。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从权威输出合同解释可用路径、目标字段形状和基数，并返回安全、可操作的参数修正反馈。
- existing implementation in repository: `natural_reads.schema_at_path` 已解析路径；`field_read_params._read_shape` 已派生 object/object-array/scalar/scalar-array 的字段、required、maxItems 与 `value` 包装。
- mature candidates and pinned versions: 不适用；这是既有工具公开接口反馈修复，不新增基础设施。
- selected implementation: 复用既有路径解析和 shape 推导，只格式化已确认 schema 的根字段、required、allowed 与 maxItems。
- reused public surface: `FieldReadToolParams`、`expand_field_read_params`、`schema_at_path`、稳定错误码。
- B-A-T-owned adapter and remaining gap: 在稳定错误码后附简短修正提示；不改变读取、验证、合同或浏览器所有权。
- license/runtime/platform fit: 不引入依赖或运行时变化。
- browser/runtime/state ownership conflicts: 无；错误参数必须在浏览器访问前失败。
- replay model calls: 0。
- rejected candidates and evidence: 不输出完整 schema、不拼接异常正文、不放宽字段/基数/类型校验，因为会扩大提示面或改变既有契约。
- focused validation: 保存的 a18/a20/a22 真实参数与同一 outputSchema；throwing browser 证明 0 浏览器调用，失败记录仍为 0；另做标量接口说明定点检查、`py_compile` 与 Ruff。

## 主审及定点验证

原source a18/a22的不存在路径、a20缺必需字段均用真实工具入口复现：修改前只返回抽象code，修改后指出有效根字段及所需字段。错误参数仍在访问Browser前拒绝，红绿各browserCalls=0、successfulRecords=0。未放宽字段完整性、基数或类型；三个模型输入字段不变。精确diff及红绿产物见/private/tmp/field_read_tool.feedback.diff、field_read_params.feedback.diff、field_read_feedback_red.json、field_read_feedback_green.json。

两文件py_compile/Ruff通过，主agent已核验实际Sol/high、审查diff并归档执行者。本项与author指导/未通过judge的输出保留一起更新manifest，sourceDigest=ee6a94cd27643eeff35cecf9f7c3d3c46a8b85508ad2401e90b88df7a3e2816e；setup --check通过。不等于原主线验收通过。接下来诊断已记录click完成效果与只读search_page覆盖，避免已知缺口下盲重跑整段。

## Shadow DOM 可见字段适配（局部诊断）

Product Alignment:
- natural-language task: 从同一列表容器确定性读取普通文本、属性、多值标签和含 Shadow DOM 的完整可见文字。
- reusable chain boundary: 保持 `bat_read_fields` 的 `outputPath`、`container`、`fields` 公共参数不变，只在选定文本字段含 shadow 子树时补齐浏览器原生可见文字。
- runtime inputs: 既有 CSS container/field selector 与可选 attribute。
- dynamic task outputs: 输出合同派生的对象、对象数组和标量。
- generic platform capability used: browser-use `Page.dom_service.get_dom_tree`、`EnhancedDOMTreeNode` 与 `DomService.is_element_visible_according_to_all_parents`。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 在不实现 CSS、布局或 selector 引擎的前提下读取 open shadow tree 的原生可见文本。
- existing implementation in repository: browser-use 原生 DOM 快照已保留 provider 顺序、shadow roots、snapshot 节点和 computed-style 可见性。
- mature candidates and pinned versions: 仓库已锁定的 browser-use；AX `queryAXTree` 定点实测未返回该字段的文本节点，未采用。
- selected implementation: 非 shadow 字段保持原 `innerText` 字节；仅含 shadow 的已选文本字段映射到同 target 的唯一 backend node，再按 provider 顺序规范化拼接原生可见 TEXT_NODE 片段，不宣称与通用 `innerText` 完全等价。
- reused public surface: `get_dom_tree`、`children_and_shadow_roots`、`backend_node_id`、`target_id`、`is_element_visible_according_to_all_parents`。
- B-A-T-owned adapter and remaining gap: 每次 `read_fields` 最多懒加载一次原生树并只在该次读取内复用；字段 backend 必须在同 CDP session 映射且同 target 唯一，否则固定失败。
- license/runtime/platform fit: 不新增依赖；无浏览器或模型所有权变化。
- browser/runtime/state ownership conflicts: 不跨读取缓存 DOM 树；读取前后继续执行 page identity 守卫。
- replay model calls: 0。
- rejected candidates and evidence: 不读取整页 HTML，不递归计算 CSS，不按站点控件特判；light fallback 没有 snapshot 且原生不可见，不能当作当前渲染时间。
- focused validation: `/private/tmp/bat-rendered-field-text-fixture.py` 用 mock 原生可见性 predicate 验证遍历、格式、混合可见/不可见值 guard 和非 shadow `innerText` 字节路径；它不证明真实 CSS opacity 行为。`/private/tmp/bat-field-read-production-acceptance.json` 保存一次真实局部读取。

真实局部验收从原计划 `steps[0].outputContract.schema` 经 `expand_field_read_params` 派生规格；同页调用真实 `bat_read_fields` 与 `read_fields_with_proof`，均读取第一页前 5 条的 number、title、仅标签正文、完整 `Updated` 加相对时间、detailUrl，并用独立 `bat_read_fields` 读取当前页控件为整数 `1`。首条结果包含 `#8408` 和 `· Updated 11h ago`；字段歧义定点返回 `field="number"; matchCount=0; reason=expected_exactly_one_match`。模型调用为 0，Browser 在 `finally` 中关闭。

以上是 2026-09-17 对当前 GitHub 页面的一次局部诊断读取，只证明这次生产读取路径和原生 shadow 适配，不是正式候选、sample replay，也没有证明含仓库路径的任务数据 selector 已跨仓库或不同输入复跑。原动态 React ID 已失效；验收参数改用页面结构和稳定属性，未嵌入当前标题、Issue 编号或 URL 样本值。
