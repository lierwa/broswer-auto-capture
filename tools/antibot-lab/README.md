# 本地独立检测实验

`antibot-combined.acceptance.py --account-borrow`只跑实际账号借用连接的当前HTTPS组合检查（冷挑战、动态选择、Fetch、原异常仍告警），不重跑原三项/重启套件。2026-10-09该检查通过；源码/范围/首败见实施记录。

账号借用最新实现使用固定Patchright1.63兼容驱动，browser-use主控制保留。`npm run upstream:setup`安装哈希固定制品并恢复其遗漏的原no_defaults焦点条件；`--check`核修补后SHA。`account-borrow-runtime.acceptance.ts`现为实际产品回归，要求Runtime阴性、原生CSP/主世界/存储和owner正常；旧“账号Runtime仍阳性”为修复前状态。实际Chrome扩展传输及Fetch所有权已由admission-_vzu9yie复核；使用owned临时Profile，其他OS未测。

现有 Windows checkout + WSL Ubuntu；使用固定 CrowdSec/Traefik/systemd 用户服务，不依赖 Docker。
此目录是独立盾与校准入口，HTTP 200、采到字段或安装成功均不等于检测验收。
`start/status`同时检查四个既有Creep/Worker bundle的固定来源、摘要和原异常探针保留标记；缺失/错版/损坏返回`probe_assets_unavailable`。按原`prepare-fixtures.ps1`构建，不用空文件或关采集使健康检查通过。
当前证据、首次失败和未测范围见 `docs/development/ANTIBOT_IMPLEMENTATION_20261008.md`。

最新执行顺序：先完成本地可测功能与短测，跨天最后；当前没有跨天作业，不部署云端。业务页BotD/输入摘要已经在线接入CrowdSec；这些客户端报告可伪造，只告警、不授予通行身份。报告telemetry按源站签发page关联，partial/error/missing均不能宣称完整阴性。

在线增量：原CreepJS WebGL镜像和window/worker四字段对照已接业务collector→原CrowdSec告警；分别用`antibot-combined.acceptance.py --webgl-online`、`--worker-online`校准。在线Worker只使用同源专属进程、成功/异常/三秒超时均终止，不注册/注销业务Service Worker；构建对固定上游TS校验后仅扩可选地址/类型，算法不改。`--workers`按原准备入口构建，receipt另记录适配文件SHA。报告分别显示BotD/WebGL/Worker测量健康；不把一项正常当所有探针正常。HTTP/JS身份包含四基础加七高熵字段（formFactors在内），缺权限保持不可测。

键盘/滚动线索复用MIT Kitsune f0a22b3原公开函数与0.15/30ms阈值，制品在artifacts.json固定。collector不保存键值，服务器只落判定；缺样本/触屏API/倒退时钟分列。`antibot-combined.acceptance.py --behavior`为实际CrowdSec在线控制，`tests/calibrate-input-behavior.ts`复用保存样本；锚点跳转可触发正常反例，只是实验辅助线索，不能作为一般人机分类或单独封禁。

输入节奏回归：`antibot-input.acceptance.py --joint-only --long-text`复用原owned gate/收尾，验证315字符完整值与原生事件。B-U未配置的TypeTextEvent默认期限补新增逐字等待；显式`event_timeout`、`TIMEOUT_TypeTextEvent`和外层任务预算不改。正常耗时约79秒，不能用60秒超时失败冒充检测拒绝。

明确挑战恢复：主文档官方挑战标记接原TaskRun检查点和准备阶段人工等待，普通403仍拒绝。`human-wait-real.acceptance.ts`的`BAT_HUMAN_WAIT_PUBLIC_MANUAL=1`仅为已授权练习站真人验收，需要用户在线；不自动批跑、不记录答案。`antibot-author-access.acceptance.py --status 403 --resume-challenge`是本地B-U协议控制，不能当真人或外站准备验收。

