# Windows 日常 Chrome 测试交接 · 2026-10-02

本次先验三件事：日常 Chrome 一次授权后可复用；失败后能再次运行且旧原因保留；三种环境选择沿用已有链路。Windows 尚未实机验收，下面每项初始状态均为「未测」。macOS 已完成原 GitHub V5 普通复跑、0模型、清理确认，以及刷新后查看旧失败；不能据此标记 Windows 通过。

## 1. 先把代码和扩展准备好

使用家里现有 checkout 和现有 master；以下命令都在该 checkout 根目录执行。先正常停止本项目开发服务、结束活动任务。若本地有改动或不在 master，不覆盖或重置它，先处理本地差异再更新。

PowerShell：

```powershell
git status --short --branch
git pull --ff-only origin master
git log -1 --format="%H %s"
node --version
npm.cmd --version

npm.cmd run setup
node scripts/build-daily-chrome-extension.mjs --prepare-tools
npm.cmd run dev
```

前提为 Node.js 24+、npm 11+、正常安装的 Google Chrome。使用 npm.cmd 可避免 npm.ps1 被 PowerShell 执行策略拦截，无需更改执行策略。setup 已包含 Node 依赖、项目自带 uv 与 Python 3.12、固定 B-U/W-U runner；不需要自己安装 Python、Playwright 浏览器或整套 BrowserSkill。首次安装需要 npm、Astral/GitHub 与 Python 包源网络。

扩展构建会下载固定微软源码并校验摘要，再沿原 Vite 构建；输出必须出现：`B-A-T unpacked extension: work/daily-chrome-extension/extension`。加载的是该完整目录，里面有 manifest.json；不要加载 vendor 中的源码目录。固定身份为 `egiggbcomooebckhjcimllnoediapped`，名称「B-A-T 日常 Chrome」。来源/许可由包内 UPSTREAM.json、LICENSE 与 THIRD_PARTY_LICENSES.txt 保留。

工作台默认 `http://127.0.0.1:4173/`，API 默认4175；若终端打印其它端口，用实际打印值。如果 setup 或构建失败，先保留该命令、错误与退出码，记为安装/构建失败，尚未开始浏览器验收。

## 2. 你必须手动做的首次授权：加载一次、允许一次

1. 在你要绑定的**日常 Chrome 用户窗口**中打开 `chrome://extensions`，开启开发者模式，点「加载已解压的扩展程序」，选 `<你的 checkout>\work\daily-chrome-extension\extension`。已装本扩展时更新同一目录，再在原卡片点一次重新加载。
2. 工作台「浏览器环境」选「日常 Chrome」，首次授权界面选择同一 Chrome 用户，点「授权并连接」。实际 Windows 用户名称可能和 Mac 的「用户1」不同，以本机为准。
3. 在自动打开的扩展页面点一次「允许并保存授权」。回工作台应显示「已授权」、所选 Chrome 用户及「已连接」。**不需要复制或粘贴授权码。**

Windows 首次授权独立于 Mac；Git 不包含本机的 data/work、授权、模型账号、任务库或 Chrome Profile。不要把 Mac 的 auth.json、Cookie、Profile、整个 data 目录复制到 Windows。后续刷新、连接和普通运行复用 Windows 已保存的授权；不要为了验证持久化再次授权。

## 3. 没有旧任务也能先验证：现成的零模型入口

这台 Windows 可能没有 Mac 上的 GitHub V5。不要把「拉代码后没有任务」当作扩展失败，也不要为跑通连接先重新让模型编译任务。可以直接使用已有的 saved daily 验收夹具：它消费 Windows 已保存授权，经实际 B-U/W-U/LangGraph 执行一个本机公开合成页导航，创建并释放自己的任务窗口；不配对、不撤销、不改已发布任务。

先在开发服务终端按 Ctrl+C **正常停止 B-A-T 服务**，保持日常 Chrome 打开。确认没有活动任务，不让夹具与工作台同时占用控制会话。在同一 checkout 根目录的 PowerShell 中运行：

```powershell
$env:BAT_SAVED_DAILY_PROOF = '1'
$env:BROWSER_USE_SETUP_LOGGING = 'false'
$env:ANONYMIZED_TELEMETRY = 'false'
node --import tsx apps/api/tests/fixtures/daily-chrome-playwright-relay.ts
$batDailyProbeExit = $LASTEXITCODE
Remove-Item Env:BAT_SAVED_DAILY_PROOF
Write-Output "daily probe exit=$batDailyProbeExit"
```

通过必须同时满足：exit=0；最终 JSON 的 `dailyProfileAcceptance=true`、`status=passed`、`savedAuthorizationReused=true`、`runtime=LangGraph`、`modelCalls=0`、`auditComplete=true`、`cleanup=confirmed`。个人窗口/标签仍在，只有夹具任务窗口被回收。它证明连接与普通运行消费者，不代表 GitHub 任务或画布交互已通过。

此现成夹具读取默认 `data`；如果工作台使用自定义 BROWSER_CAPTURE_DATA_DIRECTORY，不运行此夹具，改用工作台已有任务验收，不通过复制授权文件迁就夹具。执行结束后 `npm.cmd run dev` 恢复工作台。

## 4. 按这个顺序做界面验收

