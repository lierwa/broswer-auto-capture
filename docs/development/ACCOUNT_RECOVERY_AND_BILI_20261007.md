# 账号恢复与冻结 Bilibili 验收（2026-10-07）

## 本轮问题与依据

基线 `4eaaa03`，原无关 `unused-owned-fixture/` 保留。

用户最新账号检查 `d167fa26` 和准备 `85d192eb` 在旧账号转移恢复阶段失败，B-U 动作与模型调用均为 0。transfer `173d7956` 为 target_pending；直接读取原 Windows DPAPI 材料的固定元数据确认 phase=rollback_ready、原目标 Cookie 数为 0。没有输出、复制或记录凭据。原 `account_auth.write` 在每次写入前持久化 write_started，因此该材料证明本次尚未开始写入。

旧恢复先要求 inspect 旧页面，relay 空枚举报 `hybrid_attached_window_end_unconfirmed`，导致无写入事务也无法撤销，后续账号检查和新任务被一起阻塞。旧错误被 safeReason 压成通用提示，**首次转移为何丢失页面控制仍没有足够原始证据**；不将本次复现的关页注入追认为那次真实原因。

## 最小整改与复用

- 沿原 auth_restore/DPAPI store 增加离线阶段探测：核验版本、owner、lease、kind、平台及旧 scope 后，rollback_ready 直接撤销材料，无浏览器写入；已经开始写入则回到原 owner 与 digest 保护的恢复路径。移除重复 inspect 前置条件。
- auth_abandon 和离线探测不依赖 daily endpoint/lease 的可用性。没有清空 pending 数据库、替换登录、跳过已写入恢复保护或新增自动重试循环。
- 自动专属账号检查复用现有 Chrome headless、ManagedWindow 与原借用协议；内部 accountMaintenance 表示交回宿主继续检查，不放开普通任务的 headless 人工交接。人工登录仍可见；旧 headless 页须先确认关闭才能进入人工流程。
- 原生命周期诊断增加固定动作/错误码记录，不保存原异常、页面正文、Cookie 或请求 payload。既有模型和业务编译逻辑未改，新增 LLM 请求和字段均为 0。

Product Alignment 和 Reuse Assessment 见 [RESEARCH](RESEARCH.md) 同日条目。

## 验证事实

- 新增 Python 用例先在修改前失败，证明未写入恢复错误地连接浏览器；修后两项原生 DPAPI 测试通过，包含旧 scope、有写入恢复、错误 owner/版本拒绝和离线只探测。
- 15 项账号操作/共享登录回归通过；新增 headless 人工恢复守卫后，相关 12 项通过。浏览器选择旧用例把另一来源仍有效的账号期望为 expired，与现存保存逻辑和用例名称矛盾；改为断言原来源 ready 且本次复用失败，没有改产品状态逻辑。
- API 类型检查与 Workbench 类型检查/构建通过。首个命令误用不存在的 typecheck script，后使用仓库实际 check script；构建保留原有 chunk 大小警告。
- 原生隔离 headless `round-1`：auth_prepare 后物理关闭测试目标，首轮失败但安全 rolled_back、没有 pending 和遗留维护页；下一次实际 UI 检查/跨 Profile 复用/刷新通过，18.972 秒、12 账号请求、1 compiler、0 模型。关窗故障提示与手动关页后启动恢复通过；物理新增残留页 0，原有页保留。
- 保存的真实 B 站账号经现有工作台按钮检查成功：operation `fa5dca42-7c33-4101-9c7b-f7669146bc1e`，check `9fdb0218-d824-4d08-a1f8-a5a710bc3b98` completed，模型 0；刷新显示已登录、无 notice，owner `24ae8fe4` closed。原 `173d7956` 由产品恢复入口转为 rolled_back，未直接改库。该次选用产品已有的专属 headless 模式，不代表对日常 Profile 重新执行了转移验收。
- 真实账号 UI harness 第一轮在点击检查前因相对 API URL 无 baseURL 失败；修正测试地址后才完成上述检查，首败保留。
- 对抗复核发现隐藏页被人工登录复用的 P2；增加兼容旧记录的 headless 事实及关闭守卫，正反例通过，复审关闭。未操作个人网页、未使用京东。

证据：`work/account-recovery-20261007/round-1/product-result.json`、`physical-pages.json`、`actual-account.json`（harness 首败）、`actual-account-2.json`（实际通过）。

## 冻结后的独立任务

921 个已跟踪源码/配置文件摘要保存在 `work/account-recovery-20261007/frozen-code.json`。冻结后服务唯一 PID24604，4173/4175。使用工作台最新既有任务 `5eecaaee-f0e5-4ebf-a0a0-cc9605426660` 的“重新试做当前需求”，在原任务浏览器下拉选择专属后台运行后点击“开始生成”；没有重写需求、候选计划、发布链路或业务数据。

本次 job `6b3f66cb-f1fb-48f9-88ca-bee5f81566cd`，browserRun `534d3af3-46b3-4461-8109-bb3866dbc0ba`，已自然 completed。账号准备 completed；B-U 执行 6 个动作（含 done）、7 次模型调用；sourceGaps 为空，编译、两次验证及发布均完成。

| 环节 | 实际结果 |
| --- | --- |
| 原需求试做 | 首页输入原词“凡人修仙传”，点击搜索、作品、等待；B-U 的 done 原始说明为第 195 话是预告、第 194 话已播放，计时 02:35/19:27。该说明是探索记录，不冒充正式运行的独立播放证明。 |
| 代表复跑 `e6fa80dc-a9c8-46a3-8c11-d0065ec266f5` | sample completed，6 次流转、8 次浏览器命令、30.518 秒活动时间、0 模型；cleanup confirmed。 |
| 独立复验 `230e4604-f37f-4d0b-84ef-e08cb4f7ccde` | verification completed，6 次流转、8 次浏览器命令、29.716 秒活动时间、0 模型；cleanup confirmed。 |
| 通过工作台发布 | release `438a9a7f-605c-452f-842c-675b5d0cff85` V1，digest `3b3865ac77bbc69eaf0cef0a644d1592ad09878f011d4c26f2de9029717a31b8`。 |
| 正式运行 | **未启动，验收阻塞**。正常 UI 显示“本任务需要保留页面，请选择显示窗口的浏览器。”且开始运行按钮 disabled。原任务的 keep_open 要求与本轮 headless 约束冲突。未越过 UI 调 API、未修改任务、未打开可见浏览器。 |

因此**本轮不能宣告完整产品流程通过**。账号检查已恢复；原来的 B-U 启动阻塞已解除，准备、普通执行器复跑、发布已有真实证据；正式运行与保留播放页面仍未验收。`ChainRunDialog.tsx` 的 run/keep_open/headless 守卫确实阻止提交，而 sample/verification 不请求页面交付；这解释了两次复验成功不能替代正式验收。冻结后按用户要求只运行，不为这个网站追加修补或改变交付要求。

完成后的 921 文件摘要比对没有变化，源码保持冻结；无运行中的 authoring job、execution 或 cleanup_required execution。本轮没有全量测试、京东访问或日常浏览器操作。

最终证据：`work/account-recovery-20261007/bili-final-acceptance.json`、`bili-progress.json`、`bili-start.json`、`bili-ready.png`、`bili-published.png`、`bili-formal-blocked.png`。这些运行文件留在忽略目录，不将账号、Profile、原始敏感页面或截图加入 Git。
