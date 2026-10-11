# 盾独立化纠正与交付结算（2026-10-10）

当前方案 S0–S4 已实施并完成必要本机验收。保留 master@dc45be4f07fd2e9c4a425c0d257e8b1aaef8ed80 和开工已有改动；未提交、推送、创建 worktree、访问京东、启动云/跨天测试或关机。按[原方案](SHIELD_INDEPENDENCE_PLAN_20261010.md)连续完成，没有重开检测模型研究或扩展网站。

## 实现与交付

- `packages/request-budget` 是唯一 quota 实现：移动原 `check` 函数，B-A-T 原入口兼容委托，盾保留参数/错误薄适配。双方数据库和策略独立。PyrateLimiter 4.5.0、filelock 3.19.1、滑窗/锁/SQL/结果语义不变。
- 公共包 `bat-request-budget==1.0.0` 采用标准 build 1.2.2.post1 / Hatchling 1.27.0。源码摘要与 wheel 摘要分别冻结；B-A-T 受管安装记录和 `--check` 核实际模块字节，盾在 WSL Python `-I` 显式装载已核 wheel。坏/缺制品拒绝。缺生成 wheel 的 checkout 可以按冻结回执重建；不会修改 vendor baseline 来掩盖来源差异。
- 盾发布包包含独立 npm 锁、源码、固定公共 wheel、来源回执和许可说明；禁用 npm 生命周期打包，排除 local.json、运行数据、密钥、数据库、缓存和 node_modules。运行无需 B-A-T API、runner 或根依赖。
- 页面只补已有 `typing-cadence` 映射、状态和导出。原 FCaptcha 判据/阈值、原告警和检测锁存保持；不可测不计正常。
- `lab.ts relocate <旧源码绝对路径>` 复用 configure/systemd：要求资源停止、核旧源码/data owner，WSL tar 保留内部 Hub 链接，配置失败恢复原配置/归属，新增配置清除。数据库、密钥和报告保持原位；路径回退不恢复旧 spent/配额数据库。
- 空实例发现并修复 runtime/haproxy 父目录缺失、发布遗漏 continuity.lua，以及 C/D 跨盘 Creep 构建漏源。最后一项使用原 Rollup TypeScript 插件的 owned tsconfig/相对 include，未重写编译器或检测器。

公共源码摘要：`8fc614b6fbbd481c3657eb79daab7c75cd66df219e5ca4f8b8c6a4a54a73af20`。
公共 wheel SHA256：`cfc34413d49556d19891b1992252958081768957ce5decf6ef86464ac65a40ca`。
原 vendor sourceDigest 仍为 `b1f560935841db93dc7d0bbb3c1a34343c8cc82c7f9fdd774ee9d4cffe54511a`；公共包采用独立回执。

维护步骤和独立安装命令见 [盾 README](../../tools/antibot-lab/README.md)。最终发布物在 ignored `work/antibot-service/releases/browser-capture-antibot-lab-tools-1.0.0.tgz`，文件/归档 SHA256 见同目录 `release.json`；它不是运行数据备份。

最终归档 115 文件，SHA256 `fd221e6d216ca97bd5e9c0260ebbcad894740ffd5d2fd30a4e179f32976e5911`。与已通过空实例/搬迁/联合的发布内容比较，仅 README 结算文字变化；运行源码/共享 wheel/锁/构建 recipe 字节一致。归档清单、公共 wheel 摘要和全部结算证据核对通过，汇总见 `work/antibot-service/reports/d10-independence-closeout.json`。

## 本轮验收矩阵

以下路径均相对实际 checkout，所有运行证据保留在 ignored work；不把旧副本/旧全变体验收写成本轮从零结果。

