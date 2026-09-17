# R3b：生产目标滚动工具派发（主 agent 决策，2026-09-17）

> **历史派发记录，已关闭。** 本文件不再授权或指示启动任务。当前只按 [清理账本](../../REPLAY_CLEANUP_20260917.md) 工作。

## 目标与边界

实现 `bat_scroll_to(selector)`：首次 Agent 与普通执行器共用同一个薄工具，唯一定位当前主文档的 CSS 目标，再调用浏览器原生 scrollIntoView。已在视口内不滚；缺失/多义/隐藏先失败，不盲滚。成功条件是目标实际与视口相交且可见，不是滚动坐标变化。本职责只解决已存在 DOM 的目标展示；不实现懒加载搜索、旧 scroll(10) 推测归并、列表 ready 或 scope 参数化。

Product Alignment:
- natural-language task: 展示分页/表单或页面其他目标供后续操作。
- reusable chain boundary: 当前页唯一目标的原生滚入视口。
- runtime inputs: 技术 CSS 定位参数；禁止冻结坐标/历史业务值。
- dynamic task outputs: 当前目标可见事实。
- generic platform capability used: Tools.action、Page/Element、原生 scrollIntoView/IntersectionObserver。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 原生目标滚动与就绪检查的薄适配。
- existing implementation in repository: TargetResolver、SCROLL_INTO_VIEW_SCRIPT、OrdinaryCapability、StepVerifier/Tenacity。
- mature candidates and pinned versions: browser-use 0.13.8；已安装 Element.evaluate 支持 awaitPromise。
- selected implementation: 原生 DOM.scrollIntoView + 原生 IntersectionObserver/checkVisibility，经 Element.evaluate 固定代码调用。
- reused public surface: Tools.action、Page.get_elements_by_css_selector、Element.evaluate。
- B-A-T-owned adapter and remaining gap: 注册、typed 结果、采集/编译/复跑接线；没有新的滚动引擎。
- license/runtime/platform fit: 沿用已锁定依赖，不安装/改 site-packages；Windows 未测。
- browser/runtime/state ownership conflicts: 一个会话，原生 Agent 和现有 Runner；不另起 driver/loop。
- replay model calls: 0。
- rejected candidates and evidence: 原生 find_text 在 default_action_watchdog.py:2718 使用第一个 contains 匹配，无唯一目标保证；原生 scroll pages=10 连发事件，不承担目标到达保证。Actor Element.click 在滚动前计算坐标，不替换现有原生 click。
- focused validation: 下方实际 Chromium 反例和生产编译接线。

## 文件所有权

只可修改：
- 新 `vendor/workflow-use/workflows/workflow_use/hybrid/target_scroll.py`（工具、固定浏览器谓词、typed 完成事实）
- 同目录 author.py、capture.py、registry.py、natural_compile.py、capability.py、postconditions.py；natural_facts.py 仅新增严格工具 selector 的技术参数来源；targets.py 仅在复用公开 scope/helper 确需调整时允许最小改动。
- `apps/api/src/upstream-browser/hybrid-schema.ts` 和 `hybrid-protocol.ts`：仅现有 workflow-step actionName 枚举接入此动作；若其他准确文件有枚举拒绝，先报告主 agent。
- 主审追加的最小完整性接线：capture 用既有 value_fact 生成 verified_target_scroll；Python evidence.py 与 TS hybrid-natural-payload.ts 只将该 kind 加入现有完整性校验集合，不新增校验框架或 LLM 字段。
- 本目录 `R3_TARGET_SCROLL.md` 交付证据；临时 probe 放 /private/tmp。

不得修改测试、manifest/source.json、根进度文档、原 source/requirement/plan、其他 agent 改动。你并非唯一执行者，不回退别人代码；文件冲突先报告。主 agent 统一验收和更新摘要。

## 精确实现条款

