# M1 通用契约实施记录

> 这是 M1 完成当时的历史记录；其中 legacy bridge、旧文件保留和“后续 M2–M6”限制已由 [M2–M7 实施记录](TASK_CHAIN_M2_M7_IMPLEMENTATION.md) 取代，不代表当前 checkout 状态。

日期：2026-09-12。范围：只实施 M1；依据 TASK_CHAIN_ARCHITECTURE、ADR 0001 与 TASK_CHAIN_CODE_DISPOSITION。

```text
Product Alignment:
- natural-language task: 采集结构化信息；完成页面操作并核验可观察结果
- reusable chain boundary: 一个步骤对应一条固定版本的参数化链路，集合复用同一链路
- runtime inputs: 版本化动态 schema 校验的结构化值
- dynamic task outputs: 任务定义的结构化值或产物引用
- generic platform capability used: 11 类节点、值绑定、组合、预算、检查点和调用审计
- replay model calls: 仅显式 llm 节点；审计未知数不折算为零
- site/task-specific code added: no

Baseline Impact:
- touched layers: contracts、package exports、旧消费者 import 路径、contracts 协议测试
- owning fact source: requirement/plan/chain/run 分别拥有版本；浏览器现场仍由浏览器会话拥有
- public interface changed: yes，正式出口切换到唯一通用合同
- new protocol/adapter/fallback: 通用版本协议与动态值合同；无新解释器、浏览器或模型适配器
- compatibility or legacy path changed: 旧类型隔离为 legacy 出口；版本读取器保留原始 JSON 并标记 legacy_read_only
- baseline update required: no，落实已确认的架构边界
- architecture tests to run: contracts typecheck；两类任务的协议、坏输入、版本读取与出口测试

Patch Disposition:
- delete: 无；尚未满足正式运行器替代和历史迁移删除门
- keep: 当前 dirty 修改、历史 JSON、SQLite、旧生产路径与原型不变量
- rewrite: 正式公共出口与通用 requirement/plan/chain/binding/run/version 合同
- reason: M1 提供唯一新类型入口；M2–M6 逐步替代现有生产调用，不新增并行解释器
```

## 修改前审计

- 完整读取根 AGENTS、CONTEXT、架构、ADR 0001、处置清单、DEVELOPMENT_BASELINE、ROADMAP、PROGRESS；历史任务计划执行文档不作为本阶段设计依据。
- 现有 `requirementBrief.ts` 的访问要求、`plan.ts` 的 recorded_at 与恢复字段、`chain.ts` 的语义提取/人工请求/节点分类、`capture.ts` 的 origin 过滤均是进入任务前已有补丁，保留其字节内容。
- `packages/contracts/package.json` 已有 AI Connect vendor 更新，只修改 exports，不改依赖或锁文件。
- 旧 API/Workbench/runtime 消费者仅机械改 import 到 `/legacy/*`，逐文件核对修改前内容和修改后逆替换一致；不将这些文件原有功能记为本轮成果。
- workflow/run 原型的请求不允许注入游标/审计，绑定 runId、版本、输入摘要；ordinary-run 保持幂等键、同运行恢复、实例互斥。新合同承接这些数据边界，行为迁入 M2。
- capture 生产路径的版本/digest、显式预算、稳定键、检查点、模型审计和人工等待保留；不得因 M1 尚无解释器就删除现有实现。

## 分阶段兼容边界

正式 root、requirement、plan、chain、binding、run、version 出口只指向 `src/task-chain/`。旧 capture/workflow 出口退出正式命名空间；原文件由显式 `/legacy/*` 出口承载现有消费者，interview 保留旧 brief 桥接，等待 M4 迁移。legacy 出口不是新执行契约。

版本读取器不推测历史任务 schema，不补默认版本，不写库、不重新序列化原始 JSON。无 contractVersion 的 JSON 返回 `legacy_read_only`；未知版本返回 `unsupported_version`；声称当前版本但结构错误返回 `invalid`。只有明确当前协议且通过结构校验的记录才能取得通用类型，仍需后续 compiler、授权和运行校验。

