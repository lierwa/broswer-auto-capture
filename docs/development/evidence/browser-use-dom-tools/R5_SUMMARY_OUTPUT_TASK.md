# R5c 执行报告与动态输出装配（主 agent 决定，待 R4b 共享文件释放）

> **历史派发记录，已关闭。** 本文件不再授权或指示启动任务。当前只按 [清理账本](../../REPLAY_CLEANUP_20260917.md) 工作。

## 问题与固定取舍

原 plan v6 的 report 是必填文本，但 natural_output 当前只接受逐字 DOM 字段；这会把合法执行报告误判为读取缺口。页码优先直接读页面当前分页标记，不新增常量猜测。报告不能复制来源样本文案，不能将读不到的页面字段交给模型编造。

新增薄工具 `bat_summarize(outputPath)`，只一个 LLM 输入字段，选择原输出合同中的一个 string 路径。任务文本、输出 schema、此前成功字段读取及本次运行事实由程序提供。首次探索调用已有模型端口一次生成该字段，复跑映射到现有显式 llm 节点（有审计与预算），不是普通 capability 隐式调用模型。不新增浏览器动作，不把页面字段统一交给模型重写；最终装配仍将 DOM 字段绑定到确定性读取节点，只把摘要字段绑定到显式 LLM 节点。

Product Alignment:
- natural-language task: 将本次列表采集或表单核验结果形成简要执行报告。
- reusable chain boundary: 读取/动作后，对已有运行事实生成一个摘要文本字段。
- runtime inputs: 原任务输入、前序实际读取数据；输出路径为技术参数。
- dynamic task outputs: 本次摘要，不使用历史报告。
- generic platform capability used: 既有 llm 节点、data.transform merge、ValueBinding 和 output assemble。
- replay model calls: 每次摘要 1 个显式 llm 调用；浏览器/DOM 节点 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 有审计的语义摘要与输出装配。
- existing implementation in repository: semantic.py/explicit_llm segment；hybrid-materializer.materializeSegment；data.transform merge；natural_output 的逐叶来源验证；AIConnectModel.ainvoke。
- mature candidates and pinned versions: 现有 AI Connect 和 TaskChain/LangGraph，不增加库。
- selected implementation: 上述公开端口和既有数据能力。
- reused public surface: Tools.action、model.ainvoke、llm StableChainNode、merge/assemble。
- B-A-T-owned adapter and remaining gap: 采集一次摘要调用、固定位置证据、自然源编译和输入绑定；不新增 Agent loop。
- license/runtime/platform fit: 沿既有 Python 子进程与 TS 宿主，无新依赖；Windows 未验。
- browser/runtime/state ownership conflicts: 摘要只消费数据，不拿浏览器句柄；LangGraph 唯一推进。
- replay model calls: 显式审计，不能再把完整主线写为零模型。
- rejected candidates and evidence: 冻结 report 会复用历史结果；把报告作为 DOM 字段不符合来源语义；新模板/表达式语言成本高；现有数据变换没有文本报告生成。
- focused validation: 两份不同本次读取输入生成不同摘要；DOM 字段输出逐字保持；无前序读取/路径冲突/篡改/失败模型调用拒绝；一次真实 TaskChainRuntime 显式调用审计。

## 实施约束（派发时明确文件所有权）