1. 工具参数只接受非空 selector，长度采用现有 ReadField.selector 的 2000 边界；不接受 JS、pages、坐标、文本近似匹配。注册 helper 在 author_tools 中统一使用，保证在线/offline registry 相同；OrdinaryCapability 自建 Tools 时也注册同一工具。
2. 工具前后核验实际 targetId 和完整 URL；CSS 必须唯一，只允许当前主文档。复用 TargetResolver.assert_scope/resolve_collection；明确拒绝跨 tab/page。捕获前 URL 只用于当次漂移校验，不当作换输入参数化实现。
3. 目标自身隐藏或断开时在滚动前失败。原生 checkVisibility 检查可见样式；原生 IntersectionObserver 判断实际裁剪后的视口相交，不能只检查 bounding rect 忽略 overflow 裁剪。固定脚本可使用有限的一次 observer 回调和超时清理，必须 disconnect/clearTimeout；不写轮询/重试器。读值需严格校验。
4. 已相交且可见不调用 scrollIntoView；否则调用一次现有固定 nearest/instant 脚本，再核验同一页及目标相交。失败向外返回固定错误，不能继续十次或改找别的元素。不宣称相交等于无遮挡可点击；点击仍由 Tools.act 原生处理。
5. 工具输入只有 selector；成功 ActionResult.extracted_content 只向 LLM 返回固定简短确认 `Target is in view.`。selector、targetId、urlDigest、visible=true、是否调用过滚动等 typed 技术事实保留在当前工具内部记录与专用 fact，不作为 LLM 交互字段。capture 只处理当前固定动作的唯一实际成功记录，校验参数、固定成功确认、实际 resultRef 和前后观察页身份，形成 actionRef/resultDigest 绑定的专用事实。失败带记录、成功无/多条记录、错位和页面漂移仍拒绝。参数 selector 按该工具的 schema 保留，不放宽其他字符串脱敏；不将模型输入声明当作成功事实。
6. 注册 effect=ui_state。成功工具编译为现有 browser.workflow-step v2 actionName=bat_scroll_to；target 用相同 CSS 与当前已存在 scope，selector 参数通过明确技术绑定保留；后态是新增通用 target_in_view equals 'true'，由同一可见谓词读取。此谓词不能变成目标点击或文本读取。compile 必须验证专用结果事实、参数、当前 action/result、前后页身份，缺失/篡改即 gap。
7. OrdinaryCapability 允许该已注册动作，明确校验 target.strategy=css 且 target.value=args.selector；先核验 scope，再调用同一 Tools.act 工具一次，并沿已有 verify_declared 检查 target_in_view。不得把它放入会自动添加 index 的 TARGET_ACTIONS；不能接受不匹配的 target/selector。保持普通节点 model=0。
8. 不增加运行节点类型、executor、模型、第二套调度器或自动重试副作用。旧 source scroll 仍按原证据缺口处理，不删除/改写。工具失败可能发生滚动后，不新增一律排除失败动作。
9. author guidance 用自然语言明确：已知目标（含分页器）先查局部定位并使用 bat_scroll_to；已经有可点击索引可原生 click；不要用 pages=10 搜索已知目标。不靠 prompt 将所有原生 scroll 强行改义，也不声称已解决懒加载。
10. 函数 <=100 行/文件 <=500 行；若 natural_compile 超限，提取本项纯编译 helper 到新 target_scroll_compile.py，只有此附加文件预先允许。

跨语言补充：host hybrid-materializer.assertNaturalBinding 对 v2 所有参数绑定都要求 sourceRef 指向 natural_binding fact。selector 的编译 binding 必须来自 collector 已有 binding_facts，provenance=native_parameter，不能直接借工具成功 fact 充当 binding fact。最终编译响应需经现有最窄 TS 校验/物化入口消费一次；不能以 Python 零 gap 代替宿主接通。最小夹具若依赖不明先报告主 agent。

## 验收与退出

先检查已安装公开 API，不安装或读 node_modules。使用现有环境：`work/upstream-browser-hybrid/.venv/bin/python`；项目命令 workdir 必须 checkout 根目录。禁 uv、pytest、全量/根级测试、新增修改测试、commit/push/branch/worktree、provider/原网站。可用 py_compile/Ruff，最小现有验证只运行一次（如基线因旧 mock 失败如实记录，不改测试刷绿）。

一个临时 localhost probe，真实 Chromium，独立临时 Profile，全局一次最多一个 Browser；finally 关闭 Browser/server。设置 ANONYMIZED_TELEMETRY=false、BROWSER_USE_CLOUD_SYNC=false、BROWSER_USE_SETUP_LOGGING=false。沙箱 bind 被拒仅对同命令请求升级，不更换环境。展示前后位置与 scrollIntoView 调用计数：已可见 0；视口外 1；缺失/多义/隐藏 0；嵌套 overflow 容器确实到达；到达底部再次调用 0。读 scope 漂移应拒绝。原生脚本 Agent → 采集 → 编译零 gap（可用 null 输出减少无关逻辑）；在线/offline registry 一致；普通 Runner 执行同一编译动作而非手造替代，目标位置变化仍滚到当前目标且 modelCalls=0。记录该样例不是 provider/原任务整链。

交付改动清单、实际 session id、命令与结果、首次失败及修复、未测边界、probe 路径；主 agent 验收后退役，不接新职责。
