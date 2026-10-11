# 盾系统独立化方案与开发交接（2026-10-10）

状态：**本方案随后已获用户明确实施授权，S0–S4 的本机纠正与必要验收已完成，见[最终结算](SHIELD_INDEPENDENCE_CLOSEOUT_20261010.md)。** 下文保留开发前方案/review 快照；其中“尚未实施/下一session/只文档”是当时事实，不覆盖后续授权与结果。
当前快照：Windows，实际 checkout 为 D:\work\browser-auto-tool，master@dc45be4f07fd2e9c4a425c0d257e8b1aaef8ed80。开始下一轮必须再次核对。
本文是盾独立化的实施依据；原检测机制、首次失败与反爬主线证据继续引用既有文档，不重写一份历史。

## 0. 决策摘要与最新用户要求

**采用同仓独立服务＋最小共享模块。独立安装、运行和交付，通用实现只维护一份。**

- 保留 tools/antibot-lab 现有目录、代码、探针、规则、页面和未提交独立化成果。
- 共享代码不等于共享进程或数据。盾不需要启动 B-A-T 的 API、任务编译、浏览器 runner 或模型服务；双方可依赖同一个小型公共模块。
- 首先消除已经确认的重复：盾 budget.py 为取消 API 导入，重复了原 quota.py 约 20 行适配。移出原实现供双方复用，不继续维护两个副本。
- 检测继续复用 CrowdSec、BotD/fpscanner、CreepJS、PyrateLimiter 及既有协议组件；不重建检测、评分、挑战、限速或服务管理框架。
- 只修真实软件问题并补独立交付缺口；网站保留、暂停扩展。已接入键盘判据漏展示属于修错，不作为扩网站的入口。
- 不新增人机概率模型，不训练/组合/换模型试验，不恢复自定 FPR 1%/召回 80% 的整线门槛。
- 在现有 master checkout 工作，保留全部改动；不创建 worktree，不修改相邻项目，不推送、不关机，不恢复京东自动访问，不启动云或跨天测试。
- 本 session 只获文档整理与 review 授权，不实施代码。以前“主线验收后一次本地提交”已经用在 dc45be4；不把它解释为独立化可再次自动提交。下一 session 按其启动指令处理本地提交；这不阻塞开发和必要验证。
- 技术困难由开发 agent 定位。单项外部条件仅阻塞该项；继续可独立工作，不能每完成一小项就结束，也不能无限重复不变的测试。

本方案纠正两个先前说法：“代码零依赖”不是独立化目标；“独立运行已通过”不代表“没有重复代码、全新安装也已通过”。

## 1. 前后上下文：哪些完成了，为什么还有这一阶段

| 阶段 | 已发生事实 | 下一 session 应如何使用 |
| --- | --- | --- |
| 原反爬主线 | 已完成纠偏后的实际修复与必要联合验收，并本地提交 dc45be4 | 不重新制定总体反爬方案，不重开已经停止的模型研究 |
| 第一次工程独立化 | 提交后新增本包依赖/锁、路径/数据配置、启动入口、测试位置调整；仍未提交 | 保留成果，做增量纠正 |
| 第一次独立运行验证 | 107 个盾文件复制到仓库外；独立安装/检查、6 项边界检查、WSL 预算跨进程、原冻结业务联合通过 | 证明当时源码和依赖可独立运行，且复用了既有数据与制品 |
| 本轮只读评估 | 发现 quota 适配重复、键盘规则漏展示、全新安装缺证、搬迁步骤仍手工 | 前两项是实代码问题；后两项是交付缺口 |
| 用户进一步纠正 | 独立化不能以重复实现已有代码为代价 | 采用公共模块单一源码，独立发布包包含所需依赖 |
| 本文交接 | 用户要求完整方案、上下文与 review，另开 session 开发 | 只交文档，不借此提前实现 |

历史详情只从以下入口定点读取：
- [原主计划 0 节](ANTIBOT_NEXT_SESSION_PLAN_20261008.md)：原范围、纠偏、禁止事项。
- [主线结算](ANTIBOT_CLOSEOUT_20261010.md)：主线修复、最后联合证据和未覆盖限制。
- [第一次独立化结算](ANTIBOT_STANDALONE_20261010.md)：当时实现与真实验收，不当成本文修正已完成。
- [覆盖矩阵](ANTIBOT_COVERAGE_BACKLOG_20261008.md)、[实施记录](ANTIBOT_IMPLEMENTATION_20261008.md)：只查受影响条目。
- [PROGRESS](PROGRESS.md)、[ROADMAP](ROADMAP.md)、[RESEARCH](RESEARCH.md)：当前断点、执行顺序、复用依据。

旧临时交接 BAT_ANTIBOT_EXECUTION_HANDOFF_20261010_003537.md 的 HEAD、共享 SW 优先顺序等是旧快照；不得照旧重开主线。历史凌晨关机授权已经失效。