| 门 | 本轮结果与证据 |
| --- | --- |
| A1 唯一实现 | 公共 contract 验证 API 与公共 check 为同一函数；盾 CLI 实际调用公共 wheel；原函数体只保留在公共 src |
| A2 双侧装载 | Windows 受管安装/来源 check、WSL `-I` 两进程、仓库外源码的独立预算通过；坏/缺 wheel 拒绝；`reports/d10-budget-reconstruction.json` 证明缺 wheel 时固定重建/安装成功 |
| A3 配额行为 | Windows 原预算验收：20 进程竞争余量 10，10 允许/10 拒绝；持久拒绝、4.15 秒真实短窗、长窗约束、坏 scope/坏库不放行；`reports/d10-shared-budget-windows.log` |
| A4 数据隔离 | 同模块/同 scope/两个数据库互不消费，同库跨进程持久生效，不让 Windows/WSL 并发写同一库；公共 contract 与独立 budget-standalone |
| A5 页面 | 原生交互/正常采集、WebDriver 与脚本阳性、探针/collector 缺失通过；cadence 七类结果 clear/detected/unavailable/excluded/incomplete/invalid/error 保留 outcome/valid，错误/排除等均导出 unavailable，阳性锁存；前六类实际文字留证，error 与 invalid 的共同“测量失败”分支定点核验；390px 视窗无横向溢出 |
| A6 空实例 | 仓库外发布物独立 npm ci；空数据完成 prepare/原 React/Creep/worker/device 探针、Tor/DB-IP、HAProxy 与 CrowdSec 持久化候选构建/激活、ready；`reports/d10-empty-build.json` 及各阶段日志 |
| A7 搬迁/恢复 | 错 owner 拒绝、真实 configure 中途失败恢复、内部 POSIX 链接保留、新增配置清除、状态摘要不变；v1→v2 启动，v2→v1 回退后 ready/关闭；`reports/d10-independent-evidence/relocate-acceptance.json`、`reports/d10-independent-rollback.json` |
| A8 原机制 | 使用空实例原固定机制；页面正常/异常/缺失、原挑战、真实 engine 重启后同一已消费票据再次拒绝两次，正常通行状态仍可用；`d10-independent-evidence/replay-restart-sq2eqt6w/result.json`，票据/Cookie 只在内存 |
| A9 正式联合 | `product-d10-independent-RK6zpP/resume-proof.json`：冻结不可变发布链、完整 HTTPS 4183、动态结果 7、普通模型调用 0；3 条 H2 观测 valid=true/consistent，无 detected；host/relay 关闭、1 个 Profile 永久删除 |
| A10 收尾 | 验收 Profile 各自 finally 关闭且永久删除；所属五业务服务、presence、window-test 全 inactive/MainPID=0；非敏感证据移出临时目录，永久删除 owned 安装根，最终回执见下节 |

页面证据按未完成项分段运行，不能称全脚本首遍通过：`check-site-y0vdvn8o` 提供原生/自动/响应式，`check-site-1wy65fl7/cadence-controls.json` 提供七状态与锁存，`check-site-6a805qgn/result.json` 提供 WebDriver/脚本阳性和缺失控制。均在 `reports/d10-independent-evidence`。

配套最小检查：盾 TypeScript check、独立配置 locations 单测、原访问策略 declared_policy / explicit_policy_missing 两个定点 unittest、原持久挑战 Go 聚焦测试通过；未运行根级/全量测试。只有新增失败或代码变化才补相应未完成检查。

最终受管 `--check` 和 diff --check 通过，日志为 `reports/d10-independent-final-source-check.log`、`reports/d10-independent-final-diff-check.log`。版本/共享摘要与已安装回执一致，没有以登记刷新替代校验。

## 空实例真实性与首次失败

实例位于本次新建 `C:/Users/30553/AppData/Local/Temp/BAT_SHIELD_INDEPENDENCE_20261010_195405`，源码先后 source-v1/source-v2、独立 instance 数据；owner 与初始空目录记录见 `reports/d10-independence-install-owner.json`。仅复用 31 个原 artifacts.json 已核 SHA 下载归档（229432487 字节）和本机既有工具/构建缓存。未复制旧 runtime/config/secret/业务、配额、spent 数据库。HAProxy 原源重新构建，候选 SHA `6a0796c7f0ea0510cacdaf7389578c408ee83eeef67875cc36664b991e7f981e`；CrowdSec 固定补丁候选重新构建/显式激活，SHA `860ba7dd8f9f53871fb8054bdbf8914f362ee75dc23e823428e138e6ee12ce28`，原发行二进制保留。

首次失败均保留，重试只针对原因：

