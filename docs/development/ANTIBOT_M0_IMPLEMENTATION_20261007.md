# M0 开源检测闭环实施记录

日期：2026-10-07，状态更新于 2026-10-08。起点：干净的 `master@4304981035c038be4678852f9dcc58c0f50c6a80`。用户本轮授权开发；此前方案中的“仅文档授权”已被本次指令更新。**本文件的 P0/P1 限定客户端测量闭环完成；后续 W3 最小改造已取得实际 daily 双探针与完整发布链路证据，见 [W3 受控验收](ANTIBOT_W3_EVENT_CAPTURE_20261007.md#2026-10-08w3-受控范围验收)。** 下文首轮中断及后续人工记录按时间保留，不代表当前开发仍停在 M0。

## 实施前登记

Product Alignment:
- natural-language task: 让用户自己的浏览器任务减少网站可观察的自动化特征，先建立可解释的本地检测对照。
- reusable chain boundary: 开发侧测量现有浏览器能力，不改变 TaskChain。
- runtime inputs: 固定探针、专用合成 Profile、可见 Chrome、本地动态资料列表、阶段和轮次。
- dynamic task outputs: 最大已发布资料选择结果；检测事实单独保存。
- generic platform capability used: 原 RunnerProcess、B-U BrowserSession/DOM、原普通执行能力和 finally 清理。
- replay model calls: 检测、报告及普通能力执行均为 0；本阶段不调用探索模型。
- site/task-specific code added: no；合成场景仅在 tests 中。

Reuse Assessment:
- capability: 自托管 fpscanner 诊断及有效性比较。
- existing implementation in repository: method-completion-native.acceptance.ts 的 node:http 场景模式、RunnerProcess 与 browser-use 0.13.8。
- mature candidates and pinned versions: fpscanner 1.0.8 / 4255cfd8a23fef5ea714147518d8c6ae1e5426d3；其余候选见两份复审方案。
- selected implementation: 固定 npm 发布制品作为测试专用依赖；从独立工作目录读取，不进入产品打包，不运行包脚本。
- reused public surface: FingerprintScanner.collectFingerprint({ encrypt: false })、BrowserSession、现有 hybrid_start/observe/execute。
- B-A-T-owned adapter and remaining gap: 本地夹具、输入有效性、阶段关联、薄报告；不实现检测算法或综合真人分数。
- license/runtime/platform fit: fpscanner MIT、浏览器 JS；Node/TypeScript 本地 HTTP、现有 Windows Python/B-U。
- browser/runtime/state ownership conflicts: 一次一个测试浏览器，独立 Profile；原生 B-U 与产品执行分层记录，不借用日常浏览器。
- replay model calls: 0。
- rejected candidates and evidence: 首轮无服务器挑战/TLS 需求，不安装 CrowdSec、BotD、JA4、宿主替代或 stealth 包。
- focused validation: 制品完整性、缺失/异常不可算通过、未知规则、同环境门、一次采样、真实可见浏览器与原执行能力。

## 预登记测量与结论范围

- E01：hasWebdriver、hasPlaywright、hasSeleniumProperty、hasWebdriverIframe；E06：hasCDP。读取对应原始输入与库内规则输出，不重新计算 detector。
- 严格布尔输入可证明这几个固定版本的简单比较规则可执行；其它规则内部错误不可从输出排除时保留 unknown。ERROR/INIT/SKIPPED/NA、缺字段和超时独立登记。
- 正例：独立可见 Chrome 的标准 `--enable-automation`，预期 webdriver 检测命中；它是校准样本，不是待推广的产品配置。
- 人工：无远程调试/自动控制连接，由用户亲自完成选择。程序启动窗口不等于程序操作页面。
- 原生对照：相同 Chrome、全新 Profile 策略、相同页面；单列仅启用调试端口、B-U 仅连接、B-U 观察。
- 当前 B-A-T：现有专属可见 Runner 启动及普通执行；启动过程与原生对照不同，不能把总差异直接归因某一次动作。
- 每份探针只在一个新文档执行一次。三轮用于工程复现，缺人工数据时不得宣称 P1 有效基线通过、不得触发产品改造。
- 运行事实、探针结果、规则健康、模型调用及清理分别结算。没有 TLS/CrowdSec/独立复核，不声明网络、平台放行或防封效果。

## 数据与资源

测试工作目录为 checkout 下 `work/antibot-m0/`，不提交 Git。固定制品单独保留；每轮原始结果上限 20 MiB、保留 7 天，显式按收据清理。Profile 与进程由本轮 owner 关联，先关闭并核验 PID/路径，再删除专用 Profile；失败则保留清理阻塞，不继续下一轮。测试 HTTP 仅监听 127.0.0.1，CSP 限制页面外发，完整指纹只保留本地原始文件，不写产品日志。

## 实际证据

首轮状态：**部分实施，未完成 M0 有效基线；可见测试已按用户反馈停止。** 后续用户分别恢复人工及最后两组测试，见文末，不覆盖本次中断事实。

实现放在 `apps/api/tests/antibot-m0/` 及同目录的 acceptance/test/compare 入口；没有新增生产依赖或修改产品运行代码。测试制品从官方 npm 发布包提取，包脚本未执行，不读取 node_modules。

- 制品：sha512 `v5admnc9Iz4PsODfe+R2nrkQPPRjEW0B3jMoxs3+m1rU3VRNKxrYvXtibwMLfIGstUrQMBjTl/+rfe8XleS5vg==`；bundle SHA256 `75abba497a00625ed053ce7a0bc9353fa5d5c9859cc67438141fe83d8d0946b2`。
- 逐一核验 npm 中的入口与五条已登记规则，对应 [固定上游提交](https://github.com/antoinevastel/fpscanner/tree/4255cfd8a23fef5ea714147518d8c6ae1e5426d3) 字节相同。
- 三项定向测试通过：无效输入/内部未知不能视为负例；缺人工不能晋级；同来源一次提交与重复/跨来源拒绝。
- 首次 API 类型检查发现两处测试空值类型错误；修正后检查通过。其后收尾/比较脚本与可见启动门有新增草稿，尚未再次完成验证。
- `work/antibot-m0/run-2DrjRv/` 有九份完整样本：positive、debug-host、bu-connect 各三轮；五项已登记输入状态单列，webdriver 均 true、CDP 均 false。原始其它规则健康仍可能 unknown。没有将原始指纹写入本文或产品日志。
- 人工运行 `run-2Ov54G` 没有点击/结果。用户表示暂时无空；人工样本保持缺失，未用自动化替代。
- bu-observe 第一轮被中断，未结算；bat-execute 未开始。TS Runner 适配仅为未验证代码，不代表已完成产品链路/发布/复跑验收。

## 桌面干扰与停止收尾

用户让 agent 先做其他能做的工作时，agent 错误启动了多轮可见测试，窗口反复开关。用户反馈后立即停止两个测试 Node 控制进程，再按精确 Profile、PID 和进程创建时间关闭剩余 owned Chrome。责任在开发调度，不是用户没有提供授权或没有操作。

停止后只读核验本轮测试进程 0，57393/58597 无监听。十一份 owner 关闭收据均 true；九份 Profile 随正常 case 永久删除，人工和中断观察剩余两份 Profile 经路径/链接/收据核验永久删除。原始结果继续保留，不把保留证据说成全部目录已删除。两个目录的 `interrupted.json`、`interruption-cleanup.json` 记录中断与清理；不是自然完成收据。

后续执行入口要求显式 `--visible-session`，必须事先安排用户可接受的可见测试时段；不默认运行，不改为 headless 冒充人工同环境对照。本轮不再开启浏览器，也未据不完整证据改生产配置。

## 后续操作（本轮不执行）

- 无浏览器单元检查：`node --import tsx --test apps/api/tests/antibot-m0.test.ts`。
- 安排好可见测试后，人工单组入口：`node --import tsx apps/api/tests/antibot-m0.acceptance.ts --visible-session --modes=manual`。其余阶段逐组选择，不默认批量启动。
- 比较已有报告：`node --import tsx apps/api/tests/antibot-m0.compare.ts work/antibot-m0/<run>`，仅匹配固定制品/环境，缺项保持未完成。
- 数据保留 7 天；`apps/api/tests/antibot-m0/cleanup.ps1 -RunDirectory <精确实验目录>` 只接受过期且有关闭证明、无关联进程/重解析点的目录。中断目录没有自然完成收据，需要按中断核验结果另行处理，脚本不会擅自删除。

## 人工补测与离线比较

用户随后明确重新开始人工流程。仅以 `--visible-session --modes=manual` 启动三轮，用户回报完成后核对原始收据；没有顺带启动自动化组。

| 轮次 | 实际选择 / 当轮目标 | 业务选择 | 已登记五项输入 | webdriver / iframe webdriver / CDP |
| --- | --- | --- | --- | --- |
| 1 | 7 / 7 | passed | observed | false / false / false |
| 2 | 7 / 11 | failed | observed | false / false / false |
| 3 | 13 / 13 | passed | observed | false / false / false |

三份点击均 trusted，原始请求/信号本地保留于 `work/antibot-m0/run-CDgBAu/`。第二轮任务错误不改写；它仍是用户真实操作产生的环境负例，无需以重新操作掩盖原始失败。新增一项定向测试保护“业务失败与环境参考分离、不同环境不可当匹配对照”，原三项仍通过，共四项。API 包类型检查通过。

与 `run-2DrjRv` 九份完整样本离线合并，制品、Chrome 二进制、Windows、可见模式、新 Profile 策略匹配。主页面及 iframe webdriver 形成三轮正例/三轮人工负例；仅调试端口与 B-U 连接各三轮亦为 true。`hasCDP` 两侧 false，没有阳性校准，不作控制不可检测的结论。源码 `managed_window.py:375` 使用 `--remote-debugging-port=0`，属于候选归因路径；当前产品完整执行未测，不能把实验启动信号直接写成产品修复验收。

合并结果：`work/antibot-m0/comparison-1791384627858.json`。`registeredReferences` 可列局部有效参考，整体 `baseline` 保持 `incomplete_or_invalid`，`productImprovement=not_tested`，缺观察/执行组。没有实施生产补丁或独立探针扩展。

人工 run 自然完成，三份 Profile 永久删除，Node 10868 与本轮相关测试进程已退出，57395 无监听；`lab-closed.json` 时间为北京时间 2026-10-07 22:48:05。原始结果保留，无回收站暂存。

## 六组测量完成后的结算

**后续纠正**：以下六组均为专属测试宿主，不能代表全局已选 daily；完成这些测量不是原开发任务终点。已继续实现两种模式共用的 W3 最小修正，证据与 daily 补测见 [W3 实施记录](ANTIBOT_W3_EVENT_CAPTURE_20261007.md)。

用户明确回复“现在运行这两组”后，只运行 `bu-observe,bat-execute`，共六个专用可见窗口，没有自动追加/重试。`run-lIonWP` 在北京时间 22:53:10 自然结束。Chrome 154.0.8037.98，系统/浏览器二进制/显示模式/Profile 策略均与人工样本匹配。

| 组别 | 样本 | 主页面 / iframe webdriver 命中 | CDP 命中 | 业务结果 |
| --- | --- | --- | --- | --- |
| 无控制人工 | 3 | 0 / 0 | 0 | 2 passed、1 failed，保留真实选择 |
| enable-automation 已知正例 | 3 | 3 / 3 | 0 | 未执行选择 |
| 仅调试端口 | 3 | 3 / 3 | 0 | 未执行选择 |
| B-U 仅连接 | 3 | 3 / 3 | 0 | 未执行选择 |
| B-U 观察 | 3 | 3 / 3 | 0 | 未执行选择 |
| B-A-T 原 Runner 执行 | 3 | 3 / 3 | 3 | 三轮均选对；每轮 3 命令、0 模型 |

合并报告 `work/antibot-m0/comparison-1791384902365.json`。所有已登记布尔输入 observed、每份新文档一次采样。webdriver 正反例成立；其它复杂规则内部健康仍可能 unknown，不把完整探针结果一概判通过。原始上游输出与错误状态保留，没有改检测规则或伪造值。

报告修正：人工业务选择错误仍是人工环境负例；将“人工必须选对资料”从环境校准门移出，业务 failed 独立保留。自动化业务失败、缺轮次、不同环境、重复提交、无效输入仍阻止整体诊断通过。定向回归覆盖这一区分。四项测试及 API 类型检查通过，未运行根级或全量测试。

这一阶段完成的是受控环境的探针、对照和原 Runner 能力闭环。`productHost` 调用真实 hybrid_start / navigate / read-fields / click，按实际读取值动态选择；没有运行需求对话、B-U 模型探索、发布或正式 TaskRun，因此不声称 P2 全生命周期验证通过，也不将这三次能力序列虚构为正式发布链运行。

### 已定位的候选改造与未定位项

1. **W1 启动标记**：人工未命中；无控制连接、仅开启 `--remote-debugging-port=0` 即命中；产品 `managed_window.py:375` 使用同一参数。[GoogleChrome 固定文档](https://github.com/GoogleChrome/chrome-launcher/blob/a8e688f6b7524eb8fa59bdb8f5d201e7b567c6e0/docs/chrome-flags-for-tools.md)明确端口 0 会设置 webdriver=true，与本机行为相符。最小候选是既有启动边界的显式非零端口适配；仍须验证端口归属/冲突、旧清理/恢复、原 B-U 与完整链兼容。当前未实施。
2. **W3 完整执行路径**：CDP 从 B-U 观察 0/3 变为原 Runner 执行 3/3。宿主/启动及动作序列有多项差别，不能直接归因点击、DOM 读取或某个 Runtime 调用。下一阶段先沿既有路径做单变量定位，不批量注入 stealth、伪造属性或重写探针。
3. **效果晋级**：上述都是修改前证据。尚无修改后结果、独立探针、网络/TLS/会话证据；`productImprovement=not_tested`，不作平台放行/防封结论。保留 browser-use，未改生产协议、数据库、UI 或宿主默认配置。

### 最后六轮资源

三份原 Runner 审计均 cleanup confirmed、activeResources=false；其余三份原生宿主关闭收据均 true。六份 Profile 已永久删除，62696 无监听，相关测试进程已退出。原始测量目录与固定制品依保留策略保留，不进 Git；无回收站操作。
