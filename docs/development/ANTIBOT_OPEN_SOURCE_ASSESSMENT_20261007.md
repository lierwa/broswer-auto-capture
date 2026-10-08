# 自动化识别检测：开源选型、覆盖矩阵与扩展边界

**2026-10-08 最新结算：按用户最终指令聚焦底层浏览器控制，停止扩展复跑编译。独立 CrowdSec 服务已补齐并完成原规则对照：日常浏览器旧控制 3/3 因 CDP 被拒，新控制 3/3 经真实挑战后执行成功。保留 B-U，交付、首败、启动和未测边界见 [本轮交付](ANTIBOT_DELIVERY_20261008.md)。后文旧阶段状态按时间理解，不代表对所有网站不可识别。**

日期：2026-10-07，状态更新于 2026-10-08。**M0 原十八样本的专属环境边界保留；后续实际 daily 中，fpscanner 与独立 Brotector 均为修正前 3/3 命中、修正后 0/3，业务选择均正确。保留 B-U 的 W3 最小补丁与现有准备→发布→动态复跑完成受控验收。** Brotector 固定 `98b330999e9928a226ca0c8254dddf909d1583bd`，仅结算经正负例校准的 Runtime 分支。源码、首次失败、适配、资源及未测边界见 [W3 记录](ANTIBOT_W3_EVENT_CAPTURE_20261007.md)，原始 M0 记录按时间保留。下文调研记录保留当时证据范围，不代表当前仍停在检测准备阶段。

用户要求：优先找开源库或完整开源方案，仅补齐它们没有覆盖且对 B-A-T 必要的部分；随后规划现有系统的深度整合。本文负责第一件事，第二件事见 [系统集成与实施方案](ANTIBOT_SYSTEM_INTEGRATION_PLAN_20261007.md)。

## 1. 直接结论

**最小首批采用固定 fpscanner + 自托管受控页面 + 现有 B-A-T 运行记录，先比较人工、仅连接、观察和完整自动操作。需要服务器挑战与跨请求判定时，再接 CrowdSec；需要网络结论时接 JA4；效果晋级前接一份独立复核探针。**

复审纠正：上一版把“完整检测底座推荐”误放成了“取得第一份有效测量的前置条件”。单独复用检测库并不要求自研挑战、签名、规则引擎或行为窗口；受控的初始诊断可以直接使用库的输出。多层检测仍复用 CrowdSec，按缺口启用，不为首轮诊断先建完整 WAF。

检测实验室回答：**网站能观察到当前浏览器哪些自动化信号、这些信号由哪条访问路径产生、某项改动具体改善了什么。** 它部署在自有测试站前面，不是将京东、淘宝流量经过一个本地 WAF 就能使它们放行。

当前产品控制主线保留 browser-use。本文不以物理鼠标、桌面 Computer Use 或随机轨迹替代浏览器环境、网络和会话一致性的研究。实验室通过之后形成的是所测环境的检测结果，不是目标平台账号的放行结论。

### 1.1 组件职责和推荐顺序

| 层次 | 首选复用 | B-A-T 需要做的部分 | 本轮决定 |
| --- | --- | --- | --- |
| 主浏览器探针 | 独立 fpscanner 固定版本 | 公开采集入口、原始命中原因及信号有效性 | 首批；先诊断，不改产品代码 |
| 服务器检测、规则和行为聚合 | CrowdSec Engine / AppSec / Hub | 受控站配置、结果引用；不重造引擎 | 需要挑战/跨请求判定时接入 |
| 独立页面复核 | BotD 或 CreepJS 单独页面 | 自托管、关闭外发、结果适配 | 按待验证机制选一份；晋级前必做，不预装两份 |
| 网络指纹 | FoxIO JA4 的 TLS 部分、tshark | 受控端点抓包及结果关联 | 声称解决网络差异前必做，初始页面诊断不依赖它 |
| 场景与实验记录 | 现有 B-A-T 准备、发布、复跑、审计 | 首批复用一个本地场景及现有事件，薄比较报告 | 不先做实验管理平台或生产 schema |

### 1.2 不作为本轮前置条件

不采购商用风控、不搭账号画像平台、不开发自己的浏览器内核、不替换 LangGraph、不重写 browser-use Agent loop。商用 WAF 的自有域名对照可放到后续独立阶段。