| 首败 | 最小纠正与原记录 |
| --- | --- |
| npm pack 意外触发 prepare 生命周期 | 核 parent/命令后停止本次 owned PID 18200；添加 --ignore-scripts。原 prepare 曾触及既有配置/构建，不声称原数据树完全没有写入；旧密钥/数据库/历史保留。`d10-release-first-failure.json` |
| 新实例 HAProxy 解压父目录缺失 | 增加 owned runtime/haproxy mkdir；`d10-empty-prepare.log` |
| 发布缺 continuity.lua | files 增加 .lua；`d10-empty-prepare-after-mkdir.log` |
| Creep 跨盘漏源 | filterRoot 试改及绝对 include 均未覆盖原模块，保留各日志；最终 owned tsconfig+相对 include 成功；`d10-empty-fixtures.log`、`d10-empty-creep-after-*.log` |
| 页面测试把 scrollbar 宽度当 overflow | 实际 390/375/375，改验 content<=viewport；未加宽页面或改盾。`check-site-5ukl3thl`、`check-site-yl4sqccp` 保留首败 |
| 新验收 callback 格式不合 B-U Actor | 改成原支持的 `(data)=>...`；只继续控制项；`d10-independent-website-after-scrollbar.log` |
| 旧 dataset.case 字符串误做 JSON 解码 | 修验收解析；只补 WebDriver/脚本/缺失控制；`d10-independent-website-controls.log` 和 `d10-independent-website-failures.log` |
| 联合前受控夹具 helper 写错数据库路径 | 未开始正式 TaskRun；改为已有 data/business.sqlite、mode=rw。`d10-independent-fixture-first-failure.json`；冻结链 URL/ID 不改，无旧数据/通行状态复制 |
| 永久清理首次超时 | 首次 helper 含不必要的整棵构建目录大小统计，120 秒未取得回执；核无残留清理进程，去掉统计、保留相同 owner/资源门，以原 shutil.rmtree 完成精确目录删除。`d10-independent-cleanup-first-failure.log` 与 `d10-independent-cleanup-retry.log`；无工具策略拒绝 |
| 最终制品/证据核对 helper 两个假失败 | Windows tar清单CRLF未归一；将原 detector outcome 错当公共 measurement status。只修核对脚本：分开 detailed outcome/valid 与 unavailable，制品/产品源码不变。`d10-final-artifact-verifier-first-failure.json`、`d10-final-artifact-verifier-state-failure.json` |

正式联合使用原 workbench.sqlite 的 SQLite backup 副本和冻结发布版；这属于产品验收夹具复用，与盾空实例数据区分。新盾重新建立相同 catalog 夹具 ID，走自身新密钥下的原挑战。未触发自然语言准备、重新编译或模型探索。

## 资源与保护结算

稳定证据目录 `reports/d10-independent-evidence/evidence-index.json` 保存 59 个非敏感 JSON/PNG 及 SHA；不复制 secrets、数据库、Cookie 或配置备份 tar。正式 TaskRun、验收数据库和构建日志作为证据留在 ignored work。

资源关闭与永久删除分别记录：`reports/d10-independent-rollback.json` 记录七个服务 inactive/MainPID=0；各页面/重启报告有 closed/profile-deleted；正式运行有 resume-closed/resume-profile-cleanup。安装根永久删除结果见 `reports/d10-independent-cleanup.json`，没有移入回收站。个人浏览器、原 B-A-T/盾数据目录未删除。

开工所有文件的存在性/字节摘要见 `reports/d10-independence-start-inventory.json`，最终核对见 `reports/d10-independence-preservation.json`。无关既有改动保持原字节，原删除的 Go 测试不恢复；本轮只增量修改相关文件。HEAD/分支保持不变。

## 验证边界

这是本机既有 Windows/WSL 上的空实例安装与同一发布版源码路径搬迁/回退；未验证新电脑全套 OS 安装、其它 OS、跨版本数据库升级/降级、并行多实例、公网长期运营、小时/日真实长窗、断电或跨天。网站产品化/观测端全生命周期仍按原 E1–E4 后置。

本轮正式联合仅变体 1/结果 7；11/13/无合格候选 99 的全变体证据引用原主线，不冒称本轮再测。没有重新准备任务，也不声称所有检测完整覆盖或第三方网站均通行。原检测分数、挑战协议、模型路由、TaskChain 和访问限制边界保持。