公开诊断按需运行：设置`BAT_RUN_PUBLIC_DIAGNOSTIC=1`及原runner的PYTHONPATH，运行`apps/api/tests/antibot-public.acceptance.py --device-check --interactions-only`。使用owned临时可见Chrome、原普通输入/click和虚构资料，只记录公开具名布尔结果；exit0只表示测量有效，检测通过还须`signals.isBot=false`。`--manual`只在用户已同意时使用，等待对应报告目录的human-done.json，不能无人值守自动确认。原ignored public-probe已迁移到此入口，时序/坐标试验与请求观察分支已移除，首败报告保留。最新f58my_b7及无实验观察的4hnide0t均阴性；不等于普遍网站通过。原输入兼容命令仍为`antibot-input.acceptance.py`，包含Shift/键码与原生框架提交检查。

所有命令从实际 checkout 根目录运行；禁止在真人采样或长窗口检查期间重启检测服务。
`lab.ts` 的 prepare/configure/stop 会拒绝打断 `bat-antibot-window-test`。该检查若被系统重启打断，必须保留为中断，不能续写成连续时间通过。

## 新环境准备

1. 满足项目 Node/npm/Python 既有依赖；盾在线H2需要WSL Python>=3.11及Go，独立协议校准另需tshark；均非B-A-T浏览器产品依赖。
2. 服务停止时运行 `npm run antibot:lab -- prepare`：验证 `artifacts.json` 固定SHA256，复用官方安装器与原生配置，不覆盖既有secret。
3. 运行 `powershell -NoProfile -File tools/antibot-lab/tests/prepare-fixtures.ps1`：使用固定lockfile与官方npm registry完整性摘要；`npm ci --ignore-scripts`作用于tools/antibot-lab和ignored实验runtime目录。打包现有React夹具和固定CreepJS页面、worker、设备原模块，不上传指纹。
4. 服务停止时`npm run antibot:lab -- refresh-source-data`下载并验证Tor Project公开地址，生成原CrowdSec来源规则；此名单仅来源属性，不自动封禁，不代表全局信誉。`status`/报告显示available/stale/unavailable；24小时截止不被304延长。刷新需维护时停止引擎且没有长测，不自动要求台式机常开。
5. 用已配置Python执行`tools/antibot-lab/prepare-geodata.py`，复用第2步已解压的CrowdSec原源码模块，不需要先编译挑战补丁。下载当月DB-IP Country/ASN，原读库验证后部署；`--candidate`可复用本实验reports内的候选。服务停止且没有长测时操作，保留旧数据备份。
6. 当前完整网络层需要固定元数据候选：服务停止时，已配置Python运行`tools/antibot-lab/prepare-edge-h2.py`，随后`npm run antibot:lab -- activate-edge-h2`；仅基础prepare的发行binary不具有本项目新增H2/H3/首广告ALPN出口。
7. 运行`tools/antibot-lab/prepare-persistent-engine.py`构建固定挑战持久化候选，再`npm run antibot:lab -- start`，最后`tools/antibot-lab/activate-persistent-engine.py`启用候选并恢复服务。这是首次安装顺序；已有已激活receipt的环境直接start，重编已选binary前必须stop，不必重复构建。
8. 用`npm run antibot:lab -- status`核五个服务/health与两类数据状态。Tor或GeoIP缺失、摘要不符或过期均拒绝启动；Tor刷新按stop→refresh-source-data→start，GeoIP按stop→prepare-geodata→start执行。Tor有效期固定为源发布时刻+24小时，过期304不会返回刷新成功。启停、构建与receipt核验只是交付验证，检测结果仍取对应校准报告。以上顺序已核源码；独立新机器从零安装尚未实测。

