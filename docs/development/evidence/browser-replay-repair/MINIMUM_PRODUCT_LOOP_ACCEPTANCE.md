# 产品最小闭环验收记录

## 结论

2026-09-21，`master` 分支从检查点 `7d59036332a66de8991744659d2317da126c6123` 继续开发后的当前工作区，在 Windows x64 范围完成 [产品最小闭环](../../MINIMUM_PRODUCT_LOOP.md) P6 历史七类验收、闭环修订 R1–R5 正式产品验收，以及一条真实公开站点任务从准备到可重复运行的补证。两组正式结论均为 `completed=true`；macOS arm64 由用户延期，仍为未测。

本记录只固定可复查的产品事实。P6 历史七类证据保存在 Git 忽略目录 `work/minimum-product-loop-1789843205619/`；R1–R5 修订后正式结果保存在 `work/minimum-product-loop-1789921035029/result.json`。SQLite 状态和历史截图仍留在各自运行目录，未写入账号、Cookie、Profile、验证码或原始敏感页面内容。

## 后续真实任务闭环（2026-09-21）

历史七类结果继续是当时输入下的真实证据。它们曾暴露一个未覆盖边界：用户只说站点名称而不提供完整 URL 时，准备流程会把空 `allowedOrigins` 交给 runner。该缺口已从根合同修复并由同一真实任务补证，不再以站点名、业务字段或页面 special case 绕过。

真实任务 `e99c66f6-873e-40cf-a1c9-bebca8d05540` 已从已确认需求进入正式准备，发布 release `eefe5eb7-a4be-42f2-836b-66867d67ecd9` v1，绑定 chain `78ab3e78-7b2b-4bd4-884d-4ebcecc027b0` v4 和有效 preset `f60ae0e4-85c5-4923-8eca-56689ad85abd`。准备的 sample 与 verification 均完成；随后两个独立正式 execution `69b391df-a8c2-4a2d-8ff4-bff9832d4597`、`982066f7-25e9-4bc1-86ae-5932e34ed62a` 沿合法控制流完成。每个 run 均消费 6 个浏览器命令、0 个模型调用，审计完整，因此已经形成可从正式产品入口重复启动的发布链路。

该任务的首次真实探索使用官方公开页面，浏览器确认当前可播放正片并观察到播放器时间推进；登录或验证码没有被绕过，也没有触发人工等待。后续准备重用版本化来源事实，普通复跑没有重新交给模型找路。技术修复集中在通用合同：计划授权入口绑定、执行期观察型读取、稳定目标消歧、跨标签页显式聚焦，以及失败后复用同一不可变计划和来源事实。

## R1–R5 修订后正式结果

- `work/minimum-product-loop-1789921035029/result.json` 从正式 Workbench/API 产品入口完成，顶层 `completed=true`。
- R1 的充分访谈、可选只读来源解析、Question Panel、待决硬门和确认需求持久化均由产品合同产生；用户未填写 `startUrl`、selector 或 JSON。
- R2 的准备边界、技术完成语义和真实错误保留通过；链尾没有额外全局来源或完成 judge。
- R3 的修订草稿、不可变版本、checksum/digest、聚焦验证和发布通过；旧版本与历史运行没有改写。
- R4 的“符合预期 / 调整链路 / 重新梳理需求”三条路径、用户可读运行摘要、新需求版本和重新准备通过。
- R5 同时覆盖数据换输入、人工等待跨重启恢复同一 run、外部阻断、显式修复、持久化及正式 Workbench 交互；所有隔离资源在验收后清理。

## 产品入口与边界

- 任务准备、发布、运行、恢复、修复和状态读取均经过正式 Workbench/API 产品入口；没有直接调用 `TaskChainRuntime` 拼装通过结果。
- 受控页面只提供稳定可复现的页面行为；任务、release、preset、execution、run、检查点和模型审计均由正式持久化与服务流程产生。
- 自动 Workbench 验收使用不抢焦点的 headless Chromium；没有启动可见浏览器。
- 生产源码没有加入网站名、业务字段、弹窗文案或 CSS class special case。可选准备动作只来自同一预执行证据：目标在语义 dialog 内相邻、准备后同 document、目标变为稳定可用且业务动作只派发一次。

