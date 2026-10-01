# 日常 Chrome 扩展 P0 源码与运行证据

## 2026-10-02 最新补证：窗口激活回归与完整原任务

实际 Chrome154/已保存授权的原前两步，页面 hidden 时复现相同目标状态失败；仅增加既有 Target.activateTarget 后同动作/后条件通过。现已在原 AttachedWindow 的新/复用 operation 启动阶段显式激活已持久化且 TargetScope 核验的任务目标，激活失败沿原清理合同；所属24项通过。工作台完整原V5复跑 execution `97a83b22-1a20-4308-8095-6536b2669a53` / run `443055d0-2e3b-494c-8b42-90675eb98f80` completed，20 transitions、23 browserCommands、0 llmCalls、审计完整、cleanup confirmed；首页搜索至第二页首项标题/正文完成，真实结果UI已核验。原release/digest和失败记录保留。

实际消费者入口仍为 B-U0.13.8/cdp-use1.4.5/W-U0.2.11 与固定微软受管 relay；不引入 Playwright 浏览器驱动。证据与所有权反例见 RESEARCH/PROGRESS 最新节及 ignored `work/daily-chrome-p0/search-focus-full-v5-proof.json`、`search-focus-full-v5-result.jpg`。Windows实机阻塞；日常冷启动/重启/撤销/卸载、首次完整探索发布、iframe/popup/下载未测。下方“未通过/未实施”是原2026-10-01时点结算。

日期：2026-10-01。原始结算（历史）：**P0 日常扩展兼容仍未通过，采用路径未冻结；P1 持久配对/撤销未完成。P2 独立模式接线和 P3 环境/专属账号 UI 已实现与最小实测，见末节。Windows 缺机，整体未完成。**

本记录消费 [开发方案](DAILY_CHROME_EXTENSION_DEVELOPMENT.md) 与 [ADR 0013](../adr/0013-daily-chrome-task-window-control-boundary.md)。本轮用户已明确授权现有 checkout/分支内实施开发及必要最小验证，覆盖原文档会话的“仅只读/文档”授权快照；未授权新增选型决定、自造协议、分支/worktree、提交或推送。

## 实际基线与处置

- checkout 以执行时的实际根目录为准；分支 `master`，HEAD `674ed366222961840a7e0af8495f37ad81b8ae1d`。
- 开始时已修改 `CONTEXT.md`、`RESEARCH.md`、`ROADMAP.md`、`PROGRESS.md`；已新增开发方案与 ADR 0013。原文保留，本轮追加记录；没有产品代码 dirty 基线。
- 现存 API health 返回同 checkout，PID `16753`；日常 Chrome PID `657`。本轮未重载/结束它们，未读取用户 Profile、Cookie、个人页面或原始敏感协议响应。
- 现有运行时版本实际查询：browser-use `0.13.8`、cdp-use `1.4.5`、workflow-use `0.2.11`。开发 Node `24.12.0`，探针消费仓库锁定的 TypeScript `5.9.2`、tsx `4.20.5`、ws `8.21.3`。
- 新增代码只有固定来源下载脚本与所属 API 的显式 P0 探针/辅助模块。没有接入候选到产品、创建第二驱动或改动现有 Browser-Use/Workflow-Use/TaskConnection/恢复路径。探针不进入默认 `*.test.ts` 测试集。

```text
Product Alignment:
- natural-language task: 在绑定的日常 Chrome 中创建任务专属窗口，持久授权可撤销，并保留三种浏览器环境选择。
- reusable chain boundary: 原参数化 TaskChain、发布与复跑边界；P0 不创建新的产品运行图。
- runtime inputs: 原 task/operation owner、所选浏览器环境、成熟组件的有效连接授权。
- dynamic task outputs: 原任务输出与独立清理事实；P0 只产生候选协议/所有权/隐私反例。
- generic platform capability used: 既有目标所有权与连接生命周期；不扩展站点、选择器、Agent 或调度能力。
- replay model calls: 本轮真实任务运行 0；探针 0 模型；正式普通节点零模型合同不变。
- site/task-specific code added: no
```

## 固定来源与许可证

源码通过固定 commit 的 codeload archive 获取，先核验 archive SHA-256，再逐文件保存摘要；没有 Git clone、分支或 worktree。解压来源只保存在忽略的 `work/daily-chrome-p0/`，保留上游 LICENSE、原版权头和构建入口。没有把任一候选复制成新的产品驱动。

