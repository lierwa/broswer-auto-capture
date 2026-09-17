# H2 来源与复用准入（2026-09-16）

当前状态：**两项 executor 缺陷已在 fork 内修复，7 项 focused 回归通过；混合编译与正式接线未完成。** 见 [修复记录](FORK-REPAIR.md)。以下来源探针及停止结论是修复前的历史证据，不再代表当前 fork 行为。

结构化停止结果见 [admission-gaps.json](admission-gaps.json)；它是 H2 准入评估，不是编译器产出的 HybridCompilation。

这不是 H7 `abandoned`：没有开始新 candidate、样本复跑或真实验收。

## 已完成

- 从 [固定上游 commit](https://github.com/browser-use/workflow-use/tree/5d2d19fe8835cc86f1bf3e04302a5000d590f249) 下载原始 archive，导入 `vendor/workflow-use/`，188 个上游文件逐字节保留。
- archive SHA-256：`47a85b5446e22fd4d025f0dc85768f2bd51cd3b478ea471dacb5b7a2714a858a`。`UPSTREAM.json` 记录来源、日期、逐文件 SHA-256 和 mode；保留原始 AGPL-3.0 LICENSE；`BAT-CHANGES.md` 记录没有修改上游文件。
- 未应用 0001–0012，未运行旧 setup、旧 runner、上游安装、浏览器或模型。上游原样代码中存在站点/业务启发式，不表示 B-A-T 接受它们作为公共能力。
- fork `workflows/pyproject.toml` 声明 Python >=3.11，`uv.lock` 固定 browser-use 0.13.8。lock 含针对依赖安全下限的 override；本轮没有改 lock 或安装依赖。
- browser-use 0.13.8 源码仅下载到临时目录，核对 lock 中 sdist SHA-256 `2c868f099a66d8c33c0c346762d9b1c59e7254517bc900d3891e0b84767b977a`。只展开 agent/history、tools/registry、browser state 与 actor 的七个源码文件，没有读取旧 venv、node_modules、Profile 或截图。

## 实际探针

历史探针命令：`python3 apps/api/tests/fixtures/workflow-fork-probe.py --baseline-archive <原始 archive 路径>`。脚本核对固定 archive digest，只读原始方法，当前 vendor 修复不会改变历史反例。

探针从干净上游 AST 提取原样方法体，用内存 port 隔离依赖。它证明方法行为，不代表完整包 import、实际 Browser 或 Windows 验收。结果见 [method-probe.json](method-probe.json)。

| 反例 | 当前行为 | 必须满足的合同 | 源码 |
| --- | --- | --- | --- |
| converter 的 extract 输出 | 生成 extract_page_content；execute_step 抛 Unsupported step type | schema 与普通 capability dispatch 一致 | `healing/deterministic_converter.py:783`；`workflow/semantic_executor.py:1863`；`schema/views.py:145` |
| 可选条目只有 1 个，要求 ordinal=2 | `_select_element_by_position` 返回第 1 个 | 数量不足必须 missing，不能选另一个输入 | `workflow/semantic_executor.py:483–522` |
| future_action、wait、switch_tab、文件动作 | converter 返回 None，动作消失 | 未知动作进入 coverage/gap；副作用不能静默排除 | `healing/deterministic_converter.py:876–883` |

两项 executor 核心反例已经暴露，因此本轮立即重审复用，**没有修复 executor，也没有准备第三份补丁**。

## history 证据边界

[history-admission.json](history-admission.json) 仅包含结构与布尔事实：两份 history 的最后 `is_done/success/judgement.verdict` 均为 true；不能因此标 candidate。

- `browser_use/agent/service.py:2733–2840` 的 `multi_act` 在错误、页面变化或 terminates_sequence 后停止余下动作。因此 action 数不等于实际执行数；未执行 proposal 不能标 succeeded。
- `agent/service.py:1307` 的步骤异常处理可能把 last_result 替换为单个错误；`agent/views.py:846–849` 的便捷过滤使用 zip，会丢失无对应 result 的 proposal。规范化不能直接复用这个丢失信息的列表。
- `agent/service.py:1732–1774` 与 `browser/views.py:116–123` 仅持久化该 history item 的 URL/title/tabs/interacted_element/screenshot path，没有逐 action 的 post observation。
- 完整历史中 0-based item 8、13、14 有未配对 proposal，item 15 没有动作但有错误。结合 multi_act 可以解释“提议不等于执行”，但不能从这些结构字段恢复每个执行动作的 effect/postcondition。
- 不把下一条 pre state 自动认作多个动作各自的 post state，不打开原始截图或完整页面来填充未经脱敏的证据。当前最小 fixture 有意保持 `not_compilable`，不是正向 compilation fixture。

## Reuse Assessment（H2 重审）

- capability: history/action schema 读取、完整覆盖、稳定目标解析与普通执行
- existing implementation in repository: 现有 TaskChain/LangGraph、版本引用、绑定、预算、SQLite 审计；v1 已在 H1 退休
- mature candidates and pinned versions: workflow-use 0.2.11 @ 5d2d19f；browser-use 0.13.8（lock sdist 已核 SHA）
- selected implementation: workflow-use 仅保留干净源码作为待准入 fork；本阶段不冻结普通 executor
- reused public surface: browser-use `AgentHistoryList.history`、`AgentHistory.get_interacted_element`、`Registry.create_action_model` 与各 action param_model 是候选读取面；必须保留 raw action 顺序及非成功状态。`Tools.act`、Page/Element 是候选执行面，尚未证明 StableTarget/effect/postcondition 的产品映射
- B-A-T-owned adapter and remaining gap: Requirement/Plan/ControlContract、脱敏 EvidenceRef、coverage/binding 与 TaskChain 映射属于 B-A-T；目前普通能力准入和逐动作后置证据仍缺，不能写一个自有通用定位/等待/执行系统来补足
- license/runtime/platform fit: workflow-use AGPL-3.0；Python >=3.11，锁 browser-use 0.13.8；本轮只有 macOS 上 stdlib AST 方法探针。完整依赖 import、Windows、分发义务未测
- browser/runtime/state ownership conflicts: 单 Browser、LangGraph 唯一图引擎、SQLite 产品事实源；拒绝 upstream Workflow.run、自带 storage、Agent fallback 和第二个调度器成为新运行旁路
- replay model calls: 普通节点要求 0；上游 extract 可以调用 page_extraction_llm，Workflow no-ai 名称不能证明 0；因此整个 semantic executor 不准入
- rejected candidates and evidence: 原生 deterministic 的动作丢弃见方法探针；整图 LLM conversion 在 HealingService.create_workflow_definition 中向 ainvoke 传 WorkflowDefinitionSchema，拒绝该公开入口；semantic executor 的 schema dispatch 与 ordinal 语义反例已实测
- focused validation: 原始 archive 对比、188 文件摘要；原样方法 AST 探针；两份 history 结构与成功标志投影。没有把这些检查写成真实执行通过

## Failure Analysis / 硬停止

- expected invariant: H2 在写 compiler 前冻结可证明 target/binding/effect/postcondition 的普通执行复用面
- observed evidence: executor 选择错误条目、schema/executor 不一致；history 无专用逐 action post observation；结构 fixture 不能证明区段完成条件
- responsible layer: 普通能力准入与探索证据合同，非 LLM 分类器
- root cause or falsifiable hypothesis: 上游 workflow step/semantic hint 与 B-A-T StableTarget/EffectContract 不等价，成功 history 也不是逐动作证明包
- affected public contract: 规范 8 节 deterministic 四项证明；H2 公开能力准入；ADR 0005 硬停止条件 4
- keep / rewrite / remove existing change: 保留通过的 H0/H1 gate、fixture、原始数据和干净 fork；不移植 patch、不修改 vendor executor、不伪造正向 fixture；没有 compiler/runtime v2 改动需要撤销
- smallest validation: 已完成上述源代码、方法级反例与 history 结构核查；没有必要重跑真实网站
- reuse decision impact: 普通 executor 仍未准入，H2 未通过，H3–H7 不启动。恢复需要先给普通能力适配及逐动作证据一个可验证的成熟公开复用方案，并修订/完成本准入记录；不能继续沿用“已冻结”假设

下载首次因沙箱无法访问既有本机代理失败；通过受审的只读公开源码下载重试成功。没有改代理设置、安装依赖或启动服务。
