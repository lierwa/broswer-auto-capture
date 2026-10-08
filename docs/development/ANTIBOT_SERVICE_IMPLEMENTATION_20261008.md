# 常驻反爬检测服务与 B-A-T 联调

**最新结论：服务与底层控制对照已完成，见 [最终交付](ANTIBOT_DELIVERY_20261008.md)。用户最终明确不以任务链可复跑建设为本轮重点，已停止该方向扩展。以下保留实施时的决策与历史首败。**

2026-10-08，master@4304981 工作区。用户再次明确最终交付是先运行独立检测服务，B-A-T 按正常任务访问受保护站点，再依检测事实改造 B-A-T。此前 M0 和 W3 是局部成果，不能称整体 P0–P4 完成。保留已有代码、证据与首败，整体任务重新标为进行中。

## 开工前边界

```text
Product Alignment:
- natural-language task: 在可运行的自有检测站执行搜索选择和表单任务，根据网站侧判定改造现有 B-A-T。
- reusable chain boundary: 现有需求、准备、编译、发布、普通复跑；实验站是独立目标。
- runtime inputs: 本地靶场入口与任务参数、现有用户所选浏览器。
- dynamic task outputs: 当次选择/提交结果；检测结果、访问记录、限制和业务结论分别持久化。
- generic platform capability used: 原 B-U/Runner/TaskChain 和生命周期；检测侧复用上游服务。
- replay model calls: 普通复跑为 0。
- site/task-specific code added: no；虚构业务数据仅位于实验站。
```

```text
Reuse Assessment:
- capability: 常驻网站侧反爬检测、真实挑战/阻断、跨请求观测及 B-A-T 运行关联。
- existing implementation in repository: M0 node:http 夹具、固定 fpscanner、Brotector、Runner 接口和真实发布链路验证；尚无常驻检测服务。
- mature candidates and pinned versions: CrowdSec 1.8.1/909b5157986a2b2c2163300fdaef5ed01289f7d2；Hub f5cd0975d0bd69ebad09c5e6992d4f1a1ef594b0；Nginx bouncer 1.2.3/067541cdfff4b650182d819e92c04a207aa2fbb5；Lua 1.0.19/ec94d512927cf70be865686e4eb928d128189633。
- selected implementation: 先验证文档已有 CrowdSec AppSec + 官方 bouncer 组合；Docker Compose 管理独立 Linux 服务，Windows B-A-T 保持原位。
- reused public surface: 官方镜像/构建、AppSec 配置、Hub collection、cscli、bouncer 配置和原生挑战协议。
- B-A-T-owned adapter and remaining gap: 固定制品、局部启动配置、合成目标站、脱敏记录、实验与产品执行关联；不自写评分、签名、PoW 或行为聚合引擎。
- license/runtime/platform fit: 上述组件 MIT；Docker Desktop/Compose 已安装但 Linux daemon 尚未运行；镜像 digest 和本机兼容性在启动验收时冻结。
- browser/runtime/state ownership conflicts: Compose project 固定 bat-antibot-lab；仅本机回环端口；不映射个人浏览器 Profile、不修改系统代理/防火墙、不替换现有 API；检测服务不拥有产品浏览器。
- replay model calls: 0；仅正常首次准备可调用产品已配置模型。
- rejected candidates and evidence: M0 瞬时夹具不能交付持续服务；单纯把布尔结果包装成自行签发的通行证会重造 CrowdSec 已有协议，不采用。
- focused validation: 服务独立启动/重启/持久化；无 cookie 请求进入真实挑战；固定正例被拒绝；原 B-A-T 与候选走同一保护入口；业务输出、检测明细、请求阶段、零模型与清理分别核验。
```

## 本轮验收目标

- 明确的启动、状态、停止入口，返回稳定受保护网址和观测入口；服务生命周期独立于单次测试和 B-A-T。
- 官方默认 balanced 规则保持原样，禁止为让 B-A-T 通过而降阈值或白名单放行本机；关闭云共享/自动规则更新，内部接口不对外发布。
- B-A-T 正常准备、发布、复跑访问服务；检测器不读取 reference/candidate 标签，不以测试参数作为自动化判定。
- 首次失败保留；遇到未覆盖信号继续依据源码与对照定位，不能用探针未命中代替业务完成或宣称对所有网站不可识别。
- JD 停测边界持续有效；不需要用户重做旧人工基线；不创建 worktree、不推送、不重启已有 API 来绕过此前工具拒绝。

## 2026-10-08 运行环境纠正