| 候选 | 固定 commit / 版本 | archive SHA-256 | 许可证与实际入口 |
| --- | --- | --- | --- |
| Playwriter | `33d5c5a2c5ebf702e387d94d609e038c98e0acec`；package `0.7.0`，manifest `0.0.151`（extension package 的 `0.0.89` 不是安装版本） | `e57431d8f6e8ef7b386d5a6d04468cba4229e7c54697dd9b3e95134dd2c5cecd` | 根 MIT；extension package 声明 Apache-2.0，微软来源版权头须保留。`playwriter/src/index.ts` 公开 `startPlayWriterCDPRelayServer`；`extension/vite.config.mts` 是原构建配置。 |
| Playwright | `8b552173e8d767db29b8baef8f4a1f08cf7f26bf`；core 开发版本 `1.64.0-next`，extension `0.4.0` | `2782d7e7b862200e25c6b0dcaebc8dad9285ba0cd8069aaa8e897c689320446a` | Apache-2.0。`CDPRelayServer` / `ExtensionProtocolV2` / `BrowserModel` 是内部源码入口，并非已冻结的公开 relay API；extension 使用原 Vite 配置与 manifest key。 |
| Panerelay（补充调查） | `852dcd8208f58a885187329c185df9167d45c9c3`；`0.11.1` | `d71ba8e4757c43e6f4f05333203801828533c5ce089d0d33bc6a5cb9c22796b0` | MIT。`@panerelay/bridge/browser-use-gateway` 是公开导出；内部 `BrowserRelay.listen` 负责真实 HTTP/WS。原构建入口 `pnpm --filter @panerelay/extension build`；本轮未构建、安装或运行其 Native Host。 |

```text
Reuse Assessment:
- capability: 日常 Chrome/Profile 的成熟扩展传输、持续信任、撤销和任务页面范围。
- existing implementation in repository: dailyChromeConnection、TaskConnection、ConnectedTaskScope、AttachedWindow、TargetScope；三种环境的完整接线未实施。
- mature candidates and pinned versions: 上表三个不可变来源；无 latest 安装或依赖替换。
- selected implementation: 未冻结；现成行为已出现下述准入反例，等待用户决定允许哪个受管最小扩展或继续寻找直接适用组件。
- reused public surface: 候选公开 relay/gateway、原构建/安装、原授权与凭据机制；原 Browser-Use Browser(cdp_url) 仍是预定消费者。
- B-A-T-owned adapter and remaining gap: 仅允许原任务 owner、窗口准入、IR 绑定与运行/清理审计适配；候选目前都没有满足空目标建任务专属窗口及严格非 owner 排除。
- license/runtime/platform fit: MIT/Apache-2.0 与源码版权按上表保留；Node/TypeScript，声明的平台支持不算 macOS/Windows 实机验收。
- browser/runtime/state ownership conflicts: Playwriter 默认日志/遗留云资源与 query token；Playwright tab-group 扩权、空目标枚举、argv token、内部接入口；Panerelay 新页要求 all-tabs、丢弃 newWindow、CLI/Harness 与 Python SDK 消费的区别。
- replay model calls: 传输/探针 0；未调用产品模型，没有普通节点修复环或新模型字段。
- rejected candidates and evidence: 原样采用三个候选均不能过 P0；不宣称永久淘汰其可扩展能力，不回到整套 BrowserSkill。
- focused validation: 9 个固定原源码反例/性质，其中 Panerelay 两项使用真实 HTTP/WebSocket；其余为原代码与合成 I/O 的定点执行。真实 Chrome/扩展/SDK/编译/复跑门未通过。
```

## 已执行反例与可复用能力

探针在加载前核验每个来源文件摘要；使用 TypeScript 原编译器转译，没有修改被调查函数的逻辑。Chrome API、历史文件/云调用、进程启动的边界使用合成 I/O；所有替身范围如下表明确记录。VM 只用于执行候选原逻辑，属于测试辅助，不是产品浏览器驱动。

