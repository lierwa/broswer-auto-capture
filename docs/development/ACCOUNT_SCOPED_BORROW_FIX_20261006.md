# 账号检查连接故障修复（2026-10-06）

## 用户现场与根因

基线 `44a1fc7`，当前 checkout 原位修复。用户的准备 job `cdfea68e-ce88-42a2-8c26-21f2950c6e37` 在账号前置检查停止，探索动作和模型调用均为 0；原错误 `account_target_unconfirmed` 被归到 browser-use 探索。最近三次手动检查均 interrupted/runtime_failed，原始持久记录只保留 `hybrid_runner_failed:Error`。这不能证明网站未登录，也不是 LLM 输出失败。

隔离 headless Chrome 使用真实扩展与生产 owner URL 后，稳定复现两处通用接线缺陷：

1. Playwright `connect_over_cdp` 的无 target `Target.getTargetInfo` 握手被新增的 owner 校验拒绝，报 `daily_chrome_target_required`。
2. 修复握手后，新连接收不到已存在 owned target 的 `Target.attachedToTarget`，报 `account_owned_page_unavailable`。通知标记此前只按全局 session 保存，且重置发生在生成地址时，未覆盖 SDK 重连。

此前真实 borrow 验收使用无 owner 地址，绕过了实际生产隔离路径，不能覆盖此次回归。已修正验收地址，不把旧通过记录作为修复证据。

## 修复边界

- 无 target 的只读查询从 BrowserModel 当前目标与 owner 权限交集中选择；已关闭历史目标仅保留清理权。缺目标的写操作、跨 owner target/session 继续拒绝。
- 实际连接建立时重放本 owner 现有 attach/runtime 事实；不重新 debugger attach，不重发其他 owner 通知。复用固定 Playwright relay，扩展端代码未变，无需重装扩展。
- 检查运行中断、审计不完整或发生模型调用时，任务准备返回 `account_check_incomplete`，界面说明试做尚未开始；手动检查说明未能核验并保留原账号。网络未知/账号不一致继续沿原契约处理。
- 没有新增 LLM 调用、模型字段、站点特判或浏览器重试循环。

Product Alignment / Reuse Assessment 见 [RESEARCH](RESEARCH.md) 的“账号连接整改”。

## 冻结验证

| 验证 | 结果与限制 |
| --- | --- |
| 修复前真实 headless + 原扩展 + owner URL | 握手失败；`work/account-scoped-borrow-20261006/before/retry-daily.json` |
| 只修握手的中间版本 | owned page 不可见；`after/retry-daily.json`，保留第二次首败 |
| 最终 relay 版本 | `final/retry-daily.json` 通过；限定 Cookie 范围、断开借用后任务页存活，finally 关闭测试 Chrome；0 模型、未接触个人 Profile |
| `parallel-relay.test.ts` + `account-borrow-protocol.test.ts` | 3/3；包含两 owner 隔离、重连仅重发本 owner、关闭历史首目标后读取活目标 |
| 新增 interrupted account 回归 + 既有 failure-message | 3 项通过；目录保留原账号、准备只读/写入两分支均拒绝运行时中断，模型调用 0 |
| 同文件两条原有 startup 测试 | 失败：旧 foreign browserRunId 断言与 resume 回调断言。使用 HEAD 原测试和原 AccountReuse 单独复现同样 2 项失败；`baseline-tests.log`。未把这组描述成全绿，未改旧断言掩盖失败 |
| API 类型检查 | 通过 |
| 对抗 review | 发现并修复历史关闭 target 的 P2；最终 relay 与账号诊断复核无新增确定 P1/P2 |
| 服务加载与只读 UI | 旧 PID4852 经原 shutdown API 退出，单实例 PID22352 接管 4173/4175；headless 工作台打开网站账号面板无 pageerror，冻结代码哈希一致。`reloaded-ui.json`；未点击用户真实账号检查 |

没有重跑京东、B 站业务、用户真实登录或视频播放；真实证明范围是此次共同失败的 owner 连接与账号准入边界。任意新任务的编译、发布和业务执行可靠性仍不能由这些局部验证推出。