## 2. 实际 checkout、改动与运行证据

### 2.1 本轮现场核验

- 分支 master，HEAD 完整值见文首。
- 文档修改前共有 60 个 Git 状态条目，其中 54 个非 Markdown 条目；这些已有改动均须保留。
- 主要变更是 tools/antibot-lab 内包/路径/构建/适配调整和根 package.json 的转发入口；另有文档。
- apps/api/tests/challenge_spent_store_test.go 显示删除，tools/antibot-lab/tests/challenge_spent_store_test.go 显示新增：既有结算记为测试搬迁。不得只因 D 状态就恢复旧文件，重新造成双份维护。
- 新增未跟踪文件包括 locations.mjs、locations.d.mts、lab_paths.py、local.example.json、tsconfig.json、本包 .gitignore 和对应测试。
- 本轮保存了带路径/存在性/SHA256 的临时基线清单，路径见临时交接；用于保护已有改动，不含密钥、Cookie、数据库或 Profile 内容。

### 2.2 可引用的原始证据

在 ignored 的 work/antibot-service 内：
- reports/d10-standalone-receipt.json：独立安装、未复制产品源码、冻结业务复用、恢复源码归属、资源结算。
- product-d10-standalone-e2vgdyra：完整 HTTPS、业务结果 7、普通复跑模型调用 0、3 条 H2 样本。
- reports/d10-final-mainline-receipt.json 与 product-d10-final-0tyto_qk：主线提交前结算。
- 其他原四变体及异常拒绝证据通过主线结算索引查找，不遍历/输出全部运行原文。

边界：
1. 单变体报告 ineligible99Rejected=false 表示该次未跑 99，不是该次已经证明拒绝。
2. freshPreparationPerformed=false 表示复用了发布链，不是重新进行了自然语言准备。
3. 副本启用过原数据及制品，不是空环境全部重建通过。
4. 最后回执记录六服务 inactive/MainPID=0、Profile 与临时副本永久删除。本轮没有查询实时服务/PID，下一 session 必须现场核对，不能引用旧回执断言现在仍停止。
5. 不能以“采到了字段”“HTTP 200”或“安装成功”代替检测和产品验收。

## 3. 已有能力与保留边界

| 层 | 已有能力 | 独立化保留的限制 |
| --- | --- | --- |
| 规则与挑战 | CrowdSec 固定 Hub、原评分/阈值、PoW、通行 Cookie、错误/过期/重放路径 | 已有 SQLite spent 补丁；不能称完全未改上游 |
| 浏览器探针 | BotD、fpscanner、选定 CreepJS 模块、Worker/WebGL 对照 | 各入口覆盖不同；部分设备模块为独立校准而非网页全部在线展示 |
| 请求身份 | HTTP 与 JS 基础/高熵身份比较 | 缺权限或字段明确不可测 |
| 网络 | TLS/JA4、H2/H3、ALPN、选定 QUIC 元数据与一致性检查 | 部分依赖 HAProxy 元数据补丁；不能单独证明真人、真实设备或全球地区 |
| 限速与状态 | CrowdSec 场景、PyrateLimiter SQLite 持久预算 | B-A-T 策略与盾配额各自配置；短窗/重启不等于跨天或断电容灾 |
| 行为线索 | 可信事件、原 Kitsune 弱线索、FCaptcha 窄键盘联合判据 | 不提供通用行为分类器；弱线索不升级为单独封禁 |
| 来源与协议 | Tor、国家/ASN 数据及过期检查；本地身份协议校准 | 不等于完整 IP 信誉、真实 issuer/attester 或通用真人证明 |
| 现有页面 | 自动检测、可选输入/点击/滚动、逐项状态、报告导出 | 当前 38 项是页面子集；观察报告与完整盾处置分开 |

日常 Chrome 共享 Service Worker 的逐页面归属仍有原限制；专属 Profile 已有主线证据。它们不属于本次盾部署边界修复，不能为了独立化重新阻塞全线，也不能宣称专属 Profile 完全替代所有日常 Chrome。

## 4. 缺口分级：必须修、必须补证、后置

