# 原生查询局部结构适配

> **已停止／历史记录（2026-09-17 清理决定）。本文件不再授权或指示启动任务。** 当前只按 [清理账本](../../REPLAY_CLEANUP_20260917.md) 清理。 原生查询结果追加结构实验及其调用已删除；下文仅保存该实验的历史记录，不代表当前代码。

## Product Alignment

- natural-language task: 列表字段读取或表单控件定位时，需要真实 DOM 层级来修正字段选择器。
- reusable chain boundary: 只在首次探索的原生 `find_elements` 正常返回后补充首个匹配元素的局部结构；不生成复跑业务节点。
- runtime inputs: 复用原 `find_elements.selector` 和当前 Browser；不增加工具或 LLM 字段。
- dynamic task outputs: 不增加正式业务输出；正式页面数据仍由 `bat_read_fields` 读取。
- generic platform capability used: 原生 `Tools.act` 结果适配与 Actor `Page.evaluate` 固定只读 DOM 查询。
- replay model calls: 0；`find_elements` 仍是 `agent_internal`。
- site/task-specific code added: no。

## 已证实缺口与复用边界

- browser-use 0.13.x 原生 `find_elements` 返回匹配元素的 tag、可选正文、请求属性和 `children_count`，但不返回真实祖先链或直接子元素位置；局部模型因此把渲染树误当作 DOM 父子层级。
- 已安装公开 Actor API 的实际签名为 `Page.evaluate(self, page_function: str, *args) -> str`；实现要求箭头函数，参数由 API 做 JSON 编码后传入。适配因此使用固定只读脚本，并把 selector 作为参数传递，不拼入脚本文本。
- 固定脚本只调用 `querySelectorAll`、`parentElement`、`children` 和 `getAttribute`。节点只保留 tag、既有 `STRUCTURAL_ATTRIBUTES` 加 `aria-label` 的实际属性、1-based sibling 位置和 `childrenCount`。
- 只返回首个匹配元素、完整祖先链和该元素的直接子元素；不读取正文、`input.value`、任意属性或 HTML，不递归导出子树，也不设置任意字节截断。
- 原生失败结果原样返回。辅助失败只追加固定“结构不可用”提示，不改变 `error`、`success`、`is_done`、`long_term_memory` 或其他原生字段；取消继续传播。
- 读取前后必须保持相同 focus target、公开 targetId 和 URL；任一变化都不返回可能来自错误页面的结构。

## 验收边界

- 一次 0 模型真实本地页面验证祖先链和直接 children，同时核对原生结果字段及 registry `schemaDigest` 不变。
- 非 `find_elements` 动作不变；辅助失败和取消使用 `/private/tmp` 定点反例。
- 不修改原 artifact、manifest、测试文件或公共契约。

## 实施与验收结果

- 新增 `hybrid/find_elements_context.py`，在同一个 `Tools.act` 包装内等待原生结果；只有 `find_elements` 且原生没有 `error` 时才执行辅助读取。`author_step` 只把既有 Browser 传入包装，并增加一句使用指导；原 `finally` 恢复逻辑保持。
- 通过已安装 browser-use 注册表实际 inspect：原生实现的格式化输入只有 `tag`、可选 `text`、请求 `attrs` 和 `children_count`，没有祖先链、直接子元素或 sibling 位置。
- `/private/tmp/native_lookup_structure_probe.py` 通过：原生字段逐项保持，非 find 动作不调用辅助读取，原生 find 失败原样返回，辅助异常/页面漂移只追加固定提示，`CancelledError` 传播；包装前后 registry `schemaDigest` 相同。
- `/private/tmp/native_lookup_structure_browser_probe.py` 通过一次真实 localhost Chromium、0 模型验收：实际祖先尾链为 `ul>div>div>li`，直接 children 为 `span`、`input`、`time`；节点没有正文、`value` 或未列入白名单的 `data-private`。原生字段和 `long_term_memory` 保持，`schemaDigest` 保持为 `1a727fba547b912fd7d31707a5539363d626320e4767d7428f6c81b28a7a97b2`。
- Browser 使用独立临时 Profile，并在 `finally` 中 `kill`；按 Profile 路径核对的所属进程从关闭前 7 个降为 0。
- 修改文件 `py_compile` 与 Ruff `--no-fix` 均通过；`author_step` 仍为 98 行。修改前既有 `test_hybrid_author.py` 基线为 3 项中 1 项通过、2 项因 fixture 未提供 `models['semantic_annotation']` 报错，本次不修改测试或该既存接口。