首批也不要求 Docker/WSL、CrowdSec 网关、抓包驱动、产品 UI、公共协议字段或数据库迁移。它只交付可重复的客户端诊断；30 类目录是覆盖地图，不是首批必须实现 30 项功能的清单。最小范围与效果验收的逐项复审见 [集成方案第 0 节](ANTIBOT_SYSTEM_INTEGRATION_PLAN_20261007.md#0-设计复审结论与纠正)。

## 2. 调研证据与冻结对象

本轮通过官方文档、Git 标签、固定提交和源文件只读核验；没有运行下载到内存中的源码，没有安装任何组件。GitHub API 遇到公共限流后，通过 Git 远程引用和官方 raw 源文件核对。BunkerWeb 完整源码包超过本轮读取上限，改为定点读取其 antibot 源码与许可证；不声称完成该项目全面审计。

文档中 `Next` 是上游滚动文档，**不是版本契约**。实现必须以表中的源码、规则快照及真实协议测试为准。固定源码不等于固定发布镜像；二进制、镜像 digest、浏览器版本和依赖锁文件仍须在实施阶段登记。

| 组件 | 本轮核验版本 / 提交 | 许可证与运行方式 | 维护和采用判断 |
| --- | --- | --- | --- |
| CrowdSec Engine | v1.8.1，`909b5157986a2b2c2163300fdaef5ed01289f7d2` | MIT；Go 服务；该提交 go.mod 为 Go 1.26.1 | 1.8 引入 Bot Detection，1.8.1 修正 Brave Shields 相关误报；官方仍标记检测模块 Alpha |
| CrowdSec Hub | `f5cd0975d0bd69ebad09c5e6992d4f1a1ef594b0` | MIT；独立更新的 YAML collection/parser/scenario/config | 必须与 Engine 分别锁定；不能启动时拉浮动最新规则 |
| Nginx bouncer | v1.2.3，`067541cdfff4b650182d819e92c04a207aa2fbb5` | MIT；Nginx Lua 接入 | Makefile 指定下列 Lua 库；研究组合，不宣称已经联调 |
| Lua bouncer | v1.0.19，`ec94d512927cf70be865686e4eb928d128189633` | MIT；Lua 库 | 已读响应状态、body、headers/cookies 的适配位置；仍需验证整个挑战往返 |
| fpscanner 独立库 | package 1.0.8，`4255cfd8a23fef5ea714147518d8c6ae1e5426d3` | MIT；浏览器 TypeScript/JS | 当前源代码含跨上下文探针、检测与测试；与 Engine 内置 bundle 不视为同一版本 |
| BotD | package 2.0.0，`66da86e9d9e7206e817a0f7fdbdfa8fe37f3cd47` | MIT；浏览器 JS | 适合基础检测复核；上游路线偏稳定维护，不能充当完整检测引擎 |
| CreepJS | `10aa6724cd33a1015db1574211890518cd04f0cc` | MIT；独立研究页面 | package 的 1.0.0 不作为稳定 API 版本；上游定位为研究工具 |
| FoxIO JA4 | `c6469a7b0dbf8fe963810162429fbfd9d1acc4d5` | TLS JA4 为 BSD-3-Clause；Python + tshark | 其余 JA4+ 组件另有 FoxIO License 1.1，不能统一称为宽松开源 |
| BunkerWeb | v1.6.15，`cf4a04c2526912571328c58f89ef2477b60b5f10` | AGPL-3.0；Nginx/OpenResty、Linux/容器 | 完整网关备选；已核验 core antibot，未采用 PRO 功能作为开源覆盖 |
| Anubis | v1.27.0，`d39e26cedcc96bea5e4915297c756e7eec74aaf7` | MIT；Go 反向代理 | 挑战/策略夹具备选；该版本新增 Windows Server beta 支持 |

许可列仅记录源码许可证和引入边界，不把主仓库许可证外推到全部依赖、数据集、浏览器二进制或商业扩展。

bouncer 的固定组合依据：[Nginx Makefile](https://github.com/crowdsecurity/cs-nginx-bouncer/blob/067541cdfff4b650182d819e92c04a207aa2fbb5/Makefile)、[Lua 响应适配](https://github.com/crowdsecurity/lua-cs-bouncer/blob/ec94d512927cf70be865686e4eb928d128189633/lib/crowdsec.lua)、[Lua MIT 许可](https://github.com/crowdsecurity/lua-cs-bouncer/blob/ec94d512927cf70be865686e4eb928d128189633/LICENSE)。

## 3. 多层检测扩展为什么选择 CrowdSec

### 3.1 能直接复用的完整链路

```text
受测浏览器
  → 自有测试站的 Nginx / OpenResty + 官方 bouncer
  → CrowdSec AppSec：指纹与挑战校验、规则判定
  → 放行后到达受控业务夹具

站点访问日志 / AppSec 事件
  → CrowdSec parser + scenario
  → 本地告警 / 决策 / 指标
  → B-A-T 实验报告适配器
```

反向代理与 AppSec 是测试站组件；它们不接管个人浏览器、系统代理或 Windows 防火墙。B-A-T 的浏览器仍直接访问指定测试站。

CrowdSec 已拥有挑战 cookie、票据、密钥轮转、PoW 校验、指纹解析、规则 helper 与事件输出，不应在 Fastify 中重写一套。固定源码的 [`challenge.go`](https://github.com/crowdsecurity/crowdsec/blob/909b5157986a2b2c2163300fdaef5ed01289f7d2/pkg/appsec/challenge/challenge.go)、[`fingerprint_helpers.go`](https://github.com/crowdsecurity/crowdsec/blob/909b5157986a2b2c2163300fdaef5ed01289f7d2/pkg/appsec/challenge/fingerprint_helpers.go)、[`appsec.go`](https://github.com/crowdsecurity/crowdsec/blob/909b5157986a2b2c2163300fdaef5ed01289f7d2/pkg/appsec/appsec.go)是实现依据。

Hub 的 [`appsec-bot-challenge` collection](https://github.com/crowdsecurity/hub/blob/f5cd0975d0bd69ebad09c5e6992d4f1a1ef594b0/collections/crowdsecurity/appsec-bot-challenge.yaml)已经组织指纹评分、排除规则、日志解析、挑战请求和提交过量检测。B-A-T 复用 collection 的组织方式，新增内容以独立命名的扩展配置存在，保留上游原始规则快照。

### 3.2 源码核验对设计的实际影响

| 发现 | 对选型和开发的影响 |
| --- | --- |
| Engine 稳定发布不代表新 Bot Detection 已稳定；官方标为 Alpha | 适合可重建的开发实验室；必须保留替换引擎的结果适配边界，不能让产品运行依赖其持续可用 |
| Hub 与 Engine 分开发布 | 同时锁定两者，先做配置装载与 helper 兼容验证；检查失败时停止该组合，不临时补造规则函数 |
| bouncer 把 AppSec 的内部 403 包装转换为浏览器实际响应 | 不能看内部 403 就判浏览器被拒绝；验证 HTTP 状态、多个 Set-Cookie、POST body、挑战资源路径和 CSP |
| 规则为有权重的启发式，部分环境信号具有真人反例 | 保留每个 reason；“score”不是人类概率；用人工、隐私保护、远程桌面等对照解释误报 |
| 默认行为场景按 source_ip 聚合 | 同机实验会共用 IP；隔离实验状态、禁止相邻 case 污染，不把上一 case 的 ban 当成下一浏览器检测结果 |

已读 [`scoring.yaml`](https://github.com/crowdsecurity/hub/blob/f5cd0975d0bd69ebad09c5e6992d4f1a1ef594b0/appsec-configs/crowdsecurity/appsec-bot-challenge-scoring.yaml) 和 [`balanced.yaml`](https://github.com/crowdsecurity/hub/blob/f5cd0975d0bd69ebad09c5e6992d4f1a1ef594b0/appsec-configs/crowdsecurity/appsec-bot-challenge-scoring-balanced.yaml)。默认 balanced 阈值为 75；这是上游规则值，**不是 B-A-T 的安全阈值**。先保留默认配置生成基线，不为让某候选通过而删规则或调低其权重。

### 3.3 Windows 与本地部署

首批页面诊断复用项目已有的本地 HTTP 夹具和 Windows 浏览器，不需要另一套服务器运行环境。确需 CrowdSec 多层检测时，产品浏览器保持原位，服务器组件优先放到独立 Linux 容器或受控 Linux 主机。CrowdSec 自身有 Windows 支持，不等于整个 Nginx Lua / AppSec 组合已经在本机通过。

新挑战运行时要求支持编译模式的 WASM 宿主；amd64 需要 SSE4.1，且可执行内存映射不能被宿主策略拒绝。首次实施只读确认容器/虚拟化/CPU 与端口条件，然后使用明确归属的实验室资源。本轮不安装 Docker、WSL、驱动、抓包工具或 Windows 服务。依据：[官方前置条件](https://docs.crowdsec.net/docs/next/appsec/bot_detection/intro/)。

### 3.4 默认数据边界

实验室从第一版就使用本地 LAPI、独立目录和合成账号。关闭 CAPI 信号共享、Console 上下文上传及不需要的 usage telemetry；不做云 Console enrollment。规则包在准备阶段固定取得，运行阶段不自动更新。具体开关按锁定版本验证，关闭一个 sharing 开关不能直接结算为“完全无外发”。依据：[配置文档](https://docs.crowdsec.net/docs/configuration/crowdsec_configuration/)、[Docker 环境参数](https://github.com/crowdsecurity/crowdsec/blob/909b5157986a2b2c2163300fdaef5ed01289f7d2/build/docker/README.md)。

只加载用于受控站的 web 日志与 AppSec acquisition，不启用 SSH、系统审计或宿主防火墙 bouncer。先用有确定标签的正反例证明本地/私网 allowlist 没有使检测路径被整个跳过。

## 4. 页面与网络补充组件

### 4.1 fpscanner：复用探针，不把示例当安全协议

独立库的公开入口是 `FingerprintScanner.collectFingerprint()`；输出包含信号、检测结果、时间和 nonce。现有实现可收集主页面、iframe、worker 的相关环境信号。源码依据：[入口](https://github.com/antoinevastel/fpscanner/blob/4255cfd8a23fef5ea714147518d8c6ae1e5426d3/src/index.ts)、[检测目录](https://github.com/antoinevastel/fpscanner/tree/4255cfd8a23fef5ea714147518d8c6ae1e5426d3/src/detections)。

已核验 [`crypto-helpers.ts`](https://github.com/antoinevastel/fpscanner/blob/4255cfd8a23fef5ea714147518d8c6ae1e5426d3/src/crypto-helpers.ts)：默认编码是 XOR，源码明确不具有密码学安全性。首批在受控站通过公开 `collectFingerprint({ encrypt: false })` 采集，不开发加解密和挑战协议，也不将该结果作为客户端不可伪造的远程证明。需要对抗重放或挑战验证时复用 CrowdSec，而不是照抄 README 的演示解码器。

CrowdSec 内置 bundle 由 Engine 提交固定；独立 fpscanner 1.0.8 是另一份研究对象，不能擅自替换 Engine 的 bundle，或把两份结果算为完全独立的检测器投票。

**复审核验出的实际限制：**固定 [`src/index.ts`](https://github.com/antoinevastel/fpscanner/blob/4255cfd8a23fef5ea714147518d8c6ae1e5426d3/src/index.ts) 的 `collectSignal` 将异常转为 ERROR，`runDetectionRules` 的异常分支会写 `detected: false`。因此低布尔值不能单独通过验收。适配层保留原始信号，逐项检查所用规则的输入有效性；异常被库吞掉而无法从输出判断时，该规则健康状态保留 unknown。若它阻塞实际验收，才提交一个保留错误状态的最小上游修正/受管补丁，不重写检测逻辑。

另一个具体限制是 [`src/signals/cdp.ts`](https://github.com/antoinevastel/fpscanner/blob/4255cfd8a23fef5ea714147518d8c6ae1e5426d3/src/signals/cdp.ts) 会赋值 `Error.prepareStackTrace` 并执行 console 探测，函数中没有恢复该属性。各探针必须在独立的新文档中测量，不能顺序注入同一页面再把结果当作独立证据。人工和自动化使用相同探针过程；外部原生日志已够用时，不再为了取结果额外开启控制通道。此处记录的是该固定版本的实现，不外推到 CrowdSec 内置 bundle。

### 4.2 BotD：轻量独立复核

使用自托管构建和公开 `load({ monitoring: false })` → detector `detect()` 流程。已读 [`src/index.ts`](https://github.com/fingerprintjs/BotD/blob/66da86e9d9e7206e817a0f7fdbdfa8fe37f3cd47/src/index.ts)：npm 入口默认开启概率为 0.001 的安装统计请求，必须明确关闭。

源码对独立导出的 sources、detectors、collect、detect 等低层符号注明不受公开语义版本保护。不要因为可以 import 就把它们当稳定公共协议；如果诊断确实需要内部细节，限定在实验室适配器，固定版本并写清升级验证。依据：[BotD 源码](https://github.com/fingerprintjs/BotD/tree/66da86e9d9e7206e817a0f7fdbdfa8fe37f3cd47/src)。

BotD 的未命中只说明其基础规则未命中。它不提供目标网站的账号历史、网络声誉或完整行为判断。

### 4.3 CreepJS：独立环境一致性检查页

作为单独自托管页面运行；不要将整个项目注入目标网站。它适合提供更广的环境差异、原生对象异常、渲染与跨上下文检查。其上游定位与输出结构决定它不应成为 B-A-T 的稳定风控 SDK。依据：[固定 README](https://github.com/abrahamjuliot/creepjs/blob/10aa6724cd33a1015db1574211890518cd04f0cc/README.md)、[主页面源码](https://github.com/abrahamjuliot/creepjs/blob/10aa6724cd33a1015db1574211890518cd04f0cc/src/creep.ts)。

该主页面存在完整 fingerprint 的 console 输出；示例 server 使用宽泛监听方式。接入前审计外发和日志，限制监听与访问范围，将结果脱敏后导出。不能直接让现有 Python stdout/浏览器诊断采集器把完整指纹带入产品日志。

### 4.4 JA4：只补真实观测到的网络维度

复用 [FoxIO 固定版本](https://github.com/FoxIO-LLC/ja4/tree/c6469a7b0dbf8fe963810162429fbfd9d1acc4d5) 的 Python/tshark 工作流，读取受控端点流量并输出 TLS 指纹。本地 HTTP 不产生 TLS ClientHello，不能用于验证 N02。Windows 上工具是否安装、抓包权限和实际网卡路径均列入后续环境核验。

采集位置应能看到浏览器发出的握手；如果先经过终止 TLS 的代理，后端看到的是代理握手。HTTP/2 header 顺序、H3、连接复用等分别记录，不能把一个 JA4 字符串扩写成“网络指纹全覆盖”。[`LICENSE-JA4`](https://github.com/FoxIO-LLC/ja4/blob/c6469a7b0dbf8fe963810162429fbfd9d1acc4d5/LICENSE-JA4) 与其他 JA4+ 许可分别登记。

## 5. 组件比较与采用边界

| 候选 | 可以直接复用什么 | 决策与理由 |
| --- | --- | --- |
| BunkerWeb 1.6.15 | 完整反向代理/WAF、会话挑战、限速、插件组织；core antibot 包含 cookie/JS/CAPTCHA/Cap.js 等模式 | 多层扩展首选 CrowdSec；首批页面诊断无需完整网关。主组合遇到实际缺口后才单独验证备选 |
| Anubis 1.27.0 | 挑战、策略表达式、已有 honeypot、受控站访问门 | PoW 主要提高访问成本；默认策略还包括 AI bot 分类限制，放行/拒绝不等于真人/自动化分类正确。可用于挑战与停机行为测试 |
| 独立 fpscanner + 现有本地夹具 | 浏览器采集与库内检测 | 复审后采用为最小首批；不建设签名、窗口、规则和告警。只有扩展到完整网关仍打算自己补这些能力时，才拒绝该做法 |
| ModSecurity / OWASP CRS 单独使用 | HTTP 攻击负载检测 | 注入攻击与自动化识别是不同问题，不能作为真人判断的完整替代 |
| 商用 Cloudflare / Akamai / HUMAN / DataDome / 阿里云方案 | 独立检测对照、外部声誉和跨会话视角 | 不满足开源主体要求；后续仅在自有端点按需对照，结果不外推到京东/淘宝 |

BunkerWeb 的具体依据是 [`antibot.lua`](https://github.com/bunkerity/bunkerweb/blob/cf4a04c2526912571328c58f89ef2477b60b5f10/src/common/core/antibot/antibot.lua)、[`plugin.json`](https://github.com/bunkerity/bunkerweb/blob/cf4a04c2526912571328c58f89ef2477b60b5f10/src/common/core/antibot/plugin.json)；Anubis 的具体依据是 [`botPolicies.yaml`](https://github.com/TecharoHQ/anubis/blob/d39e26cedcc96bea5e4915297c756e7eec74aaf7/data/botPolicies.yaml)。Anubis 中依赖 Thoth 订阅的数据能力不计入本地免费开源覆盖。

### 5.1 与反检测浏览器候选分开

Ego、CloakBrowser、Patchright、Camoufox、BrowserOS 是浏览器宿主或控制候选，**不是用来建设检测侧的替代库**。它们保留在 [集成方案](ANTIBOT_SYSTEM_INTEGRATION_PLAN_20261007.md) 的宿主对比中。检测基线先建立，再决定是否替换宿主；不能只靠厂商“通过检测站”的截图选择。

## 6. 30 类检测机制与真实覆盖矩阵

这是开发可维护的机制目录，覆盖公开主要检测层；未公开规则和未来新机制不能被有限列表穷尽。每个 ID 用于关联样本、观测来源和后续缺口。

表中“复用”表示组件已有相关原语；“配置”表示需要使用上游扩展点；“采集”表示只获得事实、尚无经校准判定；“外部”表示本地实验室不具备目标平台数据。任何一类均不能因表格有一行就标记已实测。

### 6.1 网络与请求身份

| ID | 网站可观察的机制 | 开源复用 / 最小缺口 | 验证边界 |
| --- | --- | --- | --- |
| N01 | IP、ASN、代理属性、网络声誉 | CrowdSec 有 IP 决策与名单能力；真实全球声誉属于外部数据 | 本地关闭共享后不能声称覆盖目标平台声誉 |
| N02 | TLS ClientHello、JA3/JA4、ALPN | JA4 + tshark；适配握手和 case 关联 | HTTP 页不覆盖；校验首个 TLS 终止点 |
| N03 | HTTP/2 参数、头顺序、HTTP/3 | 受控边缘日志或协议工具采集 | Fastify 的规范化 headers 不能恢复原始顺序；JA4 不包办此项 |
| N04 | HTTP UA/Client Hints/语言与页面信号是否一致 | fpscanner + CrowdSec mismatch；缺失字段按配置补映射 | 可采集值不等于可直接断言机器人 |
| N05 | 浏览器与后台 HTTP 混用、连接/会话连续性 | 浏览器请求日志 + 网关日志 + JA4；B-A-T 关联 transport 事实 | TLS 差异和 cookie 相同可并存；须定位实际调用路径 |
| N06 | 地理、时区、语言、RTT 组合 | CrowdSec locale/mismatch；地理数据另核许可 | 旅行、VPN、远程桌面为必要真人反例 |

### 6.2 浏览器环境与执行上下文

| ID | 机制 | 开源复用 / 最小缺口 | 验证边界 |
| --- | --- | --- | --- |
| E01 | webdriver、框架遗留属性、自动化标记 | fpscanner、BotD | 测整个宿主版本和启动方式，不只单一属性 |
| E02 | 屏幕、窗口、DPR、平台与浏览器特性 | fpscanner、CreepJS | 无头/远程环境本身不能等价非法访问 |
| E03 | Canvas、WebGL/WebGPU、GPU 一致性 | fpscanner、CreepJS | 指纹唯一性不等于机器人概率 |
| E04 | 原生对象、属性描述符、iframe/worker 一致性 | fpscanner、CreepJS | 记录不可采集、超时和不同上下文，不能统一填 false |
| E05 | 字体、音频、编解码、媒体设备特征 | CreepJS；fpscanner 部分设备/codec | 测量是否触发权限、是否被隐私策略限制 |
| E06 | 版本相关的 inspector/CDP 副作用 | 各探针的具体实现及阳性对照 | 旧检测方法会随浏览器变化失效；CDP 存在不能靠名称断言 |

### 6.3 操作与行为

| ID | 机制 | 开源复用 / 最小缺口 | 验证边界 |
| --- | --- | --- | --- |
| B01 | 事件顺序、输入来源、isTrusted | 受控夹具使用 DOM 事件 API 采集；CrowdSec 扩展规则消费 | isTrusted=true 不等于真人；采集代码不是新分类器 |
| B02 | 鼠标、滚动、停顿分布 | 仅做受控场景摘要与人工对照；成熟主体未覆盖完整行为模型 | 不自行造“真人轨迹评分”；需要数据支持才立扩展项 |
| B03 | 键盘、IME、粘贴与控件事件顺序 | 受控表单夹具采集；规则只验证明确的不变量 | 粘贴、键盘导航和辅助技术属于正常使用 |
| B04 | 焦点、可见性、页面切换 | DOM API 采集 + 既有 browser owner 记录 | 后台标签页与远程桌面不得一票判 bot |
| B05 | 速率、并发、重复、重试密度 | CrowdSec parser/scenario；把所有产品阶段纳入关联 | 挑战过量自带场景不等于已覆盖业务页面的全部频率规则 |
| B06 | 导航关系、资源请求、跳过页面直接 API | 网关请求日志 + 场景步骤关联；必要的上游配置扩展 | 缓存、SPA、预加载会改变请求图，不能固定要求每步都有网络请求 |

### 6.4 会话、账号与业务策略

| ID | 机制 | 开源复用 / 最小缺口 | 验证边界 |
| --- | --- | --- | --- |
| S01 | cookie 生命周期、会话连续性 | CrowdSec 挑战会话 + 合成业务会话夹具 | 不读取或记录个人登录 cookie 值 |
| S02 | storage、token、设备与挑战绑定 | CrowdSec challenge 协议 + 受控存储场景 | 必须逐项测试已有绑定语义，不能由“加密”推导全部绑定 |
| S03 | 账号、设备、地点变化 | 合成账号变更记录；复用场景引擎表达已知规则 | 不迁移真实账号来获取实验数据 |
| S04 | 长期账号历史、投诉和封禁记录 | 外部 | 本地只有合成历史，不能复制平台账户风控模型 |
| S05 | 跨账号/设备/IP 图关联 | 本地可验证关联数据契约；平台关联图属外部 | 不为填满矩阵而建立自己的图风控平台 |
| S06 | 业务流程异常、平台禁止的使用方式 | 自有业务规则及合成任务 | 自动化证据、滥用判断和站点规则决定分列 |

### 6.5 主动验证和观测完整性

| ID | 机制 | 开源复用 / 最小缺口 | 验证边界 |
| --- | --- | --- | --- |
| V01 | JS 主动环境探测 | fpscanner、BotD、CreepJS | 每份探针独立页面/轮次，记录探针自身扰动 |
| V02 | nonce、有效期、票据、重复提交验证 | CrowdSec challenge 实现及上游测试 | 只验证自有协议；不实现第三方 token 伪造 |
| V03 | CAPTCHA、PoW、挑战页 | CrowdSec；Anubis/BunkerWeb 作备选夹具 | PoW 不是人类证明；产品遇到需人工处理的挑战沿现有人工等待 |
| V04 | 设备证明、PAT、Web Bot Auth | 外部协议/提供方 | 授权 agent 证明与真人证明不同；不伪造受信设备证明 |
| V05 | 蜜罐、不可见链接等主动诱饵 | Anubis 已有 honeypot 可复用 | 无障碍工具、预加载、扫描器需单独解释；第一期不是必装项 |
| V06 | 遥测缺失、篡改、重放、超时 | CrowdSec 协议 + schema 校验与测试故障注入 | 缺数据是 unavailable/invalid，不能当“未检出” |

公开商用系统证明需要多层视角，而非单一 webdriver 检查。对照依据包括 [Cloudflare 检测引擎](https://developers.cloudflare.com/bots/concepts/bot-detection-engines/)、[JA3/JA4](https://developers.cloudflare.com/bots/additional-configurations/ja3-ja4-fingerprint/)、[Akamai 检测方法](https://techdocs.akamai.com/cloud-security/docs/detection-methods)、[HUMAN 特征](https://docs.humansecurity.com/applications/bot-characteristics)、[阿里云自定义规则](https://help.aliyun.com/zh/waf/web-application-firewall-3-0/custom-advanced-rules)。这些来源没有证明京东或淘宝使用其中某个具体产品。

## 7. 哪些缺口允许补，怎样避免再次自研整套系统

| 缺口 | 最小实现 | 复用边界 | 不接受的扩展 |
| --- | --- | --- | --- |
| 实验与产品运行关联 | 本地 case、execution、phase、组件版本与结果引用 | 现有运行事件/存储；独立实验 manifest | 新的工作流调度器、Agent loop、账户库 |
| 业务步骤与网络日志关联 | 受控站生成 trace；宿主关联动作序号和时间 | 上游日志、标准 HTTP/DOM 观测 | 在真实网站注入专用识别头或改写其请求来“测量” |
| 上游未提供的明确时序规则 | CrowdSec 自定义 parser/scenario/appsec-config | 上游 Expr、桶/窗口、告警机制 | 自写 Redis/SQLite 计数器和第二套通用规则引擎 |
| DOM 事件与可见性差异 | 只在自有夹具记录必要摘要 | 浏览器标准事件 API；已有探针优先 | 未经校准的“真人概率”、鼠标生物特征 ML |
| 报告与证据脱敏 | 字段白名单、缺失原因、版本化结果映射 | 现有 Zod/日志边界 | 复制 cookies、Profile、完整页面或完整指纹到 Git |

每个扩展必须附一张缺口记录：`mechanismId`、上游固定版本/源码、缺少的具体输入或规则、正反例、采用的公开扩展点、增加的自有文件、验收与删除条件。先尝试上游配置，再考虑适配器；只有两者确实无法承载才提出新的实现。

未找到成熟行为模型、没有目标站历史数据或无法校准的项保持“未覆盖”。把未知显式保留，比新增几十条无依据规则更有开发价值。

## 8. 实验设计与验收门

### 8.1 先证明检测器有工作，再比较浏览器

| 组别 | 内容 | 用途 |
| --- | --- | --- |
| 人工基线 | 无自动控制的浏览器；键盘/粘贴/隐私设置等代表场景 | 测误报及正常变化；手动采样由独立人工操作完成 |
| 已知自动化对照 | 未定制的标准自动化环境、非浏览器 HTTP 客户端 | 验证检测链路、日志、规则没有被 allowlist 或部署问题短路 |
| 当前 B-A-T | 账户准备→探索→sample/verification→正式复跑→恢复/清理 | 得到真实全生命周期访问代价与暴露信号 |
| 单变量候选 | 保持任务/版本/环境，逐项改变宿主、配置或已定位路径 | 建立因果比较，不能同时更换 IP/Profile/控制器 |
| 留出复核 | 未参与调参的探针、场景、浏览器版本；之后可加自有 WAF | 避免只针对公开测试题取得好看分数 |

人工基线不能由另一个 Agent 生成。headless 可用于无人值守组件测试，但不能代替“同 Windows、同 GPU、同浏览器模式”的人工对照。用户选择的日常浏览器保持独立；本轮没有取得使用它进行实验的授权。

### 8.2 最小受控任务

首批复用一个已有本地动态选择场景，取得人工、连接、观察、执行的同环境对照。确认候选改动后，再加入表单填写/校验/提交这一不同任务类别，证明集成不依赖单一任务。初态已满足、顺序变化、零结果等优先复用既有夹具；挑战、429 和会话过期只在验证相关工作包时加入。使用虚构数据和本地账号，不复制真实平台页面或登录材料。

每个 case 独立分配实验会话和服务器检测状态；浏览器会话保留还是重建由 case 明确指定。既不能每次随意换 Profile 破坏可比性，也不能让之前的挑战 cookie 使新一轮跳过检测。服务器 IP ban/桶状态和浏览器 cookie 状态分别登记。

### 8.3 必须输出的结果

检测结果按 detector、规则版本、signal、观测值类别、命中原因、采集状态分别输出。记录原始组件分数；不把多个相关检测器平均成“真人概率”。

带标签的样本输出 TP/FP/TN/FN 和各环境分母；小样本不报夸大的百分比。比较报告展示新增/消除信号、业务结果、各阶段导航/请求/重试数量、总耗时和资源清理状态。请求预算与 browserCommandCount 分开，一个浏览器命令可触发多个请求。

通过开发验收须同时成立：检测正反例可区分、人工误报有解释、数据没有漏采冒充通过、任务结果保持正确、普通复跑零隐式 LLM、一个产品运行一个实际控制会话、涉及的挑战恢复与资源清理正确。上述功能不变量本身还不证明反检测有效；必须另满足 [效果硬门](ANTIBOT_SYSTEM_INTEGRATION_PLAN_20261007.md#83-效果硬门不能用功能回归代替)，逐项证明预先登记的识别差异已消除或达到约定标准。

## 9. Reuse Assessment

```text
capability: 网站侧自动化信号检测、受控挑战与行为场景、B-A-T 对照评估。
existing implementation in repository: 已有浏览器准备/复跑/审计；未建设该检测实验室。
mature candidates and pinned versions: 第 2 节；CrowdSec 底座成熟，新 Bot Detection 仍为 Alpha。
selected implementation: 最小首批为独立 fpscanner + 既有本地场景/运行记录；CrowdSec 为多层扩展，独立探针与 JA4 按验收目标接入。
reused public surface: fpscanner collectFingerprint；后续 AppSec/bouncer 协议、Hub 配置、LAPI/日志/指标、BotD load、JA4 CLI。
B-A-T-owned adapter and remaining gap: 任务夹具、实验版本/身份关联、脱敏报告；平台历史与行为 ML 不自研填满。
license/runtime/platform fit: 主体 MIT；TLS JA4 BSD-3；备选 BunkerWeb AGPL；Windows 产品 + 独立服务器实验室。
browser/runtime/state ownership conflicts: 检测引擎不控制浏览器、不进入 TaskChain 调度；实验结果不覆盖产品运行事实。
replay model calls: 检测与报告不调用模型；产品普通复跑零隐式 LLM。
rejected candidates and evidence: 第 5 节；允许单探针做受控诊断，拒绝以此为由自研完整服务器检测、只以 PoW 或总分结算。
focused validation: 固定源码/版本/许可证及接口核验已做；组合启动、Windows 联调、人工基线、真实浏览器效果未做。
```

下一开发阶段只执行 [集成方案的 P0/P1](ANTIBOT_SYSTEM_INTEGRATION_PLAN_20261007.md#8-实施顺序与每阶段交付门)，先确认组合能运行并有效检测。本文不授权启动开发或恢复任何已停止的平台测试。