用户明确本机没有可用 Docker Desktop，停止该路线。此前把残留 CLI 和文件误当可用安装，启动两次均失败。第一次为 dockerInference，保留旧运行目录后第二次为 Secrets Engine；没有重置 Docker、删除镜像/卷、安装或修改其设置。保留目录 C:/Users/30553/AppData/Local/Docker/run.antibot-backup-20261008，原 run 由 Docker 重建；不是永久清理，收据 work/antibot-service/docker-runtime-repair.json。

已核验现有 WSL Ubuntu 26.04、systemd 用户服务可用。实验组件采用工作区内便携二进制，systemd 管理实验进程，Windows B-A-T 保持原运行方式。固定 CrowdSec 1.8.1/Hub，网关调整为 Traefik 3.7.14（MIT）与 crowdsec-bouncer-traefik-plugin v1.8.0-alpha/710e88808baccb320d7b2b3560397e1474e3e98b（Apache-2.0）。该版本已实现 AppSec 原生挑战转发，仍为 Alpha，必须实际校验挑战体、多 cookie、拒绝和业务转发后才能冻结适配结论。公开 localplugins 方式加载完整固定上游源代码，不改检测评分。原 Nginx/OpenResty 方案需要另装运行时，本机没有，不再作为当前启动前提。

## 最终复用与真实验证

```text
Reuse Assessment:
- capability: 独立网站侧指纹挑战/拒绝及 B-A-T 底层控制前后对照。
- existing implementation in repository: 既有 RunnerProcess、B-U、owner-scoped DailyChromeExtension、M0 固定探针。
- mature candidates and pinned versions: CrowdSec 1.8.1/909b515…、Hub f5cd097…、Traefik 3.7.14、bouncer v1.8.0-alpha/710e888…、便携 Node 24.9.0；发行 SHA256 见 artifacts.json。
- selected implementation: 上述固定组合，通过既有 WSL Ubuntu 的 systemd 用户服务运行；没有 Docker。
- reused public surface: cscli collections/parsers/hub upgrade、AppSec 原生挑战及指标、Traefik localplugins、systemd-run。
- B-A-T-owned adapter and remaining gap: 本地端口/私有源站配置、合成业务场景、脱敏观测、实验 owner 和前后结果；不自写风控算法。
- license/runtime/platform fit: CrowdSec/Hub/Traefik/Node 为 MIT，bouncer 为 Apache-2.0；Windows 浏览器 + WSL Linux 服务实测通过；bot/bouncer Alpha 风险保留。
- browser/runtime/state ownership conflicts: 服务仅占用本机回环；原 API 不重启；日常任务窗口由原 owner 生命周期关闭；服务保存独立 SQLite 和日志。
- replay model calls: 控制对照 0；本轮不再扩展 TaskChain 编译。
- rejected candidates and evidence: Docker 无可用实例，停止路线；M0 瞬时探针不具备独立服务；稳定 bouncer 1.7.1 未具备所需新挑战转发，选已核源码并实测的 Alpha。
- focused validation: 正例真实拒绝；同日常浏览器前后各 3 轮独立 cookie 域，旧控制 CDP/100 拒绝 3/3，新控制挑战 accepted/solved 和读取/点击 3/3；真实服务重启持久化通过。
```

公开源码：[CrowdSec 固定版本](https://github.com/crowdsecurity/crowdsec/tree/909b5157986a2b2c2163300fdaef5ed01289f7d2)、[原始评分规则](https://github.com/crowdsecurity/hub/blob/f5cd0975d0bd69ebad09c5e6992d4f1a1ef594b0/appsec-configs/crowdsecurity/appsec-bot-challenge-scoring.yaml)、[原始 balanced 阈值](https://github.com/crowdsecurity/hub/blob/f5cd0975d0bd69ebad09c5e6992d4f1a1ef594b0/appsec-configs/crowdsecurity/appsec-bot-challenge-scoring-balanced.yaml)、[固定 bouncer](https://github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin/tree/710e88808baccb320d7b2b3560397e1474e3e98b)。

先后出现的环境失败均保留在 work/antibot-service：根目录 TypeScript 模块模式、Windows tar 符号链接、WSL 参数路径、LAPI 凭据目标文件、Hub parser 名称及已有规则缺数据集。当前工具目录显式 ESM、WSL tar/exec、独立 LAPI 凭据和官方 hub upgrade 已解决对应启动问题。Hub 分支固定且不运行自动更新；数据集来自上游动态 URL，本次下载摘要保留，不能声称外部数据内容永久固定。

`product-C2IwfJ` 到达业务页并选对 7，但编译缺少完整候选读取，且同域此前人工访问可能已获得 clearance，因此不作为反爬阴性证据。后续底层对照每轮单独 hostname；分组标签不传给检测器。参考启动一次 RuntimeError 与候选测试规格一次 ZodError 均独立留档，详见最终交付。原核心补丁未在本轮再次扩张。
