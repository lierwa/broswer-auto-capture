# 产品浏览器验收入口纠正

## 问题与结论撤回

用户指出验收必须代表系统正常启动/连接。原 `bsk-free-mainflow-host.acceptance.mjs` 直接启动 Chrome，注入 `--remote-debugging-port=0`，改写本进程 LOCALAPPDATA 并在临时 Profile 内加载扩展，然后把它当作日常浏览器。Chromium 的 `content/child/runtime_features.cc` 明确把端口 0 映射到 AutomationControlled；`Navigator::webdriver` 据此返回 true。

原 task5c07ca39 的 Bot/38 clear/1 WebDriver、完整输出与运行记录保留。撤回它代表产品正常浏览器反爬验收通过的结论；流程完成不等于本次改造已合格。不能通过改一个调试端口、注入 webdriver 覆盖或修改盾来取得通过。

## 最小修正边界

- 验收使用当前 checkout 已运行的真实工作台，其浏览器选择、扩展授权和产品数据沿正常入口读取；不另开产品宿主、不复制凭据、不改 LOCALAPPDATA、不自行安装扩展、不启动任务 Chrome。
- 界面自动操作复用既有 `minimum-product-loop-workbench` 辅助浏览器，仅访问工作台、无任务扩展。其调试连接永不交给产品 runner；资源归属与真实任务窗口分开记录。
- 入口校验实际 checkout、系统已选 daily、既有授权已连接且空闲；条件不满足即明确失败，不静默切换浏览器。首尾核验同一 Profile、选择 revision 与宿主 PID。
- 冻结后新建产品任务，经真实需求对话、准备、样本/独立复验、工作台发布及同版正式复跑取得报告；检测结果如实记录，另行核验 WebDriver 与原 Human 基线是否回归。
- 不改个人 Profile、扩展安装记录、检测算法/阈值、已有任务与历史失败。不创建 worktree、不访问京东。Mac/重启等原交付未完成项继续保留，不能执行提交/推送/关机。

Product Alignment:
- natural-language task: 使用系统已连接的日常浏览器完成本地交互检测并取得完整最终报告。
- reusable chain boundary: 仍为产品准备、发布和普通任务执行，不新增浏览器控制路径。
- runtime inputs: 正常工作台的浏览器选择、既有授权、任务英文和中文参数。
- dynamic task outputs: 每次真实检测结论、39 项结果、页面地址。
- generic platform capability used: 既有 DailyChromeExtension/CDPRelayServer/Chrome launcher、受管窗口和独立 UI 测试客户端。
- replay model calls: 0；准备/需求对话独立审计。
- site/task-specific code added: no

Reuse Assessment:
- capability: 验收与产品同一浏览器入口，分离界面客户端和任务浏览器。
- existing implementation in repository: DailyChromeExtension.createRelay、vendor/daily-chrome-extension/chromeLauncher.ts、minimum-product-loop-workbench.ts。
- mature candidates and pinned versions: 仓库固定 Playwright relay/launcher 与 browser-use 0.13.8；不换依赖。
- selected implementation: 直接使用已运行产品公开 HTTP/UI 与其既有受管浏览器链路。
- reused public surface: /api/health、/api/browser-environment、/api/browser/daily-chrome、工作台交互。
- B-A-T-owned adapter and remaining gap: 仅验收入口校验、证据及所属 UI 客户端收尾；无新 controller。
- license/runtime/platform fit: 沿现有固定源码与许可证；本次 Windows 实测。
- browser/runtime/state ownership conflicts: 不启动/关闭用户 Chrome；只由产品创建并回收本次任务 owned 窗口。
- replay model calls: 0。
- rejected candidates and evidence: 临时 spawn 任务 Chrome 已实际引入 WebDriver；调参重跑不能证明产品正常行为。
- focused validation: 入口错误/环境漂移拒绝测试、API 类型检查、新冻结真实任务及同次盾报告比对。

## 执行状态

用户最新指令：所有问题解决后也不关机；撤销本轮原关机安排。全部交付条件满足后的提交/推送授权仍在。

