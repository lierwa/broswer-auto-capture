# 检测盾：真人中文输入、服务端验证与验收结算

> 后续修正见[原生输入上下文结算](SHIELD_INPUT_CONTEXT_CLOSEOUT_20261011.md)：本页 35 clear/1 advisory/3 excluded 是当时真实回执；当前同一真人原数据为36 clear/0 advisory/3 excluded，原始信任位没有改写。新采集 B-A-T/原生 IME 同流程39 clear；保留本文首败与当时状态，不把历史回执改成首遍通过。用户后续重新授权完成后关机，旧“不关机”只表示本页形成时边界。

日期：2026-10-11。当前 checkout 为 master@dc45be4，全部原有改动保留，没有提交、推送或创建 worktree。网站入口：https://localhost:4185/measurement/check。原五个所属服务保留运行。

## 实际结果

真人和 B-A-T 都输入 `Today feels like a good day.` 与 `今天适合出去走走。`，滚动阅读区后提交。结果、检测项与 JSON 保持同页，不增加报告对照或访客 HTTPS 配置。

| 样本 | 实际结论 | 原规则与完成证据 |
| --- | --- | --- |
| 用户亲自操作，无 CDP、无程序输入，Windows 中文输入法 | Human，页面“真人 · 本次验证通过” | 原挑战 score=0，保护请求成功，35 clear/1 advisory/3 excluded，无 flagged/failed/pending |
| B-A-T ManagedWindow + OrdinaryCapability，同样中英文与滚动提交 | Human，普通模型调用 0 | 原挑战 score=0，保护请求成功，36 clear/3 excluded，DOM JSON 与服务端结果一致 |
| 原标准 Playwright channel=chrome，无头，同样中英文与滚动提交 | Bot | BotD 原 AppVersion/UserAgent/WebDriver 阳性；原挑战 score=500，被原 balanced >=75 拒绝 |

真人 run 为 `726e210d-169a-48c8-aea0-d8bac5e984e1`，B-A-T 首次成功为 `dc7a4ca3-1bf6-4de5-a5c8-62c2933f6535`，最后成功为 `84c23df6-e10b-4601-9b75-b38fb62a29d6`。最终重新读取这三次服务端报告均为 Human、transportFailed=false、timedOut=false。不是将失败回执替换成成功。

B-A-T 中文使用原普通输入能力；独立原生 Chrome IME 取消、提交和结束释放另行验证。B-A-T 没有被称为物理真人，也没有把自动 Unicode 输入冒称 Windows 输入法操作。这里的 Human 表示这次检测验证通过；原检测器允许 B-A-T 通过的能力保留，不保证识别所有自动化。

非敏感证据根为 `work/antibot-service/reports/`：

- [真人提交报告](../../work/antibot-service/reports/shield-verification-20261011/manual-submitted.json)、[最终服务端报告](../../work/antibot-service/reports/shield-verification-20261011/manual-final-api.json)、[用户完成确认](../../work/antibot-service/reports/shield-verification-20261011/manual-user-confirmation.json)。真人 watcher 后续维护期间失败的文件另列，不拿被写成 null 的 manual-report.json 作通过证据。
- [最后 B-A-T 结果](../../work/antibot-service/reports/verified-flow-46jdo7rl/result.json)、[完整同页报告](../../work/antibot-service/reports/verified-flow-46jdo7rl/bilingual-report.json)、[DOM/输入内容一致性](../../work/antibot-service/reports/verified-flow-46jdo7rl/input-match.json)。只保存公开夹具是否匹配，不存原输入内容。
- [无头对照结果](../../work/antibot-service/reports/shield-verification-20261011/reverse-result.json)、[原引擎拒绝记录投影](../../work/antibot-service/reports/shield-verification-20261011/reverse-engine-proof.json)。挑战响应 HTTP 200 内的 rejected 不算通过。

## 为什么真人之前 unknown，以及 B-A-T 中途为什么失败

