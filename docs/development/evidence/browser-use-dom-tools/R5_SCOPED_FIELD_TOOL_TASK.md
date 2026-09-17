# R5a 派发说明

> **历史派发记录，已关闭。** 本文件不再授权或指示启动任务。当前只按 [清理账本](../../REPLAY_CLEANUP_20260917.md) 工作。

日期：2026-09-16。决策 owner：主 agent。执行 owner：全新空白上下文 `/root/r5_scoped_field_tool`。首次创建受平台 `agent thread limit reached` 限制；R6 交付后重新创建成功，没有复用退役 agent。

## 目标与范围

在既有 browser-use / workflow-use 环境中，完成局部字段读取及原生工具注册模块。对应 [当前计划](../../BROWSER_REPLAY_REPAIR_PLAN.md) R5a；不把本项视为 R5 或原任务完成。

开发 agent 必须是全新上下文、gpt-5.6-sol/high；主 agent 核验实际 turn_context。不得再委派。不单独创建分支/worktree，不提交、安装、运行全量测试或改测试文件。所有命令 workdir 为当前 checkout 根目录，解释器使用 `work/upstream-browser-hybrid/.venv/bin/python`；不运行 uv。

文件所有权：

- `vendor/workflow-use/workflows/workflow_use/hybrid/read.py`
- 新增同目录 `field_read_tool.py`；固定投影脚本确需拆文件时允许 `field_projection.py`
- `apps/api/src/upstream-browser/hybrid-schema.ts` 仅 `readSpecificationSchema.maxInputBytes` 去掉 `.max(128000)`，与 Python 同步；显式 LLM budget 的上限不在本任务范围
- 本目录 `R5_SCOPED_FIELD_TOOL.md` 实施证据

不要修改 author、capture、history、natural_compile、coverage、action_dispatch、natural_reads、其他 TypeScript、测试或源码摘要清单。其他 agent 的修改必须保留。

## A：字段投影

1. read_fields 改为固定只读 Element.evaluate；selector/fields 作为函数参数传入，禁止拼接脚本或接受任意脚本。
2. 由浏览器原生 CSS 选择器取得每个字段节点，返回各字段的局部 outerHTML，继续用 BeautifulSoup 和既有 read_value 处理文本及类型。不得返回整容器/main/body HTML。
3. 单值字段最多返回两个匹配以发现歧义；多值最多 maxValues+1 以发现超限；不能静默截断后成功。保持单值缺失失败、多值空集合的既有语义。
4. 检查既有 BS4 对容器自身的匹配语义，保留合理自身匹配。非法或非原生 CSS 明确失败，不实现选择器解析器或旧整容器 HTML 回退。
5. 保留 maxItems 和调用者显式 maxInputBytes 正整数预算，但删除 maxInputBytes 的 128000 硬上限；仅对选中字段片段累计字节。ReadSpec 序列化字段和旧摘要不变。
6. 保留 scope 的前后核验。不打印原 HTML、页面值或错误正文。

## B：独立工具注册模块

提供 `register_field_read_tool(tools, *, output_schema)`；返回成功读取的内存记录集合或轻量持有者。只通过原生 `Tools.action(param_model=...)` 注册 `bat_read_fields`，由 browser_session 注入当前会话。

参数：specification: ReadSpec，outputPath: list[str|int]，readPath: [] 或 ["value"]。不接受 expected 历史答案。不修改生产 author_tools，不删除 native extract。

复用 natural_reads 现有 validate_proposal、read_fields_with_proof、current_page/page_identity 等 helper，核验 schema/output path、同页和同容器身份、两次读取一致性；不复制这些能力。将已成功记录 outputPaths 用于冲突检查。validate_proposal 只访问 mapping 的上述字段，可复用而无需构造假 expected 值。

成功向 Agent 返回原生 ActionResult，extracted_content 为本次实际读取值 JSON。记录 mapping、output、当前页面 identity 和 container digest；不要提前编造 actionRef/resultDigest，这由后续生产采集绑定。失败返回固定错误码且不追加成功记录。没有模型调用、文件持久化、HTML 缓存或隐藏全局状态。

## 验收

临时脚本写在 /private/tmp 并保留脚本和脱敏输出日志。参考已有 `/private/tmp/r3a_browser_probe.py`。只使用 localhost、临时独立 Profile、一个 Chromium；通过真实 Tools.act 调工具；finally 关闭自己创建的浏览器/服务器，不调用 provider 或外站。

- 页面和选定容器均含超过 128000 字节无关内容，少量 name/attribute/multiple 字段读取成功。
- 相同结构内容改变后，独立工具运行返回新值，不复用历史值。
- 缺单值字段、单值歧义、选中字段字节预算不足、错误输出路径失败且不留下成功记录。
- 页面 identity 改变沿既有 helper 拒绝；如果只能以替身诊断覆盖，必须注明，不能称为真实浏览器证据。
- 超过 128000 的显式预算通过 ReadSpec 解析。

可运行一次最小现有 test_hybrid_read.py；若固定返回旧整容器 HTML 的 mock 与新接口不兼容，记录失败，不改断言或添加生产回退。只做受影响文件的静态检查，不重复无变化验证。

## 交付及主 agent 把关

报告精确文件、实际命令、浏览器验证摘要、临时证据路径。明确本项未接生产注册、未替换旧 whole-page annotation、未解决复合输出。主 agent 检查代码与真实证据后才接受本项，决定后续生产接线；不得由子 agent 自行扩大范围。交付并验收后退役，仅同一职责返工可继续使用。