| 项目 | 实际结果 | 证据层与冲突 |
| --- | --- | --- |
| Playwright `Target.createTarget(newWindow=true)` | 原 handler → BrowserModel 只发送 `chrome.tabs.create([{url}])` | 原协议/模型源码执行，Chrome API 替身；不能创建或声明任务专属窗口。 |
| Playwright 空初始目标 `Target.getTargets` | 原 BrowserModel 拒绝：没有已附加页可转发浏览器级命令 | 原源码执行；不能用个人标签页补初始化条件。尚未执行 B-U 真实握手。 |
| Playwright 私人页拖入 group | Chrome 合成 `onUpdated(groupId)` 使原 ConnectedTabGroup 调用 `attachTab(私人页)` | 仅合成私人页，无实际私人页面；与 D1 “搬入不自动取得 owner” 冲突。 |
| Playwright 正常 Chrome 打开 | 原 `_openConnectPageInBrowser` 把持久 token 放进 URL，并把该 URL 传给 spawn argv | 进程启动替身，未真的打开 Chrome；会违反凭据不得进入 argv 的合同。指定 Profile 参数确实保留，但实际自动打开/复用未测。 |
| Playwriter 遗留云资源清理 | 原 `cleanupOrphanedCloudSessions` 删除历史状态文件并调用 disconnect，不核验本次 owner | fs/cloud 全部替身，未读取真实历史文件或请求真实云系统；公开 start 原源码成功 listen 后直接调用此函数，无禁用配置。 |
| Playwriter 原 CDP logger | 默认序列化保留合成页面正文及普通 `?token=` URL，flush 后实际写入测试私有文件 | 实际文件 I/O，只含合成标记，finally 删除；远程控制专用 redactor 不等于一般凭据/页面脱敏。可复用 cdpLogger 注入点，仍须解决其它冲突。 |
| Panerelay 空目标建页 | 原 extension handler 在非 all-tabs 模式先拒绝，不调用 tabs.create | 原函数执行，Chrome API 替身；不能用整个 Profile 的页面授权替代任务窗口授权。 |
| Panerelay `newWindow=true` | 真实 relay HTTP/WS 往返成功，但发给 extension 的原 typed operation 只有 create/url/active | 原 BrowserRelay + 本机实际临时 TCP/WS；extension 回执合成。窗口要求被真实协议路径丢弃，不能仅因返回 targetId 就记建窗成功。 |
| Panerelay 当前租约撤销 | 原 relay 消费 lease revoke 后，旧凭据的新 WS 连接以 1008 拒绝 | 真实 HTTP/WS 与原凭据/撤销逻辑；证明这一层可复用。不是持久配对、Chrome 重启或产品 stop/revoke 的实机证据。 |

固定源码补充：