## 七类独立结果

| 类别 | 结果 | 核心证据 |
| --- | --- | --- |
| 执行型任务 | 通过 | 服务重启后任务仍绑定 release `a0e8afca-17bc-40f0-82a3-ab68647e20b8` v1；直接运行与再次运行各创建独立 execution 并完成 |
| 数据型任务 | 通过 | 同一 release `ec360734-412d-4643-803a-f196e7d411ac` v1 分别以 `alpha`、`beta` 运行，输出对应 `Catalog result`；两次 run 均 `llmCalls=0`、`modelCalls=[]` |
| 人工等待 | 通过 | execution `a70bbe22-d333-4564-8259-b05cb2e42b95` 跨服务重启恢复；恢复前后 run 均为 `2f02608c-4617-4558-831f-b3c6a14cef31`，副作用没有重复 |
| 确定性失败修复 | 通过 | failure digest `696c34bcd496735b1ab0c880141cd6549d12a9e11d04b165488f7cf119a3993d` 经明确授权生成 repair job；release v2 经两组输入验证后发布，v1 保留 |
| 外部阻断 | 通过 | HTTP 429 保存为 `external/rate_limited`、`repairable=false`；`authorize_repair` 返回冲突而未启动修复模型 |
| 持久化 | 通过 | 重启后 release、preset、7 条历史 execution 与待恢复 run 一致；人工等待随后原位完成 |
| 交互与视觉 | 通过 | 1440×1000 与真实 390×844 指标下主路径可用；首个 Tab 命中 skip link，Enter 聚焦 `main-workspace`；reduced-motion 生效，双击只新增一条 execution，断网重试只新增一条 execution |

## 修复发布与普通复跑

修复发布为 release `f3c940a9-182a-44f2-820b-0d537b6fdc38` v2，digest `7ddf95dfbf361b1548805d3e30a6a7551f5d4117494ee25c48aeb89d4b6bc914`。发布清单绑定 chain `ae48eb0e-0299-444d-8424-92fb32ef1d32` v3，digest `a5008ec3e49cb8bb805a89da89b18cbabe070a5be21bd749a556ea3b1d99739c`，其中有两个通用 `browser.target-readiness` 节点。

遮挡输入运行只在目标未就绪时执行已经证明的准备动作，完成后输出 `{ keyword: "alpha", message: "Catalog result for alpha" }`，消费 9 个浏览器命令、0 个模型调用。正常输入运行跳过准备动作，输出 `{ keyword: "beta", message: "Catalog result for beta" }`，消费 7 个浏览器命令、0 个模型调用。旧 release、失败 execution、失败 run 和修复审计均保留。

## Workbench 与清理

- 桌面截图：`work/minimum-product-loop-1789843205619/screenshots/desktop.png`
- 窄屏截图：`work/minimum-product-loop-1789843205619/screenshots/narrow.png`
- 390px 设备指标下 `innerWidth=clientWidth=scrollWidth=390`，没有横向溢出。
- 双击验证的 execution 数量由 6 增至 7；一次离线失败后的同请求恢复由 7 增至 8，均只新增一次。
- 最终产品浏览器记录为 `busy=false`、`cleanupRequired=false`；隔离 Chromium、API、受控站点和 runner 均在 `finally` 中退出。

## 聚焦验证

- 正式 P6 恢复验收最终一次退出码为 0，七个 case 全部存在且 `completed=true`。
- Workbench 生产构建通过，共处理 5048 modules；仅有既有大 chunk 性能警告。
- API TypeScript 检查、相关 TypeScript/Python 定点测试、真实 headless hybrid 交互/读取和受管 fork 真校验通过。
- 当前受管 fork digest 为 `135fbdfc4a2c6e9f9f9060fe389be861fd849ee52403ded2a92bab43e3ce3d00`。

未运行根级全量测试，也没有用类型检查或定点测试替代上述产品入口结果。当前改动未提交、未推送。
