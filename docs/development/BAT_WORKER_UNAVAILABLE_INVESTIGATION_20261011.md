# 两次Worker不可测：原证据、确定性复现与最小修复

2026-10-11，master@5ac7f8f1748955779446937f8491a01dc6be054f。用户要求追查原样本和独立复验的Worker unavailable，不以末次Human关闭历史故障，不改盾、不碰运气重跑。

## 结论与尚未证明的部分

**已证明且修复的B-A-T缺陷**：日常任务页只在请求阶段启用Fetch准入，随后在CDP接收回调中同步持久化响应退避。磁盘/SQLite操作变慢时，整个CDP消息处理被堵住，Worker的attach/resume和请求继续指令无法及时处理。受控真实Chrome前后对照证明该机制能导致Worker超时，并证明修复有效。

**两个历史运行的唯一归因仍未证明**：原盾事件、HTTP记录和任务结果均在，但当时未保存CDP接收/放行时间和阻塞堆栈。它们与已复现缺陷吻合；不能把后来采样栈或人工慢存储等同于当时发生了同一数据库锁等待。原两次unknown保留，历史原因标为未完全定因，不因本轮Human改写为通过。

## 原始三次对照

| 阶段 | case | Worker结果 | probe.js到creep.js请求间隔 | creep.js服务端处理 |
| --- | --- | --- | --- | --- |
| 样本 | 4e08fe00-1249-473d-8ddc-e3cee54b9a08 | 四项unavailable | 4.881s | 52ms，200 |
| 独立复验 | c4b51d95-d02b-4e00-823e-4a8f7e9b95df | 四项unavailable | 4.159s | 101ms，200 |
| 原正式复跑 | 90e00a24-9935-4166-89d3-9f730b40561c | 四项clear/有效 | 0.425s | 7ms，200 |

间隔按网关请求StartUTC计算，不冒充浏览器发起/接收时间。两次不可测回执分别在11:38:04.719Z、11:39:06.006Z到达，均在英文/中文输入、滚动、提交之前。脚本在原服务器200返回，同期其他Worker和报告轮询也停顿。可以排除报告读早、交互未完成和服务端脚本非200；服务端200不能单独证明浏览器已完整处理。

原盾Worker加载适配从new Worker开始设3000ms计时，超时、onerror、onmessageerror均终止并返回null，后续四字段映射unavailable。因此历史unavailable本身没有区分这几种分支，不能从文字标签独断具体异常。盾未修改。

## 从现场到确定性因果对照

1. 一次带计时的原页面启动诊断，case61bcb4ed-7397-48af-ba96-584ab4f5dec0，四Worker有效，未重现旧停顿。只做启动，不做交互或伪造遥测；没有继续原样重复。诊断脚本首次UUID参数类型错误在浏览器创建前退出，修正测试入口后才有这一次浏览器访问；首败收据保留。
2. 诊断真实调用栈采到：`CDPClient._handle_messages → EventRegistry.handle_event → Runner.record_document_response → DocumentResponses.record → access_cooldown.remember → diskcache.Cache.__init__`。固定cdp-use1.4.5的接收循环逐条await handler；同步存储占用的是接收/派发线程。此诊断只证明调用路径和短时阻塞，不证明两个历史运行的长停顿。
3. 在独立本地夹具中使用真实日常Chrome、同一Runner/TargetScope/Admission，Worker限时3秒。只把一次响应持久化人为延迟4秒，Worker脚本等待这次持久化开始后由本地服务器正常返回，控制条件固定；不访问盾、不修改浏览器Worker API。
4. 修前：存储从相对924.500ms阻塞至4925.080ms；Worker attach在4933.557ms才被接收处理，页面在3006.3ms判unavailable。修后：同样4秒存储从927.564ms到4928.143ms，Worker attach在1000.200ms已处理，页面144.7ms得到measured。两次均0模型、原finally关闭所属窗口。