| 编号 | 真实缺口和证据 | 分类/处理 |
| --- | --- | --- |
| I1 | apps/api/python/browser_use_runner/quota.py:8 与 tools/antibot-lab/budget.py:25 均实现同一 SQLiteBucket 调用及结果映射；git diff 显示后者由原导入改成重复实现 | 必修。抽出既有公共实现，删除两侧重复算法体，保留薄入口 |
| I2 | cadence.ts:17 输出 typing-cadence；check.js 的 groups 没有该 detector，mergeSignal 丢弃未知行 | 必修。只补原判据映射及正常/异常/不可测显示、导出一致性 |
| I3 | 原独立副本复用运行数据，README 明确新环境从零安装尚未实测 | 必须补证。空数据目录完成正式发布包安装与制品构建；有错误才补相应脚本 |
| I4 | 搬迁源码要手工改 prepared/environment 等 checkout 字段 | 必修交付流程。通过现有配置/owner 能力提供可重复步骤及失败恢复 |
| I5 | 共享模块抽出后，原“复制盾目录就能交付”的判定不再完整 | 必须随 I1 落实。发布包携带固定共享制品、来源和摘要 |
| I6 | 新共享包不在现有 vendor verifyForkSource 的校验范围 | 必须随 I1 落实。单独记录并校验共享包源码/制品版本，不能只刷新旧 vendor 摘要 |
| E1 | 页面缺网络/来源/挑战全量汇总和更完整版本解释 | 后续网站产品化；本期不追加完整目录、评分面板或新检测展示体系 |
| E2 | 建会话/遥测不受业务配额约束，自己的观测日志/会话记录缺完整生命周期策略 | 公网或长期开放运行前补；当前本地交付明确该边界 |
| E3 | 固定端口、服务名与 WSL Ubuntu，非多实例/跨平台 | 本版明确单实例，冲突应清晰报错；不新增多租户服务管理器 |
| E4 | 通用行为分类、RTT 单独判机器人、GPU 物理证明、真实外部长期验证 | 保留未实现/未测，不继续自组模型，不作本次门槛 |

I2 修复不得顺带重构网站。已有同源校验、页面签发、批次防重复、输入长度限制及脱敏输出继续保留，不另建一套安全协议。

## 5. 为什么选同仓独立目录

| 方案 | 优点 | 当前成本/结论 |
| --- | --- | --- |
| 同仓独立服务＋公共小模块 | 共享代码单一来源；联动修改及回归可一次审阅；独立产物照样单独运行 | 本期采用 |
| 现在新建独立仓库 | 可独立权限、团队、发布节奏 | 当前无对应刚需；会新增共享包发布/版本协调/历史迁移，不增加检测能力 |
| 盾继续导入 browser_use_runner 全部产品路径 | 暂时少移动文件 | 部署依赖方向错误；把小工具复用变成产品源码/环境耦合 |
| 各自复制适配代码 | 表面上目录独立 | 已经出现的错误做法，明确撤销 |

未来确有独立维护团队、访问权限或发布节奏时再拆仓；公共包仍用同一发布制品。现在不改目录名字、不改所有命令品牌、不搭私有包仓库或发布平台。

## 6. 目标结构与依赖边界

以下 packages/request-budget 为建议新目录，**尚不存在**；名称可按仓库命名规范调整，但单一源码和职责不变。

~~~text
apps/api/python/browser_use_runner/quota.py     保留兼容导出，委托公共包
packages/request-budget/
  pyproject.toml                             最小 Python 包元数据
  src/bat_request_budget/__init__.py          导出 check
  src/bat_request_budget/quota.py             从现有 quota.py 移入的唯一实现
  tests/                                     只保护公共接口/持久化不变量
tools/antibot-lab/
  package.json / package-lock.json
  budget.py                                  盾制品加载、参数和错误映射
  locations.mjs / lab_paths.py                已有配置事实源
  lab.ts / prepare*.py / tests/               沿用现有启停、构建、验证
~~~

~~~mermaid
flowchart LR
  BAT["B-A-T：任务及浏览器控制"] -->|公共模块调用| Q["唯一 quota 适配源码 / 固定发布制品"]
  SH["盾：检测、挑战及处置"] -->|公共模块调用| Q
  Q --> UP["原 PyrateLimiter SQLiteBucket"]
  BAT -->|HTTP 联合验收| SH
  BAT --> BD["B-A-T 独立策略与数据库"]
  SH --> SD["盾独立配额、密钥及数据库"]
~~~

四条不可混淆的边界：
1. 源码：两边复用同一公共实现，不各自维护同样函数体。
2. 进程：盾可单独启动；公共包不是新增远程限速服务。
3. 数据：代码相同也不共享业务配额、数据库、Cookie 或密钥。
4. 部署：盾的完整发布包携带公共依赖；裸源码子目录不是最终发布物。

公共模块只保留现有 check(database, scope, rates) 及结果结构。数据库路径、scope、rates 均由调用方传入；不引入网站默认限额、HTTP、浏览器对象、TS contracts 或 B-A-T 任务类型。

原行为须保持：scope 格式、SQLite 表名、PyrateLimiter 4.5.0、filelock 3.19.1、FULL 同步、原窗口/锁、retryAfter 向上取整及状态字段。不要借迁移添加第二套限流算法、清空历史或把异常转 allowed。

## 7. 共享代码如何交付：避免“抽出来之后装不上”

### 7.1 发布方式

优先使用标准纯 Python wheel，本仓维护源码、构建一次、两个消费者使用同一摘要的制品。无需发布 PyPI，也无需新建包注册服务。

