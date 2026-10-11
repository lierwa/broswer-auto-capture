# 检测盾暗色 V3 网站交付

用户最新授权：按已讨论原型完成真实检测盾网站。master@dc45be4 保留所有原有工作；本轮不提交/推送、不创建 worktree、不访问京东、不关机，不重开模型研究。

## 网站与使用

当前服务保留运行，可直接打开 **https://localhost:4185/measurement/check**。日后在实际项目根目录运行 `npm --prefix tools/antibot-lab start`。已配置实例无需重新 prepare 或证书配置；本机信任维护命令在包 README。

- 暗色 V3 原型落地：SHIELD 品牌、醒目的 Bot/Human/未知结论、原创点阵扫描/变形/收束动画。无报告对照、原型场景选择器或访客 HTTPS 配置流程。
- 自动检测 34 项；交互区补充输入、阅读区滚动和提交，增加 5 项行为检测。所有 39 项结果始终在同页 DOM/JSON，行为不足明确等待，不用切报告页。导出内容含原判据、依据、状态、运行归属和覆盖限制。
- 回执按 page/batch 归属及去重，阳性锁存。未知输出/测量缺失不算阴性；失败、排除、丢失保持显式。节奏弱线索不单独判 Bot；Human 只表示本次已测信号未命中，不是身份认证或完整盾放行。
- 交互提交等待本页实际批次确认，不靠动画或固定计时产生结果。采集器在 capture 阶段记录阅读区内部 scroll，继续复用原行为函数/阈值；键盘切换模式不再派发程序 click，避免自己制造 untrusted 阳性。未改变原检测引擎、评分、JS/PoW、预算或挑战数据库。
- 结构化入口：`globalThis.__batCheckReport`、`script#shield-report[type=application/json]`；`#report` 的 data-status/data-verdict/data-run-id。报告 schema/version=2；phase 为 running/waiting_interaction/complete/failed，verdict 为 pending/human/bot/unknown；兼容原总体 status 的 clear/detected/unavailable/pending 表达，逐项状态更明确。

## HTTPS 实际解决

复用 mkcert 1.4.4 固定官方 binary，Windows 当前用户 ROOT 已安装本机 CA；叶证书涵盖 localhost、*.localhost、127.0.0.1 和 ::1，有效期至 2029-01-10。CA 私钥仅在本机用户 AppData，不在服务数据、Git、证据或发布包。公开 CA 链供原 Node/HAProxy 校验；HAProxy 后端保持 verify required，未改成 verify none。旧叶证书仅作为 ignored 的维护备份。

真实 ManagedWindow 默认 Chrome 与 Playwright Chrome 均能访问网站；无 SPKI 忽略、ignore-certificate-errors 或 ignore_https_errors。Playwright 独立 Node route.fetch 客户端使用 NODE_EXTRA_CA_CERTS 指定公开 CA，不把该客户端信任设置冒充浏览器系统信任。TLS 1.3 默认校验与系统根读回证据已取得；4183/4193 的正常就绪也通过。

公网域名/服务器未提供，本次为本机 localhost 信任，不宣称公网证书部署或 HTTP/3 无忽略参数验收。迁到其它机器需建立该机器自己的信任；新安装顺序已经包含 trust-localhost。

## 聚焦验证与证据

证据均在 ignored 的 `work/antibot-service/reports/`，不包含输入文本、Cookie、票据或私钥。测试样本文字仅为本地公开合成输入。

| 验证 | 实际结果与证据 |
| --- | --- |
| 子包 TypeScript 与五个 JS 语法检查 | 通过；只覆盖独立盾包，不运行根级/全量测试 |
| 原公开投影/同源 session 与新分类边界 | 5 个测试通过：缺失/未知、归属/去重、阳性锁存、弱行为/排除/丢失；tests/check.test.ts、check-model.test.ts |
| 默认 Chrome 自动检测及真实 B-A-T 交互 | check-site-mzgs3cr6：automatic.json 为 34 有效阴性；native-cadence.json 为 39 有效阴性、Human、同一 runId、untrusted=0；responsive.json 无横向溢出。普通模型调用 0，没有真人样本冒充 |
| 真实原判据状态与异常/失效控制 | check-site-en38fqi5/result.json：cadence 7 状态、WebDriver/脚本输入阳性、探针失败、采集器失败通过；真实原观测通道保留。正常交互部分引用上一行，不冒充本次 partial 再测 |
| UI、真实提交回执、JSON 导出、排除/重测、移动端、TLS | check-ui-86rlwtst/result.json：默认 Chrome 校验成功、TLS 1.3、同页 39 行、延迟真实回执期间 busy、嵌套滚动、导出、原 paste 排除、新运行、390px 布局、consoleErrors=[] |
| 模式切换与迟到回执 | check-ui-58i_y5r5/navigation.json：键盘切换保持原生、提交中返回自动后迟到回执不能改回模式、原阳性/同一运行保留 |

这次 B-A-T 正常原生控制实际被判 Human，表示现有原判据未命中；不能据此宣称能够识别全部 CDP 自动化、对外平台反封锁成功或真人人群误报率已验证。真人手测留给用户在该地址完成。

## 首次失败与修正

保留真实失败，未把重跑写成首次通过：

1. HTTPS 首次 start 健康超时，独立访问定位 4183 的 HAProxy 503。旧 ca-file 指向自签叶证书，替换 CA 签发叶证书后无法验证后端。改用 rootCA.pem，并保留 verify required；正常重启恢复 ready。Windows curl 默认吊销检查不接受无 CRL 的本地 CA，因此未将 curl 错误解释为浏览器失败，也未关闭浏览器校验；真实 Chrome 访问通过。
2. check-site-a273ia09：验收脚本把 B-U evaluate 返回的 JSON 字符串直接与数字比较；纠正 JSON 解码。check-site-1qc7lov3：用了旧 num_pages，实际 0.13.8 schema 为 pages；核原模型后修正。不是修改执行器放宽校验。
3. check-site-mzgs3cr6 正常自动/交互/移动端已通过，随后损坏源控制仍断言旧 unavailable；新报告正确显示 failed，修正断言后仅补 controls-only，不重跑已通过正常流程。
4. check-ui-mjnwu2t6：Chrome 默认导航已成功，但 Node route.fetch 未建立其独立 CA 信任；显式公开 CA 后通过。没有用 ignore 参数过测。

以上每个失败浏览器均 finally 关闭，并有 profile-deleted.json 确认永久删除。

## 资源、发布与边界

验收浏览器与 Profile 全部关闭/永久删除；原五个生产服务及 presence 保留运行，供用户使用。保留运行服务不称“全部资源已关闭”。原 SQLite/上游制品/日志保持原位，FCaptcha 源码损坏控制已恢复原 SHA。

修改前 baseline、无关既有字节保护、最终服务与验收汇总位于 reports/d10-shield-website。新增发布物放在 releases/shield-website-v3-20261010，保留旧独立化归档；release.json 校验全部包文件，不带运行目录、根私钥、配置或数据库。

未重跑原独立安装/搬迁/全部冻结业务链，复用 S0–S4 证据；新增源码静态路由已由实际浏览器验证。公网运营、新电脑 OS 安装、跨版本存储升级、长期/断电、其它 OS、广泛真人人群及完整 H3 新信任链未测。
