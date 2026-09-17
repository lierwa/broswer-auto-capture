# 废弃整页语义读取清理

日期：2026-09-17

结论：已删除退出生产后的 whole-main/body DOM 注解入口、128000 字节页面上下文常量及只覆盖该入口的测试。正式 `bat_read_fields`、读取证据、编译和输出组装职责保持原合同；本次没有运行模型或浏览器。

## 对齐边界

Product Alignment:
- natural-language task: 清除无生产调用的整页语义读取实现及只验证该实现的残留。
- reusable chain boundary: 保留参数化字段读取、稳定性证据和确定性编译；不增加新执行能力。
- runtime inputs: 不修改。
- dynamic task outputs: 不生成业务输出。
- generic platform capability used: 既有 `bat_read_fields`、`VerifiedNaturalRead` 和 `browser.read-fields` 编译路径。
- replay model calls: 0；本次验证不启动模型。
- site/task-specific code added: no

## 调用核查与处置

CodeGraph 已初始化，但未索引到 Python 符号；按项目规则改用 scoped `rg` 核查实际调用。

删除 `vendor/workflow-use/workflows/workflow_use/hybrid/natural_reads.py` 中：

- `MAX_CONTEXT_BYTES = 128000`
- `propose_verified_read`
- `bounded_dom_html`
- `natural_read_system_prompt`
- 仅上述实现使用的 `json`、`SystemMessage`、`UserMessage`、`BeautifulSoup`、`Comment` 和 `bounded_schema` imports

删除 `vendor/workflow-use/workflows/tests/test_hybrid_natural_reads.py`。该文件的所有测试均通过已删除的 `propose_verified_read` 入口执行；生产代码没有该入口调用者。删除后 scoped `rg` 对四个已删符号和 natural-reads 的专属 bs4/messages imports 均为零引用。

原文件字节在删除前保存至：

`/private/tmp/dead-read-cleanup.fFrX7R/`

原始 SHA-256：

- `natural_reads.py`: `b71ef35e33ade07a74414ab963e98c8edd97fd1ccc85cd80bb32ce55f55ae531`
- `test_hybrid_natural_reads.py`: `a30abc9db14bf5e6556d65ec925cfb819b82d1fb2b1966cdc2c5fc9aa4847bdb`

## 保留职责

以下符号仍有正式调用，未删除：

- `NaturalReadProposal`、`validate_proposal`：当前字段映射及编译证据验证。
- `VerifiedNaturalRead`、`NaturalReadFailure`、`schema_at_path`、`paths_conflict`、`value_at_path`：字段工具、证据、输出和摘要共同合同。
- `read_fields_with_proof`、`collection_identity`、`current_page`、`page_identity`、`assert_identity`、`backend_id`：`bat_read_fields` 的页面、容器与双读稳定性核验。
- `compile_verified_read` 及其验证 helpers：`natural_compile` 到确定性 `browser.read-fields` 节点的正式编译路径。

`vendor/workflow-use/workflows/workflow_use/hybrid/semantic.py` 中显式 LLM 节点的 `maxInputBytes <= 128000` 合同保留。它限制历史显式语义节点的已绑定输入，不是生产页面整页或整容器读取上限。

没有删除 Python 依赖记录。`beautifulsoup4` 仍由项目的 `markdownify==1.2.2` 依赖链使用，`soupsieve` 也有独立安全版本约束；本项仅移除废弃页面读取实现对 bs4 的直接 import。

## 验证

验证均以当前 checkout 根目录为 workdir，设置遥测和 cloud sync 为关闭，pycache 写入 `/private/tmp`。

改前与改后均执行：

```text
work/upstream-browser-hybrid/.venv/bin/python -m py_compile \
  vendor/workflow-use/workflows/workflow_use/hybrid/natural_reads.py \
  vendor/workflow-use/workflows/workflow_use/hybrid/field_read_tool.py \
  vendor/workflow-use/workflows/workflow_use/hybrid/field_read_evidence.py \
  vendor/workflow-use/workflows/workflow_use/hybrid/natural_compile.py
```

结果：通过。

```text
work/upstream-browser-hybrid/.venv/bin/ruff check \
  vendor/workflow-use/workflows/workflow_use/hybrid/natural_reads.py \
  vendor/workflow-use/workflows/workflow_use/hybrid/field_read_tool.py \
  vendor/workflow-use/workflows/workflow_use/hybrid/field_read_evidence.py \
  vendor/workflow-use/workflows/workflow_use/hybrid/natural_compile.py
```

结果：通过，`All checks passed!`。

两个既有纯内存模块在改前和改后各运行一次，共 17 项；两次结果一致，均为 15 通过、2 个既有失败：

- `test_scroll_and_send_keys_require_specific_observed_effects`
- `test_delayed_scroll_effect_owns_only_continuous_pure_wait`

两项失败分别是滚动位置变化不再作为完成证明，以及缺少既有 effect/postcondition/binding 证据，与本次删除无关；本项未扩大修改。

随后定点运行保留读取编译与输出职责：

```text
python -m unittest \
  vendor.workflow-use.workflows.tests.test_hybrid_natural_compile.NaturalCompileTests.test_verified_natural_read_compiles_only_with_original_output_schema \
  vendor/workflow-use/workflows/tests/test_hybrid_natural_output.py
```

结果：4 项通过。

最终 scoped `rg` 结果：

- `propose_verified_read`、`bounded_dom_html`、`natural_read_system_prompt`、`MAX_CONTEXT_BYTES`：零引用。
- `natural_reads.py` 中 `browser_use.llm.messages`、bs4 和 `json`：零引用。
- `semantic.py` 中显式 LLM 的 128000 输入预算合同仍在。

## 未扩大事项

- 未修改 `author.py`、`capture.py`、`action_dispatch.py`、`find_elements_context.py`、manifest 或主进度文档。
- 未新增或修改测试，除删除只覆盖废弃入口的测试文件。
- 未启动 Browser、模型、网络或服务；未安装依赖；未运行全量测试；未提交。