旧网站把所有检测阴性直接组合为 Human，但中文 IME 导致三项逐键节奏不适用、辅助 compositionend 非原生后，又把它们当作整体没有足够依据。既没有真实服务端验证作为依据，也没有按原检测器适用范围区分证据。此次保留 excluded/advisory 和原五类强脚本阳性，以本 run 实际原挑战验证、保护请求和完整流程作为完成依据；没有把 excluded 改成 clear，也没有降阈值。

B-A-T 在首次成功后的复验出现两次真实失败：`verified-flow-4bjm_8xq` 命中 BotD 窗口标记，输入随后报 ordinary_event_target_unverified；`verified-flow-ttubfv5e` 完成全部输入后仍因原窗口标记判 Bot。失败前的页面 hidden=true，而原生窗口 bounds 为 normal；只等待非零尺寸没有解决问题，因此这段窗口恢复/等待代码已删除。

当时验收脚本用底层 Page.goto 打开检测页，绕过产品普通导航。最后一轮激活本次所属页面，并通过原 OrdinaryCapability 的 navigate 进入，采集前、中、后的尺寸均为 1265×1372，hidden=false、focus=true；原 BotD 不再命中，完整流程为 Human。此为验收路径纠正，没有修改 B-A-T 公共控制源码、JS 属性或原检测器。匿名诊断代码在取证后已移除；验收入口只保留所属页面激活、原普通导航及可见状态检查，不恢复窗口或添加隐式动作重试。