复用仓库已有 Python 构建路线：vendor/workflow-use/workflows/pyproject.toml 使用 hatchling.build，已有 build==1.2.2.post1。共享小包不改 vendor 的 frozen lock。Hatchling 当前仓库声明没有固定具体版本；实施包 S1 应核验并固定构建后端版本及来源后做最小构建，不把其 README 中无上限依赖直接当成可复现版本。

可用现有 uv/build 前端构建标准 wheel，不写自定义 wheel 格式、包解析器或同步框架。[Hatch 构建与文件选择](https://hatch.pypa.io/latest/config/build/)、[uv 支持标准构建后端](https://docs.astral.sh/uv/concepts/build-backend/)

### 7.2 两侧消费方式

- B-A-T：在现有 setup-upstream-browser-runner.mjs 的受管环境准备步骤，安装固定本地 wheel；不得让依赖解析升级现有 PyrateLimiter/filelock，不改变 browser-use 或 vendor 锁。旧 quota.py 保留薄导出以减小调用路径变化。
- 盾：沿 budget.py 现有哈希 wheel 加载方式，把纯 Python 共享 wheel 纳入明确清单和校验，调用公共 check。不要导入 apps/api/python，也不要依赖 B-A-T venv。
- 盾使用 WSL 系统 Python -I；仅设置 PYTHONPATH 不能解决该模式的导入。应沿现有程序内显式加载已校验制品的入口接入；不得去掉 -I 或靠全局 site-packages 碰巧存在来通过。
- Python 的 ZIP 导入可复用，但只适用于符合条件的纯 Python 内容；不要假设任意有 native 扩展或安装钩子的 wheel 都能直接加载。[Python 3.12 ZIP 导入](https://docs.python.org/3.12/library/zipimport.html)、[隔离模式](https://docs.python.org/3.12/using/cmdline.html#cmdoption-I)

### 7.3 单一来源及版本核验

- 源码只在公共包维护；wheel 是生成制品，不允许手工修改另一份 quota 实现。
- 构建记录至少有共享包版本、规范化源码摘要、wheel SHA256、构建后端版本和上游依赖版本。
- 双方验收记录输出所加载模块来源、包版本和共享源码/制品摘要，不输出敏感数据。
- 现有 verifyForkSource 只核 vendor/workflow-use 清单。用现有安装回执机制增加公共依赖记录并检查，不能声称原 sourceDigest 自动覆盖 packages。
- 不伪造上游清单，把 B-A-T 自有公共代码塞进 vendor 的上游 baseline；不要为了通过 --check 无条件改写记录。
- 构建重复性优先核有效源码和来源，若要声明产物字节可复现需实际验证；不能因为 wheel 时间戳差异放宽完整性检查。

### 7.4 独立发布包

建议由现有工具链生成一个可搬迁目录/归档，包含盾源码、锁文件、必要静态资源、公共 wheel 与摘要、安装说明和许可证。完整依赖大制品可以通过既有固定 URL/SHA 准备流程获取，不强制做全量离线安装包。

排除 local.json、.local、work、node_modules、Profile、Cookie、私钥、数据库和原始观测报告。运行数据在安装时创建或由使用者明确指定，不能随源码包混入。

独立验证改为“只带发布包就能安装运行”，不再要求“只能拷贝 tools/antibot-lab 的手写源码”。打包携带由唯一源码生成的依赖，不算复制维护两套实现。

## 8. 成熟组件复用与维护责任

| 组件/本地固定版本 | 保留职责和公开表面 | 本项目维护边界 |
| --- | --- | --- |
| CrowdSec 1.8.1 / 909b5157；Hub f5cd0975 | 原 AppSec、规则、挑战、决策 | 配置、适配及原 spent SQLite 补丁；不改评分/签名/PoW |
| Traefik 3.7.14；bouncer 710e8880 | 原路由、中间件与挑战协议转发 | 固定配置、入口与 owner；不重写代理 |
| BotD 2.0.0；随固定 CrowdSec 的 fpscanner | 原标记判据 | 构建与有效性映射，不增加概率模型 |
| CreepJS 10aa6724 | 选定原探针与一致性比较 | 现有构建别名、生命周期、错误状态 |
| HAProxy 3.2.9＋固定 Ubuntu 补丁；JA4 Lua 6abe4014 | 原网络栈和 JA4 | 已有元数据出口补丁与关联适配 |
| PyrateLimiter 4.5.0 / filelock 3.19.1 | SQLiteBucket、窗口、SQL、锁 | 移动已有公共结果适配，零新算法 |
| FCaptcha 56aa2b38 / Kitsune f0a22b3 | 已选窄函数 | 固定原阈值/适用范围，不移植整个模型/引擎 |
| Node/npm、WSL systemd、Hatchling/build | 包管理、服务管理、标准构建 | 少量配置与已有入口编排 |

事实源是 artifacts.json、各 package-lock.json、prepare 脚本、原补丁 recipe，不以本表短提交号代替完整摘要。

维护/许可提示只针对实际交付：CrowdSec Bot Detection 官方仍标 Alpha，BotD 以稳定性维护为主；不能把所有组合都称为成熟通用人机识别。CrowdSec/BotD/CreepJS/PyrateLimiter 的已有许可信息保留，bouncer 固定版为 Apache-2.0，JA4 Lua 为 MPL-2.0；DB-IP 数据保留 CC-BY 署名。分发修改过的组件时保留其对应源码/补丁和许可信息，不给整个制品粗暴标成同一种许可证。
来源：[CrowdSec 状态](https://docs.crowdsec.net/docs/next/appsec/bot_detection/intro/)、[BotD](https://github.com/fingerprintjs/BotD)、[PyrateLimiter](https://github.com/vutran1710/PyrateLimiter)、[bouncer 固定许可证](https://raw.githubusercontent.com/maxlerebourg/crowdsec-bouncer-traefik-plugin/710e88808baccb320d7b2b3560397e1474e3e98b/LICENSE)、[JA4 固定许可证](https://raw.githubusercontent.com/FriendlyCaptcha/ja4-haproxy/6abe401466537f896482900969b06c1e302498a0/LICENSE)、[DB-IP](https://db-ip.com/db/lite.php)。

不增加 Anubis/ALTCHA 等另一套挑战系统：当前没有已证明的替换缺口，本期引入会扩大协议和回归面。以后若原组件确实缺能力，再以源码和最小真实样本评估，不按项目宣传选型。

## 9. 最小实施顺序

每包在 PROGRESS 记录真实缺口、复用、最小改动、首次失败与关闭条件。下面是执行顺序，不是每包完成后停工等用户审批。

### S0：恢复现场与保护基线（只读）

读取 AGENTS → 本文 → 主计划 0 节/ROADMAP/PROGRESS → 相关结算。核 master/HEAD/dirty 与临时清单；实际状态有变化先解释差异、保留原改动。

核服务/长窗/owner/PID/端口，旧回执仅作历史。确认盾 local.json 解析到的数据目录但不输出密钥。禁止为初始化清空原数据。

产物：当前源码基线、资源状态、S1 文件范围。没有理由重跑 M0 或全部检测矩阵。

### S1：公共限速模块单一源码与发布依赖

依赖 S0。按第 6、7 节迁移原 quota.py，实现两侧薄入口、标准制品和校验。先用最小模块样本证明 Windows 产品环境及 WSL -I 两侧都能加载，再接实际调用。

继续保留 B-A-T access_policy.py 的站点策略、冷却、取消语义；盾保留自己的 scope/默认配额和 HTTP 429 映射。上游依赖版本不变。

关闭条件：唯一算法适配体；两侧消费同一共享版本；独立包不需要产品源码；持久拒绝/短窗/坏数据库/坏 scope/坏制品及独立数据范围验证通过。只改路径不算完成。

### S2：修现有页面漏展示

可独立于 S1。只修改原 signal 清单/必要文字和针对性测试，接出 typing-cadence。展示原 detected/clear/invalid/excluded/incomplete/unavailable/error；不新增人机分数、不调整阈值。

未交互状态要准确：该项未测不应把其他自动检测失败隐藏，也不能要求用户输入真实账号或密码。同页证据保留、刷新新检测的既有语义不变。

关闭条件：实际服务回执、页面和导出一致；异常不能被正常后续批次冲掉，不足样本不能显示正常。自动项、同源/脱敏与现有 38 项不退化。不要因新增一项重建整个网站。

### S3：安装、搬迁、升级和回滚

依赖 S1 的发布边界；S2 可并行推进但不要并发占用同一浏览器/服务。

1. 发布包安装到仓库外 owned 目录；使用空数据目录和现有 Windows＋WSL 前提。
2. npm ci 与固定共享依赖、探针构建；沿 README 的 prepare → fixtures → Tor/Geo → HAProxy 候选构建/激活 → CrowdSec 持久化候选构建/启用顺序验证。
3. 开始构建前报告预计时间/磁盘和组件范围。允许复用哈希正确的下载缓存，不能复制旧 prepared/config/secret/database 冒充新实例安装。
4. 首装短暂启用原 CrowdSec binary 是现流程中间态，不能此时结算跨重启防重放通过；最终必须确认持久化候选已激活。
5. 复用现有 lab.ts/configure/owner，在停止且归属核验后完成显式搬迁。统一更新相关记录及 systemd 配置；失败恢复原代码/配置归属，不留半更新。
6. Tor/Geo 过期或损坏按原维护入口处理，不改有效期或伪造 fresh。缺 OS 工具写出具体缺项，不自动装云、Docker 或修改个人浏览器信任。
7. 首版保持单实例。新旧实例顺序验证，不并发抢固定端口/服务名；清楚区分原 owned 服务与他人进程。

关闭条件：独立产物＋空实例数据安装完成、ready、原机制烟测；从新路径可启停；原数据接入不丢失，失败可恢复。仅在本机既有 Windows/WSL 上测得的结果称“本机空实例安装”，不外推干净新电脑全套 OS 依赖安装。

### S4：必要联合验收及交付

依赖 S1–S3。按第 10 节选择受影响的已有验证，不根级全量测试，不无变化重复已过检查。

原 frozen release 用 owned 新副本执行，保留历史数据和首次失败，确认没有自然语言准备/模型重新探索。独立实例新 secret 使旧通行状态失效时走原正常挑战，不复制旧 Cookie，不削弱盾。

若验收器暂时固定旧数据路径，只做 endpoint/数据定位/受控夹具重建的最小适配；不得为此另写一套产品测试框架，也不得用手工 runner 动作冒充正式链路。

最终输出实现清单、必要测试/未测、公共版本、发布包、维护说明及资源结算。没有新提交授权则留改动，不阻断实现交付。

## 10. 验收矩阵与现有入口

**通过标准是原行为、真实接口与部署不变量，不是新的人机准确率指标。**

| 验收 | 最小证据 | 失败不得如何掩盖 |
| --- | --- | --- |
| A1 单一实现 | 两个入口实际调用公共 check；源码/制品摘要对应；包内无第二套适配函数体 | 只 grep 没命中就宣称运行有效 |
| A2 模块装载 | B-A-T 受管 Python 与盾 WSL -I 各自加载固定包；仓库外发布物不回读产品源码 | 去掉 -I、改用根 PYTHONPATH 或隐式全局包 |
| A3 配额行为 | 真实持久拒绝、并发不超发、短窗口恢复、scope 隔离、坏库不放行 | 清数据库、转内存或改额度 |
| A4 数据隔离 | 同模块/同 scope/不同数据库互不消耗；同库相同 scope 在同一平台跨进程生效 | 让 Windows 与 WSL 并发写同一 SQLite |
| A5 页面修错 | 键盘正常/异常/不足/排除/错误，页面与导出一致 | 把 valid=false 或缺失计成通过 |
| A6 空实例安装 | 固定源下载/缓存摘要、构建/激活回执、共享依赖、ready 与原机制烟测 | 复用旧完整 runtime/配置后称从零通过 |
| A7 搬迁与恢复 | 源码路径变化、owner 拒绝错误目标、已有状态保留、失败回滚、启停 | 直接改三个 JSON 就称完成；误停无关服务 |
| A8 盾原机制 | 对本次包/部署变化覆盖正常、异常、缺失；挑战及重启防重放、必要协议样本 | 为 B-A-T 过测放宽原分数、白名单或关探针 |
| A9 B-A-T 联合 | 完整 HTTPS 4183、冻结正式链、动态业务结果、0 普通模型调用、资源回执 | 使用 4185 测量入口或手写点击替代 |
| A10 交付清理 | 本次 Profile/服务归属与关闭、临时目录永久删除单列；敏感数据排除 | 将移入回收站/仅目录消失说成永久删除 |

现有入口（实施时先读参数/owner gate，以下不是本轮已执行命令）：

- tools/antibot-lab/tests/budget-standalone.py：独立两个进程及持久拒绝；扩为加载共享包，不再依赖复制算法。
- apps/api/tests/antibot-budget.acceptance.py：原并发/真实短窗/坏库/坏 scope；有重叠的证据复用，不机械在两个 OS 重跑全部场景。
- apps/api/tests/test_access_cooldown.py：定点选择 declared policy、missing policy 等受影响 case；不自动运行整个 Python 测试集合。
- tools/antibot-lab/tests/locations.test.ts、probe-assets.test.ts、geo-source.test.ts：按配置/安装改动选择。
- apps/api/tests/antibot-check.acceptance.py：现网页真实浏览器入口，原 gate 为 BAT_RUN_OWNED_CHECK=1；使用自有临时 Profile 和局部 SPKI。
- apps/api/tests/antibot-replay-restart.acceptance.py：真实引擎重启防重放；部署制品换源/换构建时核受影响范围。
- apps/api/tests/antibot-service.acceptance.ts：正式冻结链联合入口。使用专属浏览器、完整 TLS、已有 --resume-directory 和 --frozen-variant=1，先从代码核实其其余参数及拥有的副本。不能无参数运行触发新准备/模型。
- scripts/setup-upstream-browser-runner.mjs：安装/来源校验需随共享依赖更新；--check 应只验证，版本维护不能无条件登记绕过。
- npm --prefix tools/antibot-lab run check：本包类型检查；改到 API 的 TS 安装/调用边界时按该包现有方式定点检查。

必要的新增测试只保护公共包边界、制品装载和真回归，不逐行镜像实现。安装或浏览器长运行前说明范围，输出首败位置和后续修复依据；同一失败不原样重复。

## 11. 配置、数据与资源维护

- 沿用 locations.mjs：源码从模块位置解析；数据默认 .local，可由 local.json 或 BAT_ANTIBOT_DATA 指定，环境变量优先。现实现即使有环境变量也会拒绝损坏 local.json，不擅自改变。
- lab_paths.py 复用同一 Node 配置解析，Python/TS 不各自发明路径优先级。
- 保留原 work/antibot-service 的制品、数据库、secret 和失败证据；它是当前开发数据，不是新交付默认路径。
- 本期不共享两个产品的数据库。共享包只接受调用方路径，不默认猜测 B-A-T 工作目录。
- 维护/搬迁先核无长窗、无真人操作且资源归本实例。禁止根据端口或进程名字直接批量结束浏览器。
- 回滚主要回滚代码、制品选择和配置；不能恢复旧 spent/配额数据库来“回滚”已经消耗的票据或预算。涉及存储兼容时必须保留真实历史。
- 新目录由当前操作创建并记录精确绝对路径、owner、收尾责任。删除前核绝对目标在 owned 范围内，拒绝 junction/symlink 越界。
- 首次工具策略拒绝按 TOOL_POLICY_INCIDENT_20261007.md 留证，不换 shell/API 绕过，不把受阻清理说成已完成。
- 不运行管理员全局“清理”“重装”或给个人 Chrome 安装证书；本次不需要操作个人浏览器和真实登录。

## 12. 预计文件范围：复用、移动、新增各是什么

| 位置 | 允许的最小动作 |
| --- | --- |
| packages/request-budget（拟新增） | 移入现有 quota 实现；标准元数据、最小文档/测试，唯一源码 |
| apps/api/python/browser_use_runner/quota.py | 保留兼容入口，改为公共包委托，不保留算法副本 |
| tools/antibot-lab/budget.py | 删除重复适配体，复用已校验共享包；盾参数/错误封装保留 |
| scripts/setup-upstream-browser-runner.mjs | 受管环境安装和校验公共依赖；保留固定上游与原来源检查 |
| tools/antibot-lab 的准备/制品/启停入口 | 增量添加公共包/发布产物、显式搬迁；复用现有 owner 和 rollback |
| tools/antibot-lab/check.js 及受影响测试 | 原键盘判据漏展示的最小修复 |
| 已有 API 与盾测试 | 更新共享依赖装载和独立发布验证，不复制 runner/browser lifecycle |
| README、PROGRESS、ROADMAP、RESEARCH、独立化结算 | 更新最终事实、版本、首次失败、未测与交付步骤 |

不得因为本表就机械修改所有文件；确实没有变化的入口保留。不得改原反爬分数、浏览器输入/控制实现、TaskChain IR、模型路由、个人账号、其它网站流程。

实施前在 S1 的 PROGRESS 记录：

~~~text
Product Alignment:
- natural-language task: 原通用浏览器任务不变
- reusable chain boundary: 原发布链和普通执行器不变
- runtime inputs: 原显式站点策略与各自数据库
- dynamic task outputs: 原动态结果，联合复跑核验
- generic platform capability used: 共享已有持久预算适配
- replay model calls: 0，普通链路无新增模型
- site/task-specific code added: no

Reuse Assessment:
- capability: 共用 quota 适配的单一来源和独立打包
- existing implementation in repository: browser_use_runner/quota.py；盾重复体待移除
- mature candidates and pinned versions: PyrateLimiter 4.5.0 / filelock 3.19.1；现有标准 Python 构建链
- selected implementation: 原适配函数＋原 SQLiteBucket；标准纯 Python wheel
- reused public surface: init_from_file / leak / put_decision / close
- B-A-T-owned adapter and remaining gap: 配置/结果映射与打包；无窗口/SQL/锁重写
- license/runtime/platform fit: 原许可；Windows 受管 Python、WSL Python -I 均需实证
- browser/runtime/state ownership conflicts: 不新增控制会话，双方数据隔离
- replay model calls: 0
- rejected candidates and evidence: 两份适配会漂移；导入整个 runner 扩大部署依赖；独立 RPC 增加无必要进程
- focused validation: A1–A4，加受影响安装和一次正式联合
~~~

构建后端具体 pin 是下一轮 S1 的小型核验工作，不需要重新开总体方案讨论；若现有版本不满足，给出实际错误再作最小调整。

## 13. Review：本轮发现与已纳入方案的纠正

审查方式：主 agent 直接核对当前 git diff、确切源码、已有回执、恢复文档和官方资料；未启动第二个审查 agent，未执行代码/浏览器验收。下面“已处理”只指方案已纠正，不表示代码已修。

| 审查项 | 发现的问题 | 文档处理及待验证 |
| --- | --- | --- |
| R1 复用原则 | 前一答复“无依赖”漏报重复 quota | 第 4/6/7 节明确移出原实现；S1 实际消重待做 |
| R2 独立包定义 | 抽公共模块后裸目录复制不完整 | 第 7 节定义带固定公共依赖的发布产物；A2/A6 待做 |
| R3 来源检查 | 原 vendor 摘要不覆盖新 packages | 第 7.3 节单独公共依赖来源校验；不得虚改 vendor baseline |
| R4 隔离 Python | WSL -I 不消费普通 PYTHONPATH | 复用显式已校验 wheel 加载；两侧实测待做 |
| R5 数据共享 | 单一代码可能被误做共享配额 | 第 6/10/11 节明确独立数据库/策略；A4 待做 |
| R6 安装证据 | 旧副本用了原数据/制品 | 第 2/9 节分开旧证据与本机空实例验证，不宣称干净新机器 |
| R7 网站范围 | 把统一展示、公网配额和多实例全变成本期门槛会扩张 | 第 4 节仅修漏展示；其它按后置条件处理 |
| R8 验收真实性 | 原验收脚本无冻结参数可能触发模型准备；单变体不代表全变体 | 第 2/10 节明确复用冻结链、0 模型和未测语义 |
| R9 单实例及回滚 | 新旧服务可能抢 owner/端口；回滚旧 DB 会失去消费历史 | 第 9/11 节顺序运行，回滚代码配置且保留状态 |
| R10 授权恢复 | 旧文档写“独立化完成”，可能跳过修正或重放关机/提交 | 恢复入口加入本轮文档优先级，旧验收保留为历史 |
| R11 新增构建依赖 | Hatchling 在原 pyproject 中未固定具体版本 | 不虚构已锁版本；S1 固定并记录后最小构建 |
| R12 前后事实 | 旧共享 SW、模型门槛与主线状态可能覆盖本轮 | 第 0–3 节固定当前任务与保留限制 |

Review 结论：**架构、范围、依赖方向与交付门已经可供实施；当前仍有 I1–I6 待完成，不能将文档 review 写成产品验收通过。** 没有需要用户重新设计技术方案的前置问题。后续若发现新的实际耦合，按同样原则最小共享/适配，并记录证据。

本轮文档交付核验：主方案及临时交接的 13 个本地链接均存在；列出的 16 个现有代码/验收入口均存在；既有 54 个非 Markdown 改动项的存在性和 SHA256 与开工清单一致，没有新增非 Markdown 工作区改动，HEAD/分支未变化；已修改文档的 git diff --check 通过。检查只证明文档入口及改动保护，不代表运行验收。新公共包目录已明确标为拟新增，不计入现有文件检查。

## 14. 给新 session 的最短开始方式

1. 核当前 master/HEAD/status，保留所有已有文件。
2. 读本方案和恢复入口顶部；仅按 S0 检查真实资源。
3. 先处理 I1：核现有 quota 两份逻辑，抽原实现，完成标准制品双侧加载样本；不要先从网站、公网平台或模型研究开工。
4. S1 遇构建/平台依赖时先定位；可独立推进 S2 文案/映射和 S3 安装说明，但不要虚报 S1 完成。
5. 按最小矩阵连续完成到 S4，阶段切换更新断点。最终统一交付，未测事实保留。

可复制启动指令：

~~~text
在 D:\work\browser-auto-tool 现有 master checkout，按
docs/development/SHIELD_INDEPENDENCE_PLAN_20261010.md
开始实现盾独立化纠正与交付。先读 AGENTS.md、主计划0节和 ROADMAP/PROGRESS 顶部，
核实际 HEAD、工作区和资源，保留全部已有改动，不创建 worktree。
优先消除 quota 重复实现：复用原函数，双方调用同一公共模块，独立发布包携带依赖，
分别保留各自数据。按 S0–S4 完成必要修复、安装/搬迁和联合验收。
不重新做总体反爬方案、不扩网站、不搞模型实验、不放宽盾。
不推送、不关机、不访问京东、不启动云或跨天测试；本地提交以本 session 的明确指令为准。
单项受阻继续其它独立工作，不每完成一小项就结束。
~~~

## 15. Suggested skills / 建议技能

- handoff：下一次确需交接时整理临时入口并引用本方案；技能路径 C:/Users/30553/.codex/skills/handoff/SKILL.md。
- 本次实施无需额外产品访谈、前端设计或模型训练技能。需求与技术方向已明确，不通过重新访谈扩大范围。
- CodeGraph 是结构查询工具，按 AGENTS 优先使用；具体已知文件可定点读，literal 查询用 rg。不能扫描 node_modules。
- 若未来用户明确要求重新定义领域边界或完整网站设计，再按实际需要选择相应技能，本期不预先引入。

