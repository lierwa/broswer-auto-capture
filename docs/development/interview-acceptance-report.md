# 浏览器自动化需求采访验收报告

> 状态：最终冻结版真实验收完成。14/14 场景形成并持久化可确认草稿，14/14 经逐案人工审阅可接受；其中 1 案保留轻度采访效率问题。该结论不代表外部网站或正式浏览器任务已经执行。

## 验收范围

本轮只验证“用户输入 → 真实模型采访 → 可确认需求草稿 → 草稿确认与刷新恢复”。不启动来源调研、计划、浏览器网站操作或事务提交，也不把消息内模拟输出当作产品链路通过。

14 个固定任务覆盖：含糊商品采集、指定品牌分支、完整官网产品、招聘列表、官网事实核查、指定媒体、动态最新媒体与时间定位、内容阅读定位、预约确认门、收藏管理、账单与报销混合、跨轮纠正、系统推荐委托，以及采集与媒体复合目标。

## 运行约束与隔离

- 产品模型选择固定为 managed OAuth connection、`gpt-5.6-terra`、`medium`；报告和 fixture 只保留 connection ID 的 SHA-256。
- 每案最多 6 个真实生成轮次，单轮上限 120 秒；不自动 retry、不切换模型。每轮要求恰好一个 invocation，并核对完成事件的 model ID。
- 测试进程使用 Node 24、自有随机本地端口和 `work/` 下隔离 ProductStore；浏览器执行器设为硬失败，计划执行器禁用。
- 正式工作台原有任务只读计算聚合摘要；每次运行前后比较任务数及 interview/browser/research/plan/chains 五个 surface 的聚合 SHA-256。
- 原始事件、SQLite 与完整运行 artifact 保存在 Git 忽略的 `work/interview-acceptance-*`。Git 只保留可读报告与脱敏摘要。

## 最终冻结版溯源

| 项目 | 实际值 |
|---|---|
| Node | `24.14.1` |
| Skill SHA-256 | `03af80ee986af4494c8d3851d166b8c9b8e3ad01bd4b039843e25cdc746caf9c` |
| interview protocol SHA-256 | `d528bf7f988df0c520b42f705ab5f03f9b9759bcaf515c462d6848d4383d12f0` |
| AI Connect vendor tar SHA-256 | `9c78ea593f3d1d67a0796355c0a8a52e4acf80e8029923eaa4ffa48ea3290b6a` |
| 实际生成 prompt SHA-256 | `7020f1858627827d0f0172252c35159dd2eb17f5ea053020594928080991e34c` |
| model / effort | `gpt-5.6-terra` / `medium` |
| connection ID SHA-256 | `cca9033dbbcd57a130468137e7fdb87a95d853d9c6d2a097f6b3a2694a6f7d27` |
| 用户任务聚合摘要前后 | 14 个任务；`46b6c7f2…18ae1` → `46b6c7f2…18ae1` |
| 上游 AI Connect 交付 | `97d9f90bc146b550cf13be2f932cfe91410f6ab1` |

Preflight 还会从真实 host 生成的 prompt 中核验：自由输入 Question 零选项、选择题才允许选项、采集草稿唯一 JSON 示例，以及通用草稿唯一 raw Markdown 示例。哈希用于证明运行时内容，不以源码更新时间代替。

## 判定方法

自动层仅检查：正式 HTTP 状态、typed Question 可回答性、草稿版本、明确由用户实际发送的关键目标词、单 invocation、模型一致、后续 surface 为空、确认版本持久化与用户数据摘要不变。

人工层逐案检查：

1. 用户明确事实、限制及跨轮纠正是否完整保留。
2. Question 是否只追问会改变结果或授权的关键缺口；系统可调查事实是否留给后续调查。
3. 默认建议是否与用户事实分开，是否把未确认默认写成硬范围。
4. 高层步骤依赖、可观察完成标准、缺失及覆盖缺口是否可判定。
5. 来源发现和现场未验证事实是否与已知事实分开。
6. 登录、付费、提交、删除及账号变更是否保留相称确认门。
7. Question 或草稿前的普通说明是否自然、有实质内容。

关键词断言通过不等于人工质量通过；同义单位（例如 `3 分钟`、`03:00`、`180 秒`）按语义等价审阅。

## 阶段运行与已确认发现

这些运行用于发现协议、Skill 与 harness 问题，不计入最终通过率：

