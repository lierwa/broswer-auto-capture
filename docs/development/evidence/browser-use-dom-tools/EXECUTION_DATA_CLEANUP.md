# 执行数据破坏性处理清理

日期：2026-09-17
范围：`author.py` 的动作／证据值处理、`dom_evidence.py` 的局部 DOM 证据和 URL 身份、`targets.py` 的 URL 摘要核验。

## 结论

本轮删除了会破坏复跑数据的来源白名单哈希和 32／128 计数截断。动作参数、非输入证据字符串、选定结构属性、URL query／fragment 现在保留执行原值。唯一运行输入路径仍可保存为 `inputRef`；同值对应多个输入路径时保留原值，不任意绑定其中一个路径。

本轮没有新增浏览器能力、模型调用、敏感内容扫描器、raw AgentHistory、截图或 ActionResult 正文存储。`redactionManifest` 继续作为既有事实引用，policy 更新为 `execution-values-preserved/v1`，并保留 `rawHistorySaved: false`。原先仅写入 `kind`／`digest`、从未返回或读取的进程内 evidence map 已删除；`put` 仍只返回内容摘要对应的 `EvidenceRef`。因此，这次清理不证明 `resultRef` 背后存在完整原始 ActionResult。

## 实际处置

### 动作和证据值

- 主 agent 复核后使用独立深拷贝保留动作，防止后续消费者改写原记录；该反例另行通过。
- `redactor` 保留 normalized trace 中的动作名称与完整参数，不再依据参数是否出现在需求原文、运行输入、业务输出或原生参数白名单中决定是否替换为摘要。
- `evidence_sanitizer` 只在字符串值唯一对应一个运行输入路径时生成 `inputRef`。重复值对应多个路径时保留字符串原值，避免旧 `setdefault` 语义错误绑定第一个路径。
- 选定 DOM 结构属性仍只来自既有 `STRUCTURAL_ATTRIBUTES` 集合，不读取文本节点正文；这些已选属性不再被无差别摘要化。
- 输入参数化的完整性仍由既有 binding facts／compiler 负责。本轮没有把“原值保全”记作“参数化已经验收”。

### DOM 局部结构

- 删除 `MAX_ANCESTORS = 32` 和 `MAX_NODES = 128`，不再因任意总计数丢弃真实祖先或同层节点。
- 捕获范围仍是选中目标的真实祖先链，以及祖先链中各节点（包含目标）的既有直接孩子。不会递归收集旁支节点的后代，也不会扩成整页 DOM。
- 祖先 `seen` 检查继续阻止环导致无限遍历；检测到环时记录 `ancestor_cycle_detected`，并保持 `ancestorsTruncated: true`。
- frame、target 和 shadow root 边界继续由 `dom_boundary`／`structural_children` 阻止跨越，并保留对应 limitation。

### URL 身份

- HTTP(S) URL 保留 scheme、host、port、path、query 和 fragment。只有明文 userinfo（username／password）从存储 URL 中移除；没有新增内容扫描规则。
- `urlDigest` 继续由完整原始 URL 计算，只承担一致性校验。它使 query／fragment 以及被剥离的 userinfo 仍参与身份判断，而不在证据中保存明文 credentials。
- `TargetResolver` 在 scope 带 `urlDigest` 时，以 `digest(liveUrl) === urlDigest` 核验完整 URL 身份；不再附加旧 path-only `scope.url` 比较。这样旧的 path-only scope 在完整摘要正确时仍可通过，新完整 scope 同样通过，摘要不匹配不能通过。
- scope 没有 `urlDigest` 时仍要求 `liveUrl === scope.url`，不添加第二套旧 URL 规范化规则。

## 日志和诊断边界

本轮保留原值发生在 normalized trace／选定事实容器，不扩张日志。Python lifecycle diagnostic 仍只产生 `phase`、`status`、`actionName` 和 `stepNumber`；TypeScript 侧用严格 schema 接收，无法解析的原始行直接丢弃。它们不输出动作参数、原始页面、账号内容、URL credentials、异常正文或截图。

## 定点验证

只执行了一次无 Browser、无模型、无网络的 `/tmp` 纯函数反例脚本：

```text
PYTHONPATH=vendor/workflow-use/workflows work/upstream-browser-hybrid/.venv/bin/python /private/tmp/bat_execution_data_cleanup_validation.py
PASS execution-data cleanup pure-function counterexamples
```

覆盖的反例：

- 不在需求／输入／输出／白名单中的普通动作字符串保持原值。
- 唯一输入值生成 `inputRef`；两个路径中的重复值保留原值；普通证据值和选定属性保持原值。
- 40 层祖先完整保留；包含 140 个同层孩子的局部图超过旧 128 节点限制仍完整保留；旁支孙节点没有被递归加入。
- ancestor cycle 正确停止；frame 和 shadow 边界没有被跨越。
- credentials 被移除而 query／fragment 保留。
- 旧 path-only scope＋正确完整摘要通过；新完整 scope＋正确摘要通过；错误摘要拒绝；无摘要且 URL 错误拒绝。

按清理授权未运行浏览器、模型、网络、安装、全量测试或仓库测试，也未修改测试。测试所有者另行删除了只要求 query／fragment 或已选普通 `id` 被抹除的陈旧断言，保留 DOM 关系、范围和摘要完整性测试。`aria-label` 不在既有 `STRUCTURAL_ATTRIBUTES` 中，因此 history fixture 的 `Private title` 仍会在属性集合交集阶段被排除；对应断言继续有效，本轮没有扩大属性白名单。

## 未证明和风险

- 移除计数上限后，极深祖先链或单层大量 siblings 会增大单次证据体积；cycle guard 和局部非递归范围仍限制遍历形状。本轮没有用另一个任意阈值替代已删除阈值。
- `id`、`class`、`name`、`data-*` 和既有选定 ARIA 关系属性可能包含业务值。它们现在作为复跑证据保真保存；仍不得把这些值复制进日志、Git 快照或诊断输出。
- 相同运行输入值出现在多个路径时不会错误绑定，但也不会自动推断应该绑定哪一个路径。参数化能力仍需由正式 compiler 验收。
- 旧摘要无法恢复被替换掉的原始动作或证据字符串；需要从仍存在的原始来源重新编译，不能把本次代码清理描述为旧产物修复。

## 执行上下文

- checkout：当前仓库根目录
- branch／HEAD：`master` / `7242264bd3757a7ebe82514f9a17cb63e7bf614c`
- agent rollout：Codex session `rollout-2026-09-17T11-48-33-01a0ad7a-fdbe-7742-860b-9fc016294af5.jsonl`
- 实际 `turn_context` ordinal 7：`gpt-5.6-sol` / `high`
