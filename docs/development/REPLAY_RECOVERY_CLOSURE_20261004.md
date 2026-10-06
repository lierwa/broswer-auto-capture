# 复跑与账号资源恢复闭环

## Product Alignment
- natural-language task: 已发布任务可独立再次运行；账号检查/登录独立于旧任务；观察间隔本地保存。
- reusable chain boundary: 不改发布链路与历史 TaskRun；每次启动仍创建新 execution。
- runtime inputs: 已发布版本、输入、所选浏览器、持久化间隔偏好。
- dynamic task outputs: 原业务输出和首次失败保留，资源核验另记清理审计。
- generic platform capability used: 已有 runner 清理、owner/lease 核验、日常 Chrome relay、账号复用。
- replay model calls: 普通复跑与恢复不增加模型调用。
- site/task-specific code added: no

## Reuse Assessment
- capability: 启动失败与旧 owned 窗口恢复，不增加通用调度器或浏览器驱动。
- existing implementation in repository: TaskConnection / RunnerProcess / AttachedWindow / ManagedWindow / AccountTransfers。
- mature candidates and pinned versions: 继续使用仓库已锁定 Browser-Use、CDPClient、Playwright、LangGraph 与 Radix；不替换依赖。
- selected implementation: 扩展已有 owner 核验和本地 relay 适配边界。
- reused public surface: Target.getTargets / Target.closeTarget、原 runner.close / managedWindowAction、原账号 UID 与 scope 校验。
- B-A-T-owned adapter and remaining gap: 正确区分尚未创建的执行资源与账号维护资源；旧记录可核验；共享账号投影与传输错误隔离。
- license/runtime/platform fit: 沿用已验证依赖与 Windows 本地 runner；不新增库。
- browser/runtime/state ownership conflicts: 仅操作匹配 owner/lease 的目标；实际控制器保持互斥；授权 Profile 变更拒绝重绑定。
- replay model calls: 0 个新增隐式模型调用。
- rejected candidates and evidence: 不新增恢复状态机；已有服务与原生租约拥有所需事实。
- focused validation: 隔离 SQLite、错误路径测试、原生租约测试与 headless UI；不控制用户 Chrome。

## 必须覆盖的分支

| 分支 | 必须行为 |
| --- | --- |
| 账号准备失败、task runner 尚未创建 | 保留首次失败；执行资源记 not_required，不虚构清理挂起 |
| runner 启动失败/链路失败/取消 | 原 owner 清理报告落库；下一次启动自动核验，原业务结论不改写 |
| 老版本错误 owner + 空清理报告 | 只在未进入链路、无交付事实时用持久运行 owner 做原生缺失/结束证明 |
| 清理仅 browser_close 未确认 | 原控制器退出且其它阶段确认后，沿同 owner 核验/释放 |
| 完成且保留交付页 | 按已有 releasedOwners 归档收据，新运行只创建自己的目标 |
| 人工等待/暂停 | 保留同一次现场恢复；停止有明确反馈，现场丢失后允许重新独立运行 |
| 原 relay 地址过期 | 只对同一授权浏览器身份刷新传输地址；不把另一 Profile 空目标列表当关闭证明 |
| 账号检查连接失败 | 保存操作失败，保留最后确认的共享账号身份/登录证据，不降级为退出登录 |
| 实际控制器仍工作/资源身份未知 | 明确说明占用或无法核验；下一次动作重新自动核验，不能假报释放 |
| 服务重启/请求重试 | owner、业务输出与清理审计持久；requestId 幂等；偏好不重置 |

## 当前证据

修改前：失败 execution 的缺失报告使用 cleanup-owner，与 managed-window 不一致；12 次重复核验未进原生；日常账号检查先核验旧任务窗口；界面按 Profile 投影登录状态；间隔每次打开清零。

所有浏览器验证仅限 headless 隔离样本；没有打开、聚焦、检查或写入用户 Chrome。

### 实施结果