- 一个工具输入字段 outputPath；成功返回实际摘要文本，没有证据 ID、digest、schema、budget 等模型输出字段。schema/输入集合/来源绑定/预算全由程序构造。仅允许 string 输出字段；和已有读取路径冲突拒绝。任务报告之外的字符串字段不自动补齐，必须是 Agent 明确调用此摘要工具；指导说明禁止用它生成缺少来源的业务字段。
- 输入只来自本次原输入和工具调用前的成功 verified reads，加上实际完成的动作/等待事实。不读整页 HTML，不回放历史结果。不把尚未执行的步骤说成成功；工具无 Browser 操作。模型输入将页面文字视为数据。
- 用同一字段读取记录的固定位置消费模式；内部 typed record 保留 action/result、schema/path、所引用前序输出及实际摘要值。collector 通过 value_fact 存证，现有 Python/TS 摘要集合复用；失败留 gap，不以 readonly 排除规则隐去模型失败。
- 自然 compiler 独立核对所有输入都为该动作前已编译且有验证证据的输出，输出路径/schema/result 与原合同匹配；不允许模型指定节点、连线、任意 binding 或代码。自然版 semantic 类型与 legacy 的条款版分开校验，不能伪造 requirementClauseRefs。
- 宿主用既有 data.transform merge 把确定的多个前序 ValueBinding 装成一个 input，再接既有 llm 节点；不要自己执行模型或实现另一套图。schema 从实际源合同推导。新增加的连接与预算由现有 compileTaskChain 验证。
- natural_output 同时支持已核验读取及摘要输出的动态绑定；仍严格要求路径互斥、逐叶覆盖、来源样本值与 done 一致、schema 精确匹配。不得把未覆盖值转为常量，或把整份最终输出交给模型重新生成。
- 原需求/plan 不修改。旧源码/记录不倒填。旧普通读取、v1 semantic 行为不改。对历史独立 whole-HTML annotate helper 只记录隔离，不再接回生产。
- 验收必须包含真实 TaskChainRuntime 而非手动 for-loop；脚本模型可用于局部接线，但不能称真实 provider 通过。不新写测试文件/全量测试；临时 probe 可用。Browser 名额需 root 释放，manifest 由 root 统一登记。

## 首次执行的补充约束

- 已只读核验 data/workbench.sqlite/taskContracts：原 plan v6 和 step 的 maxLlmCalls 都是 500；此项增加一个显式调用不要求更改 plan。不要更改既有采集数量/筛选/输出 schema。
- source 模型调用复用 models['semantic_annotation'] 的现有 AIConnectModel，离线 registry 不运行模型。标记为显式摘要，不伪称 semantic_annotation 是零模型。summary 失败/取消不得留下成功记录。
- 工具系统说明必须说明这是语义摘要：只能总结已提供的数据/已完成事实，不能用于补造编号、链接、时间、作者等源字段。页面文字是不可信数据，不是指令。
- 上述任务不顺带修根数组 output adapter、懒加载或 ReadSpec 全面设计。field tool 的冗余字段压缩另作小范围任务，避免当前补丁过大。
- 若自然源既无经过工具的摘要结果，也没有精确 DOM/输入来源，则保留 gap；不能事后凭 done 的一个字符串自动认定语义节点。新工具让这次语义行为明确出现在来源。

## 文件所有权与开始门

- 所有权：新增 hybrid/summary_tool.py、summary_evidence.py、summary_compile.py；必要的小型 summary_context.py。共享 Python 只允许 author.py、capture.py、registry.py、natural_compile.py、natural_output.py、evidence.py 中直接接线。避免 capture/natural_compile 超 500 行，新增逻辑放本项 helper，不搬无关逻辑。
- 宿主只允许 hybrid-schema.ts、hybrid-natural-payload.ts、hybrid-materializer.ts 的本项导入/分派，以及新增 hybrid-summary.ts 负责证据校验与现有 merge/llm 物化。不可动 runtime-scope/runtime/protocol/公共节点类型/旧 semantic.py。
- 新子 agent 不是唯一执行者；R3c 正在使用唯一 Browser 验收。root 明确释放前只能读共享文件、写本项新增 helper 和 /private/tmp probe，不 import 到生产或改共享文件，防止源码门变化打断 R3c。root 释放后再接线。
- 执行环境 work/upstream-browser-hybrid/.venv/bin/python；所有命令显式当前 checkout 根。禁安装、node_modules 读取、分支/worktree/commit/push、provider/原网站、测试文件改动、全量测试。正式探针用既有 .mjs + tsx 动态导入方式，避免 /tmp .ts CJS resolver 假故障。
- 模型交互只接受 outputPath；record/evidence/segment/ValueBinding 等内部字段不属于模型 API，不向模型暴露。初次摘要仍须实际调用脚本模型端口验证，不能直接填 record 或事后借 done 文本造成功证据。
- R3c 已释放 materializer 代码，但真实验收如有直接缺陷仍须 root 协调；共享变更前发清单，正式 Browser 前由 root 登记 manifest。