| 阶段 | Skill 前缀 | 真实调用 | 用途 / 结果 |
|---|---:|---:|---|
| 早期基线与协议探针 | `fefdab0d` | 11 | 含糊输入、恢复、首批完整草稿与格式失败取证 |
| JSON 通用草稿阶段 | `ba4bc7f2` | 24 | 14案阶段运行；暴露长 Markdown 内嵌 JSON 格式失败 |
| 私有 raw Markdown 阶段 | `c7dc0b8a` | 22 | 格式失败消失；暴露采访引导质量问题 |
| Skill-only 质量阶段 | `35b7a04b` | 20 | 11案确认；暴露正交单选和记忆 URL 事实归属问题 |
| 最终冻结版 | `03af80ee` | 27 | 25 次构成最终14案；另2次为招聘 fixture 回复不完整后的留痕复测 |

全部本地 artifact 合计 104 次真实模型 invocation；零模型 preflight 不计。最终通过率只使用最后一行中的 25 次有效轨迹，不把前期失败、质量发现或额外 fixture 调用隐藏为自动 retry。

- 最终协议前的 baseline 在模型调用前因 harness 顶层初始化次序失败；真实 invocation 为 0，用户数据摘要未变化。问题修复后加入零模型 preflight。
- 一个含糊微波炉任务曾跨进程恢复 pending Question；宽泛回答规则把“目标市场”误当“品牌来源”连续作答。该结果归为 harness 语义错误，促成“未映射问题立即暂停、人工按固定 persona 裁定”的规则。
- 长 Markdown 内嵌 JSON 路径出现真实模型格式失败：模型完成事件正常，但 raw 多一个 JSON `}` 且缺少 `</interview-result>`；shared authoring 给出 `recovered_syntax` 与 `invalid_directive`，BAT 正确 fail-closed。没有把该失败归因于 provider 或无普通正文。
- 阶段草稿暴露两类质量风险：把未确认排除项写进硬范围；同一草稿同时写“本需求授权后续核实”与“不产生浏览器授权”。这些反馈进入最终 Skill/私有指令冻结前审查。
- 早期 fixture 曾把只存在于隐藏 persona、未通过用户消息发送的字段当作草稿必含项。最终 harness 先证明每个断言事实已出现在真实用户消息，再检查草稿保留，避免要求模型猜隐藏信息。
- 私有 raw Markdown 指令阶段在 22 次真实调用中产出并确认 10 个草稿，未再出现通用草稿的 JSON 尾随字符失败；其余 4 案保持原 pending Question，未用重建首轮或隐藏 retry 绕过。该阶段同时暴露采访引导质量问题：将多个正交范围合并成单选、把低风险预算与成本中心缺口过早设为草稿阻塞项，以及复合提问增加不必要轮次。协议解析成功不等于这些草稿和问题路径达到最终质量标准，因此整批仅作为阶段证据，等待下一次 Skill 冻结后 fresh 复测。
- “采集 + 媒体”案的草稿实际保留了“UP 主”和“第 1 条”，旧自动断言因空格及汉字数字归一化不足误判。修正只覆盖明确等价写法，没有删除任意数字或否定词；同一草稿在零新增模型调用下确认。该项归为测试缺陷，不归为模型丢目标。
- 后续 Skill-only 阶段用 20 次真实调用得到 11 个已确认草稿，仍发现两项产品语义质量缺陷：招聘采访把可同时成立的“职位类别与工作地点”“目标公司或行业”包装成单选；MDN 草稿把用户未提供、应由系统现场查找并核验的记忆 URL 写成“已知输入”。两项均保留为产品质量失败，没有通过放宽断言改判。该阶段另有 3 案停在持久化 Question，未发生 provider 或协议解析错误；在下一 Skill 冻结后从新任务重跑，不沿用旧状态。

## 最终 14 案质量矩阵

最终 14 案共 25 次真实模型调用；所有轮次均为 `gpt-5.6-terra/medium`、每轮恰好一个 invocation，无自动 retry 或模型切换。人工回答仅在冻结 persona 能语义确定时提交；未知但低风险的合成用户事实（中国大陆、中国国家图书馆、无匹配场地处理）均以自然用户消息留痕。

