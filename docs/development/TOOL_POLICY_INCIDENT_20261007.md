# 工具策略拒绝与临时资源交付复盘

日期：2026-10-07。适用：本项目开发 agent 的命令诊断、临时资源管理及交付；不是 B-A-T 产品运行协议，也不要求产品 LLM 增加字段或调用。

## 事件与责任

开发辅助启动的引号错误创建了多余 Chrome Profile。该辅助进程经身份核验关闭，目录移到忽略的 `work/browser-routing-20261007/accidental-profile`。随后三次永久删除请求在执行前被 Codex 拒绝；开发 agent 没有立即查对应源码，误归因“自动审批 reviewer”，要求已授权用户再次操作，并把后来的回收站暂存称作“已处理”。

责任在开发 agent 的诊断顺序、重复尝试和交付表述。用户授权不足不是本次根因；临时数据没有业务保留价值。Codex 的通用报错隐藏具体分类，增加了诊断难度，但不能替代开发方查证。

## 已确认的根因链

核验对象为本机 `codex-cli 0.160.0`，对应官方 `rust-v0.160.0` 源码。三次拒绝发生于北京时间 14:26:37、14:27:49、14:34:39；命令均含 `Remove-Item … -Force`，当时实际会话均为 `approval_policy=never`、`sandbox_policy=danger-full-access`。

1. Windows `has_force_delete_cmdlet` 将该命令分类为危险命令。此分类看命令词与强制参数，不消费聊天里的授权或此前路径核验结果。
2. `render_decision_for_unmatched_command_for_platform` 对危险命令先分支；审批策略为 Never 时返回 Forbidden，不进入普通 unrestricted 文件权限放行分支。
3. `DangerousCommandMatch::Other` 的拒绝文案固定为 `blocked by policy`。拒绝发生在创建 PowerShell 进程之前。

源码依据：

- [Windows 强制删除判定](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/shell-command/src/command_safety/windows_dangerous_commands.rs#L207)
- [危险命令与 Never 的决策分支](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/core/src/exec_policy.rs#L731)
- [通用拒绝文案](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/core/src/exec_policy.rs#L1049)

用户配置文件中的 `guardian_subagent` / `on-request` 默认值不能覆盖实际会话证据。本次没有证据表明 reviewer 作出了拒绝决定。只检查 `default.rules` 得到 `matchedRules: []`，也不能排除执行器的内置 fallback 分类。

以上只解释这三次已核对的删除拒绝。其它历史 `blocked by policy` 必须按各自命令与当时策略诊断，不统一套用本例结论。

## 强制执行规则

这些规则已同步到根 `AGENTS.md`，不能仅留在本复盘中。

| 阶段 | 必须取得的事实 | 不允许的替代做法 |
| --- | --- | --- |
| 创建资源 | 用途、owner、精确目标、收尾路径；优先既有临时目录/finally | 为临时维护随意新建个人浏览器资料副本 |
| 发出清理 | 路径范围及重解析点核验、资源已释放、确实需要的参数 | 无条件添加强制参数、删除整个 work 或全局回收站 |
| 首次策略拒绝 | 原请求、版本、有效权限、拒绝层、具体规则或明确证据缺口 | 无变化重试、仅凭错误字符串归因、重复索要已有授权 |
| 处理拒绝 | 使用正式审批机制或实质降低风险的方案；记录目标差距 | 修改工具策略、换解释器/API/编码绕过拒绝 |
| 交付 | 关闭、永久删除、回收站暂存、阻塞分别核验并陈述 | 把移动或目录消失说成空间已经释放 |

若缺少根因证据，状态只能是“已定位到某层，具体判定未确认”，随后继续可行的只读定位；不能宣称无法删除，更不能把查证工作转给不在电脑旁的用户。

## 本次资源的准确结算

- 通过产品 handoff 的 end 操作关闭原任务窗口；execution 仍 completed、handoff ended、cleanup confirmed。
- 核验后关闭本轮扩展连接页；回收站操作结束时 Chrome 主进程为 0，个人 `User Data` 保留。
- 临时 Profile 已移入 Windows 回收站，原错误位置及隔离位置均不存在，回收站匹配该原目录的条目为 1。
- **永久删除和空间释放未完成。** 不清空用户的整个回收站，不把暂存记录改写为永久删除。

本地证据：`work/browser-routing-20261007/cleanup-receipt.json`、`recycle-cleanup-receipt.json`。它们保留各自时间点事实；原始 Profile、账号内容及私人页面不入 Git。

## 本次记录验证

核对本机版本、三次实际命令/会话设置与固定版本官方判定代码；没有再次执行删除，没有改 Codex 安全配置，没有创建新浏览器/Profile。文档交付只做差异、链接及事实一致性检查，不为开发工具事件增加产品测试或新的 LLM 协议。
