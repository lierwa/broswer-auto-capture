# 全项目成熟组件复用核对（2026-09-27）

**最新范围：** 用户已纠正广泛替换方向。本记录是职责核对，不是全面换库计划。尚未执行撤回；保留已通过的改动，仅修本次引入的点击API回归。其他替代建议不得自行启动，必须先对应当前主线的具体阻塞。

## 范围与当前事实

用户要求按整个产品链落实“成熟组件负责通用能力，B-A-T只承担领域组合和适配”。本记录覆盖所有阶段，不将某一个网页任务、分页或跨语言转换当成项目主线。沿用当前checkout及全部dirty，不提交、不关机。

| 环节 | 已有成熟组件 | B-A-T应保留的职责 | 本次处置 |
| --- | --- | --- | --- |
| 需求对话、搜索、模型连接 | Pi AgentSession/ResourceLoader、AI Connect、已安装搜索extension | 任务语义、来源引用、用户确认和唯一草案 | 保留既有组件；不增加模型循环或供应商分支 |
| 浏览器探索 | browser-use 0.13.8 的Agent/Tools/Browser | 授权范围、代表任务输入及捕获事件适配 | 不另写Agent loop |
| 普通浏览器动作 | browser-use现有DOM、Page/Mouse等公开接口 | 绑定本次目标、前后态证据和运行审计 | 核对手写CDP点击派发能否由原生Mouse替代，见专题记录 |
| 动态数据合同 | Zod、Python jsonschema/Pydantic；仓库已锁定Ajv 8.20.0 | 有限ValueSchema方言、合同版本及错误归属 | 已复现自有schema翻译导致Unicode长度语义与Python不一致，改交成熟JSON Schema校验器 |
| 请求与回执 | 标准JSON、Zod、Pydantic | 请求关联、受管进程所有权、领域协议版本 | 两端手写约束存在差异，尚不能宣称唯一schema生成已接通；不能把装了库等同于完成整合 |
| 证据和方法编译 | workflow-use/browser-use来源能力；QuickJS 0.32.0 | 不可变来源、TaskChain IR映射、参数/方法/规则的证据关联 | 自有方法适配明确标为自有，不能冒充上游既有能力；错误选择程序继续拒绝 |
| 图执行、循环、取消 | LangGraph 1.4.14 StateGraph | B-A-T节点语义、预算、幂等、检查点关联 | 已核对使用原生图推进；不替换框架、不另写调度器 |
| 纯函数运行 | quickjs-emscripten 0.32.0 | 输入输出合同、版本化源码及模型调用审计 | 保留隔离引擎；不使用host eval或浏览器JS执行模型函数 |
| 发布、运行事实、删除 | SQLite、better-sqlite3、Drizzle、现有事务 | 不可变发布、请求幂等、任务私有资源归属 | 保留已有事务/持久化；不另写数据库或通用工作流存储 |
| 工作台与图布局 | React、Radix Themes、React Flow、Dagre、AI Connect React | 任务展示、单次execution投影、操作入口 | 保留成品组件；只改业务组合 |
| 原窗口、人工等待、清理 | 现有Browser/CDP、psutil、运行器资源释放 | owner/lease、原运行恢复、业务和清理状态分离 | 保留成熟浏览器控制；归属和审计属于B-A-T必要胶水 |

重复方法完整源码路径与未接通边界见[PAGINATION_REMAINING_CLOSURE](PAGINATION_REMAINING_CLOSURE_20260927.md)。地址推进已实际验证；按钮同页更新、滚动不是“仅未测”，当前证据准入和物化尚不支持。此事实不要求重写LangGraph。

## 动态值校验的实际反例与替代

Product Alignment:
- natural-language task: 读取文本结果或填写带长度要求的字段。
- reusable chain boundary: 相同版本化ValueSchema在准备、样本、正式运行和Python读取端具有相同值语义。
- runtime inputs: ValueSchema及JSON值。
- dynamic task outputs: 保持原值的合法数据或明确合同拒绝。
- generic platform capability used: 成熟JSON Schema校验器，Zod仍校验B-A-T合同外形。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 有限JSON Schema动态值校验。
- existing implementation in repository: `packages/contracts/src/task-chain/value.ts`把schema逐项翻译为Zod；Python读取器使用jsonschema 4.25.1。
- mature candidates and pinned versions: Ajv 8.20.0已存在于当前package-lock；现有Zod 4.1.8；Python jsonschema 4.25.1。
- selected implementation: Ajv 8.20.0，作为contracts显式依赖；用公开2020类的compile/validate/removeSchema。
- reused public surface: JSON Schema标准类型、字符串/数组/数值边界、required、additionalProperties、enum。
- B-A-T-owned adapter and remaining gap: 保留有限方言/版本/原型键准入与ZodError边界；删除自有逐类型valueValidator，不扩大schema方言，不加默认值或强制转换。
- license/runtime/platform fit: Ajv MIT、纯JavaScript，现有Node/浏览器依赖图已包含该版本；本次以Workbench构建检查前端消费者。
- browser/runtime/state ownership conflicts: 不控制浏览器、不改变模型配置、调度或持久化；编译后释放Ajv schema缓存条目，避免每次规范化出的新对象长期滞留。
- replay model calls: 0。
- rejected candidates and evidence: 现有Zod字符串min/max采用JS字符串长度；已复现单个非BMP字符在minLength=2时TS接受、Python拒绝。继续手写Unicode补丁会保留第二套schema解释；Zod的JSON Schema反向转换在官方文档中仍为experimental，当前contracts版本没有该稳定入口。
- focused validation: 同一JSON输入经真实Python jsonschema与TS合同入口比较Unicode/换行/转义/嵌套/数值/布尔/缺失与null；既有动态schema命名用例；contracts类型门及受影响Workbench构建。不跑根级或全量测试。

依据：[Ajv类型和字符串规则](https://ajv.js.org/json-schema.html)、[公开API与schema释放](https://ajv.js.org/api.html)、[许可证](https://ajv.js.org/license.html)、[Zod JSON Schema支持范围](https://zod.dev/json-schema)。先复现后替换，结果随后追加。

### 本组实际验证

- 新跨语言验证首次失败，16个样例中4个Unicode长度样例的TS/Python结果不同；标准转义、代码字符串、数字/布尔和缺失/null样例本身一致，没有捏造“所有JSON传输都坏了”。
- 删除自有stringValidator/valueValidator，改用已锁定Ajv后，同一用例16个样例全部一致；原样返回数据，禁止coerce/default/remove。命令：设置BAT_TEST_PYTHON为受管Python后，`node --import tsx --test apps/api/tests/value-schema-parity.test.ts`，修后1/1。
- 原有命名用例 `动态 schema 严格` 1/1；`npm run check --workspace @browser-capture/contracts`通过。
- 浏览器动作复用与焦点错位修复见[REUSE_BROWSER_BOUNDARY](REUSE_BROWSER_BOUNDARY_20260927.md)；只更新该组两个vendor manifest条目，保留其他改动。
- 为验证上述两组实际接线，复用已保存真实来源`bat-g5-real-selection-fbdqn3`，仅离线编译和普通执行器对两个既有输入复跑，模型试做不重跑；结果写入新的retry子目录。另做受影响Workbench所属build验证Ajv在前端的打包入口。此验证不是新的G6，也不证明未接通的其他方法。
- 实际首复跑`retry-xRoEmZ`因点击适配漏await异步Page.mouse失败，第二个输入未运行；修复后只验证第一页到`retry-z2EqpM`，9命令、0模型、实际目标URL核对通过。Workbench build、API check通过。当前停止额外替代，不重跑已通过验证。
