# 账号入口与占用修复（2026-10-03）

用户实际验收否定旧表单入口：不能要求填写网址、平台名、账号备注，再手动研究检查方式。原工程通过不等于该产品体验已验收。

Product Alignment:
- natural-language task: 在日常或专属浏览器登录网站，自动收录当前网站及真实身份。
- reusable chain boundary: 用户打开受管登录窗口，当前页面元数据确定来源，原 producer 建立检查链并复跑。
- runtime inputs: 稳定 Profile、原窗口 owner/lease、本次真实当前页面。
- dynamic task outputs: 自动网站条目、真实检查结果及身份。
- generic platform capability used: 原受管窗口、CDP 元数据、原生方法生产、TaskChain、SQLite、Radix。
- replay model calls: 已有方法检查 0；首次建立独立审计。
- site/task-specific code added: no

Reuse Assessment:
- capability: 无表单登录收录、原窗口当前页元数据、正确占用反馈。
- existing implementation in repository: AttachedWindow/ManagedWindow、RunnerProcess、AccountService、accountMethodProducer。
- mature candidates and pinned versions: 沿上次 RESEARCH 固定 B-U 0.13.8、W-U 0.2.11、cdp-use 1.4.5；不增依赖。
- selected implementation: 原窗口的 Target.getTargets 或现有 /json/list 元数据，仅限证明拥有的原标签。
- reused public surface: 原 managedWindowAction、withCapabilities/handoff、TaskChain 和 Radix。
- B-A-T-owned adapter and remaining gap: 无 entry 的维护窗口、元数据到目录绑定、建立后自动执行；不添加驱动/调度器。
- license/runtime/platform fit: 沿原受管依赖与 Windows 入口。
- browser/runtime/state ownership conflicts: 活跃控制器全局互斥；控制器已退出的保留窗口只阻止相同浏览器身份空间。两种 owner 使用原本不同的租约文件，动作须按请求 owner 匹配；不关闭或改写另一窗口。
- replay model calls: 普通刷新不调用模型；新来源首次建立使用已有选择。
- rejected candidates and evidence: 全局 activeBrowserWindowLease 把已完成 daily 交付错误地挡在 dedicated 前；现有核验原 endpoint 返回 ConnectionRefusedError，不能当作关闭证明。
- focused validation: 无表单真实 UI 收录、双浏览器元数据与原 owner、自动首次建立/检查、跨种类保留窗口不阻塞、同种类和运行中仍阻塞、原数据保留。

本轮不扫描个人历史、密码库或全部私人标签。采用用户已接受的“打开网站登录，由系统识别收录”路径。账号页没有手工建档前置表单；原保存条目保留。需要登录/验证码仍由用户在网站处理，未知不能画成登录成功。

实际首败：原用户任务 handoff inspect HTTP500，直接原 runner 诊断为 ConnectionRefusedError；原业务 completed 与原 lease 保留，未退出账号、关标签或清库。后续验证与实际服务加载在交付补记记录。

## 实际完成与验证

账号入口已改为“打开浏览器登录 → 在网站正常登录 → 识别账号”。读取原受管标签的 URL 自动收录来源与网站名称，首次自动建立方法并执行；再次识别复用精确链、创建独立零模型检查。未登录/未知仍保真；未知时用户可选“重新识别”显式修订。既有条目和备注保留，不再要求先填写资料。相同账号维护窗口可打开已有网站；Windows 拒绝抢前台时提示从任务栏切换，不伪称资源失控。

占用只按实际控制器全局互斥；已退出控制器的保留窗口按 daily/dedicated 身份空间隔离。Python 启动恢复与离线窗口动作均按确定 owner/模式选择原租约。相同浏览器旧窗口仍未核验时显示原因及“核验窗口状态 / 查看原任务”，不把连接拒绝当作关闭证明。

### 首败、修复与单项补验

