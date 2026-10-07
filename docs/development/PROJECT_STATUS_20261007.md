# 项目现状核验：主流程、模块与底层基建

核验日期：2026-10-07；产品源码基线 `4a03d51e0ff372dba68157e93ae7bddad9067dd1`，分支 master。此文件是该基线的统一状态入口；旧记录保留首次失败和当时结论，不能按其中“当前/最新”字样直接判断今天的状态。

本轮只修改工程约束和文档，读取现有源码、API、SQLite、冻结与验收记录；没有运行新的产品任务、调用产品模型、启动浏览器或重载服务。历史验收不是当前基线全部重验。不用代码数量或历史成功/失败条数计算完成百分比。

## 总体判断

系统已具有自然语言需求→确认→B-U 代表探索→编译→验证→发布→普通执行器复跑的真实闭环，并非只有原型。普通复跑零隐式模型调用已有多次实证。

但当前不能交付“任意新任务都可靠”：动态业务要求是否完整进入发布链路、复杂页面上的方法泛化、真实中断恢复以及跨平台验收仍有缺口。最重要的新发现是下面的 Bilibili 动态规则覆盖问题；账号检查和原 B-U 启动阻塞不能继续按旧文档描述为当前未修复。

## 主流程逐段结算

| 阶段 | 已经做到的程度 | 证据边界与剩余问题 |
| --- | --- | --- |
| 新建需求、搜索、来源选择 | 已接 Pi 搜索工具、宿主引用绑定、Question 交互及确认版本；真实新任务已通过 | 任意需求的歧义与来源判断没有泛化保证；宿主不能替模型做来源语义判断 |
| 准备计划成稿 | 固定 Markdown 正文通过已有注册 authoring 协议承载；格式失败最多一次同模型 repair；真实漏闭合标签首败经 repair 成功 | 封套及固定章节依赖仍在，不是完全取消格式协议；来源真实性/网络/身份错误不靠 repair 掩盖 |
| 账号准备与浏览器选择 | 面板冻结目标 kind；daily/dedicated 检查和登录入口、冷启动、同 UID 登录复用已实际通过 | 人工扫码/验证码、所有平台正向和线上 SSO 未全验；检查结果只证明当时状态 |
| B-U 代表探索 | 既有原生 Agent 能启动、探索、保留动作/读取/来源；原任务 6 动作、7 模型调用后形成来源 | 新任务仍可能因页面/语义/编译缺口失败；未知业务歧义必须回需求对话 |
| 记录、在线节点生成、完整编译 | 固定来源→workflow-use 受管编译→TS 物化→TaskChain；已有 repeat 和空集合控制接线 | 动作覆盖不等于确认的动态业务规则覆盖。Bilibili 发布链缺少“最新”的显式选择或等价可验证规则，见下文 |
| sample、verification、发布 | 已有版本/digest/输入/验证记录，UI 可发布不可变版本；Bilibili 两次复验通过 | GitHub 历史 sample 只跑来源、verification 才跑全部五项；不能称两轮都覆盖全流程。相同现场重复成功不证明变化场景正确 |
| 正式运行、再次运行 | Bilibili 原 V1 日常 Chrome 正式 completed、6 流转/8 命令/0 LLM；GitHub 历史正式及再次运行五项通过 | “当前运行完成”和“动态要求在以后变化时成立”必须分开。最新修复后没有重新跑所有历史任务 |
| 成果、画布、历史 | 已有主步骤/子节点、each 调用、原图成果、同 execution 事件与历史 | 所有复杂分支、窄屏和超大成果组合未全验；历史产物的边栏文字不会被新范围修复原地改写 |
| 暂停、恢复、清理 | owner/lease、checkpoint、pendingEffect、独立 cleanup 审计已落地；真实受控同 run 恢复通过 | 人为关个人浏览器、真实登录后续跑、长期空闲断线、服务重启组合未完整闭合；临时开发 Profile 仍仅回收站暂存 |

## 本轮新确认的关键缺口：动态要求与可执行链不完全对应

只读 SQLite 中原任务 `5eecaaee-f0e5-4ebf-a0a0-cc9605426660` 的发布 V1 `438a9a7f-605c-452f-842c-675b5d0cff85`，其 plan goal 明确写着“依据运行时页面显示确定最新一集后播放；若最新一集无法播放，报告实际情况，不改播其他内容”。

实际发布链只有 5 个 capability 与 1 个 terminal，顺序为：

```text
navigate → input → click 搜索 → click 作品 → wait(media_playback=playing) → completed
```