M1 的读取状态是供 M4 repository 接入的合同边界；不宣称现有 API/Workbench 已切换到此读取器，也不宣称旧运行入口已完成禁止执行门禁。后续必须在正式持久化与队列边界接入，旧 digest 不得进入新运行器。

## 合同语义与后续实现边界

- `bat-task-chain/v1` 是平台合同版本；需求、计划、链路各自的 version 和动态数据合同的 id/version 独立保存，不互相替代。
- `bat-value-schema/v1` 是封闭、可序列化的结构化值方言：null/boolean/string/number/integer/array/object，含必需属性、额外属性策略和长度/数值范围。不能传入远程 schema 引用或执行代码。`parseTaskValue` 使用 Zod 验证任务数据；`parseTaskOutput` 核对合同 id/version，产物引用内容需等 artifact reader 读取后验证。
- binding 的 input/node/variable/constant 是唯一参数来源；分段 path 的空数组指整个值。节点结果存入 nodeOutputs[nodeId]，writes 从当前节点结果按 path 写入已声明变量。图级对象引用先检查存在；可达性、上游支配、路径与 schema 类型匹配由 M2 compiler 负责。
- Plan 中 node binding 引用已完成的依赖步骤；each 的 itemVariable 仅在该步骤逐项调用内可用。step budget 是该步骤所有调用的总预算，不因 maxItems 自动扩大；invoke 的 child version/digest 固定。运行中父子预算累计与稳定键持久化由 M2/M4 执行。
- browser/observe 的 operation 和 arguments 是受控能力描述，不是任意脚本。observe.stableWhen、human/checkpoint.resumeWhen 的 path 检查 fresh observation；expected 才使用普通绑定。M3 将核验当前 capability provider 实际支持的操作与参数，schema 能表达不等于现有 BrowserSkill 已实现。
- 每类节点声明固定 outcome 集合，每个出口恰有一条连线；terminal 没有出边。显式失败、缺失、超时、人工等待、取消与循环上限不能以缺省成功吞掉。M2 必须实现确定性数据操作、循环边界及终态语义；本轮没有新增解释器。
- run request 不接受游标、结果或审计；resume request 只接受同运行 binding 和检查点引用。检查点保存变量、节点输出、循环/子调用、原消费量和未决副作用幂等键。只有 runtime/host 可以核验输入摘要、浏览器现场和授权，也不承诺 exactly-once。
- 运行 modelCalls 只承载 explicit_llm；需求、探索、编译和修复调用属于 host 的其他用途。未知回报或不完整审计令统计保持 null；调用意图与实际回报分开。M2 必须验证记录实际来自被执行的显式 llm 节点，不能只依据 schema 或零长度数组宣称零模型复跑。
- chain.validation 的 verified 要求 sample/verification 通过、不同 runId/输入摘要、同 chainDigest 与已知模型调用数；实际摘要一致性、浏览器真实性和复用边界由 M2/M4 的验证流程保证，M1 fixture 不提供真实验证证据。

## 本阶段验证与补丁保全

| 检查 | 结果 |
| --- | --- |
| contracts typecheck | 首次暴露 optional/undefined 类型不匹配；修正后通过 |
| 两份新增 contracts 协议测试 | 13/13 通过；两类任务、坏输入、版本、出口、绑定、审计及保真读取 |
| 旧消费者逐文件审阅 | 29 个文件逆替换 imports 后与开工前完全一致；原逻辑 diff 保留 |
| 其余快照内已有文件 | 141 个保持一致；package.json 仅 exports 不同（更新阶段文档之前的检查结果） |
| SQLite/真实任务/浏览器/模型 | 未打开运行服务、未写库、未新增模型或浏览器调用 |
| 全量或根级测试 | 未运行；不更改无关模块通过/失败结论 |

本地开工内容快照在忽略目录 `work/m1-contracts/before.json`，仅包含开发源码和相关文档，不包含用户数据库或页面数据。后续阶段不得把当前旧运行器继续可用误解为通用运行器已完成。
