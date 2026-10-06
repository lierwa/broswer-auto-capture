# 账号检查完整操作修复（2026-10-07）

## 现场事实与此前验收缺口

基线 `1b5985c`。用户操作 `d15feffd-8ef5-4757-ab3d-dadbb608122a` 从北京时间 10/6 23:59:54 开始，10/7 00:02:16 失败。目标日常浏览器最初未登录，来源专属浏览器已登录；原生检查成功，登录复用后的目标检查 `bb64b0da-dbf0-4377-b197-7afe1ad3088c` 在 00:01:53.910 已确认 authenticated，模型调用 0。

随后 `auth_abandon` 删除加密备份撞上整次操作 120 秒截止时间。transfer `80d726d0-3aef-41de-acba-0929ed902b23` 回滚了目标登录。检查失败路径没有 finally 结束目标维护页，owner `f1240bdb-967c-486a-aa3f-0f6aac644511` 留在 handoff；其 SDK session 后缀 `650c` 与用户截图左侧启动页一致。来源维护页在操作结束时已 closed；不能只凭另一张截图将当时两个页面都断定为永久残留。

每次 accountSession 都新建完整 Python runner，完整检查/登录复用有 12 次账号请求；原验收只覆盖 scoped borrow，旧完整账号 fixture 又替换了 native.accountSession，因此都没有验证真实的累计进程启动开销。上次局部连接通过不构成检查登录功能交付。

加载前进一步查到准备 job `e1c0b6e0-5cf5-42a0-8642-a45857392937` 和执行 `9698362b-4483-41cf-8aab-65a0f699402d` 均在旧维护页清理时失败，错误为 `hybrid_attached_window_end_unconfirmed`。release 的 inspect 前置条件把空 relay 枚举当成无法继续，原生精确 target 关闭核验没有机会执行，旧记录因此阻塞后续启动。两次均未进入本次业务浏览器动作，不能归因于网站或 LLM。

## 实施

- 复用原 `RunnerProcess` 和 Python `AuthorRequestLoop` 的多请求协议，用 Node `AsyncLocalStorage` 将进程限定在一次账号操作中。每条命令仍有 owner/lease 和原取消信号；取消/失败后废弃旧进程，恢复需要新进程。操作结束 finally 关闭进程，没有进程池、跨操作缓存、模型调用或新增重试。
- 自动检查页在成功、异常、超时、取消路径均沿原 owner 执行 finish。仍有待回滚凭据时保留原窗口，不绕过恢复校验；人工登录等待的页面保留规则不变。
- 有效登录检查先持久化，窗口收尾独立记录。对应 platformOperation 尚在收尾时，UI 保持 busy；关窗未确认只投影当前 owner/lease 的 notice，保留已确认账号，避免显示成未登录。
- 检查超时提示明确为账号检查超时，不再要求用户“在网站完成登录”。
- 任务启动释放维护页直接调用原 owner/lease 的幂等 finish；重启后的 cleanup_required 页同样须由原 finish 确认 closed 才允许替代。空枚举不证明关闭，也不再阻止原生关闭核验；待回滚保护仍生效。

## 冻结与验收

生产代码冻结摘要：`work/account-operation-20261007/frozen-code.json`。复用选型与 Product Alignment 见 [RESEARCH](RESEARCH.md) 对应 10/7 条目。

| 验证 | 实际结果 |
| --- | --- |
| 7 项定点回归 | 通过：单操作复用、操作间隔离、取消后废弃、失败关闭检查页、复用失败回滚并收尾、超时/已完成结果/清理 notice/busy、旧页已关时启动和重启后恢复 |
| API 类型检查 | 通过 |
| Workbench 构建与类型检查 | 通过；保留既有大 chunk 构建警告 |
| round-1 | 验收 fixture 误将人工交接模式改为 dedicated-headless，被原合同拒绝；未进入 UI 检查。保留失败结果，未修改生产合同来放行测试 |
| round-2 | 真实 UI 检查→跨 Profile 复用→结束→刷新通过，19.423 秒，12 次账号请求仅 1 次 compiler runner 启动 |
| round-3 | 正常 UI 流程 19.929 秒；12 次账号请求、1 个 compiler runner；目录/transfer 均 completed，模型调用 0 |
| round-3 关闭错误 | 在隔离测试 owner 注入关闭失败后，UI 保留已登录并显示清理 notice，刷新仍正确；解除故障后用原 finish 关闭，不改写失败事实 |
| round-4 最终冻结代码 | 正常 UI 流程 20.121 秒，12 次账号请求、1 个 compiler runner、0 模型；关闭失败 notice 与刷新通过；手动关闭已知测试 target 后，原 prepareStartup 成功释放旧记录 |
| 物理页面核对 | round-2/3/4 均新增残留页 0、原有页保留；round-4 共 5 个维护 owner 均 closed 且 verify_closed 不活跃；finally 退出隔离 Chrome，无本次测试 Profile 的 Chrome/Python 残留进程 |
| 对抗复核 | 发现提前保存结果会隐藏 cleanup_required 的 P2，补精确 notice 和 busy 投影；复审关闭。旧页恢复两处补充审查无新增确定 P1/P2 |

测试使用原 runner、原账号协议、原受管窗口和真实扩展 owner URL，仅将版本化网站数据指向本地认证站，并在测试 launcher 中加入 headless 参数；没有替换 accountSession 传输或绕过 owner 校验。源账号登录为本地测试准备，界面“检查登录”是真实产品命令。最终证据为 `work/account-operation-20261007/round-4/product-result.json`、`physical-pages.json`；验收后 16 个冻结文件摘要无变化。

未使用京东、未操作用户日常 Profile、未重跑 B 站播放；不能从本地认证站验收推出实际网站或任意任务的业务可靠性。没有运行全量测试；上一阶段已记录的两项 startup 基线失败未在本次重跑或消除。

## 现有服务加载

确认没有进行中的需求、准备、执行或账号操作后，沿原 `/api/dev/shutdown` 验证 PID/root 并退出 PID22352；确认 4173/4175 释放后隐藏启动一个替代实例。当前两端口均为 PID16604，health root 与本 checkout 一致。独立 headless 只读打开现有工作台账号面板通过，pageerror 0，没有触发个人账号检查或操作个人浏览器。该只读验证不代替上面的隔离完整流程，也不宣称用户旧失败记录已被重跑成功。

本次代码、测试和文档仅本地提交；原无关 `unused-owned-fixture/` 保留，不纳入提交。
