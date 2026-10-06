# 浏览器基础能力直接复用上游

依据用户 2026-10-06 最新指令：通用问题先使用成熟开源实现，不再写没有源码依据的替代实现。此前“本地授权策略不同，因此不采用 BrowserSkill 连接机制”的取舍撤销；历史记录保留，不能继续作为自研理由。

## 已核验来源

- 官方仓库：https://github.com/Tencent/BrowserSkill
- 当前 HEAD：`3f10983c09fcd443c7420830ab984c9d409954bf`，已以官方 Git 远端核验。
- 本地旧诊断源码：`47ac947f188bc554b66c09f5873b8045d6be57b2`，不能冒充当前版本。
- 首次读取本机 CLI 为 `bsk 0.3.1`；持久宿主启动后重新读取为 `0.3.2`，daemon/扩展也均为 `0.3.2`。没有主动执行 update 命令。发行二进制与官方 main 的对应关系尚未核验，不能直接等同。
- 许可证：MIT；直接复制源码时保留完整许可证和 Tencent 版权声明。

| 能力 | 使用的官方实现 | B-A-T 保留的职责 |
| --- | --- | --- |
| 服务发现与启动 | `crates/bsk-cli` 的 IPC/daemon；Windows 使用官方宿主管理的 foreground 模式 | 宿主管理进程生命周期，展示真实启动结果 |
| 后台连接与重连 | `apps/extension/src/transport/ws-transport.ts`、`lib/connection-controller.ts` | 连接状态映射，不能再实现另一套重连循环 |
| 浏览器启动/唤醒 | `entrypoints/background.ts` 中 onStartup、idle active 入口 | 工作台显示状态；不再作为连接请求必经中转 |
| 保活与失联判断 | `lib/keepalive.ts`、`lib/heartbeat.ts` | 映射已有状态，不再追加重复计时器 |
| 任务窗口与断线清理 | `session-manager/agent-window.ts`、`disconnect-cleanup.ts`、原 session stop 路径 | 记录 execution 到原生 session 的关系、业务输出和清理结论 |
| 多任务隔离 | 原 daemon session 路由、同 session 串行/跨 session 并行 | 原任务计划和发布链路编排；一个产品运行只使用一个实际控制会话 |

固定源码链接统一为 `https://github.com/Tencent/BrowserSkill/blob/3f10983c09fcd443c7420830ab984c9d409954bf/` 加表中路径，不能引用漂移的 main 代替实际来源。

## 最小实施顺序

1. 先通过原生 CLI、daemon 和扩展完成最小本地样本：不依赖工作台连接、创建自己拥有的空白任务窗口、停止同一 session、核验资源结束。不得请求京东或重做模型任务来验证基础连接。
2. 核验上游对 B-U 原生 CDP 输入的支持。BrowserSkill 的 session/tool RPC 与当前微软 CDP relay 是不同协议；不能把上游控制器接到不兼容的服务后声称已复用，也不得自己补造第二套通用 CDP 网关。
3. 只在公开接口或已有成熟适配能够覆盖实际调用时接入；最小真实样本通过后再冻结选型。B-U 的 Agent loop、LangGraph 的链路推进不同时改造。
4. 替代路径通过后移除被替代的 B-A-T 连接中转、重连与窗口管理代码，逐项保留仍被产品使用的能力。不得先删除仍在运行的入口或历史数据。

## 实现边界

任何新建或修改的通用代码必须有上游仓库、固定 commit、文件/符号以及直接复用方式。原样引入、调用公开 API 或独立进程优先；“参考思想后重写”不算直接复用。没有参考实现时停止该段代码实现，记录具体缺口，不继续用补丁填满。

## 当前 CDP 接入的最小纠正

BrowserSkill 原生 CLI 公开的是 session/tool RPC；没有证据表明它提供 B-U 当前所需的标准 CDP WebSocket。原生连接通过不能冒充两个协议可互换。生产浏览器能力暂沿已引入的 Microsoft Playwright 原实现，不新造转换网关。

已核验 Playwright 固定 `8b552173e8d767db29b8baef8f4a1f08cf7f26bf` 的 `packages/playwright-core/src/tools/mcp/cdpRelay.ts`：`establishExtensionConnection` 原本由服务调用 `_openConnectPageInBrowser`，使用 Chrome 原 launcher 打开连接页并等待扩展握手。项目给所有连接都传 `requestPopup`，提前返回并使已有授权复用也必须等工作台中转，这是人为改动造成的断点。

最小改动只是不再为已有 token 的连接传 `requestPopup`，恢复已引入的原 launcher/握手。首次授权沿当前明确确认入口保留；已授权的运行、恢复或显式连接由服务自己发起，不要求先开 4173。现有 loopback 不透明跳转保留，token 不放入 Chrome argv。不增加后台轮询、重连状态机或窗口控制器。本次不宣称浏览器启动会启动 B-A-T，也不宣称服务启动立即主动连接；连接仍由实际调用触发。