- [Playwriter relay](https://github.com/remorses/playwriter/blob/33d5c5a2c5ebf702e387d94d609e038c98e0acec/playwriter/src/cdp-relay.ts) 的公开配置只有 port/host/token/logger/cdpLogger；包含 CLI/录制/云生命周期。`/cdp` 的 token 校验读取 query；其它 HTTP bearer 支持不能证明 CDP WS 已接受 BrowserProfile.headers。不得直接启动它来碰用户的历史资源。
- [Playwright relay](https://github.com/microsoft/playwright/blob/8b552173e8d767db29b8baef8f4a1f08cf7f26bf/packages/playwright-core/src/tools/mcp/cdpRelay.ts) 的 token 进入 connect.html URL 与 argv；[ConnectedTabGroup](https://github.com/microsoft/playwright/blob/8b552173e8d767db29b8baef8f4a1f08cf7f26bf/packages/extension/src/connectedTabGroup.ts) 以 group 成员变化扩权。原 token regeneration 仅更换 localStorage；原 RelayConnection 的后续命令没有重新核验该 token，立即撤销当前控制尚无本轮实机证明。原 detach 逻辑还包含 target_closed 的自动 reattach，不能直接继承为 B-A-T 同运行恢复。
- [Panerelay extension](https://github.com/F-loat/panerelay/blob/852dcd8208f58a885187329c185df9167d45c9c3/apps/extension/src/background/index.ts) 的 create 分支要求 all-tabs；[BrowserRelay](https://github.com/F-loat/panerelay/blob/852dcd8208f58a885187329c185df9167d45c9c3/packages/bridge/src/browser-relay.ts) 不消费 newWindow。[Browser-Use adapter](https://github.com/F-loat/panerelay/blob/852dcd8208f58a885187329c185df9167d45c9c3/packages/adapters/browser-use/README.md) 明确 CLI/Harness 支持与任意 Python SDK 构造不同；上游 `0.13.7` 验收不能覆盖本项目 `0.13.8` + workflow-use。

## 可复现入口与首次失败记录

在实际 checkout 根目录执行（Windows 可使用既有受管 Python 对应可执行文件）：

```sh
python3 scripts/research-daily-chrome-sources.py
node --import tsx --test apps/api/tests/daily-chrome-candidate-probe.ts
npm run check --workspace @browser-capture/api
```

源下载脚本可以通过 `--candidate playwright` 等参数只准备一个固定候选。下载失败即退出，不自动重试、不更换版本、不把部分来源标成已验证。

- 首次来源准备：Playwriter 155 文件摘要完成；Playwright archive 传输 `IncompleteRead` 中断，未生成新 verified manifest。随后错误地在来源尚未齐备时执行探针，2/9 通过、7/9 因缺已验证输入失败；这 7 项不算候选协议反例成立。保留该失败记录，没有扩大测试。
- 补齐固定来源后只重验受影响项：Playwright 空目标/拖入与 Panerelay extension 三项通过；两项 Panerelay live relay 因测试辅助误加载 TS 纯类型循环而失败，尚未触达协议行为。辅助改为只加载编译后真实 require，重验这两项 2/2 通过。
- Playwright ManualPromise 的实际固定路径是 `packages/isomorphic/manualPromise.ts`；修正下载范围后，其 newWindow/argv 两项 2/2 通过。
- 最终 **9 个探针各自已有通过记录**，没有为凑一次绿色再跑整组；API 所属 `tsc --noEmit` 通过。这里“通过”表示原行为/冲突得到复现，**P0 兼容门仍不通过**。
- 探针创建的临时 CDP 文件、真实本机 relay 与客户端均在 finally 清理；没有第三方日志、真实云 cleanup、真实用户 Chrome 连接或产品 TaskRun。全部代码文件少于 500 行。

## 阶段结算与下一步

| 分类 | 结果 |
| --- | --- |
| 通过 | Git/运行时基线核对、固定 archive/文件来源、候选原逻辑的 9 项定点执行、Panerelay 实际 relay 撤销、API 类型检查。 |
| 失败 | 三候选原样采用均不满足任务窗口/所有权/秘密边界；上述研究工具首败另列，未用后续成功覆盖。 |
| 阻塞 | 需要用户按既定约束决定是否允许哪个候选的受管最小扩展，或继续寻找直接适用组件；Windows 没有本轮实机。浏览器工具安全策略拒绝打开 `chrome://extensions`（只允许 HTTP/HTTPS），扩展加载和首次受保护批准必须用户实际完成。 |
| 未测 | 扩展原构建、本地加载/更新、真实日常 Profile 身份、冷启动任务窗口、B-U/CDP 完整消费、popup/iframe、持久配对与重启、实际 stop/revoke、W-U 编译/验证/普通零模型复跑、三环境产品 UI 与接线、macOS/Windows 正式交付。 |

用户已收到具体取舍请求：允许 Panerelay 的受管最小扩展、允许 Playwright 的受管最小扩展、或继续寻找原样满足组件。未收到决定前不冻结采用、不先写 P1–P3 完整接线/UI、不把 all-tabs 或 group 拖入当成任务授权。需要扩展时继续沿用所选上游授权、凭据、传输和驱动，仅适配现有任务 owner/窗口边界；若不能保持薄适配，仍须带具体证据再次交由用户决定。

原生日常 Chrome 接入、父连接与历史运行保留；本轮没有静默切私有 Profile、增加链路复验、扩大来源或模型调用。

## 后续补证：用户不在电脑旁时的开发验证

前次答复把日常 Profile 的首次安装/批准扩大成了整个开发停止条件，范围过宽。无需用户在场也能做原版构建、独立测试浏览器加载、界面/后台及协议测试；这些证据单独记账，不替代日常 Profile 的安装、身份、登录态与持久授权验收。原候选问卷中的 Panerelay 是本轮新增调查对象，不是项目已有组件；尚未证明完整消费者兼容，不能仅凭 relay 撤销性质推荐冻结选型。

实际依赖核查：当前受管 Python 环境 browser-use 0.13.8、cdp-use 1.4.5、workflow-use 0.2.11 均无 Playwright 依赖，`playwright` 未安装，Node 产品也未安装 `playwright` / `playwright-core`。历史记录中的 Playwright bundled Chromium 是浏览器二进制/目录来源，不等于已经采用微软的 extension/relay。本轮构建其扩展作为 P0 候选样本，不切换产品驱动。

固定 Playwright archive 补取 `utils/build/`、`tests/extension/` 后共校验 65 文件。其原 `utils/build/build.js` 的 extension step 在 package cwd 调用 `vite build --clearScreen=false`；本轮照此执行原 `vite.config.mts`，未修改 manifest、扩展后台或 UI。独立研究工具沿用上游锁定 Vite 8.1.0、plugin-react 6.0.3、static-copy 3.4.0、React/React-DOM 19.2.7，并核对顶层 registry integrity；生成独立 lock，没有修改产品依赖。解压目录为 `work/daily-chrome-p0/playwright/packages/extension/dist/`，随附上游 Apache-2.0 LICENSE 以及实际打包 React/React-DOM/Scheduler 的原 MIT LICENSE；后者从固定 npm archive 核验 sha512 后提取，没有扫描/读取 node_modules 源码。

| 项目 | 结果与层级 |
| --- | --- |
| 原版构建 | 通过；原配置同时生成 client 和 MV3 service worker，扩展版本 0.4.0。新增显式研究构建入口 `scripts/build-daily-chrome-p0-extension.mjs`，不是产品扩展安装器。 |
| 首次 CfT 145.0.7632.6 加载 | 失败于 browser-use 启动/等待 CDP，30 秒原 watchdog 超时，尚未进入扩展断言；根因未确定。kill 回执后立即核验曾报 cleanup_required；随后确认该测试浏览器及其 helpers 均已退出，才删除该测试目录。没有结束用户 Chrome。 |
| Chromium 134.0.6998.35 第一次加载 | 浏览器已启动、扩展页导航成功，探针误用 `Page.evaluate('async () => …')`，原 API 要求普通 arrow；属于测试辅助错误，不能记候选失败。finally 清理确认。 |
| 修正同一探针后的加载 | 通过；现有 browser-use/cdp-use 在全新测试 Profile 读取扩展 manifest 0.4.0、授权 UI 存在、通过实际 chrome.runtime 消息取得后台连接状态。只返回版本/布尔值，不读取 token；模型调用 0，清理 confirmed。没有经候选 relay 控制页面。 |
| 日常 Profile / SDK 完整消费 | 未测；本机日常 Chrome 实际版本 154.0.8037.92，不能用测试 Chromium 134 成功覆盖。候选任务窗口、所有权、argv 秘密边界的旧反例仍成立，兼容门没有变绿。 |

测试沿用原 browser-use 的本地 launch、CDP、Page 与 kill，临时目录使用其已有 temp 标记避免 Profile 复制。没有使用 Playwright 浏览器驱动、BrowserSkill、第二产品浏览器控制会话或新的恢复机制。首败的即时清理核验已改为 psutil 有界 wait；没有按端口/浏览器名结束进程。原日常 Chrome PID 657 与 API PID 16753 仍在。

可复现命令（实际 checkout 根目录；测试二进制路径按实际机器提供）：

```sh
python3 scripts/research-daily-chrome-sources.py --candidate playwright
node --import tsx scripts/build-daily-chrome-p0-extension.mjs --prepare-tools
BROWSER_USE_SETUP_LOGGING=false ANONYMIZED_TELEMETRY=false BROWSER_USE_DISABLE_EXTENSIONS=1 \
  work/upstream-browser-hybrid/.venv/bin/python apps/api/tests/fixtures/daily_chrome_extension_load.py \
  --browser-executable '<实际测试 Chromium 可执行文件>'
```

源码下载仍保留首败：本次 urllib archive 传输再次 IncompleteRead；只换成熟 curl 的 HTTP/1.1 下载入口取得同一 archive，再通过 `--archive-path` 核验原 SHA-256，没有换 commit 或把部分输入当已验证。该选项只允许单一候选。没有重跑此前 9 项已绿探针或全量测试。Windows 仍缺本轮实机。

官方自动化测试来源：[Playwright 扩展测试](https://playwright.dev/docs/chrome-extensions)、[Chrome 扩展端到端测试](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing)、上述固定 commit 的 `tests/extension/extension-fixtures.ts`。测试 Profile 的自动加载属于开发测试；不会绕过在用户日常 Chrome 打开 `chrome://extensions` 的工具安全拒绝，也不会代点其受保护授权。

## 继续实施：真实消费者与三环境产品接线

本节接续上面历史 P0 快照。P1 日常持久配对/撤销未完成；P2 不依赖候选授权的环境配置、原链路接线和两专属模式，以及 P3 环境/账号/实际模式展示已经开发。完整日常扩展与双平台交付仍未完成，不能从 UI 或私有 Profile 的成功倒推 P0 准入。

### 真实原版 Playwright 扩展 → 现有 B-U/cdp-use 消费

- 原来源仍为 `8b552173e8d767db29b8baef8f4a1f08cf7f26bf`，extension `0.4.0`；源 archive 与文件摘要不变。
- `apps/api/tests/fixtures/daily-chrome-playwright-relay.ts` 消费原 `packages/playwright-core/src/tools/mcp/cdpRelay.ts` 的 CDPRelayServer、原 BrowserModel/ExtensionProtocolV2。只用既有 Node HTTP/ws 包装本地 I/O，不实现 CDP 命令/session 映射，不使用 Playwright 浏览器驱动。
- `daily_chrome_relay_consumer.py` 在全新 owned Chromium134 Profile 装载未改原扩展，原 connectionRequested/connectToTab 消息及 relay extensionHandshake 已实际通过。目标 tab 为合成空白页；没有操作用户日常 Profile。
- 固定 browser-use0.13.8/cdp-use1.4.5 的真实 consumer.start **失败**：SDK 在原 autoAttach bootstrap 前发送 `Target.setDiscoverTargets`，原 relay 没有 attached tab 可转发，返回 `No attached tab to forward browser-level command: Target.setDiscoverTargets`。这是一条实际消费者兼容反例；不是发现 CDP URL 或原 UI 加载后虚报通过。
- `work/daily-chrome-p0/consumer-probe-context-fixed.log` 最终安全事实：extensionHandshake=true、stage=consumer_start、status=failed、failureType=RuntimeError、modelCalls=0、cleanup=confirmed、dailyProfileAcceptance=false。
- 首先遇到的 Python target_id 属性错误、上游移除 selector 页后 evaluate 上下文丢失等研究夹具问题均独立保留；修正夹具后才得到上述消费者反例，不把夹具首败算 SDK 冲突，也不把后续 handshake 改写早期超时。

### Panerelay 原逻辑 Native Messaging fixture

- 来源仍为 `852dcd8208f58a885187329c185df9167d45c9c3`/`0.11.1`，原字节摘要不变。`scripts/build-daily-chrome-panerelay-probe.mjs` 用已有 esbuild0.25.12 编译原后台/协议逻辑，保留 LICENSE/资源。
- 此 fixture 为研究产物：manifest 改 background 路径、增加必要本地 HTTP/HTTPS 合成来源，省略 sidepanel；不是原完整 manifest 构建或生产安装器。不能拿它证明正式授权配置或 Windows 安装。
- `daily-chrome-panerelay-native.ts` 沿用原 NativeMessageDecoder/encodeNativeMessage/NativeTransferReceiver 与 BrowserRelay.listen；helper 只包装 stdin/stdout I/O。独立 helper 正常 host_ready/退出0，但真实 owned Chromium134 native_registration **超时**：background=true、nativeMissing=false、nativeExited=true、transport=disconnected。
- Native Host 在 Chrome 路径退出的根因未知，browser-use consumer 尚未到达；不能称 Panerelay 与 SDK 不兼容，也不能称兼容/配对已通过。最终 `work/daily-chrome-p0/panerelay-consumer-final-status.log` 记录 productionManifest=false、stage=native_registration、status=failed、failureType=TimeoutError、modelCalls=0、cleanup=confirmed。
- 测试 NativeMessagingHosts manifest 与可执行 helper 只在全新 owned 测试目录注册并最终清理。token/Bearer 仅经内存/private stdin/out 管道传递，不写 argv、日志、文件或 Git。
- 安装位置按 [Chrome 官方 Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) 与 [固定 Chromium chrome_paths.cc](https://chromium.googlesource.com/chromium/src/+/dcf155ffd09ad1b61a4670e34d8a1bc491d1ee0e/chrome/common/chrome_paths.cc) 核验；这不解释此次退出原因。原 all-tabs/newWindow 冲突仍由前述固定源码反例证明。

### 已完成的独立产品适配与复用

- 复用固定 browser-use0.13.8、cdp-use1.4.5、workflow-use0.2.11（fork5d2d19fe8835cc86f1bf3e04302a5000d590f249）、Radix Themes3.3.0、原 SQLite/Drizzle；产品 package/package-lock/受管 fork 不变。没有新增驱动、Agent loop、授权协议、凭据系统、通用状态机、scheduler 或恢复机制。
- Zod mode=`daily|dedicated-visible|dedicated-headless`；ProductStore 的独立配置表使用 revision/CAS，v20 迁移只新增此表，旧 JSON 原字节保留。旧记录仍可读，不从当前配置补造历史。
- 准备 job、原有 sample/verification 与正式 execution 都保存并消费当次模式；旧显式 headless=false 请求继续使用原日常可见路径，缺省才读取新全局选择。工作台和单次正式运行使用同一组 Radix 模式标签；链版本/发布/digest不变，模式切换无额外链路复验。
- 专属两模式沿用原 ManagedWindow/BrowserProfile/runner 生命周期、同一个 Profile；无头 formal execution 仍持久化精确 owner。断线只标记并沿现有错误路径拒绝派发，不允许 SDK 自动重连；清理未确认保留原业务结果/失败与 cleanup_required。
- 专属关闭先沿既有 cdp-use 发送 Browser.close，严格限于 `_owner_process` 和 `_verify` 已核验的 PID/createTime/exe/Profile/browserID，之后由原 end 合同确认/清理；日常 AttachedWindow 不调用此入口。正常退出让 Profile 存储刷盘，无复制或重新实现存储机制。
- `BrowserEnvironmentService` 只保护配置操作：有运行、账号窗口、保留现场时不切换；只关闭空闲控制连接；旧连接清理未确认时不写新选择。打开账号窗口复用原 BrowserProfileService，窗口是可见的，关闭后同一 Profile 可用于无头。
- 首先采用旧 `/var` 根和 Python `/private/var` 身份导致 runner 清理首败，已在 mkdtemp 前 realpath 规范化根；仍拒绝未经证实的 PID、路径和外部 owner，没有放宽精确回收条件。

### 最小验证与实际证据

| 验证 | 结果 | 保护的不变量/实际范围 |
| --- | --- | --- |
| browser-environment.test.ts | 8项各自通过；后续新增项单独运行 | 分流不探测日常端点、mode/headless一致、选择/CAS/重启、快照/旧记录未知、并发/未确认清理、同源HTTP、旧显式可见不被全局无头覆盖 |
| preparation-draft-handoff.test.ts 环境快照单例 | 1通过 | actual authoring入口收到准备的mode，仍保存原来源/关闭owner；不是真实模型探索验收 |
| headless-execution-owner.test.ts | 1通过 | 无头正式execution精确owner、cleanup_required不覆盖原失败或加模型 |
| task-chain-storage.test.ts v20单例 | 1通过 | 从准确v18夹具迁移20，原JSON字节保持；未重跑其他历史版本断言 |
| 原Profile/错误/占用定点集合 | 9项通过，其中路径项首败后仅重验该项 | 无新Profile复制、busy/恢复/原错误事实 |
| 原日常连接/节奏 | 6通过 | 默认daily原端点/连接与节奏契约不变 |
| Python原连接/原owner/新policy | 13/10/4通过 | 原连接释放，精确owned结束，无自动重连，headless不可假交付，foreign-owner不关闭 |
| dedicated-browser-modes.acceptance.ts | 实际两个模式通过 | 原Runner/B-U导航、同一合成Profile localStorage延续、0模型、cleanup confirmed |
| dedicated-runtime-replay.acceptance.ts | 实际两个LangGraph run completed | 消费真实PythonUpstreamBrowserRuntime和原TaskChainRuntime；每个llmCalls=0、browserCommands=1、auditComplete=true、cleanup confirmed |
| 原BrowserProfileService与真实UI | 通过 | 可见账号窗口open→closed、Profile保留；私有空白API中可见/无头保存及刷新、open/close立即busy反馈；没有真实账号登录 |
| API check / Workbench check+build | 最终通过 | 公共边界、optional历史兼容与实际bundle；existing大chunk警告保留 |
| 最新真实工作台4173/API4175 | 已加载补丁，health200 | 默认daily/revision0保持，3项可选，明确显示扩展持久授权尚不可用 |

真实运行安全事实文件：`work/dedicated-browser-modes-bounded-close.log`、`work/dedicated-runtime-replay-storage-proof.log`。后者实测 pageVisits 为可见[0,1]、无头[2,3]；第一版探针假定每次单一物理访问并失败，额外页访问原因仍未知。最终只验证两种模式连续存储，不声称浏览器层只有一次物理导航。两次逻辑命令与0模型的事实不受此修正覆盖。

UI截图：`work/browser-environment-ui-proof/mode-headless.jpg`（私有空白服务的保存/账号管理验证）、`mode-options-current.png`（最新实际工作台，保留daily选择）。生成的浏览器/测试Native Host/API/HTTP fixture均定向确认退出，私有目录在确认后清理；真实 Chrome PID657 从始至终未关闭。

已保留的首败还包括：临时类型/夹具错误、graceful close超原清理预算、最初存储未刷盘、dev重启在旧端口释放时被身份保护拒绝、Workbench新增可选字段类型不匹配。修复只重验受影响项或重建已改产物，不把旧失败改成成功，不运行根级/全量测试。全部模型与生产驱动审计入口保持原责任。

### 剩余准入门与需要决定的具体扩展范围

- **未完成P1**：原候选不能原样同时满足空目标SDK启动、独立任务窗口、非owner拖入拒绝和即时撤销/秘密边界。持久配对、指定日常Profile绑定、主动自动打开/已有实例复用、原权限查看/撤销UI尚未接入，不能生成假配对记录或凭UI宣布授权完成。
- 可供用户决定的具体范围是：是否允许对固定微软原版Chrome扩展0.4.0/relay（上述8b552173来源）做最小受管修改，补现有B-U冷启动命令、newWindow/owner准入以及原token清除时立即结束已有连接，沿用原授权/token存储而不新造协议。涉及上游 `cdpRelay.ts`、`cdpRelayV2.ts`、`browserModel.ts`、extension `connectedTabGroup.ts` 与原授权处理器。这里只提交取舍依据，**未采用、未实现、未保证该扩展后完整准入**；若用户不允许，继续寻找原样符合的组件。
- 该候选原Chrome启动把token放在argv；批准受管扩展也不允许沿用这一秘密泄漏入口。必须消费原授权机制且不让秘密进入进程参数/日志；无法通过原公开入口达成时再次提供真实反例，不自行增加授权协议。原SDK/恢复策略保持不变。
- **目标日常安装阻塞**：此前工具自动批准检查拒绝打开chrome://extensions（仅HTTP/HTTPS）；没有换原生/raw-CDP方式绕过。owned测试Profile成功不代表指定日常Profile安装/批准已经完成。
- **Windows阻塞**：本轮无实机。完整macOS日常扩展安装/配对/重启/撤销，Windows安装/更新/生命周期均未验收；没有把声明支持或静态条件分支记为通过。
- **未测**：新模式完整真实模型首次探索→W-U编译→原样本与复验→发布→正式运行端到端、真实账号/跨站任务、目标日常Profile绑定/自动打开/重启信任/实页面owner隔离与撤销。已测的零模型普通LangGraph样本是独立证据，不能代替这些门。

最终本地核对：master/674ed366不变；API/UI PID87551 已加载最后兼容修复并 health200，daily/revision0 保持。数据版本20，活动execution0；已生成的测试浏览器均确认退出，用户Chrome PID657及原createTime不变。未提交、推送、创建分支/worktree或修改相邻项目。

固定微软原版扩展最小修改/继续寻找的取舍已通过 Question Panel 提交；截至本次结算尚无用户选择，面板预选不是批准。未开展依赖这项决定的上游修改。最终按全部P0/专属/私有UI测试目录及精确fixture入口核对：测试浏览器0、测试helper0，用户Chrome657仍存活。新代码文件均不超过500行、新函数不超过100行；runtime-host和App的既有长函数没有增长。

## 产品阶段补证与旧夹具退役

2026-10-01：最终产品阶段见 PROGRESS 最新节与 `product-lifecycle-ownership.log`。微软受管子集已通过限定 SDK/W-U/LangGraph、重启、撤销及任务目标反例；原版失败不改写。本文早期 build-daily-chrome-p0-extension、candidate-probe、Panerelay helper与旧loader等8个研究文件已退役至 ignored `work/daily-chrome-p0/retired-research`，旧命令是历史记录。当前唯一产品构建为 `node scripts/build-daily-chrome-extension.mjs`，consumer使用真实受管产品manager/relay和最终扩展包，未混入Playwright浏览器驱动。当时真实日常Profile安装为工具阻塞；已由下节用户实际安装、重新加载及消费者证据解除。Windows仍缺机。

## 2026-10-02 实际Chrome154解除首次配对门

当前日常Chrome154.0.8037.92、原Default/用户1由用户实际安装并重新加载。原loopback HTTP跳转到connect.html被Chrome阻止的反例，采用Chrome公开 `web_accessible_resources` 的最小声明修复：仅connect.html、仅http://127.0.0.1/*，保留原key、token校验与协议。固定源码和许可证不要求用户固定浏览器版本或降级。

- **通过**：所属原redirect/manifest边界用例先红后绿（4例）；最终包构建；API类型检查；Chromium134的无安全绕过原生跳转；实际Chrome154真握手与保存（0600）；随后仅读取保存授权，经实际PythonUpstreamBrowserRuntime/B-U/W-U/TaskChainRuntime/LangGraph完整普通运行1次，0模型、审计完整、清理确认。
- **失败**：实际GitHub V5 execution `88c57009-f73a-4355-8c85-ab16a74517ca`导航完成，s-a-0002点击后目标状态合同失败；模型0、清理确认、根因未证明。额外实际Profile探针首次被原闲置连接占用挡住，通过原环境选择释放并恢复daily后重测通过；不把它当原GitHub任务复跑成功。CfT145独立连接探针在版本/扩展断言前TimeoutError、根因未知、清理确认。
- **阻塞**：Windows缺实机。
- **未测**：实际日常Chrome冷启动/重启、实际Profile撤销/卸载；完整首次LLM探索→编译→发布；iframe/popup/下载；根级全量测试。

实际Profile入口（停止任务，释放闲置连接并恢复daily后，在实际checkout根目录执行）：

```sh
BAT_SAVED_DAILY_PROOF=1 BROWSER_USE_SETUP_LOGGING=false ANONYMIZED_TELEMETRY=false \
  node --import tsx apps/api/tests/fixtures/daily-chrome-playwright-relay.ts
```

退出0，安全结果如下；不是伪造产品任务或修改发布图：

```json
{"dailyProfileAcceptance":true,"status":"passed","savedAuthorizationReused":true,"runtime":"LangGraph","replayRuns":1,"modelCalls":0,"auditComplete":true,"cleanup":"confirmed"}
```

来源/补丁：`vendor/daily-chrome-extension/extension/manifest.json`、`UPSTREAM.json`；Chrome官方入口与Reuse Assessment见RESEARCH最新节。原始证据均ignored：`redirect-manifest-red.log`、`redirect-chromium134-green.log`、`redirect-chrome145-red.log`、`real-daily-chrome154-runtime-busy-first.log`、`real-daily-chrome154-runtime.log`和工作台截图`real-daily-chrome154-authorization.jpg`（均在work/daily-chrome-p0）。原真实运行、模型审计与清理分别读取SQLite的taskExecutions、taskContracts和taskExecutionCleanupAudits，不输出敏感页面或凭据。