确认事实：没有剧集集合读取、排序/可播放性选择函数、显式 LLM 选择节点或对应不可播放分支；plan 的输入/输出 schema 为 null。它有实际“正在播放”的后置条件，但没有证明“正在播放的是运行时最新一集”的数据流。

此前独立页面检查证明第 194 集当时播放、195 为预告，时钟在 5 秒内前进。这份业务现场证据有效；它不能证明之后更新、观看历史改变、默认集改变或最新集不可播放时仍符合确认要求。页面默认行为也可能当次恰好满足要求，因此这里不把未来失败虚构成已复现事实。

结论：**运行器完成记录保持成立；该版本的动态要求覆盖/变化场景验收仍欠缺。** 不能继续把这项任务无条件称为动态方法完整交付。整改边界在准备/编译/发布前的确认要求与方法证据衔接；不追加全局完成 judge，不增加网站专用逻辑，不改旧版本或历史结果。本轮不启动修复或重跑。

## 架构模块与成熟度

| 模块 / 代码入口 | 当前实现与复用 | 程度 |
| --- | --- | --- |
| 需求域：`apps/api/src/interview/` | AI Connect 注册协议、Pi AgentSession、搜索引用、问题/草案/确认、一次 repair；宿主填写可推导字段 | 已有真实入口验收；语义泛化和协议简化仍有限 |
| 准备编排：`apps/api/src/task-chain/preparation.ts`、`authoring.ts` | 确认稿确定性投影、代表输入、探索、样本/复验、人工等待、原来源离线重编译 | 主线已接通；准备 Agent 的内存等待在服务重启后不能凭数据库记录直接恢复 |
| 采集/编译：`vendor/workflow-use/workflows/workflow_use/hybrid/`、`apps/api/src/upstream-browser/` | B-U 0.13.8 原生 Agent/DOM/动作，workflow-use 受管扩展，来源摘要/完整覆盖/TS 物化；已接 fold_repeat、wire_repeat_graph | 不是全部原封不动上游；B-A-T 仍拥有重要编译适配，动态规则覆盖是主要风险 |
| 公共合同：`packages/contracts/` | TypeScript/Zod，版本、节点/边/值绑定、结果、checkpoint、执行与清理事实；旧新 schema 兼容门 | 核心已用真实运行验证；全部历史版本组合未穷尽 |
| 执行器：`packages/runtime/src/task-chain/` | LangGraph StateGraph 驱动，B-A-T 负责预算/绑定/幂等/审计；QuickJS 0.32.0 运行纯函数，显式 llm 节点 | 普通 0 LLM 复跑已实证；复杂嵌套循环/分支及全部节点组合未按当前基线完整验收 |
| 浏览器适配：`packages/browser/`、`apps/api/python/browser_use_runner/` | daily 扩展/CDP、专属可见及 headless、AttachedWindow/ManagedWindow、唯一实际控制会话 | 连接、冷启动、受控重连/关窗通过；BrowserSkill 全面替换没有完成，也不是当前前置要求 |
| 网站账号：`apps/api/src/browser/account-*.ts` | 目录/身份/平台检查/窗口/迁移/恢复；复用固定 MediaCrawler、social-auto-upload；DPAPI 保护迁移恢复材料 | 两种浏览器和真实 B 站现有登录通过；13 平台不等于 13 平台私人正例与迁移全部通过 |
| 存储/API：`apps/api/src/database/`、`task-chain/repository.ts` | Fastify、better-sqlite3/Drizzle、ProductStore、不可变 release、运行事件、cleanup 审计和并发校验 | 重开 SQLite、刷新、旧发布复跑已有证据；备份恢复、长周期容量/性能未完成验收 |
| 工作台：`apps/workbench/src/` | React/Radix、主子节点与循环/分支、操作反馈、运行历史、成果/原图、账号设置 | 核心 UI 流程通过；所有复杂画布/显示组合及全项目基础控件收敛未全验 |
| 开发和交付：`scripts/`、`docs/development/` | 固定 vendor/构建、最小回归、冻结比对、真实流程证据、服务归属核验 | 有机制但执行曾失守；BBP 复盘、临时资源结算和统一状态入口本轮补入 AGENTS |

## 原基础整改交接的结算