Baseline Impact / Patch Disposition:
- 修改范围：`DailyChromeExtension.createRelay` 的公开选项适配及一致的错误说明，原 relay 入口注释。
- 删除/停用：已有授权连接中的工作台中转选项；不改首次授权、任务编排或 B-U Agent。
- 原生参考：https://github.com/microsoft/playwright/blob/8b552173e8d767db29b8baef8f4a1f08cf7f26bf/packages/playwright-core/src/tools/mcp/cdpRelay.ts
- 验证：原保存授权的服务直接调用、真实扩展握手；无 JD、无模型、无业务窗口。保留测试首败和未测范围。

Product Alignment:
- natural-language task: 任意需要浏览器的自然语言自动化任务
- reusable chain boundary: 保留原 TaskChain 与任务计划；替换浏览器基础能力的重复实现
- runtime inputs: 已选择浏览器与原生 session 身份
- dynamic task outputs: 原业务输出、原生资源状态与审计
- generic platform capability used: 上游连接、隔离窗口、原生清理
- replay model calls: 基础能力与普通复跑新增 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 浏览器服务发现、连接、重连和 session 生命周期
- existing implementation in repository: DailyChromeExtension、PopupBridge、工作台中转、微软 CDP relay、AttachedWindow
- mature candidates and pinned versions: Tencent/BrowserSkill 固定 3f10983c、本机 0.3.2 待核验版本对应；已有 Microsoft Playwright 固定 8b552173
- selected implementation: 优先使用上游原生组件；尚未冻结生产替换
- reused public surface: 原 CLI/daemon/session API，或核验后的原生公开组件
- B-A-T-owned adapter and remaining gap: execution/session 映射与状态投影；B-U CDP 协议兼容尚待证明
- license/runtime/platform fit: MIT、Rust daemon、MV3 扩展，官方支持 Windows x64
- browser/runtime/state ownership conflicts: 禁止两个控制器同时操作同一任务；不把扩展连接恢复当成已恢复原任务
- replay model calls: 0 新增
- rejected candidates and evidence: 当前自写的工作台必经连接中转不覆盖独立启动/重连；不再以本地配对策略不同拒绝成熟连接实现
- focused validation: 一个本地原生 session 生命周期，不访问京东、不新增模型调用；成功前不宣称接入完成

## 当前事实

禁用自动启动后的首次 status 显示 daemon 不在线；首次 plain-pipe foreground 启动退出后仍不在线。改为官方文档要求的持久 PTY 宿主，daemon PID424 原生连接 Chrome，版本均为 0.3.2；无需工作台页面中转。随后创建本次独立 about:blank 会话 kazb，原生 session stop 返回 failed/return_failures 均为空，status 不再有该会话。证据 `work/browser-skill-native-session-proof.json`；不把 registry 移除额外冒称独立物理窗口核验。没有网站请求、没有模型调用、没有借用个人 tab。

上述是 BrowserSkill 原生能力验证，尚未完成 B-A-T 全面接入；原京东任务也没有因此完成。当前 CDP 最小纠正的实施结果另行记录。

## 当前实施结果

- 生产改动仅为已有 token 时不传 `requestPopup`，恢复已引入 Playwright launcher/握手；首次授权仍沿原确认入口。未新写连接框架、协议网关、Agent loop 或窗口管理。
- `npm run check --workspace @browser-capture/api` 通过。已有首次授权单项测试失败于 Windows 的 POSIX mode 断言 `438 !== 384`；凭据持久化断言此前已执行，不能把整项写成通过，未修改该测试或重复执行。
- 独立宿主真实保存授权握手通过：原 launcher 调用一次，Chrome argv 仅含既有不透明 loopback 跳转，无工作台票据；finally 关闭本次 relay。证据 `work/daily-chrome-native-connect-proof.json`。原工作台当时即使已开，也没有该独立宿主的票据可转发。
- 正常服务加载修改后 PID14924，4173/4175 在线；服务显式连接返回 connected=true，popupRequest=null。证据 `work/daily-chrome-native-service-proof.json`。没有新业务任务、网站请求或模型调用。
- 对抗 subagent 只读复核：未发现本轮新增确定 P1/P2；与固定上游 launch 参数对应、首次授权保留、后台仍拒绝暂停连接，文档没有混淆 BrowserSkill RPC/CDP 或原业务验收。暂停后的直接连接精确错误码/延迟未真实验证，不能宣称完整暂停恢复均已通过。
- 本次原生 BrowserSkill daemon 在确认仍为本次 PID424 且无 session 后，经官方 `daemon stop` 结束；没有关闭个人 Chrome。0.3.2 二进制与 main commit 的精确对应、浏览器/系统重启、BrowserSkill 全面生产接入及原京东完整任务均未验收。