这些诊断通过既有relay根端点和独立TargetScope控制自己创建的窗口，验证的是同一Python消息处理/准入路径；没有冒充产品执行记录。下方原Workbench发布版复验另走产品的owner路由与正式执行生命周期。

这组对照证明修复依据是明确阻塞机制，不是最后一次偶然绿灯。

## 两处生产改动

- `apps/api/python/browser_use_runner/task_browser.py`：普通任务页调用已有`attach_access(..., observe_responses=True)`，复用原Response阶段准入。
- `apps/api/python/browser_use_runner/hybrid_main.py`：有原响应准入责任方的session，其Network回调只保留文档状态和挑战标记，不再同步重复写退避库。

持久化仍由原`Admission.decide`在线程中执行，完成后才continue对应响应；失败照旧锁存并failRequest，取消/清理由原Admission负责。没有新队列、线程框架、缓存算法、网站分支、超时放宽、重试或模型调用。原有TaskBrowser/RequestGate保证任务session归属；没有接管个人页面或共享Worker。Product Alignment和Reuse Assessment见RESEARCH同日条目。

## 验证与实际发布版

新增5项不变量检查和原准入/iframe边界共17项通过：普通页响应准入、Network文档/挑战状态不丢失且不重复同步存储、慢存储不挡Worker事件且先持久化后放行、存储失败关闭、真实429在响应交付前已可由下一请求读取。新增检查在改生产代码前先验证缺口；首次fixture将省略端口错误写成443导致作用域未命中，修正fixture后原同步持久化断言明确失败，日志均保留。未跑根级或全量测试。

只做一次修改后的原发布版复验：从原任务Workbench“再次运行→开始运行”，日常Chrome，V1 release `8b8b7548-4049-4f59-845f-24f80ca3c9da`，没有重新探索、改链路或重新发布。

- execution：`d88b0c49-f973-48d3-8a4f-0b88382e412e`，completed；8 transitions、11 browser commands、LLM 0。
- 盾case：`291f48a0-08a7-4338-82e1-f890db6bf4d6`；原服务端Human，38 clear、1按键节奏参考线索、0 unavailable/failed。四Worker均valid=true/clear。不是39项全部clear。
- 原CrowdSec1.8.1、balanced、阈值75、score0、challenge及protected request接受、allowlisted=false；没有改盾或阈值。
- 清理首次`cleanup_close_protocol_timeout`，随后一次owner核验不可用，第三次原owner核验confirmed/activeResources=false。保留全部三份清理审计；不把首次超时称为干净通过。这个异常未被证明由本次改动引入，也未在本轮擅自修改清理逻辑。

本轮已知缺陷与受控回归关闭；历史两次唯一归因、未来每次稳定通过、其他站点接受均不在已证明结论内。

## 资源与证据

唯一启动诊断和两个本地受控对照的所属窗口均由原Runner.close确认关闭；未创建个人Chrome Profile。保留其最小owner收据与空的逻辑profile目录用于核验。实际复跑最终清理确认。辅助Workbench无头Chrome PID28408退出码0，其`workbench-profile`经进程/绝对路径/非链接核验后永久删除。最后daily connected=true、busy=false；个人Chrome与原服务保留。盾源码diff为空；未提交、推送、创建worktree或关机。

证据根：`work/bat-shield-mainflow-20261011/mainline-repair-02/worker-root-cause/`。

- `original-comparison.json`：三次原盾事件与HTTP时序。
- `diagnostic-result.json`、`diagnostic-timeline.json`、`diagnostic-stacks.json`：唯一原页面启动诊断。
- `controlled-before-result.json`、`controlled-before-timeline.json`及对应after：固定4秒慢存储的真实前后对照；`controlled.py`/`diagnose.py`保留复现程序。
- `response-before.log`、`response-before-corrected.log`、`response-after.log`：定点验证及首次fixture错误。
- `release-execution.json`、`release-shield-report.json`、`release-cleanup-audits.json`、`release-completed.png`：一次原V1复验和完整清理异常历史。
- `summary.json`：汇总，明确`historicalRootCauseUniquelyProven=false`。