地理数据来自[DB-IP](https://db-ip.com/db/lite.php)，CC BY 4.0；City文件名内实际为Country-Lite，无城市/坐标。有效期为MMDB构建时刻加35天，重下载不续期。报告显示available/stale/unavailable；原CrowdSec持续进程不自动热更新，运行到期需要维护刷新。原国家/时区正反例在geo-source-iowd9nh4/current.json，实际加载在d1-geo-engine-maps.json；不是公网物理地理精度证明。

协议测试依赖：Web Bot Auth 0.2.0（Apache-2.0，自述未经审计），只验证签名bot身份。
Privacy Pass本地协议校准使用官方0.9.0（Apache-2.0，Node>=20）；原Client/Issuer/Origin与薄绑定校验分开。`node tools/antibot-lab/tests/calibrate-private-token.mjs`生成原语结果后，将其`results.json`路径传给`calibrate-private-token-binding.mjs`，验证挑战/密钥绑定、严格长度、SQLite一次消费与重开连接。只存布尔结论和消费摘要，不存私钥/原token，不连接远程issuer；合成签发没有可信Attester/硬件身份，也未配置成在线通行入口。
CreepJS构建：Rollup4.30.1/plugin-typescript12.1.2/TypeScript5.7.3/tslib2.8.1，使用上游noCheck构建保留故意异常探针。
所需制品与构建均未接入主产品依赖。`tests/creep-entry.ts`只导入明确原模块，不执行上游主站上传流程。

## 入口与验证

`/case/{id}/captcha`复用svg-captcha1.4.0，只接受用户在页面输入，未通过返回401、通过后该会话返回200。图片答案/票据仅内存5分钟，源站重启重新验证；无答案日志或自动求解。`human-wait-real.acceptance.ts`的`BAT_HUMAN_WAIT_MANUAL=1`仅接受本机owned HTTPS4183场景，沿原checkpoint等待真人操作并核原运行恢复；实际通过证据`bat-human-wait-real-tIFyCm`。测试启动器只信任该Profile的实验SPKI，不修改系统/个人浏览器信任。

| 入口 | 用途 |
| --- | --- |
| 4187 / 4186 | 原完整CrowdSec HTTP / HTTPS组合 |
| 4183 TCP / UDP | HAProxy首段TLS/QUIC→原完整盾；固定候选的TCP/QUIC首广告ALPN已独立校准，原发行版仍可能partial |
| 4181 / 4182 | 同进程TLS终止/原网关内部PROXY入口，均回环；不作产品直接入口 |
| 4185 `/measurement` | TLS/H2/H3独立测量，没有AppSec；不可当成完整盾放行 |
| 4193 `/case/{uuid}/transport` | Hypercorn/hyper-h2原协议→Kitsune一致性→CrowdSec，独立首跳H2检测；无完整JS挑战/JA4 |
| 4184 `/case/` | 频率/关联单层检查，LAPI仍启用 |
| 4188 | 本机管理与脱敏报告 |
| 4189 | secret保护的源站，不作直接验收入口 |

- `node --import tsx tools/antibot-lab/tests/calibrate-scenarios.ts`：原生hubtest正反例；回放时间不代表真实时间。
- `calibrate-botd.ts`、`calibrate-fpscanner.ts`：原判据/输入有效性分开校准；缺失不能填false。
- `node tools/antibot-lab/tests/calibrate-auth.mjs`：官方库本地签名/过期/重放等协议验证；临时私钥不落盘。
- `apps/api/tests/antibot-*.acceptance.py`：明确的owned gate，finally核验PID/启动时间/Profile，关闭并删除自有临时Profile；不使用个人浏览器。
- `antibot-launch.acceptance.py`使用实际ManagedWindow，默认可见、`--headless`检查保留无头阳性；`antibot-session.acceptance.py`需服务ready，验证真实Cookie绑定和同票重放，原票/Cookie只在内存。两者都可能短暂打开独立测试窗口。
- `antibot-cookie-lifetime.py --start-12-hour-check`是真实12小时检查，当前按用户要求后置、不自动启动：浏览器取样后即关闭，worker只内存持有Cookie；核对worker.json中的实际PID/create_time/executable，启动器PID不等于worker。睡眠/重启错过窗口须记中断/失败。
- `antibot-cookie-short.acceptance.py`在无其它验证时临时使用公开20秒TTL、真实网关到期检查，finally恢复原配置并核验；不是12小时证明。
- `antibot-online.acceptance.py`单个owned可见窗口验证业务、在线标记/输入阳性、探针缺失、页面归属和拒绝原始输入字段；`antibot-author-access.acceptance.py --status 503|429|200`用真实B-U循环及固定本地模型回复验证首次失败停止、正常继续。
- `antibot-edge.acceptance.py --workers`在一个owned可见会话完成在线TLS正反例、pcap独立校准、ALPN反例及CreepJS三类worker/篡改/CSP。先执行`node tools/antibot-lab/tests/build-creep.mjs --workers`生成固定原模块bundle。新增HAProxy使用`prepare-edge`（需服务停止）准备；不安装系统服务/WindowsCA。
- `antibot-session-restart.acceptance.py`是真实服务/浏览器重启、Cookie/localStorage保留、sessionStorage与新Profile隔离；与长测不并行。`antibot-online.acceptance.py`也验证上报原子去重/源站重启/版本错误/空健康/missing→timeout。
- `node --import tsx apps/api/tests/antibot-access.acceptance.ts`：owned无头主文档503/429/200恢复、实际请求分母和清理；不访问外部平台。
- `tests/live-rate.mjs`、`live-security.mjs`、`history.mjs`、`live-windows.mjs`、`calibrate-transport.mjs`须在WSL中以实际checkout为cwd运行，使用prepared.json中的原cscli。每个脚本有独立来源与污染门，不清决策、不白名单、不自动重试旧来源。
- `history.mjs`含服务重启，只能在没有长期窗口作业时使用；其首轮CLI去重断言失败另有readback恢复证明，勿当作无失败样本重复运行。
- HTTP3观测复用 `go install github.com/quic-go/quic-go/example/client@v0.55.0`，GOBIN指向实验runtime/quic-tools；`tests/http3-capture.sh`仅抓lo/4185，15秒/4MB上限。按既有捕获方式以WSL root运行该脚本，不修改系统捕获权限或证书信任。

`work/antibot-service`中的Cookie、secret、密钥日志、pcap、Profile和原始数据全部保持ignored，不入Git。

GeoIP运行期有效期：`start`在原Hub评分配置上生成owned覆盖，只给`timezone_country`原hook追加`TimeNow()`构建截止；原5分、其它评分、阈值和挑战保留，Hub源码不改。已运行engine的配置需要变更时明确要求先停止该owned服务，不假称热更新。过期后不再据此评分，`status/report`显示stale；新数据仍通过原`prepare-geodata.py`维护刷新。`geoip-calibration.go --guard`为同进程真实短截止验证，不是35天长测。
真人页面不存文本、按键字符或剪贴板；自由操作与严格步骤、单人分段与独立人群分开记录。
静态编译链fixture、真实runtime、正常准备发布链路、外部平台业务验收必须分别报告。

补充入口：`antibot-combined.acceptance.py`在完整TLS4183跑三项底层业务/异常；不是自然语言编译验收。`antibot-tls-fragment.acceptance.py`无浏览器验证TLS分片/无ALPN有效性。`node tools/antibot-lab/tests/build-creep.mjs --devices`后用`antibot-device.acceptance.py`校准原屏幕/GPU/权限判据，仿真缩放不是真实多屏。`antibot-cooldown.acceptance.ts`验证跨两个Runner的真实20秒站点冷却；`test_access_cooldown.py`保护账号请求/预模型/解析边界。历史`calibrate-transport.mjs`的JA4_ab实验不代表当前在线PSK规范化关联，不能再以它宣称正常恢复无误报。

持久准入配额：`budget.py`直接加载artifacts中校验过的PyrateLimiter4.5.0/filelock3.19.1纯Python wheel，由WSL `/usr/bin/python3`执行；`data/budget.sqlite`保留已准入业务事件，默认60/滚动小时、240/滚动日，按case+网关IP分组。静态/挑战/遥测排除；429带Retry-After。不要清数据库去让测试通过；不允许Windows/WSL并发写同一份SQLite。原CrowdSec漏桶继续存在。普通关机可保存这份状态，真实断电容灾/跨天持续运行另测。

挑战重放持久化：原CrowdSec1.8.1内存spent集在真实重启后允许旧票再用（`replay-restart-53ii718u`）。现有本机已启用固定源码+SQLite薄适配，原评分/签名/PoW/JS不变；`replay-restart-y2bw4ben`正常新票、旧票重启前后拒绝与暖Cookie通过。`data/challenge-spent.sqlite`仅存nonce哈希/过期时间，容量满/损坏不降级放行。它不是多主机共享存储，断电仍未测。

新机器完成基础prepare/start后，必须先用已配置Python运行`tools/antibot-lab/prepare-persistent-engine.py`（WSL Go/C编译器、固定go.mod；不运行全量测试），再运行`activate-persistent-engine.py`。后者核归属/没有长测、验证配置、切换owned engine并核readiness；失败恢复原引擎/配置。原release二进制不覆盖。`persistent-engine.json`是显式启用凭据，后续start校验候选SHA；重新configure保留spent_set_db。原构建没有此补丁，不能当跨重启防重放通过。重建当前已启用二进制前先按归属停止engine，不能边运行边改它。

`apps/api/tests/antibot-replay-restart.acceptance.py`使用实际正常挑战票据、真实engine重启，票据/Cookie仅内存；不与长测并行。账号借用Runtime旧阳性已由本页顶部所述兼容驱动修复，原首次失败证据保留。

新增H2使用`prepare-h2`（仅h2服务停止时），`start/status/stop`管理五个owned服务；固定wheel与分类器SHA校验，旧离线校准写h2-hints-offline不覆盖在线二进制。`antibot-combined.acceptance.py --h2`实际B-A-T与协议控制，不能当4183完整盾验收；同连接每个请求独立核伪头顺序，缺失/超量/HTTP1回退是unavailable。完整流程用`--flow`验证已有CSRF/SPA/缓存/303/API。富文本定点检查`antibot-input.acceptance.py --rich-only`，默认完整输入回归保留。

`apps/api/tests/antibot-h3.acceptance.py`复用常驻4183的WSL私网TCP/UDP入口，地址由start/configureEdge重取并保存在ignored的edge-endpoint.json；必须使用receipt验证的原生元数据候选→完整盾。Windows B-A-T正常h3、quic-go0.55.0同会话混栈及首广告不同于协商控制、独立40秒/4MB pcap通过（h3-integrated-pi6offav）；原QUIC组件需按前文准备。DNS/强制QUIC/SPKI仅本次owned Profile，不改个人信任或系统网络；finally关闭owned浏览器并永久删除Profile，无临时第二套HAProxy。当前ALPN来源已校准，H3其余字段仍未完成。

元数据候选构建：停止owned服务后运行`python tools/antibot-lab/prepare-edge-h2.py`，再`npm run antibot:lab -- activate-edge-h2`、`start`。固定Ubuntu安全补丁、H2/H3出口及原生ALPN扩展的源码/hash都由recipe核验；原发行binary保留。构建/启动不是检测验收。原始H2校准在`antibot-h2-edge.acceptance.py`，TLS边界在`antibot-tls-fragment.acceptance.py`。H3新增25ygwnnz通过SETTINGS/逐stream伪头、正常/混栈关联与62位/容量；缺失不填空，真实空SETTINGS单列，GREASE仅在关联归一时排除。QUIC其余字段未关闭。

QUIC新增12个RFC9000有效传输参数复用HAProxy原客户端参数结构，不含CID/令牌内容、原始参数顺序或未知扩展。`h3-integrated-_c0yc_c3`Chrome正常、混栈告警、17000ms控制和独立tshark一致；`antibot-h3.acceptance.py --metadata-only`仅验证缺失/越界，不打开浏览器。完整H3入口保留原设置/头序/ALPN检查；连续性变化仅为辅助告警，合法客户端参数也可能变化。

`antibot-budget.acceptance.py`在独立owned数据库校准并发/重建/真实短窗；`antibot-budget-http.acceptance.py`是管理员secret保护源站的单层实际配额与服务重启校准，需独占维护窗口，没有完整网关参与。`calibrate-biomech.py`只复用既有数据诊断第二候选，不是生产行为分类器。