- 运行启动：账号前置失败证明 task runner 尚未创建；旧缺失报告只在受限启动条件下核验真实 managed-window owner。已退出 runner 的 owned 目标可自动释放；活跃子进程、错误 owner、未知目标创建保持拒绝。恢复旧资源后创建独立 execution，保留原业务结果与首次错误。
- 传输恢复：已授权 Profile 的 relay 路径由 token/Profile 派生不可猜测摘要，端口仍临时分配。旧账号维护收据仅在宿主核对相同账号浏览器绑定后迁移；不同身份拒绝，缺失 owner 不连接 Chrome。
- 账号：显示持久共享账号的来源证据，不随执行浏览器选择改变。连接/不可判定检查不覆盖此前确认事实；不同或未知目标账号零自动写入；来源 UID、版本、scope 与失败回滚约束保留。
- 工作台：再次运行自动核验历史资源，去掉无意义恢复连接入口。观察间隔保存到本地，未确认原请求仍使用原冻结值。通知点击定位到对应运行详情/准备面板/需求对话；读取失败有重试。点击单条或全部已读保存回执，新事件产生新未读。任务管理菜单回到所有列表行，顶部移除重复入口。
- 暗色通知使用现有主题 token；实际 hover 背景 RGB(42,42,40)，标题 RGB(238,238,236)，说明 RGB(181,179,173)。

### 验证与首败记录

- 修改前新增两个真实不变量测试首次 0/2；修复后 2/2。
- 定点 TypeScript 测试累计 21/21：9 项清理恢复、11 项启动/保留现场/账号复用、1 项本地偏好与通知事件身份。6 项新增恢复分支首次夹具缺失必填 evidenceDigest，补齐测试夹具后 6/6；未修改合同降低证据门槛。
- 原生既有租约 8/8。真实 headless CDP 验收通过：relay 换端口保留同身份、不同身份拒绝、未知创建拒绝、缺失 owner 不修改另一 owner 收据、仅关闭已记录目标，受保护的隔离标签仍可执行。
- 真实 TS → Python IPC 缺失 owner 核验通过；原生 runner 启动但未启动浏览器、未调用模型，覆盖 daily、dedicated-visible 与 dedicated-headless 请求路由。
- 真实构建 UI + 隔离 SQLite/API 验收通过：通知定位详情、已读刷新保持、新事件重新未读、全部已读、选中列表菜单、清理挂起时再次运行可用、无恢复连接按钮、间隔刷新后保留、新 execution completed / 0 模型调用、旧失败输出和清理审计保留、持久账号直接显示。浏览器 console error 0。
- 新 UI 验收夹具首次初始化失败分别为误用方法/字段、遗漏浏览器必填 headless、在 Fastify ready 后加路由；调整夹具使用已有 API 和独立控制端口后通过。没有在正式数据上反复试跑。
- 当前服务重载后只读验收首败：持久账号已经 ready，但旧失败文案仍提示“返回原任务”。通过现有原因格式化器兼容这条已废弃文案，原数据库检查历史不变；实际页面复验确认已登录可见、检查按钮可用、没有原任务指导或产品 POST。
- API/Workbench 类型检查与 Workbench 构建通过。原生启动环境 `setup --check` 通过。原有 relay 兼容测试 13/15；2 项失败仅为 Windows stat.mode 的 POSIX 0600 断言（438 != 384），保留为平台基线失败，不冒充权限验收通过。

### 验收边界

上述证据来自受控浏览器、合成账号和独立数据库。用户的京东正式任务、真实哔哩哔哩登录复用、扩展真实弹窗和个人 Profile 的现场重启没有执行；不会用隔离通过冒充这些业务通过。

证据：`work/replay-closure-20261004/ui-proof.json`、`native-recovery-proof.json` 和对应截图。

正式开发服务以 PID/root 双重核验后，经 `/api/dev/shutdown` 重载；health 验证新 PID 4860、root `D:\work\browser-auto-tool`，4173/4175 正常监听。重载前没有 running/queued 的 execution/authoring job。实际页面只读 headless 验收通过，产品写请求 0，证据 `live-readonly-proof.json`；三模式真实 Python 路由证据 `native-ipc-proof.json`。隔离测试服务 4198/4199 已关闭；未提交或推送，原 checkout 与其它 dirty work 保留。