| 原问题 | 现在的程度 | 尚未关闭的边界 |
| --- | --- | --- |
| 非链接入口生命周期 | 同页按钮、弹出返回、混合入口、文档替换拒绝已有真实 headless 证据；href 走原生导航 | 来源文档被销毁且无稳定导航值时继续严格拒绝；不是所有控件都能自动复跑 |
| 恢复/资源归属 | 真实 relay/runner 重建、同 owner/checkpoint、未知副作用拒绝、SQLite 同 run 继续通过 | 个人浏览器关闭、站点登录/验证、服务重启与长期保活的组合仍未完整验收 |
| DOM/选择器复用 | producer/compiler/runtime 审计已完成，查询交给 B-U/Chrome；共同路径生成限定为本地编译适配 | 跨 iframe/shadow、异构集合和更广泛选择器优化未验证 |
| 参数化数量 | 真实底层 2→1/3、空集合、继承输入、数量预算与歧义拒绝通过 | 当前三个真实样本的 plan 输入均为 null，不能称自然需求到可改参数的产品主流程已验收 |
| 内容范围 | selected-regions 的正文/图片/表格、嵌套去重、排除选区外兄弟控件通过 | 选区内自带控件仍可能保留；历史 GitHub 产物尾部控件文字不改写 |
| 安全诊断 | 固定阶段、异常类型/错误码、受信帧摘要和行号已补 | 旧 transfer 首次丢失控制、旧清理第二次 owner 核验不可用的底层原因缺原始证据，不能追认已查明 |

## 当前运行现场（只读核验）

- `/api/health` 返回当前 checkout、PID 11840，复用原 4173/4175 服务；没有启动第二实例。
- Bilibili execution `29077f0f-8307-41dc-8ea6-cb99bc2671d6`：completed、daily/headless=false、cleanup confirmed；用户随后要求关闭，handoff 已 ended，不再 active。
- SQLite 当前 taskExecutions / taskAuthoringJobs 没有 queued/running/waiting/cleanup_required 活跃记录。账号 maintenance 共 47 条全部 closed；transfer 为 2 completed / 2 rolled_back，没有 pending。
- 数据库文件约 1.0 GiB；这里只记录容量现状，不删除业务历史/产物，也不据此断言性能故障。
- 无关 `unused-owned-fixture/` 原样保留。开发误建 Profile 仅移入回收站，永久清理仍未完成，见 [复盘](TOOL_POLICY_INCIDENT_20261007.md)。

## 后续优先级与交付边界

1. **P1 动态规则覆盖**：先处理确认要求与可执行方法的缺口；用状态变化的最小样本证明规则仍成立，不能继续仅凭播放成功/动作完成结算。
2. **P1 恢复与账号可靠性**：补实际使用中关窗、断连、登录等待及重启的必要组合；保留旧首败，沿原 owner/lease/原组件整改。
3. **P2 产品级参数化与任务泛化**：底层参数能力已有，通过正常需求形成可修改输入、不同数量和至少另一类操作任务的独立证据仍欠缺。
4. **P2 工程债与验收覆盖**：两项历史 Windows POSIX mode 断言失败、已有 read_fields 断言不一致没有本轮关闭证据；当前修复后的 macOS、全部平台 SSO、长期容量/恢复未验。不得把这些记为已通过，也不无授权跑全量测试。
5. **P2/P3 展示及运维**：复杂画布、选区内控件、产物容量/保留与开发临时资源回收分别处理；不要用状态描述掩盖底层缺口。

本轮没有实施上述产品整改。文档与规则能建立可检查的执行门，不能替代测试、实际收尾或承诺任何 agent 永不犯错。

## 证据索引

- [账号选择、冷启动与原任务正式播放](BROWSER_SELECTION_REPAIR_20261007.md)
- [原任务代表执行、两次普通复验与发布](ACCOUNT_RECOVERY_AND_BILI_20261007.md)
- [需求引用、字段归属与真实自动修复](INTERVIEW_SOURCE_BINDING_20261006.md)
- [基础契约、真实 headless 恢复与参数/内容边界](FOUNDATION_CONTRACT_REPAIR_20261006.md)
- [GitHub 完整新建主流程与旧链复跑的限定证据](GITHUB_MAINLINE_REPAIR_20261006.md)
- [历史 Windows 基线失败](REPLAY_RECOVERY_CLOSURE_20261004.md)
- 本地只读事实：`data/workbench.sqlite` 的 `taskReleases` / `taskExecutions` / `taskAuthoringJobs` / `browserAccountFacts`；受控摘要在 `work/browser-routing-20261007/final-evidence.json`、`cleanup-receipt.json`、`recycle-cleanup-receipt.json`。原始数据库/Profile/页面与截图不入 Git。
