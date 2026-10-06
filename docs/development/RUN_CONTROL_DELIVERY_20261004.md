# 运行控制最小修订交付（2026-10-04）

本轮工程、清理、最小验证、对抗复审与实际主链路连续复跑已完成。用户后续明确要求运行原京东链路；已经沿实际 Workbench → 已授权个人日常 Chrome → 原 TaskChain/LangGraph 执行同一不可变 V1 两次，两次均 completed、cleanup confirmed，各保存2条输出、modelCalls=0，中间没有结束窗口操作。私人京东正向本次已测，其它平台私人账号/SSO仍未测。

## 最后现场回归与连续复跑（当前结论）

用户截图中的旧失败为5d236370；实际重新启动后72afa27e再次失败，保留真实原因 `hybrid_attached_window_busy`。根因是 relay 地址随服务重启变化，却被当成 Profile 身份：原 completed/confirmed/delivery owner 已不占控制锁，但 Python _reserve 仍要求旧 endpoint 相等。最小修复只让宿主已确认释放的 owner 归档，新任务目标从空集合开始；旧 owner 的恢复/关闭仍核验原 endpoint，未接管或关闭旧页。

第一次修复重试cd7e2c56失败 `hybrid_managed_window_lease_changed`：旧收据缺少新增默认字段，归档前 raw JSON 与 Pydantic规范值比较误报。现当前/已有归档都用原 Pydantic合同比较，保留真实冲突拒绝、独占原子发布、原文件字节复核。对抗首轮指出已有旧归档分支，补后 approved，窄范围零可复现P0/P1；8/8所属包定点验证通过。

真实执行9c6f6482、9dfa0c86均为原release e64e7365 V1 / digest4499f804…，sequence36。每次9节点按planned→started→finished，27事件，auditComplete=true，无模型调用，输出摘要相同。归档/当前收据的新旧目标互不重合；两次任务页面都保留，所以现场看到两个窗口，这是顺序复跑保留的两个现场。完成状态与控制锁分离，用户无需结束窗口才能再跑。

证据：`actual-first-failure.json`、`actual-main-first.json`、`actual-main-retry-1.json`、`actual-main-retry-2.txt`、`actual-main-consecutive.json`、`actual-main-persistence.json`、`actual-main-code-review.md`、`actual-window-scoped-final.txt`。`actual-persisted-ui.json`与深浅/390px截图确认重新打开工作台读取第二次完成事实、再次运行可用，无重复全局错误块或状态抽屉；截图实际查看。

服务仍为已授权加载后的PID28908，扩展实际自动连接，无需重装或本人再授权。以上 Python 修复由每次新 child 加载，第一次成功已经覆盖旧relay收据跨重载归档。额外再次服务重启被自动审批拒绝 `blocked by policy`，未执行，不列为修复后重载成功；不把可选补证拒绝扩大成真实主链路阻塞。下方“未自动运行私人业务”均是本次真实复跑之前的历史边界。

## 实际完成与入口

| 阶段 | 实际完成 | 入口 |
|---|---|---|
| 设计/审查 | 最小基准、文档首败修订后批准；废弃状态抽屉方案 | RUN_CONTROL_IMPLEMENTATION_20261004.md；document-review-first/retry-1.md |
| 运行 UI | 红色全局块/ExecutionStrip/状态抽屉删除，紧凑 Dialog + 单一 toolbar；正常输出仍归终点 | ChainRunDialog、LiveChain、ExecutionActions、ChainBoundaryContext、SavedResultDialog/ResizableDrawer |
| 请求闭环 | 未知回执冻结原请求，读取不能吞掉错误；明确拒绝后表单/取消可用；handoff 同命令重试 | TaskChainConnection、ChainRunDialog |
| 资源闭环 | completed/confirmed/delivery 确定 owner 释放控制锁；新目标不动旧页；归档原子发布，Managed current 无空档；未知创建/旧未知收据拒绝 | ProductStore、TaskPlanExecutor、AttachedWindow、ManagedWindow、ManagedTargets、window_lease_archive |
| 账号启动 | 原账号 startup 复用同释放判据和内部 whitelist；检查维护目标与正式目标分离 | account-availability、account-windows、account-service、原 AccountReuse |
| 历史反馈 | 复用原反馈到终点/历史；保存后发送失败重试，stale 核验立即 busy，原话/选择/旧版本不换 | ExecutionFeedback、WorkbenchContext、TaskChainConnection |
| 清理/验证 | 仅删除本轮替代组件、execution 分支、空 import 和无引用样式；两轮代码修订后 approved | cleanup-manifest.json；code-review-first/retry-1/retry-2.md |

未提交、推送、创建分支或 worktree；master/原 HEAD 不变，既有 dirty work 保留。未更改模型产品配置、平台检查判据、调度器、驱动或邻项目，未扫描 node_modules。实际 session 证据是 gpt-6.1-sol/xhigh，不能标作 Astra。