| # | 场景 | 轮次 / Question 路径 | 自动 / 人工结果 | 确认 |
|---:|---|---|---|---|
| 1 | 含糊微波炉 | 2 / choice→draft | PASS；附属输入排除选项中的零售商，最终仅官网 | v1 |
| 2 | 冰箱指定品牌 | 3 / choice→choice→draft | PASS；driver 首次错选混合来源，UI 自然纠正后目标完整 | v1 |
| 3 | 苹果官网全量产品 | 1 / draft | PASS；全量、字段、缺失保留与官网范围完整 | v1 |
| 4 | 联合国招聘列表 | 2 / freeform→draft | PASS；单一自由输入承接不限岗位、北京、开放状态与字段 | v1 |
| 5 | 官网事实核查 | 2 / freeform→draft | PASS；国家消歧必要，现场核实与已知事实分离 | v1 |
| 6 | B站具体集 | 1 / draft | PASS；固定第120集、身份核对、播放完成态明确 | v1 |
| 7 | B站最新集 + 3分钟 | 1 / draft | PASS；最新身份留待现场核实，未编造集号 | v1 |
| 8 | MDN 阅读定位 | 1 / draft | PASS；准确 URL 明确列为现场调查，不伪装已知输入 | v1 |
| 9 | 羽毛球预约 | 5 / freeform→freeform→choice→draft→纠正draft | PASS；提交前确认边界完整；“无场地处理”可作安全默认，属轻度效率缺陷 | v2 |
| 10 | 收藏移动 | 1 / draft | PASS；移动前数量确认且不删除 | v1 |
| 11 | 发票整理 + 报销 | 2 / freeform→draft | PASS；未知成本归属不猜，正式提交前核对 | v1 |
| 12 | 跨轮范围纠正 | 2 / draft→纠正draft | PASS；最终只保留最近一年与30条 | v2 |
| 13 | 系统推荐委托 | 1 / draft | PASS；路线/来源交给后续核实，未编造名单 | v1 |
| 14 | 采集 + 媒体复合 | 1 / draft | PASS；20条字段与播放第一条至3分钟均保留 | v1 |

按 SQLite 事件时间戳统计 25 轮：首个非空 `text.delta` 中位数 4,742 ms、P95 7,949 ms、最大 8,723 ms；模型生成中位数 13,381 ms、P95 18,462 ms、最大 20,928 ms；整轮中位数 13,460 ms、P95 18,525 ms、最大 20,994 ms。整轮与生成的差值是本地投影/持久化收尾，不据 token 或 effort 推断不可见的 reasoning 时长。

## 逐案实际对话与草稿

完整可读证据拆分为两份，以遵守单文件 500 行限制：

- [场景 1–7](./interview-acceptance-cases-01-07.md)
- [场景 8–14](./interview-acceptance-cases-08-14.md)

两份附录保留实际输入、assistantText、Question/选项、用户回答、完整最终草稿、invocation ID、首包/生成/整轮耗时和 token 数；原始密集事件与 SQLite 只保留在 Git 忽略的本地 evidence 目录。

## UI 恢复链验收

使用 BrowserSkill 自有 `--no-focus` Agent Window 访问随机本地端口的隔离 Vite 页面；独立 Vite cache 显式代理到随机本地端口的隔离 API，数据目录为最终12案 store。页面打开冰箱 pending Question，选择“中国大陆市场”，在附属输入自然纠正为“仅海尔中国大陆官网全部冰箱”并补全四字段与缺失规则；真实模型生成草稿后在页面审阅并确认，刷新后 DOM 仍显示“需求草稿 · v1 · 已确认”和“需求 v1 已确认”。截图保存在 ignored `work/ui-final.png`。

完成后自有 BrowserSkill session 成功停止且无活动 session；隔离 API/Vite 均停止，对应随机端口无监听。后验 preflight `2026-09-10T19-49-04-057Z-11fdbfc5` 再次确认正式用户任务摘要不变。该 UI 验收只覆盖本地采访、确认和恢复，不访问外部网站。

## 回归与环境观测

- 本任务测试 helper 所属 API 与 Workbench TypeScript check 均通过；最终 preflight 通过。
- 正式回归记录：五个 workspace check 通过；contracts 16/16、Workbench 31/31 通过；API 98 项中 96 通过、2 失败。一项为既有 interview 断言 `expected drafts 0 / actual 1`；另一项为全套并发执行时 `plan-recovery` fixture startup timeout，单独在 owning cwd 复跑 2/2 通过。这里只陈述观测，不据单独复跑断言并发失败根因或排除产品风险。
- AI Connect vendor tar 在 Windows 消费；同 SHA 制品还在 macOS Node 24.21.0 / npm 11.19.1 的隔离目录完成 `npm install --engine-strict` 与 `npm ci --engine-strict`。这是共享包安装/公开导入证据，不代表 BAT 浏览器执行已在 macOS 验收。

## 结论

最终冻结版在 14 个不同任务上实现 14/14 可确认草稿、14/14 人工质量可接受，并通过一次真实隔离 UI 的 Question 回答、模型生成、草稿确认及刷新恢复。最终 25 次有效调用之外，另有同冻结版招聘 fixture 首次回复漏字段的 2 次调用；它作为测试缺陷保留，不计入最终 25 次，也不归咎模型。

验收边界仍然明确：本轮没有启动来源调研、正式计划、BrowserService 外部网站操作、媒体播放、表单提交、收藏变更或报销提交，因此不能据本报告宣称这些后续执行链已通过。