最终修后冻结1234文件，taskd246fdb8完成全产品流程，四次普通执行首次Human/39 clear、模型0、完整报告一致、cleanup首次confirmed，变化输入使用同一V1。所属UI进程/Profile已关闭并永久清理，实际产品daily revision55/Default保持。完整运行ID、39项报告与未完成Mac边界见[最终检测报告](PRODUCT_BROWSER_FINAL_REPORT_20261012.md)。以下记录保留修前首败和诊断过程，不将诊断重跑算作最终验收。

### 取消后的真实资源恢复

Product Alignment:
- natural-language task: 用户取消搜索、填写或读取任务后，可安全开始下一次任务。
- reusable chain boundary: 同一次 execution 的原 runner 退出审计与浏览器 lease 恢复。
- runtime inputs: 原执行记录、原 owner、原清理阶段证据。
- dynamic task outputs: 原业务暂停/失败与输出保留，清理结论独立更新。
- generic platform capability used: 既有 cleanup_required、受管窗口 verify_closed/end、定时恢复入口。
- replay model calls: 0。
- site/task-specific code added: no。

真实取消49832af9先保留cleanup_browser_close_failed；恢复仍失败的根因是草稿owner由启动sequence派生，而旧恢复只接受正式发布运行的managed-window owner。修正只从同taskId/executionId的服务端清理审计读取草稿owner；正式运行继续校验确定owner。13项恢复测试通过，包含外来归属、活跃控制器拒绝、人工现场保留；真实child取消测试1项通过，API检查通过。新增测试首轮fixture误用release:null被Zod拒绝，改为合同已有的undefined后通过；不改变产品合同。

正常产品重载PID24220后，既有自动恢复将49832af9的原owner aaec0c70租约置ended，browser_close confirmed、activeResources=false；业务暂停结论保留，先前33条审计未改写。证据cancel-recovery-final-proof.json。所属UI宿主OXmT9L已关闭且Profile永久删除；个人Chrome23112保留。此后重新冻结新建任务。

诊断最终实现使用ContextVar限定本次原生动作，在已固定B-U Tools模块记录失败时保留实际exception为cause，仍由原脱敏栈协议输出；3项测试覆盖异步子任务、原生超时不重派、指针ACK与读取失败。下方Bubus唯一事件方案属于早期取证尝试，未捕获真实原因，现已移除，不作为最终实现或修复证据。

### 已复现的导航失败根因：扩展转发丢失 CDP 错误结构

修后控制页 redirect-probe-m396twfq 的固定页及0/1/5/20/50ms跨域跳转共6项通过；真实触发 interception-gone:XHR=4，gate.failure=null，无动作重发，cleanup confirmed。修后旧草稿诊断试跑3d38d4c5也完成，Human/39 clear、39项输出与原报告一致；不计新冻结最终验收。真实WS协议回归1项、既有准入/取消4项及API类型检查通过。

资源审计另发现：三次诊断取消的child/process_tree虽已退出，RunnerProcess.closeChild却把browser_close标为not_required，租约仍running。现已依据三个原owner的退出审计，调用既有AttachedWindow.end(controller_released=true)关闭并核验；收据navigation-owned-window-cleanup.json。最小修正只将“未走close协议且有受管window”的状态记unconfirmed，交回既有cleanup_required/owner恢复机制；不把杀进程等同关浏览器，不重造清理流程。业务任务与原失败不改写。

2026-10-12 控制页两次复现（redirect-probe-acaxxqdw / redirect-probe-e10_qxwq）：固定页成功、快速跨 origin 的 fetch→location.replace 在后续请求失败。Chrome 原错误为 `{"code":-32602,"message":"Invalid InterceptionId."}`；ExtensionConnection 保留成 Error.message 字符串，CDPRelayServer 再包装成 `{message: JSON字符串}`，丢失外层 code。实际错误摘要 a29af16f…与该确定结构计算结果完全相同。Admission.continue_request 的既有精确取消分支仅接受原始结构，因而误将请求取消锁存为 capture_access_state_unavailable；DOM/导航健康读取随后失败，最终显示 ordinary_action_failed。此前原生直连的取消回归未覆盖扩展转发边界；不是靠检测规则解释导航失败。