| 编号 | 怎么测 | 通过标准 | 当前结论 |
| --- | --- | --- | --- |
| W01 首次安装/授权 | 按第1、2节操作 | 指定日常用户加载成功；一次允许自动保存，不粘码；显示已授权/已连接 | 未测 |
| W02 页面刷新 | 刷新工作台、重新打开浏览器环境 | Chrome用户和已授权保留；未连接可直接连接，不再首次授权 | 未测 |
| W03 空闲与服务重启 | 连接后不运行任务等至少3分钟；读取状态。再正常停/启服务并点连接 | 空闲仍连接；服务重启后保存授权可直接复用。服务停止期间未连接属于正常状态 | 未测 |
| W04 普通运行/窗口隔离 | 第3节夹具，或运行本机已有的已发布任务 | 运行在指定日常用户的任务窗口；日常标签不受控；资源释放确认；普通节点0模型 | 未测 |
| W05 成功后复跑 | 在已发布画布「再次运行」→「开始运行」 | 按钮可用；独立新记录；原版本不变；不要求手动清理 | 未测 |
| W06 失败原因与再跑 | 用一项只读测试任务；运行中手动关闭**任务新开的那个专属窗口**，保留其它日常窗口及扩展。回工作台查看失败，再点再次运行 | 本次失败可查看原因；系统处理资源释放，有同owner关闭证据后可再次运行；新旧记录独立，刷新及历史仍能查看旧原因 | 未测 |
| W07 三种环境 | 无活动任务时依次选日常/专属可见/专属无头，运行同一已有发布版本 | 实际环境与记录一致；可见/无头符合选择；日常授权保留；切换不要求链路重新验证/重新发布 | 未测 |
| W08 Chrome原本关闭时 | 仅在你日常Chrome本来关闭时点连接或运行；无需为了测试关闭全部个人窗口 | 自动打开绑定用户；授权复用；不会复制Profile | 未测 |
| W09 撤销 | 最后、无活动任务时，在授权管理点撤销 | 控制连接立即结束；工作台变为未授权；个人Chrome仍保留；需继续测时重新允许一次 | 未测 |

W05–W07 需要本机已有发布任务；没有时先完成 W01–W04。要验完整画布，可从正常需求对话准备一个只读公开网页任务并发布；**首次准备会调用所选模型，与普通复跑的0模型要求分开记账**。这台机器没有 Mac 的 V5 时，将对应「原V5跨机器复跑」记为样本缺失阻塞，不能冒充同一版本通过；本次交接未提供原V5的跨机器导入包，不新增脚本直接写库或复制整库。

Mac 原样本仅供对照：任务「获取第二页首个 Issue 详情」；发布V5 `8f89a965-4c31-4aef-8a1d-07df46d98864`；digest `5992e25012e152670305919cbef307fc549d2882a8836c53518424db571a2fe6`。其真实完成记录20次链路推进、23次浏览器动作、0模型、清理确认。Windows 的新任务不能以不同版本/输入冒充这个样本。

W06 是受控失败验证，只关这一项测试任务的窗口。若失败后释放未确认、再次运行仍受阻，记录为失败，保留首次记录；不要删租约/库、清缓存、换Profile、自动修复链路或重复模型探索来掩盖。真正创建已派发但回执未知的断线场景没有新增恢复机制，应保留不确定性；不以新连接空列表伪报释放。

## 5. 失败时发回这些信息即可

每测一项记录一项「通过/失败/阻塞/未测」。最小反馈：

```text
源码提交：git log -1 的 SHA
Windows/架构、Node/npm/Chrome版本：
用例：Wxx
操作：
实际现象与第一条错误：
预期现象：
任务名、开始时间、发布版本（若有）：
再次运行按钮是否可点：
旧失败原因能否在历史查看：
授权：已授权/未授权；连接：已连接/未连接；绑定Chrome用户：
结论：通过/失败/阻塞/未测
截图或已脱敏的终端末段：
```

可选的授权状态取证是公开 GET，不返回 token；把4175换成实际API端口：

```powershell
Invoke-RestMethod 'http://127.0.0.1:4175/api/browser/daily-chrome' |
  Select-Object paired, connected, busy, profileDirectory |
  ConvertTo-Json
```

保留第一条错误和旧运行时间；不要只报「点了没用」或用后来的成功覆盖第一次失败。不发送授权码、auth.json、Profile内容、Cookie、模型凭据、原始敏感网页或带token的完整扩展URL；截图先隐藏私人内容。

## 6. 给 Windows 上继续处理的开发会话

先读 AGENTS.md、本交接、PROGRESS/RESEARCH最新节、DAILY_CHROME_EXTENSION_DEVELOPMENT.md、ADR0013和CONTEXT，再核对实际HEAD、工作区、这台机器的数据目录与活动任务。默认只读建立Windows现场基线；如果用户授权修复，留在现有checkout/分支，不建分支/worktree、不改相邻项目，不覆盖本机改动。

沿原 browser-use/workflow-use/LangGraph、微软受管扩展与原 owner 释放合同定位，不能混回整套BrowserSkill、自造驱动/授权/恢复状态机；普通复跑仅显式LLM节点可调用模型。遇到确需产品/架构取舍的冲突，先给固定源码与真实反例。Windows一项通过不代表其它项或全部功能通过。

本交接只做固定入口、现有源码与既有证据核对；发布前不重复运行上轮已通过的47项TS、10项Python及所属类型检查。Windows结论由本机真实测试补齐。
