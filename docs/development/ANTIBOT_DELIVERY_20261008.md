# 本轮反爬交付：浏览器控制与网站侧验证

**后续范围说明：** 本文保留上一轮 CDP/控制与服务的局部交付事实，代码快照为 `e92b1d2`。用户已确认新方案并授权实施；当前事实见[实施记录](ANTIBOT_IMPLEMENTATION_20261008.md)和[覆盖矩阵](ANTIBOT_COVERAGE_BACKLOG_20261008.md)。本文旧阶段范围不再限制新计划，不能用本页历史交付替代整体反爬验收。

2026-10-08，master@4304981 的未提交工作区。按用户最后指令，重点收敛为 **B-A-T 底层浏览器控制的可观察差异**；停止扩展任务链编译与页面美化。保留 browser-use，没有创建 worktree、提交或推送。

## 交付结果

| 同一日常 Chrome、同一原始检测规则 | 改造前控制代码 | 改造后控制代码 |
| --- | --- | --- |
| CrowdSec 独立新域名挑战 | 3 轮 | 3 轮 |
| 网站侧拒绝 | 3/3，均为 CDP 信号、100 分 | 0/3，官方计数确认每轮挑战 accepted/solved |
| 到达业务页并读取、点击 | 0/3，被检测挡住 | 3/3，分别选中版本 7、11、13 |
| 普通控制调用模型 | 0 | 0 |
| 自有测试资源关闭 | 3/3 confirmed | 3/3 confirmed |

阈值保持原始 balanced 的 `>=75`；没有本机客户端白名单。候选通过后的精确分数未由 info 日志公开，**不能填成 0 分**。每轮使用独立 `.localhost` 域名，避免此前人工访问获取的通行 Cookie 污染结果。两组使用同一现行 owner-scoped relay；参考组在独立测试进程加载 4304981 的原 NativeEventCapture 和 B-U 原 Browser，不代表把整个 checkout 回滚到旧提交。

此前 fpscanner 与独立 Brotector 的日常浏览器前后对照也分别为 3/3 命中 → 0/3，见 [W3 证据](ANTIBOT_W3_EVENT_CAPTURE_20261007.md)。本轮新增的是**独立网站真正发起挑战、拒绝旧控制、接纳新控制**的运行证据。

## 产品代码交付

1. `apps/api/python/browser_use_runner/task_browser.py`：通过 B-U Page 已有 `session_id` 参数复用其管理的 CDP 会话，减少 Actor 额外 attach / Runtime 订阅。三个原启动入口共用适配，保留原生浏览器动作。
2. `vendor/workflow-use/workflows/workflow_use/hybrid/native_event_capture.py`：事件采集使用 Chromium isolated world 与指定上下文的原生 binding，不把采集状态挂到页面主上下文，不开启额外共享 Runtime 事件流。真实事件、frame/target 归属与 finally 收尾仍保留。
3. `vendor/daily-chrome-extension/browserModel.ts`：把原生查询得到的真实 URL/title 变化按标准 Target 事件通知同一 owner，修复取消重复 attach 后暴露的 B-U 缓存停在 about:blank 问题。

没有更换 browser-use、重写控制器、伪造 webdriver 或增加隐式模型调用。上游固定来源与既有组件验证见 W3 记录。

## 独立检测服务

源码位于 `tools/antibot-lab/`，使用现有 WSL Ubuntu 中工作区内的 CrowdSec 1.8.1、固定 Hub、Traefik 3.7.14、固定 bouncer 1.8.0-alpha。**不需要 Docker Desktop**。原生引擎拥有评分、挑战、PoW 和请求规则；项目只适配启动、合成目标站及脱敏记录。

电脑重新开机后，在仓库根目录执行：

```powershell
npm run antibot:lab -- start
```

也可双击 `tools/antibot-lab/start.cmd`。启动命令等待管理接口和网关就绪；不会打开浏览器。然后访问 [观测入口](http://127.0.0.1:4188)，创建场景，将新场景网址交给 B-A-T。受保护网站端口为 4187，4189 源站不能直接访问。

```powershell
npm run antibot:lab -- status
npm run antibot:lab -- stop
```

首次重建便携环境使用 `npm run antibot:lab -- prepare`，必须先停止本实验服务。固定发行制品及 SHA256 见 `artifacts.json`；Hub 内容固定，Hub 外部数据集本次下载摘要保留在 `work/antibot-service/dataset-manifest.json`，不是声称那些上游动态数据 URL 永久不变。

本次真实 stop/start 后，10 个场景、9 条业务记录、4 条拒绝记录均保留。引擎的内存计数按上游行为在重启时归零，历史日志与业务数据库保留。服务独立于单次测试，不随测试结束退出；本次关机收尾时会主动停止，**没有安装 Windows 开机自启动**。B-A-T 本身重新启动后加载此次源码；没有绕过此前工具策略拒绝去重启旧 API。

## 证据与限制

本地忽略目录 `work/antibot-service/` 内：

- `comparison.json`：可读汇总。
- `control-reference-oC38an/`、`control-candidate-cG3Z28/`：每轮请求、官方指标前后差、业务记录、零模型审计、cleanup。
- `positive-3v1n0wzt/proof.json`：已知无头自动化正例被拒绝，450 分；它只证明检测器能拒绝正例，不当作日常浏览器改造前基线。
- `restart-proof.json`：服务重启与持久化。
- `shutdown-readiness.json`：关机前最终资源与交付核验；关机命令返回值另记。

必要验证：API 包类型检查、实验工具类型检查、六轮真实日常对照、服务重启持久化、受管源码摘要及差异检查。W3 原有输入、导航、iframe/OOPIF/shadow 组件验证仍有效；没有运行根级/全量测试。

首败保留：第一次参考启动 `control-reference-OtqCpS` 在进入检测前 RuntimeError，根因未确定，不能算检测拒绝；增加只含栈位置的诊断后参考三轮通过。第一次候选 `control-candidate-iUOe4O` 已通过挑战，但测试读取规格漏填 valueType，修正测试后重跑三轮。此前 `product-C2IwfJ` 的完整链路编译因候选读取证据缺失失败；按用户最后指令不继续扩建这条非重点路径，也不把本轮控制验证声称为那次链路已修好。

未测试京东、淘宝或商用 WAF，未取得 TLS/JA4、账号风险、长期频率风控或所有检测机制不可识别的结论。当前检测器 bot 功能与 bouncer 组合含 Alpha 能力，本地验证有效不等于生产兼容承诺。后续改造必须由新的明确检测信号触发，不提前铺开 W1–W5。

个人 Profile 和个人标签没有被实验清理。已知 headless 正例临时 Profile 永久删除；便携运行时、业务数据和证据按交付需要保留。此前 Docker 残留目录仅改名保留，未永久删除，详见 [服务实施记录](ANTIBOT_SERVICE_IMPLEMENTATION_20261008.md)。
