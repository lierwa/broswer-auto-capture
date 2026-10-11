# 检测盾输入法采集：根因、最小修复与验收

日期：2026-10-11。master@dc45be4f07fd2e9c4a425c0d257e8b1aaef8ed80，1358文件基线核验。当前结论：**采集错配已修复；真实Windows同流程通过，用户修后独立操作的两次真人检测均Human/39clear，三项逐字段有效。** 不提交、推送、创建worktree、测试京东或关机。

## 真人失败的真实原因

用户第三次在自己的Chrome完成中英文、滚动和提交，run `d52566be-788d-47c4-8f47-8810443f0031` 为unknown/38clear/1failed。原挑战和保护请求接受、score0；英文34个down及34个hold，中文33/33，均无pending。不是没有输入样本，错误在自有采集器。

两个字段的首错配都发生在原生Control操作后：英文为Control的229/普通down、compositionend(false)、Control的229/普通up、另一匿名键up；中文为普通Control down/up、同一匿名键up，没有该键down。最多32个匿名事件保留真实时刻与同键关系，不保存键值或输入文本。

本机Win32扫描码Ctrl+Space实测 `windows-ime-flow-cm0anw0d` 重现相同链，并确认孤立释放为Space：Windows输入法消费Space down，页面仍收到Space up。组合开启、关闭时均能发生；正确双语、英文29/29与中文28/28，但旧采集器仍给unknown。ImmGetHotKey(0x10)读回本机切换键Control+Space（modifiers49154、virtualKey32）。这是原生系统行为，不是compositionend伪造或真人异常。

此前另一个已证实缺陷为Tab跨框：英文收到down，中文或其它目标收到up；按新target分桶造成英文pending、中文错配。[UI Events允许Tab事件目标变化](https://www.w3.org/TR/uievents/#events-keyboardevent-event-order)。Windows事件实测6puqkn85及原时刻回放35/35+28/28另有证据。

## 最终代码方案

- 保留Kitsune f0a22b3间隔/熵函数、FCaptcha 1.43.0/56aa2b38 hold函数及原阈值。两字段独立计算，阳性/错误不被另一字段阴性覆盖。
- keyup归唯一实际keydown字段；229及附带普通释放凭真实键身份配对，额外释放只消费一次，不猜时间、不用组合结束时刻造hold。
- 只识别可信Space释放与实际Control按住或紧邻释放的快捷键证据，单次消费，普通真实键对先正常配对。Control释放后的候选遇其它键或焦点变化失效。无Control、错误键、重复、非原生、陈旧释放仍invalid；快捷键不产生down/hold样本。
- composition、粘贴、焦点只作上下文，原信任位不改；原脚本五类输入、全页粘贴门、至少10完整真实键对、时钟/长度/计数检查与传输失败锁存保留。
- Human仍需本次原挑战、保护请求、allowlisted=false与所声明流程完成；没有把未命中异常当真人。balanced>=75、评分YAML和固定源码SHA不变。

[IME切换标识](https://learn.microsoft.com/en-us/windows/win32/intl/ime-hot-key-identifiers)和[Chromium TSF Process派发源码](https://raw.githubusercontent.com/chromium/chromium/main/ui/base/ime/win/tsf_text_store.cc)提供机制依据；上游main不冒称本机二进制同版，本机事件为行为证据。无新依赖、第二套检测算法或B-A-T公共runtime改动。

## 实际结果

| 证据 | 结果与边界 |
| --- | --- |
| [第三次真人原报告](../../work/antibot-service/reports/shield-ime-physical-20261011/manual-third-failed-report.json) | unknown；34/34+33/33，首错配为快捷键释放，原失败未改写 |
| [同一次真人首错配回放](../../work/antibot-service/reports/shield-ime-physical-20261011/person-root-replay.json) | 两片段invalid=false、pending0，5及6个真实键对时刻/hold与原报告前缀完全一致；仅回放首错配片段，匿名同键关系保留，Space由同构Windows复现确认，不冒称完整事件重建或新真人运行 |
| [修前Windows同流程](../../work/antibot-service/reports/windows-ime-flow-cm0anw0d/bilingual-report.json) | unknown；正确双语29/29+28/28，真实OS拼音与Ctrl+Space/Tab，复现旧错误 |
| [修后B-A-T结果](../../work/antibot-service/reports/windows-ime-flow-ofx95jlz/result.json)与[原报告](../../work/antibot-service/reports/windows-ime-flow-ofx95jlz/bilingual-report.json) | Human/39clear，29/29+28/28键对，三项逐字段有效；原ManagedWindow/OrdinaryCapability、Win32扫描码、实际Windows候选字、Ctrl+Space/Tab、阅读区滚动及原普通点击提交，模型0、JSON/API一致、TLS secure |
| [随后脚本反向](../../work/antibot-service/reports/windows-ime-flow-ofx95jlz/script-input-positive.json) | 同一修后run派发脚本input，Bot/input:trusted，强阳性没有放掉 |
| [真实原生错配控制](../../work/antibot-service/reports/windows-ime-flow-j5f4y1e6/unmatched-native-release.json) | 真实双语后CDP控制KeyB up无down，unknown/hold failed/transportFailed=false；非硬件真人错误。该次提交随后watchdog失败，不算完整任务通过；最终聚焦回归确认错误门仍有效 |
| [修后真人完整双语](../../work/antibot-service/reports/shield-ime-physical-20261011/manual-fourth-passed-result.json) | 用户自己的Chrome实际操作，63cfda00，Human/39clear；英文38/38、中文24/24，三项逐字段valid=true/clear，原挑战/保护请求接受且无allowlist；英文普通键、中文Windows输入法 |
| [随后真人独立操作](../../work/antibot-service/reports/shield-ime-physical-20261011/manual-latest-passed-result.json) | aba3de64，Human/39clear；两字段16/16真实键对、三项有效，已滚动/提交，原挑战/保护请求接受；未连接或控制用户Chrome |

第一次3a551066、第二次ce9bac11真人原报告保留，第二次原英文熵阳性未消除。没有再次要求用户重输，没有连接或控制用户Chrome，没有预设汉字冒充Windows候选字。29项聚焦、子包类型、JS与Python语法检查通过；Ctrl+Space新增回归修前先失败。回归覆盖Tab归属、错误/重复/无Control/非原生/陈旧释放、缺hold、时钟和数值损坏、两字段阳性保留与原快速/脚本强阳性。

## 删除、资源与未测

删除本包错误的 `ime.acceptance.py`、`verification-native-ime.acceptance.py`、`verification-ime-reverse.acceptance.py`，删除Windows夹具Chrome insertText/预设汉字及旧排除分支。最终Windows入口为 `verification-windows-ime.acceptance.py`；原有效协议反向检查和成熟组件保留，没有重写浏览器、输入法或生命周期框架。

精确34份Profile已关闭并永久删除，所属进程0、注册临时目录0；最新IME原模式精确恢复，五个生产服务保留，可信HTTPS已核验。两次新窗口在按键前因前台归属检查失败，原记录保留，没有向其它窗口发键。证据见[资源审计](../../work/antibot-service/reports/shield-ime-physical-20261011/cleanup-audit.json)、[旧字节与规则保护](../../work/antibot-service/reports/shield-ime-physical-20261011/preservation-audit.json)、[最终结算](../../work/antibot-service/reports/shield-ime-physical-20261011/validation.json)。

修后独立真人已由用户自行完成，服务端原回执核验通过。未验证广泛输入法/人群误报率、外站或完整TLS业务；本次B-A-T正式业务任务另行记录，不覆盖原历史证据。
