# 人工等待恢复闭合（2026-09-27）

## 2026-09-27 后续真实京东证据

用户选择京东并实际完成登录，原run在同owner/session/tab上恢复；首轮后续旧选择器检查失败。v2仅修订隔离验证任务的登录标记，在已登录原窗口完成等待/同次恢复/实际读取，模型0；不覆盖首轮失败，不声称重新登录了一次。新增的browser.wait-for-human薄适配复用原等待与交接。完整事实及ID见PROGRESS顶部和work/jd-human-live-proof.json；验证码单独解除仍未测。以下早期未测备注保留为历史。

## 范围与首次发现

- 不启动模型、服务或浏览器；使用生产运行器适配与临时 SQLite 检查恢复边界。
- 发现：无显式恢复条件的 unit capability，仅凭 fresh observation 中存在 URL 就被跳过，认证未解除也可能误判完成。
- 发现：人工恢复时 runtime scope 清空，带动态前驱作用域的当前读取无法再次执行。
- 登录、验证码等真实现场尚未触发，不能以适配测试声称已验收。

## Product Alignment

- natural-language task: 用户处理运行中的登录或访问提示后继续原任务。
- reusable chain boundary: 在原 run 的当前 capability 恢复，不重复前面已完成节点。
- runtime inputs: 同一 checkpoint、浏览器现场与版本化恢复条件。
- dynamic task outputs: 恢复后能力的真实输出或仍需人工处理的原因。
- generic platform capability used: 既有 human_required、checkpoint、幂等分类、受控浏览器恢复。
- replay model calls: 0。
- site/task-specific code added: no。

## Reuse Assessment

- capability: 人工等待后同一运行继续与副作用保护。
- existing implementation in repository: TaskChainRuntime、LangGraph StateGraph、HybridRuntimeScopeState、withHybridCapabilities、TaskContractRepository。
- mature candidates and pinned versions: 仓库已固定 LangGraph 1.4.14、browser-use/workflow-use 受控适配。
- selected implementation: 继续使用现有组件，仅修正 B-A-T 恢复判定与作用域适配。
- reused public surface: capability、verifyResume、persist、TaskCheckpoint 和 ProductStore。
- B-A-T-owned adapter and remaining gap: 区分现场身份检查与业务完成条件；显式恢复条件才可跳过已处理动作；可重复能力重新执行验证，外部写无条件时保留等待。
- license/runtime/platform fit: 不变更依赖、许可证或平台边界。
- browser/runtime/state ownership conflicts: 只恢复同一受控 session/tab；重新观察绑定当前 document；不创建第二浏览器或状态机。
- replay model calls: 0。
- rejected candidates and evidence: 无库替换或自建调度器。
- focused validation: `npm exec --workspace @browser-capture/api -- tsx --test tests/human-wait-closure.test.ts` 首次 4/4，通过生产适配 + 临时 SQLite 重建验证同 execution/run/owner、只重试当前节点、未解除认证不假完成、外部写不重复、原因和审计保留。测试后进一步收紧作用域标记校验与测试 lease owner 断言，定点复验 4/4。

## 最小验证记录

- API `npm run check --workspace @browser-capture/api` 首次通过。
- 既有两个受影响运行时用例按名称筛选，首次 1/2：新增显式人工条件后的测试链未重新经 schema 规范化，导致 `run_binding_mismatch`，发生在运行开始前。已修正测试输入的规范化；首次失败保留。
- 仅复验失败的 `无人工边` 用例，1/1 通过；已通过的协议认证用例未重复。
- 作用域标记校验和 lease owner 断言调整后，`human-wait-closure.test.ts` 定点复验 4/4。保存原执行的两次等待事件；最终完成后 `nextAction=rerun`、0 模型调用、清理确认；第一次导航只发生一次。
- 新增 `apps/api/tests/human-wait-real.acceptance.ts`，只在 `BAT_RUN_REAL_HUMAN_WAIT=1` 且指定 `BAT_HUMAN_WAIT_URL` 的公开 HTTPS 401 来源时执行；不自动启动、不调用模型、不创建正式 G6 任务。该脚本检查真实 HTTP401 → 等待 → 原窗口同 run 重试仍等待 → 结束自有窗口并确认清理。真实认证解除仍标未测。
- 新增作用域标记错误/非当前节点/owner/tab/document 变化拒绝断言，同文档 DOM 内容自然变化仍允许；只运行该作用域用例 1/1 通过。
- 含新增真实脚本的第二次 API 类型检查首次失败于新增测试 `resolved.scope` 联合类型未收窄；生产代码和真实脚本无报错。补充 `scope in resolved` 断言后，`npm run check --workspace @browser-capture/api` 通过。

## 已实现与仍未测

- 原有人工提示、handoff、清理状态分离继续复用。相同 URL 本身不再作为动作完成证明。
- 没有显式人工完成条件的 `read` / `idempotent_write` 只重试当前步骤；`external_write` 不再次派发，原因明确提示缺少验证条件。
- 人工等待不允许新 session 导航回相同 URL 冒充原窗口；带动态作用域的当前步骤重新绑定经确认的原 session/tab 及恢复时 document，后续步骤只消费真正成功动作的作用域。
- 后续真实证据：`bat-human-wait-real-mYn8Oj` 在真实 Chrome 访问 `https://api.github.com/user` 得到401，进入等待；换Runner恢复同owner/session/tab和同run，未解除仍等待，模型0，最终清理confirmed。此前httpbin原生动作失败绕过HTTP分类、并行fork修改期启动被digest拒绝均记录于PROGRESS；新增Runner错误边界修复及单例4子情况通过后取得此结果。
- 等待UI补证：隔离同execution状态场景 `bat-canvas-ui-Y1IudF` 通过跨任务提醒/返回/刷新保留与状态恢复后提示消失，详见UI_REMAINING_CHECK；不是自然认证完成的全链证明。
- 仍未测：真实用户登录/验证码解除、Basic Auth对话完成。未借无凭据场景伪造认证完成。