1. `work/account-capture-1791000278472/result.json` 整体失败：专属空白登录窗口能打开，恢复时另一个选择点仍误选 daily 残留租约。修复 `Runner.start` 的 owner 选择后继续。
2. `work/account-capture-1791000361394/result.json` 整体 failed，不能标整轮通过。但实际原生 producer 建立、读取 Test Alpha、两次独立零模型检查、旧任务保留、自有窗口结束均已通过。截图初次因测试 sentinel 抢了测试页焦点而等待；仅把隔离的测试工作台页带到前台继续，未操作私人标签。随后脚本 Page.reload 提前匹配旧 DOM，在旧页面消失后 click 失败；修为等待新文档标记，保留原失败。
3. 上述同一 SQLite 数据用 `work/account-visual-1791000701509/result.json` 单补实际服务重建/页面读取与视觉验证，passed。没有重新生成模型方法。深浅与390px截图逐张实际查看，无表单、单 Dialog、无横向溢出。
4. `work/account-capture-1791000584024/result.json`：日常 Chrome 原扩展、真实工作台、真实服务端会话、当前页收录/再次识别/刷新/自有清理 passed；此轮仅 producer 用受控链夹具，模型生产由上一专属原生样本证明，不冒充全部原生。
5. 用户真实 B 站首轮 `work/account-usability-repair-20261003/live-open-first.txt`：占用错误已解除，但 `https://www.bilibili.com` 被浏览器规范化成带 `/`，旧导航后置校验报 `ordinary_postcondition_failed_url_fact_mismatch`。底层已确认释放，账号服务却留下待清理；原诊断在 `data/source-lifecycle-diagnostics/3a7834b2-a1b5-47ec-b3fe-998c82fa3935.jsonl`。修复账号 URL 规范化、明确 browserMode 的窗口核验和失败后的只读状态恢复，不放宽为任意同站路径。
6. 最终真实重试 `work/account-usability-repair-20261003/live-open.json` passed：原 `bizhan` 条目、真实专属 Profile，已观察到 B 站原站点窗口 active。只核验结束本轮首败创建的无资源维护记录；窗口已留给用户登录，没有代填/确认私人身份。旧任务数据及原 daily lease 摘要保持不变。

### 定向命令与结果

所有命令从当前实际 checkout 根目录执行；未运行根级/全量测试。

| 范围 | 入口与结果 |
| --- | --- |
| 账号新来源/所有权/互斥 | `node --import tsx --test apps/api/tests/browser-account-capture.test.ts`：最初2项通过；后加 OS 前台拒绝/复用原窗口仅以 `--test-name-pattern='OS foreground'` 单补1项通过 |
| 原生命周期 | `node --import tsx --test apps/api/tests/browser-account-lifecycle.test.ts`：5/5；URL/失败核验改动后只补 handoff/cleanup、cancel 两项 |
| URL 精确边界 | `browser-account-url.test.ts`：根地址规范化与普通复跑通过，另一同站路径仍拒绝；与上面两项合计3/3 |
| Python 元数据 | 既有 Python3.12 环境，`python -m unittest discover -s apps/api/tests -p test_account_window_page.py`，PYTHONPATH 沿原 vendor/workflows 与 apps/api/python；2/2 |
| Windows UI | `BAT_RUN_ACCOUNT_CAPTURE=1 node --import tsx apps/workbench/tests/browser-account-capture.acceptance.ts`；专属加 `BAT_CAPTURE_REAL=1`；日常加 `BAT_CAPTURE_DAILY=1`，分开记录实际边界 |
| 重新读取保存结果 | `BAT_ACCOUNT_UI_DATA=work/account-capture-1791000361394/data`，`node --import tsx apps/workbench/tests/browser-account-visual.acceptance.ts`，passed |
| 类型/构建 | API `npm run check --workspace @browser-capture/api`；Workbench check/build 通过。日志 `api-url-check.txt`、`ui-check.txt`、`ui-build.txt`；只保留既有大 chunk 提示 |

简写日志在 `work/account-usability-repair-20261003/`。该目录的 `native-capture-summary.json` 汇总原生阶段与单项刷新补验，保留 sourceRunPassed=false；`delivery.json` 为本轮证据索引。

### 服务与人工边界

最终开发服务 PID2168，`service-final-after.json` 已证明原任务、账号条目、模型设置、原 daily lease 和授权内容不变；只允许本轮失败维护状态按真实核验更新。先前服务就绪前一次健康探测 ConnectionRefused，服务监听后通过，未把启动中的端口拒绝当成数据丢失。

无需重新加载扩展：本轮扩展代码未修改。刷新工作台即可看到新入口。用户已添加的 B 站记录已成功打开，窗口保留供本人登录；尚未代用户登录、输入验证码或声明其私人 B 站身份 verified。原日常 Chrome 历史交付 endpoint 仍不可达且未证明窗口关闭，记录保留；它不再阻挡专属浏览器。新日常入口已在隔离授权 Profile 实机通过，但不把它冒充用户原旧窗口的恢复完成。

未创建 worktree/分支，未提交/推送；master/HEAD 未变，未触碰协调器或系统关机。此修复补充并取代旧交付中手工添加平台的交互结论。
