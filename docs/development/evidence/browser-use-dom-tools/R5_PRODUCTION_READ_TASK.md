# R5b 生产局部读取接线任务（待派发）

> **历史派发记录，已关闭。** 本文件不再授权或指示启动任务。当前只按 [清理账本](../../REPLAY_CLEANUP_20260917.md) 工作。

主 agent 决策，2026-09-16。依赖：R5a 局部工具必须先经主 agent 验收，不能在未经验证的模块上继续叠加。

## 本项交付

自然 Agent 可以通过原生 Tools 使用 bat_read_fields；对应参数/当前输出从真实工具记录进入同一动作的 verified_natural_read，正式自然编译得到既有 browser.read-fields 区段；在线和离线 registry 一致。原任务的复合报告和其余完成条件不在本项自动扩展范围，必须保留未完成。

## 明确实现选择

1. 复用 R5a 工具，不再生成整页面 HTML 提示词。author_step 构建工具时使用已确认 request.outputSchema 注册；工具记录持有者显式传给 EvidenceCollector，禁止全局共享记录。
2. 保留原生 Agent loop、find_elements 和 native extract。将 author 的自然读取指导改为：结构化页面字段优先 bat_read_fields，离页前读取，可借 find_elements 发现局部 CSS。不要继续强制 native extract 为确定性字段留记录。原 native extract 仍可记录原生提取事实，但该路径不再调用 propose_verified_read/whole-page annotation；缺可复跑读取证据时保留明确 gap。
3. author_tools 的注册能力与 offline hybrid_main 编译入口使用同一已确认 outputSchema。旧 registry 来源不能偷偷升级摘要；旧来源没有新字段事实不能倒填。保持明确版本不匹配，不用无条件接受旧 digest 或伪造 registry。
4. bat_read_fields 的 effect 明确为 read。自然编译使用现有 compile_verified_read 路径，目标/读取输出/后续装配沿既有合同，不加新的 runtime action/节点/执行器。
5. callback 在动作前保存成功记录起始位置。动作结束必须唯一新增一份成功记录，且该记录 mapping 与当前固定位置动作参数一致，结果没有 error；这时才构建 VerifiedNaturalRead，使用规范 actionRef、真实 action resultRef.digest、工具当次输出与 page/container identity。不能按相同参数搜索历史记录，不能给失败动作借用前次记录。
6. 技术参数经 FieldReadToolParams 验证后保全：mapping 不含 expected 值；outputSchema 必须与已确认输出子 schema 一致。只对这个明确工具的 specification/outputPath/readPath 保留合法技术数据，不放宽其他动作普通字符串的现有脱敏。不得保存 raw HTML、错误正文或多余读取值。
7. source resultRef 与 verified read 的 resultDigest 保持原同源验证；成功动作却无记录、重复记录、错动作 mapping 明确 gap。不为了编译通过修改来源输出或原任务 outputSchema。合法默认值省略允许双方先经同一个严格 FieldReadToolParams 规范化再比较，不能据相同参数搜索历史。
8. 清理生产对旧 whole-main/body 注解调用的依赖；离线 helper 的处置先核实调用再记录。不得只新增工具却继续在生产主路径触发同一个 128KB 拒绝。
9. 主 agent 核对原 plan v6 发现其普通字符串字段没有 maxLength，原 natural_reads 却误用显式语义模型的 bounded_schema，仍会拒绝合法的确定性读取。不得给已确认合同补 maxLength。对自然确定性读取单独验证其可表达的 flat object / array-of-object（字段可为标量或标量数组）结构及合法 JSON Schema，复用 ReadSpec 的字段数、maxItems、maxValues 和实际字段字节预算；不要要求输出字符串自带模型上下文长度限制。保持 proposal 的输出路径、schema 相等及实际结果校验。semantic.py/显式 LLM 预算规则不改。新增临时反例必须使用原合同形态的不带 maxLength 字符串及不带 maxItems 的字段内数组，证明真实局部读取可接线，而不是继续只测人为加限的样例。
10. `bat_read_fields` 的代码只执行固定只读 DOM 查询，失败探查可以不进入复跑；不能因为首次 CSS 试探失败就让之后完整读取永远无法编译。仅对 registry 验证成功、effect=read、status=failed、有 resultRef 的这个明确工具增加 `failed_bat_field_read_probe/v1` 审计排除，并在 coverage 独立复核同一条件。保留失败动作及结果，不能给它借用前次成功记录，不生成虚假的 verified read。采集阶段对明确 error 结果不要求新增成功记录；结果成功但缺记录仍 gap。不要扩展到任何点击、输入、其他未知 read 工具或副作用不明失败；R6 的既有严格边界保持。最终 output assembly 仍需由真正成功读取完整覆盖，不能因排除失败而省略字段。
11. 主 agent 已用生产 read_value 复现嵌套文本 `<span>Updated <relative-time>2 days ago</relative-time></span>` 被错误拼成 `Updated2 days ago`。此错误直接违背原任务可见文本要求，必须在接线验收前补救：固定字段投影的文本值复用浏览器原生 innerText，保留内部空格/换行并排除隐藏后代；属性值只取 getAttribute，不读取 HTML。基数、作用域、特殊字段名和显式字段字节预算保留。将既有数值/布尔转换收敛为纯值转换，不自写可见文本解析器或整 HTML 回退。无可见 innerText 的元素明确失败，不默默采用 textContent。公共 ReadSpec 字段/摘要不变。该修正只在本职责真实 probe 中附加聚焦文本场景，不重复整套历史测试。

## 文件所有权

`hybrid/author.py`、`capture.py`、`natural_compile.py`、`registry.py`；`natural_reads.py` 仅上述确定性读取 schema 准入与旧注解调用处置；`coverage.py` 仅明确失败只读工具排除的独立复核；`read.py` 仅第11条主 agent 已复现的读取语义补救；必要的新纯读取证据 helper；`apps/api/python/browser_use_runner/hybrid_main.py` 的相同注册接线。field_read_tool.py 如需变化必须先向主 agent 说明直接问题。不能修改 TS/公共输出合同、测试、其他开发文件或源码 manifest。

保持文件 500 行、函数 100 行限制；capture 超限时仅把新读取证据逻辑拆到小模块，不做通用框架重构。

## 最小验收

真实 localhost Browser，通过生产 Tools 注册、原生 Tools.act、EvidenceCollector/history/normalize/natural_compile 形成完整来源与局部读取区段；回调与真实原生 history 的接线可使用已有可控 Agent 模型入口，但不得把脚本模型说成真实 provider。用普通 runtime 读取同结构变化值，核对没有模型调用或历史值拷贝。

额外只读检查：在线/离线 registry 摘要一致；原始旧来源摘要未变化。错误路径用临时诊断证明没有借用前次成功记录。不得启动原网站或完整 provider 探索，不新增/修改测试、不跑全量测试；不重复无变化验证。

所有命令 checkout 根 workdir，指定现有 `work/upstream-browser-hybrid/.venv/bin/python`，设置关闭遥测环境变量。临时脚本和脱敏日志保留在 /private/tmp，浏览器唯一且 finally 关闭，不安装/创建分支/worktree/提交/再委派。

文档交付本目录 `R5_PRODUCTION_READ.md`：实际命令、事实链、清理结论、错误/补救、仍未完成的输出装配和原任务门。主 agent 负责验收并记录完成状态；子 agent 不决定扩展方向。
