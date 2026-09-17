# H3/H4 证据与历史问题覆盖

## 两种旧转换的同源对照

- [短历史](short-comparison.json)：8 个动作全部保留，14 个结构 gap；目录没有 definition，不声称生成成功。
- [完整历史](full-comparison.json)：38 个动作全部保留，59 个结构 gap。报告通过实际导入的上游 deterministic converter 逐动作离线执行；不打开 Browser、不调用模型。
- [已记录的 LLM definition](recorded-llm-comparison.json)：同一完整 history 对应 16 个生成步骤、9 个无输入模板的字面目标、1 个输入参数，没有 loop/branch/invoke，也没有 action 来源编号。无法据此恢复逐动作覆盖，不能把 16/38 的数量差直接称为漏掉 22 个动作。
- LLM 报告读取已保存的 definition，记录源摘要；没有重跑整图生成。实际历史模型调用数未保存在该文件，报告为 null。原样 HealingService 源码会生成整个 WorkflowDefinitionSchema，结构输出异常后还会另调一次原始输出；该路径已退出产品。
- 两种旧转换都不能提供新合同要求的逐动作前后观察、用户控制意图和参数来源。结构 fixture 不补造 judge verdict、效果或成功状态，因此均不可成为 candidate。

敏感边界：报告仅保存类型、编号、摘要、布尔比较和计数；不保存页面正文、选择器值、目标文本、模型提示词、结果正文、截图或 Profile。

## 十三类历史问题的处置

| 历史问题 | 当前处理 | 最小证据 / 保留的限制 |
| --- | --- | --- |
| 0001 prompt 花括号 | 整图生成退出产品 | 旧引用核查与 workflow-retirement tests |
| 0002 extraction schema/executor | 复用原 handler 修复分派；新读取走公开能力 | test_executor_contract；read/completion tests |
| 0003 workflow 结构输出失败 | 模型不能生成整图；只提出有界语义值注解 | annotations/gates tests |
| 0004 history/截图过大 | 显式脱敏、字段/条目/字节上限；进程独占临时目录 | evidence/capture/semantic tests；真实来源关闭 |
| 0005 固定文本 fallback | 稳定目标唯一解析，缺目标失败 | capability 的 ordinal 缺失与唯一性反例 |
| 0006 上下文丢失 | 明确 CSS 容器/role-name/ordinal；来源与真实 index 对齐 | compiler/capture tests；真实表单两字段 |
| 0007 重复文本排序 | 多个等价匹配直接拒绝，不按猜测分数选择 | capability role/name 双匹配拒绝 |
| 0008 accessible name | 复用上游 AX role/name 与 ElementFinder | capability role/name 用例；无名字不补造 |
| 0009 popup/background 同名 | 唯一目标与声明字段前后状态分别证明 | completion tests；同名不唯一仍 gap |
| 0010 邻近 label 污染 | 不复制旧文本邻接补丁；AX/唯一 CSS/index 证据 | capability/capture；无法归属则 gap |
| 0011 异步稳定等待 | 即时已证明或显式 settle 预算内完成的纯 wait 可归属最近动作 | causal/completion tests；Tenacity 只重查事实；真实异步表单零模型复跑 |
| 0012 陈旧目标/效果重试 | 每次公开动作前重新解析目标；效果失败不重复副作用 | capability + 真实表单 title/字段；自动写重试未准入 |
| 未知/多动作结果丢失与补采 | 所有动作进入 coverage；未配对结果与未知动作拒绝；无自建补采循环 | evidence/gates/runner tests；原生失败保持 source gap |

## 已实现的控制范围

- 普通导航、稳定目标动作、单对象/有界重复字段读取，以及 equals/changed 声明完成条件；原生 Agent 仍负责首次探索，普通复跑没有模型句柄。
- 选择目标可在确认后通过真实 selector_map 自动绑定未来动作编号。
- 循环可引用已证明需求条款；必须连续、唯一、等价且有明确上限/停止/累加合同。历史 iterations 形式兼容保留。standalone stableItemKey 和未映射 stopOutcomes 明确拒绝；去重使用既有 accumulator.stableKeyPath。
- 纯 input/constant 的根分支由既有 evaluatePredicate 求值，fork 记录并检查证据；clause: 引用绑定已证明入口。未访问浏览器分支不推测。
- 固定版本、已通过样本与换输入的线性普通子链可 once 调用；复用现有 invoke，预算与版本摘要重新核验。
- 上游值可按输出条款引用，必须有独立字段值证明且匹配实际探索参数；物化后消费本次动态值。
- 输出组合复用 data.transform merge/assemble；循环集合复用 accumulator；开放语义只产生显式 LLM 节点。

## 来源复用

已成功判定且完整关闭的原生来源可在零 Browser/零模型情况下离线重编译；当前 registry 与输出合同必须完全匹配。正式生成的编译阶段失败重试已实际验证来源复用；不允许把输入变化、未关闭来源或失败判定当作可复用成功来源。

## 尚未满足的门

H4/H6 仍在开发，不能由局部正向样本宣布全部通过。副作用失败重试、滚动发现目标的因果归属、跨 tab 返回合同、嵌套/浏览器状态分支、each/batch 子链形态尚未完整准入。普通 Markdown 还不能无歧义提供缺失控制意图；正式 v2 当前要求确认正文中的结构条款。H7 的 LangGraph Issues 真实业务及实际模型验收尚未开始。