Product Alignment:
- natural-language task: 打开会跳转的页面后继续搜索、输入或读取。
- reusable chain boundary: 保留原生 CDP 错误结构供已有受管运行器分类。
- runtime inputs: 原 CDP 命令与原生错误回执。
- dynamic task outputs: 原任务输出不变。
- generic platform capability used: 既有 Playwright 扩展 relay、Chrome debugger、B-U Tools 与 Admission。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 扩展错误到 CDP 错误的边界适配。
- existing implementation in repository: ExtensionConnection / CDPRelayServer；Admission 已有精确取消分类。
- mature candidates and pinned versions: 现有 vendor/daily-chrome-extension/UPSTREAM.json 固定 Playwright 来源，browser-use0.13.8 / cdp-use1.4.5；不更换组件。
- selected implementation: 原 relay 恢复标准 code/message/data 对象；未知或非协议错误维持 message 失败。
- reused public surface: Chrome debugger.sendCommand 的错误回执、原 CDP WS 响应。
- B-A-T-owned adapter and remaining gap: 仅结构恢复；不扩展 Python 忽略规则，不重新派发请求，不放宽准入。
- license/runtime/platform fit: 既有 Apache-2.0 relay / TypeScript；Windows 日常 Chrome 实证。
- browser/runtime/state ownership conflicts: 控制页借用已结束且无目标的本轮 relay scope，新 operation 独立 lease；不启动任务 Chrome，不改个人 Profile。
- replay model calls: 0。
- rejected candidates and evidence: Python 按文本包含关系忽略会扩大错误豁免；固定重试/延迟掩盖丢失的协议字段。
- focused validation: 真实 WS 扩展格式→relay→CDP 正反例、原 Python 准入/取消测试、同一控制页修前失败与修后对照，随后新冻结产品任务。

后续冻结1231文件新任务dd54a5ff：样本a6c04531完成，Human/39 clear、39项输出逐项一致、普通模型0、cleanup首次confirmed；独立复验7cda31d1仍在首个navigate失败，ordinary_action_failed，cleanup首次confirmed。冻结核验changed/added均空，未发布。原事件诊断未捕获cause；不能把中间一次成功算作问题关闭。继续补原生导航后状态读取异常的脱敏cause，5项定点诊断测试通过；之后取证运行不计最终冻结验收。原a850任务的诊断复跑2655ef75也仅为诊断，虽Human/39 clear仍不覆盖原首败。

已核对 master@94fb77d9 与全部既有改动；正常工作台 API PID23656、daily revision55、Default 已连接且空闲。正在修正验收入口，尚未取得修正后的实跑结论。

首次纠正运行：1231文件冻结未变，task a8503f61 / prepare2057c22e；需求确认与代表试做完成，原生输出引用的case4c05041d显示39项正常/引擎通过/WebDriver未命中。样本execution ebae6117在首个navigate失败，ordinary_action_failed，普通模型0、首次cleanup confirmed；未发布。不能以代表试做通过代替复跑验收。

该上层错误码历史出现过（证书信任、HTTP401分类等），仅凭码不能判定同因。现有OrdinaryCapability把B-U ActionResult.error替换成统一异常，原生事件异常未保留；新增诊断适配只从本次新产生的唯一Bubus事件异常保留cause，复用原脱敏栈提取/协议，不保存异常正文、不重派动作。实际bubus1.5.6公开event_history/event_results/error字段与源码核验；4项Python定点测试通过（旧/歧义异常不误归因、消息不泄露）。以下带诊断草稿试跑单列，不计作最终冻结验收。UI初始两次输入误选旧隐藏panel，0消息/0模型，改为可见任务panel后提交一次需求；辅助工具错误不覆盖产品首败。