## 验收事实与真实证据

所有本轮证据在 `work/run-control-20261004/`，索引 `delivery-evidence.json`。

- `api-scoped-review-1.txt`：7/7；释放许可、真实 startup 信任边界、清理恢复与 headless owner。
- `workbench-scoped-retry-1.txt`：35/35；同请求、未知回执/窗口命令、反馈双击/stale/旧引用、输出合同与终点事实。
- `python-final.txt`：7/7，含归档发布中断/替换中断、不同 owner/endpoint/可见性拒绝、重启及旧无字段未知创建拒绝。
- `native-retry-2.json`：daily 和 dedicated-visible 各 4 次真实 TaskChainService → 原 runtime/LangGraph → Python/Chrome，独立 execution/target、completed/confirmed/modelCalls=0；已保存自定义账号检查、HttpOnly 会话和 localStorage 保留；SQLite/runner 重开；结束旧 owner 不影响新页；最后 ended owner 后还可复跑。专属四次同进程。仅本项目自有隔离 Profile， teardown 校验原 PID/startTime/executable/Profile 后结束自有测试进程。
- `ui-final.json`：真实 Workbench 深浅、390px、1024×480，无短表单内滚动或越界；Radix Select 约105px；启动拒绝只一处，取消不污染旧完成态；未知关闭重开/同 body 核验/409恢复表单；原结果抽屉1100px调宽并返回焦点。四种 toolbar 状态是拦截 GET 的只读展示样本，不冒充真实运行/等待/失败；活动/清理时再次运行禁用。截图已查看，证据保留逐次失败与重试。
- `workbench-build-final-retry-1.txt` 和 `api-check-review-2.txt`：构建/所属包类型通过；现有大 chunk 提示未在本轮重构。
- `service-before.json` / `service-after.json`：1任务、1发布、7 execution、4 authoring job、3 turn、账号60条事实、模型/浏览器设置与原租约哈希一致；无活动 execution。正式重载未执行，故这只证明重载尝试未动现场。
- 旧 W01–W09 审计沿 `work/account-unified-20261003/windows-audit.json` 与旧交付索引；已通过 popup/设置没有重跑。

## 首败与重试（不覆盖原证据）

实际旧锁回归：retained-replay-baseline-2.txt 失败 → api-scoped-review-1.txt 通过。前两次夹具 API/cleanup 字段错误另留 retained-replay-first/baseline.txt。

native-first-failure.json 的夹具 plan digest 归一化失败 → native-retry-1 再到新增账号门 native-retry-2 通过；没有重新生成私人业务链。

首轮 UI 定位 banner 不适用于 section 内 header；retry-1 暴露 unknown 重开后409缺表单，代码修订后 retry-2/3通过；新增 toolbar 标签与 SSE 拦截夹具错误保留 retry-4/5，retry-6通过。Scoped 首次 JSX 启动未使用 Workbench tsconfig（35中16失败）保留 workbench-scoped-final.txt；加原 tsconfig 后35/35。最后构建暴露 UUID ref 推断过窄，显式 string 类型后构建通过；首败 workbench-build-final.txt 保留。代码首轮6项P1、复审3项P1修订及批准记录分别保留。

## 加载与剩余门

正式加载已完成，新 PID28908，root 为当前 checkout。`service-loaded-admission.json` 只读核验原持久事实：dailyControlLease=null、originalDeliveryReleased=true；新服务实时 accountAvailability.daily/dedicated=null。没有启动私人任务验证，也没有关闭 Chrome、原标签或改写租约。以后仍沿原 `npm.cmd run dev` 加载服务。

`service-authorized-before.json` / `service-authorized-after.json`：原任务、合同、发布、运行、authoring、turn、模型/浏览器设置及原租约哈希不变，60条账号事实数量不变；账号表哈希因既有 AccountRepository.recover 的维护/恢复元数据更新而变化，不能称整表完全未变。首次重载拒绝证据保留；只读核验夹具的 ESM/依赖解析/connection 绑定三次失败另存，最终 retry-3 通过。没有修改产品源码来绕过准入。

本轮未改扩展，无需为本轮重装。首次/源码变化的日常扩展仍按原 `node scripts/build-daily-chrome-extension.mjs`，在 Chrome 扩展页加载/重载脚本产出的构建目录并由用户授权；扩展跟随浏览器主题。程序不代授权个人 Chrome。

用户原京东业务/本人已授权Chrome正向已实际连续复跑通过。其它私人平台账号正向、线上SSO和本人Chrome冷启动/撤销仍待本人验收，不能包装为“所有真实账号成功”。已有可见专属进程不能静默改成后台模式，跨可见性仍拒绝；未知owner、人工等待和未确认清理不能强占或自动关闭。
