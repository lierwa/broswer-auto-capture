# H2 fork 内修复（2026-09-16）

用户已明确要求在 w-u fork 内直接修改，复用现有开源实现。此前将可定位的 executor 缺陷作为不修改 fork 的停止理由不再适用。本阶段先修复两个已复现问题，不改变 B-A-T 的执行架构。

Product Alignment:
- natural-language task: 对公开列表按指定位置操作，或读取页面中任务要求的信息
- reusable chain boundary: 一个版本化 workflow step；同一位置/读取语义可用于列表与表单
- runtime inputs: step 的目标、位置和 extraction goal
- dynamic task outputs: 原有 ActionResult 与明确执行错误
- generic platform capability used: fork SemanticWorkflowExecutor、现有 schema、现有 selector/wait/click/extract 实现
- replay model calls: 位置选择与分派均为 0；原有 extract 的模型能力不因此取得普通节点准入
- site/task-specific code added: no

Reuse Assessment:
- capability: 修复 extraction schema/dispatch 一致性与显式位置选择失败语义
- existing implementation in repository: vendor/workflow-use 原始 SemanticWorkflowExecutor 和上游 schema，H1 宿主 retirement gate
- mature candidates and pinned versions: workflow-use 0.2.11 @ 5d2d19f，browser-use 0.13.8
- selected implementation: 直接修改 w-u fork 的现有 executor；保持 b-u 与 B-A-T 宿主实现不变
- reused public surface: WorkflowDefinitionSchema、SemanticWorkflowExecutor.execute_step、原有 execute_extract_step、现有查找/等待/点击/验证方法
- B-A-T-owned adapter and remaining gap: 只保留 H1 gate；混合编译与逐动作证据后续在 fork 内继续，禁止搬到宿主另造执行器
- license/runtime/platform fit: 保留 AGPL LICENSE、UPSTREAM 原始摘要；使用已存在 Python 3.12.13 的依赖，PYTHONPATH 固定新 vendor 源码并断言 __file__，不安装或修改旧环境
- browser/runtime/state ownership conflicts: 测试使用内存 Browser port，无新会话/模型/数据库；不改变单 Browser 和 LangGraph 所有权
- replay model calls: 测试检查位置失败零点击/零模型；extraction 分派只证明复用现有读取方法，尚不证明普通 extraction 零模型
- rejected candidates and evidence: 不新增宿主 executor；没有必要替换库来修复已定位的遗漏分派与越界回退
- focused validation: 正式包导入下的 unittest：PageExtractionStep 与 ExtractStep 共用原 extraction 方法，保留 goal/output/verification 字段；ordinal 越界/非法失败、有效位置保留、公开 execute_step 不经 selector fallback 错点

Failure Analysis:
- expected invariant: schema 接受的 extraction step 能执行；显式 ordinal 不可用时拒绝，不能点其他条目
- observed evidence: H2 方法探针已复现 Unsupported step type 与 ordinal=2 返回 first
- responsible layer: w-u SemanticWorkflowExecutor
- root cause or falsifiable hypothesis: 缺 PageExtractionStep 分派/goal 适配；position_hint 失败掉入默认首项，公开 click 还可绕过位置约束走 direct/legacy selectors
- affected public contract: schema/executor 一致性、指定位置的选择语义
- keep / rewrite / remove existing change: 保留上游执行主体和 H1 gate；定点改分派与显式位置处理；不移植旧 patch 栈，不新建执行器
- smallest validation: vendor/workflow-use/workflows/tests/test_executor_contract.py，通过真实模块导入后先 red 再 green；不运行根级/全量/真实站点
- reuse decision impact: 两个核心问题已重审；修复仍属于现有 w-u 执行器内部，后续新问题先独立定位并更新评估

## 验证结果

- Red：实际 vendor 模块导入后，extraction 分派报 Unsupported、ordinal 越界返回首项、显式 selector 绕过 ordinal，5 项测试出现 8 个失败子例和 1 个错误。
- Green：7/7，通过两种提取 schema、缺失/非法 ordinal、有效位置/优先级、入口 selector 旁路、点击时歧义/消失、未指定位置兼容；有效位置用真实 wait/selector 方法和内存 Element.click，不 mock 这两个方法。
- 位置点击沿用 w-u wait/retry 与 b-u Element.click；禁止无法证明仍指向同一项的文本/selector fallback。点击时缺失或歧义抛错误进入原有失败处理，不能返回虚假成功。
- Extraction 测试 mock 原有 handler，只证明 schema/分派/元数据，不证明真实页面读取或模型调用的产品审计。浏览器和模型均未启动。
- 命令（checkout 根目录）：

```sh
PYTHONPATH="$PWD/vendor/workflow-use/workflows" ANONYMIZED_TELEMETRY=false BROWSER_USE_CLOUD_SYNC=false BROWSER_USE_SETUP_LOGGING=false PYTHONDONTWRITEBYTECODE=1 work/upstream-browser-runner/source/workflows/.venv/bin/python vendor/workflow-use/workflows/tests/test_executor_contract.py
```

上游 `semantic_extractor.py:549` 的既有 invalid escape SyntaxWarning 保留。H3–H7 未完成；未指定位置的其他上游启发式也没有取得通用能力准入。
