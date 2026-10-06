# 账号窗口租约导致旧任务复跑失败

## Product Alignment
- natural-language task: 已发布浏览器任务可创建独立复跑，不被已经结束的账号维护阻断。
- reusable chain boundary: 原发布版本和历史运行不变，修复浏览器资源交接。
- runtime inputs: 发布版本、浏览器选择、同一 Profile 的 owner 收据。
- dynamic task outputs: 原业务输出、首次失败和本次清理事实分别保留。
- generic platform capability used: 已有账号维护、owner 租约、归档、启动诊断和复跑入口。
- replay model calls: 不新增模型调用。
- site/task-specific code added: no

## Reuse Assessment
- capability: 结束的账号维护与新任务之间的窗口租约交接。
- existing implementation in repository: AttachedWindow.inspect/verify_closed、AccountWindows、AccountReuse、releasedOwners、window_lease_archive。
- mature candidates and pinned versions: 沿用已锁定 Browser-Use/CDPClient、LangGraph、Zod 和 React/Radix，不引入替代驱动或调度器。
- selected implementation: 修正现有租约适配和事实投影。
- reused public surface: Target.getTargets、现有 per-owner 归档及 releasedOwners 配置。
- B-A-T-owned adapter and remaining gap: 空目标检查同步 ended；历史 closed 维护只给同一当前浏览器身份的确定 owner 归档许可。
- license/runtime/platform fit: 沿用现有 Windows 环境和依赖。
- browser/runtime/state ownership conflicts: 未知 owner、创建未确认、正在运行、不同 Profile 和待回滚仍不释放；归档保留旧收据，不关闭私人页。
- replay model calls: 0。
- rejected candidates and evidence: 不重造资源管理器；已有归档核心覆盖需求。
- focused validation: 先复现原生租约和错误投影，再定点测试与隔离 headless IPC 验收。

## 修改前的持久证据

- execution `92aa09d8-5270-4862-877a-47239112b58b` 在 reserve 阶段失败：`hybrid_runner_failed:ValueError:hybrid_attached_window_busy`。TaskRun 数量为 0，浏览器动作和模型调用均为 0。
- 同一 owner 的脱敏诊断也记录了 `hybrid_attached_window_busy`；界面忽略该固定 code，按 value_error 显示“具体的底层错误未记录”。
- 阻断 owner `97a54079-4099-4977-a2df-3771bd40d266` 属于账号维护。宿主 maintenance 在本次启动前检查后为 closed；原生当前收据仍为 handoff。
- AttachedWindow.inspect 在目标已消失时只返回 active=false，没有保存 ended；AccountReuse 随后保存 closed，且以后跳过 closed。新任务 releasedOwners 仅包含已完成的任务交付 owner，无法归档此账号收据。
- 本次 cleanup confirmed 仅证明新 runner 已退出且没有获得资源，不表示旧账号收据已经释放。保留该审计原事实。

## 验证记录

全部浏览器验证使用 headless 隔离样本；不连接用户 Chrome，不改历史业务记录。

### 首次失败及修正

- 修改前，2 个原生回归测试均失败：检查缺失目标仍保存 handoff；空启动租约仍保存 starting。2 个错误投影测试均失败：固定 busy 与已记录 value_error 均被说成未记录。
- 新账号许可测试首次误把 add 完成后已关闭的维护当成 open；夹具改为明确保存 open 再分别核验 open/closed。
- 原 browser-handoff-queue 的首连释放夹具缺少现有 releasedBrowserWindowOwners，导致在调用 runner 前报错；补齐该只读接口，保留真实释放与未知释放两个断言。
- API 首次类型检查暴露前一轮跨 UI 接线测试导入 TSX，而 API tsconfig 未设置 JSX；启用标准 react-jsx，不删去集成覆盖。新验收脚本改用 Node 既有 WebSocket，消除未装 ws 类型声明的新增要求。
- 原生验收夹具首次缺少 BrowserService 的现有 setAuthorizationValidator；补齐无操作接口后运行真实 runner。产品源码未改低证据门槛。
- 实际页面只读验收首次误用 networkidle（持久 SSE 不会闲置），后误用 button 定位 Radix tab、遗漏先选任务；改为真实 task/tab 结构与具体元素等待，没有改产品绕过断言。
- 空白检查首次强制关闭 autocrlf，把既有 Windows CRLF 误报为行末空白；沿现有转换并明确 cr-at-eol 后定点检查通过，不重写整文件行尾。

### 通过证据

- 27 项定点测试通过：11 项原生租约（含新增并发变化不得结束 owner）、14 项 API 启动/归档许可/队列/详情/账号/交付锁、2 项错误提示。未运行全量或根级测试。
- 真实 TS → Python → CDP → SQLite 的 headless 验收先复现同样 reserve/busy 错误及 0 TaskRun；启用兼容许可后，两次独立正式执行 completed，服务重启后第三次 completed。三个运行清理 confirmed、普通模型调用 0；原错误、历史 owner 归档和受保护标签均保留。
- API/Workbench 类型检查、Workbench 构建、上游环境 setup --check 通过。构建保留既有大 chunk 提示。
- 当前开发服务在无 running/queued、无进行中账号操作和无 Profile owner 标记时，通过 PID/root 双重核验的 graceful shutdown 重载。health 的新 PID 为 10968，root 为当前 checkout。
- 重载后的 API 返回原 execution 的固定 busy 诊断；当前授权身份仍与历史 closed 账号 owner 相同，可获得受限归档许可。实际页面的错误显示使用已有原因；headless 只读验收产品写请求 0。
- 实际老任务的“再次运行”与弹窗“开始运行”均可用；只打开并取消弹窗，没有启动真实任务。

### 范围

修复当前历史收据的兼容路径将在用户下一次启动时由原生 _reserve 归档，保留旧 owner；没有手工删锁、改失败为成功、改旧发布版本或控制个人 Chrome。本轮未执行用户京东任务的真实联网业务、个人 Chrome 扩展连接与账号登录验证；隔离复跑通过不能冒充该业务已成功。

证据：`work/account-lease-repair-20261004/headless-native-proof.json`、`live-readonly-proof.json`、`live-replay-reason.png`。未提交或推送。