[BotD 2.0.0 原窗口检测](https://raw.githubusercontent.com/fingerprintjs/BotD/v2.0.0/src/detectors/window_size.ts) 本来就检查 documentFocus 和 0×0 outer size。旧失败没有记录全部组件的瞬间取值，因此不能把未记录的内部时序说成已完整复现；可证明的是失败前后台状态、原命中、绕过普通导航及纠正后成功。两个失败目录继续保留，不能宣称所有尝试一次通过，也不外推所有桌面状态都不会触发上游误报。

之前反复开关窗口、没有及时固定验收路径，是本次执行问题；现在不再创建新的验收窗口，不重复用户真人输入。

## 实际改动与复用边界

复用 CrowdSec 1.8.1 原挑战、PoW、签名、sealed cookie、fpscanner、balanced 评分与原 bouncer；在原 terminal RejectSubmission 后追加原公开 LogAccepted 审计。原 Hub 文件不覆盖；owned 配置别名生成的副本保留完整原拒绝规则。原引擎已有上一阶段 SQLite 防重放补丁，本轮没有重新改引擎或声称整台引擎完全没有历史补丁。

每次检测使用新的 `<run>.shield.localhost` 域名、run/page 和原 SQLite 事实。本次服务器只接受精确 run/host、非 allowlisted、原分数 <75 的接受审计，加上经原 bouncer 验证的保护请求。客户端 verification 字段、iframe load/postMessage、全局接受次数、以前的 Cookie 或全阴性结果均不能授予 Human。刷新/重访旧 URL 创建新 run，历史事实不改写。

中英文输入只传字符数量与原生 input 计数，另记录组合是否结束、阅读滚动与实际提交。必要自动测量必须完整；原强阳性锁存为 Bot，丢失、无效或实际采集失败保留 Unknown。后续阴性不能覆盖失败。服务器 25 秒自动测量限时不再把真人已经完成自动测量后的输入时间算成测量超时。

本轮没有新增检测库、模型训练、评分特判或 B-A-T 专用豁免。公共执行器、vendor、rules.ts、cadence.ts、behavior.ts 和原固定探针摘要均在本轮基线保护范围内未变。B-A-T 侧仅修两处验收收尾缺口：cleanup helper 使用现有 workflow-use 的 PYTHONPATH，Windows 长路径用标准扩展绝对路径处理，保留原 owner/link/PID 校验。

原评分 SHA256：`1df45760daed492ee1d05a86f37064519b09e9e45fa4cb911f255ae2342e8d8a`；原 balanced SHA256：`fa54cfda9b864b02fe148760b30d25167ed7771859d55d4169eb67201ac8ada4`。最终[规则审计](../../work/antibot-service/reports/shield-verification-20261011/rules-audit.json)确认摘要、原规则保留、审计位于拒绝后，无新 grant/exemption/AddRequestScore。

## HTTPS 修复

不安全警告不是“已经安装根信任就没问题”。旧 `*.localhost` 不满足真实会话域严格主机名匹配；本轮承认并修复该签发错误。继续复用 mkcert 1.4.4 与既有当前用户 CA，签发 localhost、shield.localhost、`*.shield.localhost`、127.0.0.1、::1，新增严格会话主机名检查。所有实际浏览器验收未使用忽略证书或 SPKI 例外。

最终 Windows CurrentUser ROOT 信任仍在，严格 Node TLS 的真人/B-A-T 会话报告读取成功；Chrome 在 factory 和实际会话域返回 securityState=secure，见[实际浏览器 TLS](../../work/antibot-service/reports/verified-flow-46jdo7rl/browser-tls.json)、[根信任](../../work/antibot-service/reports/shield-verification-20261011/windows-root-audit.json)。CA 私钥留本机 AppData，不进入服务数据、证据或 Git；owned 证书/config 备份仅作为回退资源保留。公网和别的机器没有验收。

## 验证、首次失败与资源

- 聚焦逻辑测试累计 23 项通过；后续采集失败锁存改动另验证受影响 9 项。本轮最后子包 tsc、JS 语法和三份当前 verification Python AST 检查通过；没有运行根级/全量测试。IME 提交、取消、尾部释放和旧通行 Cookie 对新 run 的 409 见 [IME 验收](../../work/antibot-service/reports/verified-ime-qip8f260/result.json)。
- [HTTP 12 项反向验收](../../work/antibot-service/reports/verified-http-mEmwt8/result.json)覆盖原五类脚本事件及阳性锁存、客户端假验证、跨会话读写、丢失、未完成组合输入、倒退时间、伪造 gateway header 和真实已通过访问之后的采集失败锁存。[重访独立 run](../../work/antibot-service/reports/shield-verification-20261011/revisit.json)另作定点验证。IME 成功 run 随后被故意注入失败作为反向控制，最终 Unknown 正是预期，不能把前后时点混作一次成功。
- [原冻结业务复跑](../../work/antibot-service/product-shield-verification-20261011/resume-proof.json)通过，动态输出 7、普通模型 0、未重新准备/编译。此次为既有 HTTP 业务样本，未重跑完整 TLS 业务或其它变体。首次 cleanup 因 PYTHONPATH 缺现有 vendor、后续因 Windows MAX_PATH 失败；只修收尾并重试收尾，没有重跑已通过业务。[最终 cleanup](../../work/antibot-service/product-shield-verification-20261011/resume-profile-cleanup.json)确认永久删除、进程 0。
- TLS 错域、验收 allowed_domains、读取 API 的夹具、窗口标记与事件归属、真人 watcher 在已提交后维护期间异常等首败均保留。真人 watcher 失败没有触发重复真人输入，manual-submitted/result 仍有效；最后服务器读回确认真实结论。各失败不可用之后的成功覆盖。
- 最终[资源审计](../../work/antibot-service/reports/shield-verification-20261011/resource-audit.json)核对本轮 12 个精确 owned Profile：目录全部不存在、对应进程全部 0；各原生命周期 close/deleted 回执保留，临时目录是永久删除，不是移到回收站。原五个所属生产服务 active、PID>0、WorkingDirectory 匹配此 checkout 的实例。报告、原 SQLite 事实与回退备份保留，不宣称整个 work 已删除。
- [既有改动保护](../../work/antibot-service/reports/shield-verification-20261011/preservation-audit.json)逐项比较开始时 1348 个文件摘要，缺失 0；变化均为本包允许的适配、验收和文档文件，其它旧文件字节不变。分支和 HEAD 保持 master@dc45be4。

未测：其他输入法/浏览器/桌面状态、独立真人人群误报率、外站新一轮流程、完整 TLS 业务复跑、其他业务变体、公网部署和新机器系统信任。先前 BrowserScan/Pixelscan 的 B-A-T 通过记录不拿本轮本地结果替代。
