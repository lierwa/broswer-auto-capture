# 技术调研与复用结论

## 2026-10-02 执行失败、再次运行与原因入口（本轮授权，macOS 原任务通过）

用户本轮明确收窄为：失败后再次运行、查看同一次历史失败原因，并核实日常 Chrome 已保存授权。沿用已有侧栏和历史，不删除失败详情，不扩展采集/成果格式。

Product Alignment:
- natural-language task: 从已发布工作台再次运行失败的任务，并查看之前失败原因。
- reusable chain boundary: 同一不可变发布版本，每次再跑创建独立 execution；不自动继续旧运行。
- runtime inputs: 既有输入、运行预设、浏览器环境及持久授权。
- dynamic task outputs: 原运行输出/错误/清理审计分别保留；不补造旧错误。
- generic platform capability used: 原 cleanup_execution/verify_closed、run_task、execution detail/history，以及原扩展连接。
- replay model calls: 0 added；只允许显式 LLM 节点。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 失败原因展示、失败资源自动核验及再次运行。
- existing implementation in repository: TaskChainService.cleanupExecution、TaskPlanExecutor 的 finally/cleanupResume、AttachedWindow.verify_closed、SourceLifecycleDiagnostics、原 Radix 侧栏/按钮。
- mature candidates and pinned versions: 继续 Microsoft 扩展0.4.0/8b552173e8d767db29b8baef8f4a1f08cf7f26bf（Apache-2.0），原 BrowserModel/createTarget 与 chrome.tabs.remove；B-U0.13.8、cdp-use1.4.5、原 W-U/LangGraph；Radix Themes3.3.0（MIT）。固定入口/许可见此前记录与 vendor/UPSTREAM.json。
- selected implementation: 沿用现有生命周期与公开 Chrome/CDP 能力；不建立授权或恢复状态机。
- reused public surface: 原 run_task、cleanup_execution、verify_closed、Target.createTarget/closeTarget、chrome.tabs.remove；现有执行侧栏与历史。
- B-A-T-owned adapter and remaining gap: 从同一 owner 的既有脱敏启动诊断展示原失败阶段/错误类别；原 worker 退出后及用户再次运行时分别做一次既有释放核验。已确认旧 createTarget 未发给扩展；真正已发送而回执丢失的场景仍不得确认释放。
- license/runtime/platform fit: 不换库、不增加依赖；macOS 现场验证；Windows 缺实机阻塞。
- browser/runtime/state ownership conflicts: 一次运行只占一个控制会话，恢复只检查已证明归属的资源；个人 Chrome 与页面保留。
- replay model calls: 0 added。
- rejected candidates and evidence: 不引入第二浏览器驱动/通用状态机。固定原扩展未持久保存无回执窗口所有权；旧断线后不能据新连接空列表证明旧未知窗口消失。
- focused validation: 原 HTTP 红：cleanup_required 阻断再次运行，原因只有 RuntimeError。原 API 进程只读诊断进一步证实 ExtensionConnection._lastId=0、无 attached session、WebSocket 已以1001结束，唯一引导 tab 已不存在。因此旧任务没有发出窗口创建命令，区别于已发送但无回执的反例。原 verify_closed 同 owner 核验现已通过；旧失败及 digest 未改变。最终所属 TS47项、Python10项、API/UI/Contracts 类型检查通过；真实工作台原V5成功、0模型、清理确认，旧失败历史仍可查看。详见 PROGRESS 最新节。

原 endpoint 的只读释放证明仍走 B-U/cdp-use/AttachedWindow：CDP 初始化先读取 Browser.getVersion，再 Target.getTargets；只允许未派发任务窗口创建的原断线 relay 回答本地版本元数据和空的任务目标集合，所有浏览器动作仍拒绝。已派发而无 ACK 的断线反例继续拒绝，不更换 endpoint，不发现/接管个人页。开发现场仅临时把这几个原 relay 方法更新到持有原连接事实的 API 进程；随后通过现有 cleanup_execution 取得真实释放确认，未直接修改数据库或删除租约，最终已关闭 inspector 并加载正常源码服务。

**已保存授权的空闲连接反例及修补**：服务刷新后原授权直接连接，但125.4秒后的真实 GET 为 paired=true/connected=false。固定扩展的批准页面原来提供定时 keepalive，B-A-T 关闭该页面后，原 relay 在尚未附着 owned 引导页 debugger 时即报告就绪。Chrome 官方 [MV3 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) 说明 active chrome.debugger session 可维持 worker。复用原 BrowserModel Target.setAutoAttach 与 Target.getTargets，先对唯一 owned 引导页完成接入再报告连接，不增加心跳、恢复或授权协议。修补后实际日常 Chrome154 空闲131.5秒仍连接，随后原V5完整运行通过；不要求用户满足开发固定版本，也没有再次改扩展 worker 或要求重载。

旧03:33失败的确定事实是创建任务窗口阶段 CDP 通信异常、原连接断开且没有向扩展发送命令。原诊断只保存 os_error 而未区分 ConnectionError，断开的具体触发原因未记录，不能把后续空闲反例写成旧失败的唯一根因。新增错误类别仅保存固定 connection_error，无原始异常消息、URL、凭据或页面内容。

## 2026-10-02 浏览器环境弹窗整理（用户明确授权）

用户现场指出环境选择、持久授权/连接状态和按钮层级混乱，授权修改实际弹窗。当前真实状态为已保存授权、绑定用户1、未连接；不得把未连接写成未授权，也不得把连接状态写成原 V5 已恢复。

Reuse Assessment:
- capability: 三环境选择、授权状态和管理动作的可读组合。
- existing implementation in repository: `BrowserEnvironmentSelect`、`useBrowserEnvironment` 的原 CAS 保存；`DailyChromeAuthorization` 的状态轮询、操作序号与原 authorize/connect/revoke；已有 Radix Themes3.3.0。
- mature candidates and pinned versions: Radix Themes3.3.0 / `7300f2a9be4309e04b2c1b4e43b5d7cf4a58eb43`，原 [RadioCards](https://github.com/radix-ui/themes/blob/7300f2a9be4309e04b2c1b4e43b5d7cf4a58eb43/packages/radix-ui-themes/src/components/radio-cards.tsx) 直接包装 RadioGroup primitive；原 [DropdownMenu](https://github.com/radix-ui/themes/blob/7300f2a9be4309e04b2c1b4e43b5d7cf4a58eb43/packages/radix-ui-themes/src/components/dropdown-menu.tsx)；[LICENSE](https://github.com/radix-ui/themes/blob/7300f2a9be4309e04b2c1b4e43b5d7cf4a58eb43/LICENSE) MIT。tag 已核对实际 peeled commit；不读取 node_modules。
- selected implementation: 沿用已安装 Radix 原组件，增加原环境选择器的说明式显示；运行设置仍用原紧凑 Select。
- reused public surface: RadioCards.Root/Item 的受控 value/onValueChange/disabled 和原键盘选择、DropdownMenu.Trigger/Item、Dialog/Button/Badge；不自写选项键盘逻辑或菜单。
- B-A-T-owned adapter and remaining gap: 中文用途、已有授权/连接事实的展示和原 API 动作组合。已授权管理动作收进菜单；首次安装说明渐进展开。
- license/runtime/platform fit: MIT、现有 React19/TypeScript/浏览器入口，不新增依赖。macOS 现场验证后结算；Windows 实机仍阻塞。
- browser/runtime/state ownership conflicts: 不改浏览器驱动、Profile、凭据、租约或恢复合同；只读状态失败禁止按旧状态继续授权操作；初始化读取不显示撤销动作。
- replay model calls: 不增加模型调用，三环境选择仍不新增链路复验。
- rejected candidates and evidence: 无需替换现有可用成品组件，不新增框架。
- focused validation: 所属 workbench 类型检查通过；实际工作台三选项、绑定用户1、已授权/未连接、单一连接主按钮、管理菜单、关闭和刷新重开通过。真实页面 viewport1840×979，弹窗560×638，scrollHeight/clientHeight同为638，无内容裁切。首读过程实见“读取中”，未出现撤销按钮。当前服务器状态 paired=true/connected=false/busy=false，与 UI 一致。没有为验证 UI 撤销现有授权或切换真实环境；原 V5 清理阻塞独立保留。用户本轮已确认重新加载扩展。

Product Alignment:
- natural-language task: 用户选择执行任务的浏览器，理解当前授权与连接，并完成最少必要的授权操作。
- reusable chain boundary: 不修改已发布任务链路。
- runtime inputs: 原 BrowserMode 和指定 Chrome Profile。
- dynamic task outputs: 不修改成果内容或展示合同。
- generic platform capability used: 既有环境保存和扩展授权管理。
- replay model calls: 0 added。
- site/task-specific code added: no。

## 2026-10-02 采集内容与成果展示调研（未冻结产品或选型）

用户要求先看成熟产品和开源实现，再决定采集/展示；本节只提交调研证据，不修改采集合同、旧任务或成果 UI。官方文档于本日读取；商业产品的登录后控制台、付费 API、导出下载没有实测，不把文档或截图当作 B-A-T 验收。公开 GitHub 样本只用于离线比较，不采集登录态、Cookie 或私人页面。

### 成熟产品怎样组织成果

| 参考对象 | 已核对的实际产品入口与做法 | 可借鉴之处与边界 |
| --- | --- | --- |
| [Apify Dataset schema / Output tab](https://docs.apify.com/storage/dataset-schema) | `fields` 描述记录，`views.transformation` 控制字段/嵌套展开，`views.display` 描述表格和 URL/图片等格式；同一数据可有不同视图。文档明确视图不决定 JSON/CSV/Excel 的导出格式。 | 值、界面投影、下载格式分别有事实源。适用于结构化记录，不据此把所有浏览器任务强制变成表格。 |
| [Browse AI 数据结构](https://help.browse.ai/en/articles/13171414-understanding-your-data-structure)、[管理/导出](https://help.browse.ai/en/articles/10477537-how-to-view-manage-and-export-your-scraped-data)、[JSON 导出](https://help.browse.ai/en/articles/13187052-how-to-export-your-data-as-a-json) | 文本字段进入列，列表有各自列表页；记录包含采集时间、来源及运行输入等上下文。JSON 保留嵌套列表，CSV 需要扁平化；截图有独立展示。 | 单条长正文和多条记录不是同一种浏览体验；导出需明示嵌套与扁平化的差别。文档称抓取值默认按网站呈现为字符串，不能据此替 B-A-T 决定数值类型。 |
| [Firecrawl Scrape](https://docs.firecrawl.dev/features/scrape) | 明确选择 Markdown、HTML、rawHtml、JSON、截图等输出，并返回 metadata；正文筛选、包含/排除区域与输出格式各有入口。 | HTML、可读正文和结构化 JSON 是不同采集结果。`onlyMainContent` 或自动清洗会改变内容范围，不能直接继承为 B-A-T 通用默认。 |
| [Crawl4AI Fit Markdown](https://docs.crawl4ai.com/core/fit-markdown/) | `raw_markdown`、含引用版本、references、`fit_markdown`/`fit_html` 分别保存；Fit 输出先经过 Pruning/BM25 等过滤。 | “保留正文结构”和“挑选重要内容”应能区分；过滤后的版本不能伪装成完整原文。它是采集框架/工具，未提供已验收的 B-A-T 成果界面。 |

上述产品做法没有收敛为唯一显示方式。Apify 的视图和导出相互独立；Browse AI 的导出也可能受当前过滤/列选择影响；Firecrawl/Crawl4AI 明确区分格式和过滤结果。不能把这些差异统一写成未经确认的 B-A-T 规则。

### 固定开源源码与实际复用入口

每项均核对固定源码与许可证，下载文件的 SHA-256 保存在 ignored `work/collection-research-20261002/sources.json`。本轮没有安装产品依赖、接入云服务或更换 B-U/W-U。

| 实现 / 固定版本与 commit | 实际源码入口 | 许可证、运行时与维护观察 | 本轮证据与职责限制 |
| --- | --- | --- | --- |
| Crawlee v3.18.2 / `78da0622762e1b569b5cb0b56e8eb06a0a010d93` | [Dataset](https://github.com/apify/crawlee/blob/78da0622762e1b569b5cb0b56e8eb06a0a010d93/packages/core/src/storages/dataset.ts)：`pushData/getData/exportToJSON/exportToCSV` | Apache-2.0；TypeScript/Node，core manifest 为 Node >=16；release 2026-09-29。 | 核验了源码和模型；未启动存储/抓取框架或验证 Windows。整体引入会增加已有存储、调度和浏览器所有权，不能替换 B-A-T 链路主线。 |
| Firecrawl v2.11.0 / `ef12eb36b2f3382838dfe0a0c1a5add3d5df7fe5` | [parseMarkdown](https://github.com/firecrawl/firecrawl/blob/ef12eb36b2f3382838dfe0a0c1a5add3d5df7fe5/apps/api/src/lib/html-to-markdown.ts)、Go `ConvertHTMLToMarkdown`：GitHubFlavored/RobustCodeBlock 插件 | 根 LICENSE 为 AGPL-3.0；API manifest 另写 ISC，不能仅按该字段认定服务源码为 ISC。TypeScript + Go/CGO + Rust 原生组件；release 2026-06-19。 | 核验了实际转换与原生/HTTP 调用入口；服务/模型提取与 Windows 原生部署未测。不能为了格式转换整体接入另一套抓取服务。 |
| Crawl4AI v0.9.4 / `133e1d92e37885dfccc03ea2e3687d06c98b7ceb` | [DefaultMarkdownGenerator.generate_markdown](https://github.com/unclecode/crawl4ai/blob/133e1d92e37885dfccc03ea2e3687d06c98b7ceb/crawl4ai/markdown_generation_strategy.py)、`MarkdownGenerationResult` / `CrawlResult` | LICENSE 含 Apache-2.0 正文及额外 Attribution Requirement，要求显著署名；Python >=3.10、Playwright >=1.49.0；release 2026-09-23。 | 源码将 raw、citations、fit、extracted_content、metadata 分开。未运行其浏览器/过滤器或验证 Windows；整套 crawler 会与既有 driver/执行器重叠。 |
| Mozilla Readability 0.6.0 / `04fd32f72b448c12b02ba6c40928b67e510bac49` | [Readability.parse](https://github.com/mozilla/readability/blob/04fd32f72b448c12b02ba6c40928b67e510bac49/Readability.js)，返回 `content` HTML、`textContent`、title/byline/excerpt/lang/publishedTime 等 | Apache-2.0；JavaScript + DOM，Node >=14；固定 tag，非浏览器驱动。 | 用同一固定 JSDOMParser 在公开正文片段执行通过，结构保留见下表。文章选择启发式尚未做真实整页/列表任务准入；一份合成表格样本也保留全部9行，不能捏造“列表必败”的反例。 |
| Turndown v7.2.4 / `fb7a865ef5eba4081dfd4e20a894a61ef7a2edca` | [commonmark-rules](https://github.com/mixmark-io/turndown/blob/fb7a865ef5eba4081dfd4e20a894a61ef7a2edca/src/commonmark-rules.js)：heading/list/code/link 的确定性转换 | MIT；JavaScript/DOM，Node >=18、npm >=9；Node 依赖 Domino；release 2026-04-03。 | 源码已核验，未跑该库或 GFM 插件。基本规则不提供 Markdown 表格转换入口；若后续选用须核验所需插件，不自行重写转换器。 |
| 现有 B-U0.13.8 / `eb4126921bea3373f91afc49fb4b59d6eda7fed6` + markdownify1.2.2 / `241ed02bc1a5d567ecf486de7d84bb74db0068d2` | [convert_html_to_markdown / _preprocess_markdown_content](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/dom/markdown_extractor.py)；已安装 markdownify 公共函数 | 两者固定 LICENSE 均为 MIT；当前 Python 环境实读版本；不新增依赖或浏览器。 | 两个实际入口都已执行。原 wrapper 针对模型上下文删除 JSON 片段，不等价于保真成果；`tools.extract` 自带模型调用，不可进入普通复跑。若后续决定 Markdown，应优先验证既有确定性转换入口而非引入第二驱动。 |

### 阅读视图、表格与文件的现成组件

已核对当前 workbench manifest：已有 React19.1.1、Radix Themes3.3.0，没有 Markdown 阅读器、数据网格或 Excel 写入库。实际 `SavedResultDialog` → `ExecutionPresentation.TaskOutputView` 按绑定合同显示值；长字符串成为普通段落，数组成为分页折叠记录；`ArtifactList` 只显示 mediaType、artifactId、digest，尚不是可下载/可预览的文件交付入口。这些是当前实现事实，不能把 artifact 元数据展示说成 Excel 已交付。

| 固定候选 / commit | 实际入口与许可 | 已有证据 / 尚缺证据 |
| --- | --- | --- |
| react-markdown10.1.0 / `44d2e4a44b37461ab7778d6870c1a9eb36393ad2` | [lib/index.js](https://github.com/remarkjs/react-markdown/blob/44d2e4a44b37461ab7778d6870c1a9eb36393ad2/lib/index.js) 的 `Markdown`、components、`defaultUrlTransform`；MIT，React peer >=18。原实现默认将 raw HTML 转为文字，默认转换 URL。 | 与现有 React 版本的声明匹配；未安装、未做真实工作台阅读/链接/代码块视觉验收。若选择 Markdown 阅读，可复用其 parser/rendering；不能把旧纯文本按字段名猜成 Markdown。GFM 表格需另核验原插件。 |
| AG Grid36.2.0 / `release-36.2.0` / `0fee5b7b1e839ae23fe860e404042448f3c1375d` | [Community CsvExportModule](https://github.com/ag-grid/ag-grid/blob/0fee5b7b1e839ae23fe860e404042448f3c1375d/packages/ag-grid-community/src/csvExport/csvExportModule.ts)：`getDataAsCsv/exportDataAsCsv`；Community/React 包 MIT。`ExcelExportModule` 位于 Enterprise，并依赖 EnterpriseCoreModule，商业许可。release 2026-09-16。 | 固定源码和许可证已核验；未运行网格。官方 [CSV](https://www.ag-grid.com/react-data-grid/csv-export/) 文档说明取值/格式化和实际 cell renderer 的区别；[Excel](https://www.ag-grid.com/react-data-grid/excel-export/) 是另一入口。不能声称 Community 同时免费提供原生 XLSX，也不为少量单条正文默认引入整套网格。 |
| ExcelJS4.4.0 / `ac96f9a61e9799c7776bd940f05c4a51d7200209` | [Workbook](https://github.com/exceljs/exceljs/blob/ac96f9a61e9799c7776bd940f05c4a51d7200209/lib/doc/workbook.js) 与 [XLSX.writeBuffer/load](https://github.com/exceljs/exceljs/blob/ac96f9a61e9799c7776bd940f05c4a51d7200209/lib/xlsx/xlsx.js)；MIT；固定 manifest Node >=8.3.0，提供浏览器 bundle；固定 tag commit 日期2023-10-19，不冒称新版本。 | 下载固定 npm 4.4.0 bundle（SHA-256 `7e49da68588e250dbb8bba190d2caa8ab3787cc0284bda1d8b2f805c4df742c9`），在 ignored 调研目录执行真实写入/回读。未安装为产品依赖；没有浏览器、Agent 或模型调用。实际 Excel/Numbers、Windows 与工作台下载/文件预览未测。 |

ExcelJS 最小文件样本：将同一公开 issue 原 Markdown 保存为 string 单元格，保留1740字符/47个换行，中文/引号/换行合成字段回读一致。另用 Python 标准库 zipfile/ElementTree 独立读取 OOXML，正文内容与 string 类型一致，合成字段没有 formula 节点。样本 `work/collection-research-20261002/exceljs-sample.xlsx`；`exceljs-sample-proof.json` 与 `exceljs-ooxml-proof.json` 通过。它只证明这个编码样本，不能证明完整 Excel 产品交付或未知大文件/富文本的兼容性。

可供取舍的组合是：少量记录沿用现有 Radix/合同组合，正文格式明确时复用 Markdown 阅读器；大量同构记录才评估现成网格；XLSX 复用确定性写入库。抓取格式、默认视图和文件交付仍待用户决定，本轮不接入这些库、不添加采集字段、不创建第二份输出事实源。下载候选源码时错误 tag/path 的404仍保留在调研日志；AG Grid 最终锁定其实际 `release-36.2.0` tag，没有把官网版本文字直接当作可用源码。

### 实际样本：结构在哪一层丢失

样本为公开 [LangGraph issue #9075](https://github.com/langchain-ai/langgraph/issues/9075)，GitHub API 提供原 Markdown 与渲染 HTML，updated_at=`2026-09-25T12:59:22Z`。这是离线字段片段测试，不是通过 API 替代 B-A-T 原浏览器任务，不改变旧发布数据。

| 同一片段的处理方式 | 长度 / 换行 | 标题 / 列表 / fenced code | 事实结论 |
| --- | --- | --- | --- |
| GitHub 原 Markdown | 1740 / 47 | 5 / 2 / 1块 | 有真实可读结构。标题计数包括代码行中的 Markdown 标记，不作为 HTML 语义标题数。 |
| 渲染 HTML | 6900字符 | HTML h 标签4、li2、pre1、链接3 | 保留语义结构，也有渲染附加标记。不能把全部 HTML 都展示或永久采集。 |
| HTML 文本再压平空白 | 1723 / 0 | 行结构0 / 0 / 0 | 已丢段落、代码围栏和列表标记，UI 无法事后还原可靠层级。此文本转换与浏览器 innerText 不是同一 API，不混用数值。 |
| 现有 markdownify1.2.2 直接转换 | 1903 / 47 | 5 / 2 / 1块、链接3 | 此公开样本保留可读格式；非逐字复原原 Markdown，仍需确认字段范围/清洗策略。 |
| B-U0.13.8 wrapper | 1887 / 31 | 5 / 2 / 1块、链接3 | 本样本被过滤16字符/空行；另一个技术配置反例中，原转换保留的长 JSON 示例被 wrapper 删除231字符。不能把它默认用于成果保真。 |
| Readability0.6.0 / 同源 JSDOMParser | HTML5178、text1657 | HTML标题4、pre1、链接3 | 指定正文片段执行通过；未证明从整页挑选正文的正确性，也未冻结选择该库。 |

实际旧 V5 的 `ReadField` 正文是 rendered text 且 `normalizeWhitespace=true`；2026-10-02 已成功运行的存量正文1630字符、换行0。旧值只有普通文本，不补造 HTML、标题层级或未保存的来源事实。新采集若需要 Markdown/HTML 层次，必须在读取/编译/字段合同处保留相应信息，再用成熟转换或渲染组件展示；仅换成果弹窗无法实现。

证据：`format-comparison.json`、`readability-comparison.json`、`readability-table-counterexample.json`；公开样本/转换文件在同一 ignored 研究目录。JSON 配置反例为明确标记的合成技术片段，不冒充真实网页现场或生产验收。

### 交用户选择的范围与建议（尚未实施）

建议参考 Apify 的“记录 / 视图 / 导出”区分和 Firecrawl/Crawl4AI 的“格式 / 过滤”区分：单条正文考虑文档阅读，多条字段考虑表格和详情，文件成果考虑预览及下载。采集的确切字段、是否保留链接/代码/图片，以及最终 Markdown/Excel 等目标格式由任务需求与后续确认决定；不能统一强制表格、Markdown 或原始 HTML。

元数据候选也分清用途：来源 URL、采集时间、字段类型/内容格式帮助读者理解；运行/发布版本和读取来源引用支持审计；内部 selector/ID/digest 留在高级信息。无需为层级展示保存整页 DOM、全部 HTML 属性、Cookie 或登录态。格式信息只描述已经实际保存的值，不能按字段名猜“正文”就是 Markdown，也不能让 UI 用模型给旧纯文本虚构章节。

后续待用户判断的是内容保真度与允许的清洗范围、默认阅读视图，以及文件交付范围。暂不更改公共契约、不添加 HTML/Markdown 抓取字段、不接入导出库、不重写旧任务；Windows 上的候选执行也未测。

## 2026-10-02 首次授权自动配置：已获实施授权，采集体验仅调研

用户确认开发“安装后首次允许、自动保存原授权、后续自动连接”，尽量减少人工操作；采集方式和成果展示须先调研成熟产品/开源实现，不能自行冻结默认格式或抓取规则。当前基线为 master / 0a904506255986f30b13d0658aa29bbcc6c2d89f，工作区干净。之前提交时跳过检查的要求已完成，本轮只执行授权接线所属的最小验证，不运行根级/全量测试。

```text
Product Alignment:
- natural-language task: 在指定日常 Chrome 安装扩展后，首次点击允许即保存授权，后续主动连接/运行无需复制码。
- reusable chain boundary: 原 TaskChain、B-U/W-U、TaskConnection 和任务专属窗口保持原合同。
- runtime inputs: 指定 Profile；原扩展的 Profile-local token；原 loopback relay。
- dynamic task outputs: 公开的已授权/已连接/处理中状态；不返回凭据。
- generic platform capability used: 原 extension Allow、原初始化事件、原 token 校验、现有凭据存储及撤销队列。
- replay model calls: 0 新增；只允许原显式 llm 节点。
- site/task-specific code added: no

Reuse Assessment:
- capability: 首次明确批准后自动配置既有长期令牌，以及刷新后准确展示持久授权。
- existing implementation in repository: DailyChromeExtension、CDPRelayServer、extension connectToTab/extension.initialized、ProviderCredentialStore、Radix Dialog。
- mature candidates and pinned versions: Microsoft Playwright 8b552173e8d767db29b8baef8f4a1f08cf7f26bf / extension 0.4.0；现有 ws 8.21.3、Zod 4.1.8、Radix Themes 3.3.0。
- selected implementation: 沿用当前固定扩展；用户已批准一处首次配置适配，不替换浏览器组件。
- reused public surface: 原 Allow 消息、获准后才建立的原 loopback WebSocket、原 initialization handshake；原凭据 set/get/remove。
- B-A-T-owned adapter and remaining gap: 仅在宿主显式请求首次配置且用户点允许时交接原 token；初始化完成才保存。初始化携带的凭据由宿主消费，不进入 CDP/运行事实。
- license/runtime/platform fit: Apache-2.0/MIT 保留；不增加库或原生安装器；Windows 实机仍单列阻塞。
- browser/runtime/state ownership conflicts: 扩展 Origin 和原随机路径限制；沿用单连接及 revoke 胜过迟到授权；不关闭用户 Chrome、不复制 Profile、不控制个人页。
- replay model calls: 0。
- rejected candidates and evidence: 原上游 README 明确要求复制 PLAYWRIGHT_MCP_EXTENSION_TOKEN；原 connect.tsx 的 Allow 仅建立当次连接，pair 必须人工提供 token。这一具体缺口已交用户确认最小适配，不另造 token、授权状态机或恢复机制。
- focused validation: 无码首次保存、撤销/迟到批准、重建宿主保留、凭据不进入状态或 CDP；真实 owned Chromium 的一次批准→持久连接→原零模型运行→重启/撤销；实际日常 Profile 的现有授权兼容和刷新状态分别记账。
```

源码入口：[固定上游扩展说明](https://github.com/microsoft/playwright/blob/8b552173e8d767db29b8baef8f4a1f08cf7f26bf/packages/extension/README.md#bypassing-the-connection-approval-dialog)。固定版本和必要适配仍登记在 vendor/daily-chrome-extension/UPSTREAM.json。实施后证据见本节末的分项结算。

首次授权真实兼容测试已走通一次 Allow、权限0600保存、B-U导航/DOM及非任务目标拒绝；首次脚本返回布尔序列化失败已修正并保留日志。第二/三次在任务关闭后枚举失败：原生 fixture CDP 证实 ownedTargetsRemaining=0，扩展仍 connected=true，故不能把此错误归为断线或未关闭。既有 BrowserModel.closeTarget 等原 chrome.tabs.remove ACK 返回，但 getTargets 新鲜事实适配此时仍可能向尚未收到 detach 的旧 tab 发 Target.getTargetInfo。最小回归将原 remove ACK 与稍后的原 onRemoved 分开；修补仅在成功 ACK 后调用上游已有 onTabRemoved/幂等 detach，不增加目标发现、恢复或清理权限；remove 失败继续传播。此为授权生命周期所属适配修补，完整运行和原窗口清理合同保持不变。

```text
Reuse Assessment:
- capability: 原 Chrome remove 已成功、异步目标移除事件尚未送达时的 CDP 枚举一致性。
- existing implementation in repository: 原 BrowserModel.closeTarget/onTabRemoved/_detachTab，以及现有 owned lease 核验。
- mature candidates and pinned versions: 同一 Microsoft 8b552173/extension0.4.0；Chrome tabs.remove Promise 公共入口。
- selected implementation: 原移除回调在成功 remove ACK 后消费同一原生事实，迟到事件仍走原幂等入口。
- reused public surface: chrome.tabs.remove、BrowserModel.onTabRemoved；无新状态机或驱动。
- B-A-T-owned adapter and remaining gap: 仅对齐既有新鲜 Target 读取与 ACK/事件间隙，不吞未知错误、不把断线当清理通过。
- license/runtime/platform fit: 原 Apache-2.0/TypeScript；Windows 实机仍阻塞。
- browser/runtime/state ownership conflicts: 只处理原映射已拥有的 target；失败 remove 不删除映射，不关闭用户进程。
- replay model calls: 0。
- rejected candidates and evidence: 不退回旧 URL 缓存、不补建应急页、不加恢复重试；真实 v2/v3 的失败与连接/原生关闭事实分开保留。
- focused validation: 同一已有协议测试构造成功 remove ACK、延迟 onRemoved 的先红后绿；真实生命周期继续验证。
```

### 本轮授权验证结算与额外正式运行反例

| 状态 | 证据 |
| --- | --- |
| 通过 | 所属 `daily-chrome-relay-compat.test.ts` 10/10；API、workbench 类型检查；最终解压扩展构建。没有根级/全量测试，没有新增产品依赖或 tracked 文件。 |
| 通过 | 独立真实 Chromium134/全新测试 Profile：只点一次原 Allow，不读/复制/提交授权码；0600保存，原 SDK 导航/DOM，非任务目标拒绝；两次 W-U/LangGraph 普通运行、0模型、清理确认；重建宿主与测试 Chrome 重启复用保存授权；扩展撤销立即断开、旧 token 拒绝、宿主凭据移除。日志 `first-approval-consumer-20261002-v4.log`。撤销后的产品连接无法自恢复而 cleanup 未确认，与 fixture 所有者最终回收自身进程通过，分别保留。 |
| 通过 | 实际日常 Chrome154/用户1 的已有授权兼容：两次独立最小普通运行均 completed、0模型、auditComplete=true、cleanup confirmed；其中第二次只针对“手动连接后闲置”的差异等待5秒，未复现下面的失败。`actual-saved-first-approval-20261002.log`、`actual-saved-warm-20261002-v2.log`。此成功不证明原 V5 失败根因。 |
| 通过 | 原拥有的开发服务经既有 shutdown 退出并加载本轮补丁；工作台显示“授权已保存/已绑定用户1”，主动连接即时 busy，成功后显示已连接；刷新/重开弹窗仍保留。最终截图 `first-approval-ui-final-20261002.png` 显示失败后授权仍保存、当前未连接，准确区分两种事实。用户 Chrome PID657 未结束。 |
| 失败，保留 | 早期 fixture 的布尔 evaluate 序列化错误；v2/v3 的 remove ACK/异步事件间隙；一次临时诊断 wrapper 漏掉 async，修正后第二次 warm 样本通过。最终入口已移除临时 private monkeypatch/延迟开关；这些失败不冒充产品验证通过。 |
| 失败，未解决 | 从实际工作台重新执行原 V5，execution `7634032b-2ebe-41d4-8d55-699bbc4c2f02` 在启动创建任务窗口时失败：0节点推进/0命令计账/0模型。`task_target_prepare` 的 `Target.createTarget` 等待回复处报 os_error，SDK 包装为 `hybrid_runner_failed:RuntimeError`。没有到达 GitHub 搜索点击，因此不能把它说成原首步点击回归复发。真实失败的原 CDP 异常文本未留存；具体断开原因仍未知。 |
| 阻塞 | 原同次租约 owner/lease `118646fb-aab0-48a6-8d1f-6bc28e1e7862` 保留 starting、ownedTargets=[]；原 relay 由当前 API 所有，但扩展连接已断开。按既有 `cleanup_execution` 请求一次，结果 `cleanup_owner_verification_unavailable`，execution 继续 cleanup_required。没有猜目标、换 endpoint 核验、删除租约或改写历史。该任务正式复跑门当前不能计为通过。 |
| 阻塞 | Windows 没有实机，安装/ACL/启动复用/重启/撤销不能验收。 |
| 未测 | 实际日常 Profile 使用新版包重新加载后的“全新无码第一次批准”（保留现有真实授权，不为测试撤销）；日常 Chrome 冷启动/重启/卸载/重新生成授权；首次完整 LLM 探索→编译→发布；iframe/popup/下载额外样本；商业产品登录后 UI/导出及候选组件工作台接入。 |

正式运行反例定位：[AttachedWindow._create](../../apps/api/python/browser_use_runner/attached_window.py) 先创建，再保存收到的 targetId；创建响应丢失时，本次 lease 没有能证明所有权的目标。[固定 relay](https://github.com/microsoft/playwright/blob/8b552173e8d767db29b8baef8f4a1f08cf7f26bf/packages/playwright-core/src/tools/mcp/cdpRelay.ts) 的扩展断线/单连接与当前保留 original endpoint 的 `verify_closed` 合同不能从新连接反推旧目标。当前接口返回的清理阻塞是实际反例；下一步若需要增加“创建响应丢失”的核验方式，必须先给用户现成实现及具体冲突取舍，不擅自增加恢复发现、重试或状态机。旧 V5 的上次完整成功和本次启动失败都保留。

## 2026-10-02 搜索首步回归：任务窗口实际激活（实施前记录与修后结算）

同一 V5 可执行摘要的六次历史运行均通过 `s-a-0002`，四次完整成功；扩展接入后 execution `88c57009-f73a-4355-8c85-ab16a74517ca` 首次停在该点击。原失败诊断 `data/source-lifecycle-diagnostics/7c82e11a-459f-4309-82c8-8804bfbf1cb0.jsonl:9` 已确认同一 target/document、单次 trusted 点击命中目标后代，94次检查仍 expanded=false、focused=false，非派发异常。W-U 与 TaskChainRuntime 未改动。

当前实际 Chrome154/已保存授权的原前两步复现失败；任务页 `visibility=hidden`。仅在导航前通过既有 relay 调用 `Target.activateTarget`，同一 selector、动作与检查条件立即通过，页面 visible、expanded=true、focused=true，模型0、清理确认。固定 B-U0.13.8 的 `Browser.get_or_create_cdp_session(..., focus=True)` 只设置 agent_focus_target_id，并不调用 activateTarget/bringToFront；受管扩展的新窗口适配使用 `chrome.windows.create(..., focused:false)`。首次失败日志没有记录 visibility，不补造旧现场；本轮对照证明窗口实际激活缺失这一回归及当前复现的原因。

```text
Product Alignment:
- natural-language task: 在日常 Chrome 的任务专属窗口执行已发布链路。
- reusable chain boundary: 发布链路、selector、动作、后条件与运行审计不变。
- runtime inputs: 已保存授权、原 Profile、execution 的已登记目标。
- dynamic task outputs: 原运行结果与清理事实。
- generic platform capability used: Chrome Target.activateTarget、既有任务窗口/TargetScope。
- replay model calls: 0 新增调用，仅显式 llm 节点。
- site/task-specific code added: no

Reuse Assessment:
- capability: 新建任务页的真实激活，而非 SDK 内部控制目标切换。
- existing implementation in repository: AttachedWindow.start/start_connected；BrowserModel.activateTarget 已调用 chrome.tabs.update(active:true) 与 chrome.windows.update(focused:true)。
- mature candidates and pinned versions: 沿用 B-U0.13.8/cdp-use1.4.5 与 Microsoft8b552173e8d767db29b8baef8f4a1f08cf7f26bf/extension0.4.0；不更换驱动、协议或状态机。
- selected implementation: 在现有 task_target_focus 阶段、目标租约持久化且 TargetScope 核验后，复用当前 SDK 根 CDP 连接调用 Target.activateTarget。
- reused public surface: cdp-use.send.Target.activateTarget；既有受限 relay/Chrome tabs.update、windows.update。
- B-A-T-owned adapter and remaining gap: 仅补两处新/复用父连接 operation 的任务页激活；完整 V5 正式运行待修后验证。
- license/runtime/platform fit: 不新增依赖；原 Apache-2.0/MIT 记录不变；Windows实机阻塞。
- browser/runtime/state ownership conflicts: 只激活已登记目标；激活失败仍沿原 task_target_focus/close 合同清理。避免在 createTarget 回执/租约登记前添加可失败副作用。
- replay model calls: 0。
- rejected candidates and evidence: 不修改 GitHub selector/等待/状态条件，不额外点击或模型重试；内部 focus 已被固定源码证实不等于实际激活。
- focused validation: 当前 hidden 首两步红、仅原 API 激活后绿；待运行所属 owner/激活失败回归与完整正式 V5。
```

对照入口：ignored `work/daily-chrome-p0/search-prefix-proof.ts` 与 `search-prefix-entry.py`；原失败 `search-prefix-actual.log`、激活对照 `search-prefix-activate.log`。探针最初两次混用 stable/v1/v2 图格式，在 schema 校验处失败、未执行 GitHub 动作，清理确认；随后先做边界解析再执行。只保存固定 DOM 布尔值/计数，不保存页面文本、凭据或 Cookie。

修后结算：所属 Python 24/24 通过，新/复用连接激活和激活失败清理两项先红后绿。真实工作台提交未改动的 V5，execution `97a83b22-1a20-4308-8095-6536b2669a53` / run `443055d0-2e3b-494c-8b42-90675eb98f80` 均 completed；20 transitions、23 browserCommands、0 llmCalls、审计完整、清理 confirmed。首页搜索至第二页首个 Issue 标题/正文完成，UI 成果弹窗已核验；标题97字符、正文1630字符，只额外保存长度与摘要。`search-focus-full-v5-proof.json` 与 `search-focus-full-v5-result.jpg` 为当前证据，原失败保留。初版 prefix 汇总误用 event.type，firstClickPassed 字段错误；对照的 completed/实际布尔值有效，已改用 event.status/outcome 统计，未重写原日志。诊断脚本移入 ignored `work/daily-chrome-p0/debug-search-focus-20261002/`，不在产品入口；没有新增长期日志。Windows 实机仍阻塞，实际 Profile 冷启动/重启/撤销及首次探索发布未测，不以此次复跑替代。

## 2026-10-02 实际 Chrome154 连接页修复、持久授权与普通运行

用户已经加载现成扩展并取得原授权码，首次保存打开 connect.html 时实际 Chrome154.0.8037.92 显示 ERR_BLOCKED_BY_CLIENT。只读核对安装身份 egiggbcomooebckhjcimllnoediapped、目录与当前包一致，禁用原因为空；修补前宿主 paired=false。记录不含授权码或完整连接 URL。此真实反例推翻了此前以 Chromium134 原生启动成功认定不需要 web_accessible_resources 的结论。

```text
Product Alignment:
- natural-language task: 首次连接日常 Chrome，在任务专属窗口执行既有任务。
- reusable chain boundary: 原 TaskChain、B-U/W-U、任务窗口与 TargetScope 不变。
- runtime inputs: 原 Profile-local 授权码和既定 Profile。
- dynamic task outputs: 原连接、运行与清理事实。
- generic platform capability used: 原 relay 浏览器启动、Chrome 扩展资源导航、原 token 校验。
- replay model calls: 0 新增调用，仅显式 llm 节点。
- site/task-specific code added: no

Reuse Assessment:
- capability: loopback HTTP 启动地址安全导航到原扩展连接页。
- existing implementation in repository: 原 CDPRelayServer launcher + 私有 WSServer 302；当前 manifest 未声明可访问连接页。
- mature candidates and pinned versions: 沿用 Microsoft8b552173e8d767db29b8baef8f4a1f08cf7f26bf/extension0.4.0；Chrome Manifest V3 官方 web_accessible_resources；既有 B-U0.13.8/cdp-use1.4.5 测试消费者。
- selected implementation: 已采用并实测 Chrome 官方资源声明的最小修补，不更换组件、协议或驱动。
- reused public surface: Chrome manifest.web_accessible_resources；原 token/协议检查与任务窗口创建。
- B-A-T-owned adapter and remaining gap: 只使原 connect.html 可从原127.0.0.1启动地址导航；用户重新加载后，实际日常 Profile 真握手、保存与普通运行已通过。
- license/runtime/platform fit: Apache-2.0 原源码与入口不变；Windows继续缺实机。
- browser/runtime/state ownership conflicts: 不放开所有扩展资源，不取消 token 校验、不向 Chrome argv 写凭据、不改 Profile/个人页所有权。
- replay model calls: 0。
- rejected candidates and evidence: 不退回原 argv token，也不使用关闭浏览器安全检查或复制 Profile 的方式消除拦截。
- focused validation: 原 HTTP redirect + manifest 边界用例先红后绿；所属4例和API检查通过；Chromium134原生跳转通过；用户重新加载后的Chrome154实际配对、保存授权复用及原W-U/LangGraph普通运行通过。
```

官方入口：[Chrome 扩展资源导航合同](https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources)。从 web origin 导航到扩展资源需要声明可访问资源；matches 匹配 origin，路径必须为 /*。本次只声明 `connect.html` 对 `http://127.0.0.1/*` 可访问；原 token 校验、连接协议和任务窗口边界不变。修补后用户重新加载，实际工作台显示“连接已验证，授权已保存”；凭据文件权限0600，状态API不返回秘密。未关闭其他用户扩展或关闭浏览器安全检查。

固定源码/依赖版本用于构建复现和许可证追溯，不要求用户安装相同 Chrome 版本或降级。实际日常Chrome154与独立Chromium134均已补证；不能由此宣称所有Chrome版本和所有CDP能力已测。

| 状态 | 本次证据 |
| --- | --- |
| 通过 | 原loopback跳转/manifest回归4例；最终包原地重建；API类型检查；独立Chromium134同路径握手与清理；Chrome154实际首次配对、0600保存，随后运行自动复用已保存授权；合成本地页面经PythonUpstreamBrowserRuntime → W-U → TaskChainRuntime/LangGraph完成1次普通运行，modelCalls=0、auditComplete=true、cleanup=confirmed。 |
| 失败，保留 | 已发布GitHub任务V5的实际execution `88c57009-f73a-4355-8c85-ab16a74517ca`：导航完成，在s-a-0002点击后报target_state_fact_mismatch；llmCalls=0、审计完整、清理确认。根因尚未证明，后续合成页面成功不改写该失败。独立CfT145探针在浏览器版本/扩展断言之前TimeoutError，清理确认，不能算145兼容失败或通过。 |
| 验证准备失败，已补救 | 额外真实Profile探针首次请求第二条relay时被现有闲置连接挡住；单连接保护生效。通过原环境切换入口释放闲置连接并恢复daily，再仅重测受影响探针通过；不修改并发合同，不自动重试原GitHub任务。 |
| 阻塞 | Windows缺实机，不能核验实际安装、ACL、启动/复用、重启、撤销。 |
| 未测 | 实际日常Chrome冷启动/重启、实际Profile重新生成授权码与卸载、首次LLM探索→编译→发布全链、iframe/popup/下载额外样本、根级全量测试。 |

入口：`apps/api/tests/daily-chrome-relay-compat.test.ts`；`node scripts/build-daily-chrome-extension.mjs`；实际Profile探针复用既有 `daily-chrome-playwright-relay.ts` 的 `BAT_SAVED_DAILY_PROOF=1` 模式（先停止任务并释放现有闲置连接，仅读取现有已保存授权，不配对/撤销，不读取个人页面）。证据：ignored `work/daily-chrome-p0/redirect-manifest-red.log`、`redirect-chromium134-green.log`、`redirect-chrome145-red.log`、`real-daily-chrome154-runtime-busy-first.log`、`real-daily-chrome154-runtime.log` 与不含授权码的工作台截图 `real-daily-chrome154-authorization.jpg`。原GitHub运行/模型审计/清理事实来自SQLite中的taskExecutions、taskContracts及taskExecutionCleanupAudits只读记录。

## 2026-10-01 受管微软组件的真实产品消费与采用边界

固定候选的最小适配已完成真实样本验证：最终扩展包 + DailyChromeExtension + PythonUpstreamBrowserRuntime + 原 W-U/LangGraph 连续两次普通运行，0模型；宿主重建和测试 Chrome 重启后持久授权有效；扩展重新生成 token 立即撤销，旧 token 被拒绝；同窗口/拖分组不能准入个人页。该结论限定 macOS 独立可见 Chromium134测试 Profile；实际日常 Profile 和 Windows仍未验收。

```text
Reuse Assessment:
- capability: 指定日常Profile的扩展控制、持久凭据和任务窗口生命周期。
- existing implementation in repository: TaskConnection、AttachedWindow/TargetScope、原失败/恢复/cleanup_required、B-U/W-U/LangGraph、ai-connect凭据存储、Radix。
- mature candidates and pinned versions: Microsoft commit 8b552173e8d767db29b8baef8f4a1f08cf7f26bf / extension0.4.0（Apache-2.0）；ws8.21.3（MIT）；ai-connect0.3.2/f0ef768f（MIT）；B-U0.13.8 / cdp-use1.4.5 / W-U0.2.11 fork5d2d19fe8835cc86f1bf3e04302a5000d590f249。
- selected implementation: 已真实消费的固定微软受管子集；不引入Playwright浏览器驱动或完整MCP/BrowserSkill。
- reused public surface: 原 ExtensionProtocolV2 / BrowserModel / token生成比较与localStorage / PendingConnections / ConnectedTabGroup / chrome.debugger、tabs、windows；公开 ProviderCredentialStore；ws.WebSocketServer(noServer)/handleUpgrade。
- B-A-T-owned adapter and remaining gap: browser-level Target缺口接回原session，目标事实用原Target.getTargetInfo更新；窗口/标签owner、同源边界、原运行入口、持久凭据引用和权限UI。Node HTTP/ws只替换上游私有HTTP包装；不写CDP驱动/密码学/恢复状态机。
- license/runtime/platform fit: UPSTREAM.json记录原文件摘要与修改，Apache版权保留；产物附LICENSE与React/react-dom/scheduler固定包许可证。Node>=24；Windows代码存在，缺实机不能过门。
- browser/runtime/state ownership conflicts: Profile不复制、不写登录态；单CDP client；原扩展映射在正常SDK交付/更换连接时保留，撤销/服务关闭用原close；断线由原TargetScope阻止自动重连。
- replay model calls: 实际两次普通运行均0，显式llm边界不变。
- rejected candidates and evidence: 不更换先前候选；Panerelay/Playwriter原反例仍保留。微软原版Target.setDiscoverTargets首败与缓存URL失败通过局部适配解决，无第二套控制器。
- focused validation: product-lifecycle-ownership.log退出0，导航/点击/DOM、两次原TaskChainRuntime样本、宿主/Chrome重启、撤销与旧码拒绝、同窗口/分组越权反例；11所属用例、API/workbench检查与构建、真实UI。
```

Chrome启动完全沿固定原 spawn/Singleton入口；token URL由私有loopback跳转，不在Chrome argv中。可见测试实例真实复用通过；headless夹具不能代替日常可见启动器验证。当时Chromium134原生启动样本通过，未新增web-accessible声明；此判断已由上节实际Chrome154反例推翻并修补，不能继续作为不需要声明的依据。`Browser.grantPermissions`警告保留为能力限制，未做成功空回执扩张。精确入口：`vendor/daily-chrome-extension/UPSTREAM.json`、`scripts/build-daily-chrome-extension.mjs`、`apps/api/src/browser/daily-extension.ts`。

清理被替代的研究VM/probe/旧构建共8文件至ignored retired-research；历史P0文档里的旧命令只描述当时执行，不作为当前入口。完整日常实装及Windows、首次全链探索和额外能力样本均不可借本结论补造。

## 2026-10-01 接续：自行修复现有 B-U 与固定扩展的兼容缺口

用户继续要求开发方自行解决 browser-use 连接失败，不把技术排查交回用户。先对已实际构建/握手的微软固定扩展作受管最小兼容修复；沿用其 CDP/session 模型、授权 token 与传输，不增加浏览器驱动、协议或恢复状态机。真实消费者通过前不冻结整体采用。目标日常 Profile 安装与开发验证分别结算。

```text
Product Alignment:
- natural-language task: 从 B-A-T 在指定日常 Chrome 的任务窗口执行既有任务。
- reusable chain boundary: 原 TaskChain 与 B-U/W-U 执行入口不变。
- runtime inputs: 现有任务 owner、Profile 与已获准控制的目标。
- dynamic task outputs: 既有任务输出、连接失败和清理事实。
- generic platform capability used: 固定扩展的 BrowserModel/CDP relay 与现有 TargetScope。
- replay model calls: 普通节点 0，仅显式 llm 节点。
- site/task-specific code added: no

Reuse Assessment:
- capability: browser-use 的浏览器级 Target 初始化与任务目标枚举。
- existing implementation in repository: 固定原版扩展/relay 真实握手；原 AttachedWindow/TargetScope。
- mature candidates and pinned versions: Microsoft Playwright 8b552173e8d767db29b8baef8f4a1f08cf7f26bf，extension 0.4.0；browser-use 0.13.8/cdp-use 1.4.5。
- selected implementation: 仅受管扩展当前固定候选的局部兼容；整体准入尚待真实消费者验证。
- reused public surface: ExtensionProtocolV2/BrowserModel，原 chrome.debugger attach/sendCommand 及消息。
- B-A-T-owned adapter and remaining gap: 浏览器级 Target 命令接入原模型；目标仅来自原授权事件，不枚举个人标签页。
- license/runtime/platform fit: Apache-2.0，保留版权、原版本、原文件摘要与修改记录；macOS 实测，Windows 缺机。
- browser/runtime/state ownership conflicts: 复用原映射；拒绝不在已授权模型中的 target，不新增控制会话。
- replay model calls: 0。
- rejected candidates and evidence: 不切换候选；原版真实失败 Target.setDiscoverTargets，extensionHandshake=true、cleanup=confirmed。
- focused validation: 原真实失败探针、Target 命令所属边界用例，然后同一现有 SDK 消费修复版。
```

本次原版复现：`work/daily-chrome-p0/consumer-resume-baseline.log`，握手成功，consumer_start 的 `Target.setDiscoverTargets` 失败，0 模型，清理确认。日常安装页再次被浏览器自动安全审查拒绝：仅 HTTP/HTTPS，明确禁止 alternate UI/raw-CDP 绕过；不据此停止其余开发，也不把 owned Profile 探针标为日常验收。

局部兼容已真实通过：`consumer-managed-final-cleanup.log` 的 sdkStart、navigationAndDom、observation 为 true，status=passed、modelCalls=0、cleanup=confirmed。沿用原 Session 映射补 discovery/getTargets/attach/getTargetInfo；B-U 在 discovery 后才注册 attached 监听，显式 attach 重发原 session 事件。夹具中 loader.stop 会关闭 Chrome、原 owner 已删临时目录后的重复删除等问题分别修正，不算产品兼容反例。

P1 的持久事实继续复用微软原 Profile-local auth-token 与原 getConnectionStatus/disconnect，撤销时调用原断连；B-A-T 凭据保存复用现有 `@agent-platform/ai-connect` 0.3.2/f0ef768f 的公开 `integration/credentials/provider-credential-store`（MIT、Node>=24，原文件锁/原子 rename/0600），使用独立本地文件，不混入模型账号。已核对固定 tgz 的公开 exports、类型及实际写入源码，不另写凭据库/锁/加密/授权协议。浏览器启动沿用原 CDPRelayServer spawn/singleton Profile 参数；其 token URL 改由同一 loopback HTTP 包装跳转，进程参数只有无 token 的原连接地址。扩展仅增加 chrome.windows 与原 tabs 命令的任务窗口薄映射；不复制 CDP driver。实际入口与完整许可随产品包记录；Windows 实机仍阻塞。

## 2026-10-01 原组件三环境复用与真实扩展消费者（最新）

P0 日常扩展兼容仍未通过；P2 独立专属环境产品接线及 P3 环境/账号 UI 已实施。下面早期“未实施/未重载”记录是阶段历史，当前状态以本节和 PROGRESS 最新节为准。

```text
Reuse Assessment:
- capability: 三环境配置、同次准备/执行快照、原专属 Profile 账号与清理。
- existing implementation in repository: BrowserProfileService、ManagedWindow、TaskConnection、原 TaskChainRuntime/LangGraph、SQLite/Drizzle、Radix Dialog/Select。
- mature candidates and pinned versions: browser-use 0.13.8、cdp-use 1.4.5、workflow-use 0.2.11（受管 fork 5d2d19fe8835cc86f1bf3e04302a5000d590f249）、Radix Themes 3.3.0。
- selected implementation: 专属模式沿用仓库组件；没有产品依赖替换。日常扩展未冻结。
- reused public surface: 原 Browser/BrowserProfile、cdp-use Browser.close、runner RPC、原账号窗口与清理合同、Drizzle、Radix Select/Dialog。
- B-A-T-owned adapter and remaining gap: mode/revision、准备及 execution 快照、已有入口分流和 audit/cleanup；候选持久配对与窗口授权缺口仍未实施。
- license/runtime/platform fit: 沿用原许可证；Node24.12/Python3.12/macOS 真浏览器通过；Windows 缺设备阻塞。
- browser/runtime/state ownership conflicts: 运行或账号/交付窗口占用时不切换；只释放空闲父连接；Browser.close 限于核验 PID/createTime/exe/Profile/browserID 的专属 lease，日常 Chrome 不受此关闭入口影响。
- replay model calls: 新真实普通 LangGraph 运行两个模式均 0，没有新 judge/重试模型/必填字段。
- rejected candidates and evidence: 三个扩展不可原样通过；Playwright 真实 SDK consumer 首条 Target.setDiscoverTargets 失败，Panerelay native fixture 未到消费者，不能冻结采用。
- focused validation: 所属 CAS/并发/旧合同/迁移/owner/断线验证、真实共享存储与确认清理、原账号窗口及真实三环境 UI；不以私有空白样本代替完整新准备或日常授权验收。
```

- 对应实际入口：`BrowserEnvironmentService.select`、`ProductStore.executionBrowser`、`TaskPreparationCoordinator.start`、`TaskChainAuthoring.explorePlan`、`TaskChainService.enqueueDraftTrial/runTask`、`PythonUpstreamBrowserRuntime.withAuthoring/withCapabilities`、`ManagedWindow.end_gracefully`。沿用现有恢复合同，未新增状态机。
- Playwright 真原扩展/relay handshake 已通过，但固定 browser-use 0.13.8/cdp-use1.4.5 在 autoAttach 前发送 Target.setDiscoverTargets，原 relay 无 attached tab 可转发并拒绝；这是实消费者兼容反例。原内部入口/argv token/分组扩权等源码反例仍成立。
- Panerelay 固定原后台/协议 Native Messaging 测试 manifest fixture 的实际 Chrome native Host 退出，根因未知，consumer 未到达；独立 helper 原 relay.listen 正常启动仅是局部证据。原 manifest 完整构建与正式 Native Host 安装未验证。遵循 [Chrome Native Messaging 官方机制](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)，没有发明生产安装器或凭据协议。
- 真实 LangGraph 探针每个 run 逻辑命令 1、页面访问计数分别 [0,1] 与 [2,3]，实际原因未查明；这里只证明共享 Profile 存储连续与零模型，不声明物理动作唯一性。
- 下阶段唯一新增取舍是成熟候选的受管行为扩展/继续寻找，不重新询问三环境、任务窗口、首版平台、单 Profile 或断线合同。[证据与失败结算](DAILY_CHROME_EXTENSION_P0_EVIDENCE_20261001.md#继续实施真实消费者与三环境产品接线)。

## 2026-10-01 P0 无人值守构建与真实扩展加载补证

原版 Playwright 候选 extension 0.4.0 已按固定上游 Vite 配置构建，在全新测试 Profile 中经现有 browser-use/cdp-use 完成 UI 与真实后台消息验证，模型 0、清理 confirmed；没有采用 Playwright 产品驱动或冻结候选。当前受管环境未安装 Playwright；历史 bundled Chromium 与微软 extension/relay 是不同事实。工具仅拒绝日常 Chrome 的受保护安装页，不能据此停止可独立进行的构建/测试。[完整补证与首败](DAILY_CHROME_EXTENSION_P0_EVIDENCE_20261001.md#后续补证用户不在电脑旁时的开发验证) 保留 CfT 145 启动超时、辅助 API 格式错误、首次清理核验和各项最小补救。真实日常 Chrome 154、完整 SDK relay 消费和 Windows 仍未验收，P0 兼容门仍不通过。

## 2026-10-01 日常 Chrome 扩展 P0 固定来源与执行反例

本轮已授权开发，从实际 `master@674ed366` 与 6 个既有文档 dirty paths 开始，保护原改动，无分支/worktree/提交/推送。完整 Product Alignment、Reuse Assessment、固定来源/许可证及真实层级证据见 [P0 记录](DAILY_CHROME_EXTENSION_P0_EVIDENCE_20261001.md)。

固定 Playwriter `33d5c5a`、Playwright `8b552173`，补查 Panerelay `852dcd82` / `0.11.1`。原样采用均不满足已确认边界：Playwriter 历史云资源清理与默认日志；Playwright group 拖入扩权、空目标枚举、argv token；Panerelay 新页要求 all-tabs，并在真实 HTTP/WS 路径丢弃 newWindow。Panerelay 实际撤销旧凭据性质通过，可以作为复用依据，不代表持久配对或 Chrome 兼容。

新增固定来源脚本与 API 显式 P0 探针，9 项各自有通过记录；来源下载/测试输入及纯类型循环的首次失败独立保留，补救只重验受影响项；所属 API typecheck 通过。没有产品候选接线、模型调用、Chrome/Native Host 安装或服务切换。P0 兼容准入不通过，已按用户要求提出候选最小扩展/继续寻找的取舍，未自行冻结采用。Windows 缺实机阻塞；扩展安装/批准需要用户实际操作。

## 2026-10-01 日常 Chrome 扩展接入方案（文档与静态核查）

详见 [开发文档](DAILY_CHROME_EXTENSION_DEVELOPMENT.md) 与 [ADR 0013](../adr/0013-daily-chrome-task-window-control-boundary.md)。用户确认默认仅任务专属窗口、首版 macOS/Windows、本地加载解压扩展、主动连接/运行自动打开 Chrome、一个指定 Profile；已纠正把模式切换强制升级为链路复验的建议，产品不新增这一步。

保留 browser-use 0.13.8/cdp-use 1.4.5/workflow-use 0.2.11 的主线。候选为 Playwriter `33d5c5a2c5ebf702e387d94d609e038c98e0acec` 公开 CDP relay；Playwright `8b552173e8d767db29b8baef8f4a1f08cf7f26bf` 扩展的按 Profile token 为成熟授权对照。只复用传输，不引入额外 Agent/执行器。

静态发现：现有 endpoint/path 与 newWindow 语义有适配差异；候选默认 CDP logger 会落盘，自动启动助手按端口管理进程，relay 自身还包含辅助执行器和启动后的 orphan-cloud 清理。必须关闭这些不符合本项目秘密/资源所有权边界的默认行为，不能只因公开导出 relay 就冻结选型。browser-use 固定版本已有 headers→CDP additional_headers，是可核验的成熟凭据消费入口，不据此新增短期 token 协议；真实兼容、两平台安装、持久授权与京东效果均未验证。

当前断线源码证据：`TargetScope.ensure_connection` 与受管 `_auto_reconnect` 拒绝擅自重连；`TaskChainRuntime.executeExclusive` 对中断/预算以外异常进入 `failRun`。已有 checkpoint/resumeRequest/verifyResume 是条件性的既有恢复合同，不能推断控制掉线后自动暂停/续跑。文档沿用这些事实，不新增恢复系统。

用户最新强制要求覆盖开发的所有环节：先找现成开源实现，能复用/沿用就复用/沿用，不由 agent 自行作出新增产品、架构或选型决策。故不预先指定自定义短期 token/epoch、OS 凭据包或新授权协议；P0 逐项注明所用现成源码/API、实际不满足点与真实证据，不以文档中的示例字段为自研要求。

本 session 只编写文档并做只读核查，没有安装、启停、连接浏览器、模型运行或产品测试。开发文档与接续指令已完成，产品取舍已收敛；技术候选由新 session 的 P0 完成证据核验，未实施、未冻结采用决定。

## 2026-09-30 解锁后真实消费核查与输出约束补救

解锁后从原任务/日常 Chrome 实际点 Allow，首次连上的 operation 保留父连接，下一次 operation 没有 SDK connect 或原生确认且运行完成。成功 run 的 40 个事件有真实输入/输出 envelope，11 对 recorded、9 对 redacted。原任务现场、完整成果和 Function 参数/返回均已核对；首个连上后 target mismatch 失败保留且根因未知。此结论只覆盖同 task/config 的有效连接，不支持跨任务、Chrome/服务重启的永久授权。Chrome 官方明确新调试 session 需要确认：[官方连接说明](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)。

输出省 merge 的同源整图核查发现旧 `applyReadRequirements` 只消费非空叶绑定；新 assemble 改为根 source 加常量 paths 后就绪约束丢失。最小补救复用 runtime 已公开的 `dataCapabilityConfigSchema`，按 arguments 别名、常量 mode/paths 和实际源键恢复原路径；目标映射路径与源 requiredPaths 分开。直接 terminal 返回只消费实际非空 node 绑定，根值、动态参数和控制流不增加猜测。独立对冲覆盖别名、嵌套前缀、非法路径、空/动态映射和 identity 变量写，无新模型字段、契约字段、图调度或库。

两个真实消费反例先红；所属 4 条含 Python readiness probe 通过。原 artifact 通过当前 materializer/compiler 产生 19 节点，非输出节点及控制流、输入输出合同保持；本轮保存的 read 值经新 assemble 值/键序一致。旧 release 原文与摘要保持，候选未写入产品仓储或发布。这是新代码编译/数据消费验收，尚非新候选整链浏览器验收。

交付边界定点核查：`/api/task-chain/artifact` 返回仓储 JSON 元数据，`ArtifactList` 只展示媒体类型/ID/摘要，没有真实文件下载端点或文件生成证明；不能宣称 Excel/Markdown 已交付。原窗口聚焦已有 `controlHandoff(focus)` → managedWindowAction → AttachedWindow.focus 的生产 seam，要求原 handoff lease 和原 target 仍存在；当前数据任务无需页面保留，所以本轮不以它验收现场交付。

展示死规则反证：case ID 是版本数据，不是固定失败或循环含义。按实际源 node.kind/cases 优先解释节点、阶段、循环体与边，标准端口再按其真实类型处理；不能保留“blocked/limit 命中就是异常”的字符串表，也不能加保留字限制回避合法图。边在投影前持有真实源身份，私有 label 直接给 React Flow；分组合并保留已声明 case 身份，文案相同也不与循环边合并。独立对冲及 6 个先红反例保护此不变量；30 条所属验证通过，同文案反例补救仅重验 control 17 条。数据操作按既有注册 merge 与常量 transform+assemble 的算法语义显示中文，动态/未知不猜，无新增模型字段或第二翻译表，受影响单项及 Workbench check 通过。

循环轮数与集合项数不互相推算：while 的已完成稳定次数和当前次数用“轮”，each 的集合游标/已处理数用“项”；未知总数没有分母。此最后文案补救只重验已有未知 while 单项，通过，不追加运行字段。

## 2026-09-30 最小字段与输出精简最终对冲结论

本轮沿已有事实路径与 Reuse Assessment 执行，不新增库、模型用途或必填 LLM 字段。删除重复 review invocation/result 身份、outputNames、missing 的 not_recorded 原因、无消费的路径展开接口和重复端口表。剩余 kind/标准端口/能力翻译来自公开 IR 与已验证配置，未添加网站、任务 ID、URL/selector 词表。schema 说明复用现有 ValueSchema 类型字段；只为 Function 展示真实结构和约束，普通动作保持短类型。

输出方案已经查清 materializeOutputAssembly → data.transform → executeDataOperation → assembleValue 与 parseTaskValue：校验不规范化对象键序，既有 equals/Function 可观察顺序，不能靠字段名或 schema 宣称多字段重组恒等。独立对冲允许复用已有 assembler 删除同源 merge：rewrite 后父绑定完全一致、唯一字符串源键、paths 键序与字段顺序完全一致、closed 父对象 properties 恰好覆盖所选 required 键；否则回退。最终输出合同与变量写仍在 assemble，未重写数据能力或编译框架。新候选整值 exact contract 可 0 节点，同源投影 1 节点；旧 release 不改。输出 5 条定点不变量通过，目标合同验证调整后受影响 1 条通过；新候选整链真实运行未验。

启动失败补救同样用生产消费事实：只在 fresh operation、无旧交付恢复、无 handoff 目的/目标回执、owner/lease 相同、当前真实清理报告 confirmed 且无 activeResources、browser_close confirmed/not_required 时清掉启动占用。旧交付/回执不明/释放不确认/owner 错配保守阻断；typed UpstreamProtocolError 且无 step.runIds 才归 existing external、repairable=false，不按错误字符串猜权限原因。现有 startup/handoff 5 条（含 5 类反例）通过，新实际失败 b104a9fc 同样无残留租约。

用户后来明确授权处理本机原生 Allow；当时 Mac 已锁定，native UI 无法操作，未点击。新 sdk_connect 失败不当作链路回归通过，也不改原失败。真实首连及连续第二次复用未验证；当前保留有效 task 父连接只覆盖同 task/config 与连接存续期，不覆盖浏览器/服务重启。[Chrome 官方新调试会话确认边界](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)。

## 2026-09-30 正式运行之间的日常 Chrome 连接边界补救

Product Alignment:
- natural-language task: 同一任务再次运行时复用仍有效的用户 Chrome 控制连接，详情先说明实际业务事实。
- reusable chain boundary: 每次 execution 独立页、能力与审计；task 拥有同一 SDK 父连接。读取、导航和表单共用。
- runtime inputs: 原 task、operation owner、endpoint/profile/headless/origins/sites 指纹与真实释放报告。
- dynamic task outputs: 原任务返回值、清理与交付事实；不改历史发布和运行。
- generic platform capability used: 现有 TaskConnection.borrow/release、ConnectedTaskScope 与 retainedConnection 审计。
- replay model calls: 0 新增。
- site/task-specific code added: no

Reuse Assessment:
- capability: 正式运行确认释放本 operation 后继续保留同 task 的 SDK 父连接。
- existing implementation in repository: 准备/复验已经使用此保留路径，runtime-host 仅对 replay 强制 closeAfterOperation。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8、cdp-use 1.4.5、bubus 1.5.6；不引入/删除库。
- selected implementation: 复用已存在的同任务释放路径，不新建连接池、代理、浏览器或自动重连。
- reused public surface: TaskConnection 借用与释放、SDK start/stop、TargetScope ownedTargets。
- B-A-T-owned adapter and remaining gap: 移除正式运行独有的强制断连；真实首次连接的 Chrome 原生授权仍不可省略。
- license/runtime/platform fit: 不变；macOS 代码验证，Windows 真实运行未测。
- browser/runtime/state ownership conflicts: 同 task/config 才可复用；不同 task 下一次借用、服务关闭、取消、handoff、启动失败、释放不确认或掉线最终关闭。业务失败的 operation 若确认释放，可保留父连接，不能承诺所有失败都断连。
- replay model calls: 无新增。
- rejected candidates and evidence: 不跨 task 共享、不自动 Allow、不关闭用户 Chrome、不换私有 Profile。Chrome 官方原生调试会话每次新连接需确认，保留连接只减少重连次数，不提供永久授权。
- focused validation: 真实 runtime-host 正式入口适配与原 TaskConnection 生命周期定点验证；此次新的真实尝试失败在 sdk_connect、0 节点，不将其归因于前一次正式运行关闭。

独立只读对冲已核验 resume 原租约、handoff 保留页面并关闭 SDK、配置漂移拒绝、operation 清理与父连接审计；结论允许最小补救，首连授权仍是当前接入方式的产品限制。[Chrome 官方说明](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)。

## 2026-09-30 独立交接后的节点展示与运行事实实施门

Product Alignment:
- natural-language task: 用户查看同一次链路调用的动作、条件、循环、实际输入输出与成果，并从结果回到同任务需求对话。
- reusable chain boundary: 阶段内真实节点的只读投影和单次运行事实；导航读取、重复处理、表单操作共用。
- runtime inputs: 所选不可变候选或发布图、需求引用、TaskRun.input、同 run/invocation 的有序事件。
- dynamic task outputs: 同次返回值、逐次安全 I/O、真实循环与条件出口、交付和清理事实。
- generic platform capability used: React Flow 阶段父卡、现有 contracts/runtime 事件、产品仓储、访谈幂等命令。
- replay model calls: 展示与留存不增加模型调用；用户明确需求回流使用既有访谈用途。
- site/task-specific code added: no

Reuse Assessment:
- capability: 节点解释、运行事实留存、同任务需求回流及新候选输出绑定简化。
- existing implementation in repository: ChainPresentation、TaskRun.events、TaskContractRepository.saveRun、executionEvents、review_execution、InterviewConnection。
- mature candidates and pinned versions: 保留 React Flow 12.11.6、Radix Themes 3.3.0、Dagre 3.1.1、LangGraph 1.4.14、Zod；不引入/删除库。
- selected implementation: 适配现有公共接口；持久事实仍由现有运行仓储承担。
- reused public surface: React Flow Node/Handle、Radix 详情与结果布局、Zod schema、既有运行事件和幂等提交。
- B-A-T-owned adapter and remaining gap: 当前事件只有状态出口，没有完整逐次 I/O；workspace summary 未携带精确需求、调用输入、review。新增可选受控事实并保持旧记录缺失语义；未冻结字段接受独立只读审查后实施。
- license/runtime/platform fit: 已有依赖及许可证不变，浏览器与 Windows 真实验收另记。
- browser/runtime/state ownership conflicts: 不增加浏览器控制会话、前端进度库、调度器或检查点库；查看不触发浏览器操作。
- replay model calls: 0 新隐式调用。
- rejected candidates and evidence: 不以日志保存 I/O，不从列表相邻/标题推断循环体，不从技术限额生成分母，不改旧 release/历史 run。
- focused validation: 按阶段覆盖当前次优先、未知总数、分支共享汇合、缺事件、具名参数、输出绑定和回流幂等，不跑根级全量测试。

当前基线：HEAD `2a8d2cdeb2b2b7ea3cfe49930511a1e9d5081683`，master；原有 10 个已跟踪文档修改与 2 个未跟踪文档保留。独立交接文档已全文阅读。展示稿采用一张阶段画布，直接子行、当前次分支规则、右侧计时、可查看起止卡；结果打开宽区，集合按保存值浏览，长文本可完整读。

## 2026-09-30 变动数据下的跨页消费者就绪作用域补救

Product Alignment:
- natural-language task: 原任务读取第二页首条详情；首条随实时列表变化，不锁定探索样本。
- reusable chain boundary: 点击或键盘导航后，唯一字段消费者绑定本次动作结果页；详情读取与导航后表单读取共用。
- runtime inputs: 当前结构选择结果、动作所属 session/target、实际导航 URL、已编译读取配方。
- dynamic task outputs: 当前选中详情的标题及正文，字段合同保持不变。
- generic platform capability used: 已有 action_result_readiness、navigation owner、同轮 Page 身份校验和有界事实轮询。
- replay model calls: 0；不重新探索，不重派已经执行的点击。
- site/task-specific code added: no

Reuse Assessment:
- capability: 将跨页 ready 消费者的样本作用域绑定到合法动作结果，不改变固定 URL 的授权条件。
- existing implementation in repository: workflow-use fork 已有 transition 消费者动作结果绑定；ready 消费者遗漏。
- mature candidates and pinned versions: 继续 browser-use 0.13.8 / workflow-use 0.2.11 fork；不引入新库。
- selected implementation: 扩展现有唯一消费者选择条件，复用全部导航和身份核验。
- reused public surface: OrdinaryCapability.execute_checked、TargetResolver、StepVerifier 和 Tenacity。
- B-A-T-owned adapter and remaining gap: 仅补 ready 分支；不添加模型、控制器或第二套导航循环。
- license/runtime/platform fit: 原许可证及 Python/Node 运行时不变；Windows 未做真实运行验收。
- browser/runtime/state ownership conflicts: 消费者必须仍归同一次动作 session/target；固定 URL、多个消费者或无 URL 变化证明不得动态改写。
- replay model calls: 0。
- rejected candidates and evidence: 不删除 scope 校验、不硬编码新详情 URL。真实失败 run 1210bb38-ac4e-4ea2-8083-b2b39656bdc5 的 s-a-0028 返回首条 #9057，s-a-0029 的 ready scope 却为样本 #9050；现有选择函数只接纳 transition。
- focused validation: 真实 capability seam 对 ready 导航先红后绿，保留固定 URL/歧义/动作身份反例；更新 fork manifest，原来源离线重编译后继续独立复验及正式运行。

实测 c0f1e3f5-cd88-48e7-8edf-f26b0f4cb3b1 的日常 Chrome 首连已成功，执行到上述点击后校验失败；16 transitions / 22 browserCommands / 0 llmCalls，操作页清理确认、同任务父连接保留。该失败不能记为已通过，也不改变旧运行。

实施后验收：真实 seam 动态 ready 正例先红后绿，6 条用例逐条通过，固定 URL/多个消费者/缺少 changed/归属变化仍拒绝，点击严格一次。原 final 只读离线重编译得到同一 20 节点摘要、新模型调用 0，因此未修改草稿或旧 artifact 历史摘要。真实独立复验 e3dd159d 及本地 V5 正式运行 01987d57 均 completed，各 20 transitions / 23 browserCommands / 0 llmCalls，输出真实当前首条 #9057 而非探索 #9050，cleanup confirmed。复验到正式阶段同 Python PID69039，正式 startup 没有 sdk_connect；结束后进程退出，Chrome PID657 保持。完整证据与截图在 PROGRESS 顶部。

## 2026-09-30 同任务连续阶段连接复用实施门

Product Alignment:
- natural-language task: 继续原任务，在日常 Chrome 完成独立复验及正式执行，不反复断连授权。
- reusable chain boundary: 同任务父连接、每次操作独立页与能力；读取和表单操作同样需要。
- runtime inputs: task connectionOwnerId、独立 operation ownerId、原生端点、已确认来源。
- dynamic task outputs: 原链路输出与不可变版本不变。
- generic platform capability used: 原 Browser/SessionManager、CDP Target attach/close、TargetScope。
- replay model calls: 0；不增加模型判断或重试循环。
- site/task-specific code added: no

Reuse Assessment:
- capability: 同任务准备/样本/复验共享一个 SDK 连接，正式结束及服务关闭断开父连接。
- existing implementation in repository: RunnerProcess 每次 start/close，AttachedWindow/TargetScope 已限定 ownedTargets；生命周期过短导致每阶段新连接。
- mature candidates and pinned versions: browser-use 0.13.8、cdp-use 1.4.5、bubus 1.5.6；已查公开 Browser.start/stop 及 SessionManager Target.attachToTarget。
- selected implementation: 复用现有 SDK Browser、CDP 与 Scope，不引入控制器、代理或 Agent loop。
- reused public surface: Browser.start 已连接幂等；Target.createTarget/attachToTarget/closeTarget；最终 Browser.stop。
- B-A-T-owned adapter and remaining gap: 同任务独占借用、父子所有权及释放审计；每次独立页面/缓存；配置漂移拒绝；真正清理失败阻断复用。
- license/runtime/platform fit: 不增删库，原 Node/Python 运行时；真实验收仅本机 macOS，Windows 未测。
- browser/runtime/state ownership conflicts: 父任务拥有连接/进程/临时目录，execution 只拥有页及能力；释放报告明确 retainedConnection，不伪报父进程退出；最终关闭只断连接，不关用户 Chrome。
- replay model calls: 无新增。
- rejected candidates and evidence: keep_alive 不能阻止 Browser.stop 重置 CDP；不靠跳过清理、不池化不同任务、不自建 websocket 重连。
- focused validation: 真实 Runner/AttachedWindow seam 先红后绿；两 owner 一连接、独立页、最终 stop；取消、漂移及释放失败反例；随后原草稿独立复验与正式入口真实验收。

此处为实施前记录，不代表真实复用已通过。历史连接失败及业务运行保持原样，后续验收另记。

首连等待补救（真实复验 `46d6defb-20f1-4695-8773-03b3ba6093ab` 未执行节点）：复用不解决首次授权耗时。当前 pinned `CDPClient.start` 没有公开 open_timeout 入参，内部 websocket 默认 10 秒；BrowserStart handler 又硬编码 connect 15 秒，BrowserStartEvent 默认 30 秒。只延长一个外层 timeout 无效。继续复用原 SDK 的 start/connect/event bus，通过限定当前 Browser、当前本机 endpoint、首连 await 的窄适配提供有界人工确认预算；不修改安装依赖，不复制连接主体，不新增连接/重试循环。公开事件 timeout 优先复用；若需代理依赖调用点，必须版本锁定、无关调用保持原值、退出/取消 finally 恢复，并以新 seam 红绿测试核验。预算扩大只延长已有明确授权连接的等待，不增加接入对象或数据权限。

## 2026-09-30 日常 Chrome 连接入口补救

Product Alignment:
- natural-language task: 在原任务继续准备及复跑，始终复用用户日常 Chrome，不以私有 Profile 替代。
- reusable chain boundary: 任务浏览器连接与窗口所有权；页面读取和页面操作任务共用。
- runtime inputs: 本机 Chrome 原生连接、当前 ownerId、恢复租约和已确认来源。
- dynamic task outputs: 原任务结果合同不变。
- generic platform capability used: 既有 AttachedWindow / TargetScope；Chrome 原生 DevToolsActivePort。
- replay model calls: 连接与普通复跑 0；B-U 探索审计不变。
- site/task-specific code added: no

Reuse Assessment:
- capability: 附加日常浏览器，限定本次任务窗口及标签所有权。
- existing implementation in repository: RunnerProcess.startHybrid、AttachedWindow、TargetScope 已有本机 ws 连接与隔离/清理能力；缺失默认原生端点解析，准备入口未传产品 ownerId。
- mature candidates and pinned versions: 继续 browser-use 0.13.8 / cdp-use 1.4.5；核对 Chrome 官方原生连接文档和 chrome-devtools-mcp BrowserManager.ts（源 blob 699c1613f97412d73b560ec97c2cdcc238e86ccb）。
- selected implementation: 原生 DevToolsActivePort 配置读取，连接仍由现有 Browser-Use/CDP 与 AttachedWindow 承担。
- reused public surface: Chrome 用户数据根的 DevToolsActivePort；既有 Browser(cdp_url=...)；不另建 MCP 控制器或 Agent loop。
- B-A-T-owned adapter and remaining gap: 严格解析本机端点，显式连接优先；配置缺失在启动前报错，不再静默启动私有浏览器；准备/样本/正式运行传同一产品所有权。
- license/runtime/platform fit: 不增删依赖；Node fs/os/path 与原 Python 运行时；按平台解析 Chrome 标准目录，Windows/Linux 只做定点路径验证，不冒充真实验收。
- browser/runtime/state ownership conflicts: 不读取 Cookie/Profile 内容，不复制登录态，不关闭 Chrome；原 profilePath 仅作为既有任务租约元数据位置。清理只关闭 ownedTargets。
- replay model calls: 不新增。
- rejected candidates and evidence: 不使用 chrome-devtools-mcp 的私有启动默认值，也不添加其 Puppeteer 控制器；项目既有附加连接已覆盖控制/所有权需求，缺口仅配置适配。关闭遗留私有 Chromium 不再作为此任务的重试方案。
- focused validation: 三项真实 RunnerProcess seam 回归先红（静默私有启动、原生端点遗漏、显式连接覆盖）；补准备 owner 回归，接回原工作台任务做真实验证。

本机初始日常 Chrome PID657 无调试监听且原生开关关闭，API 未设置临时 BAT_UPSTREAM_BROWSER_CDP_URL；历史 Windows 成功不能证明本机配置。用户明确授权开启后，Chrome 原生界面已显示 127.0.0.1:9222，DevToolsActivePort 生成且监听仍为 PID657。官方原生连接需开关和每次连接 Allow：[Chrome 文档](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)，源码读取规则见 [BrowserManager](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/src/BrowserManager.ts)。同一原任务 final 与第一遍普通样本已通过，独立复验在启动阶段失败，完整验收尚未完成。

启动诊断补充：复用现有 DiagnosticChannel / fd4 / SourceLifecycleDiagnostics，而非新增控制器或重试循环。仅适配 `reserve`、`sdk_connect`、`task_target_prepare`、`task_target_focus` 固定阶段；失败因果链最多 4 层，只保留固定异常分类、精确安全码和可信源码名称/行号，不保存 SDK 消息、个人路径或页面数据。诊断先于原清理且写入失败不改变原异常，原浏览器/租约所有权不变。实际 AttachedWindow.start 与 TS 持久化 seam 先红后绿，Python 9 项与 TS 6 项通过；补齐 Runner callback 后从原草稿独立复跑，不能用后续成功改写首次连接失败的未知子因。

新复验的 SDK 连接在 10211ms 超时，未进入目标初始化；安全定位到 pinned cdp-use/client.py:277 的 websocket 握手，默认 open_timeout=10。连续阶段的原生授权重复来自 B-A-T 每次 close/handoff → Browser.stop → SDK reset → WebSocket.stop，并非 keep_alive 可以保住连接。公开 Browser.start 在已连接时跳过新连接；公开 CDP Target.attachToTarget + 原 SessionManager 可处理新任务页：先拒绝提前的未知 autoAttach，createTarget 回执后持久化 owner，再显式 attach，不信任未知 target、不重造控制器。[Target 协议](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Target.pdl)。受控 SDK 检查 connect/stop 均为 0，未控制真实 Chrome，不当作复用已接入。最小范围是同一准备批次：单独拥有连接，运行只拥有各自任务页/能力/状态；必须明确资源所有权和 cleanup 事实，不能直接绕过 stop 或套任意跨任务池。SDK 意外掉线仍有自身重连行为，不能承诺所有场景永远无原生授权。

## 2026-09-30 原主线保存来源修复：就绪依赖与等待分类一致性

Product Alignment:
- natural-language task: 从既有浏览器任务取得第二页首条详情；先修同一失败来源，不新建替代任务。
- reusable chain boundary: 现有动作、读取、选择函数及其来源证明到同一参数化 TaskChain 的编译适配。
- runtime inputs: 已确认需求与运行输入，不固化站点字段或样本 href。
- dynamic task outputs: 按原结果合同读取的详情标题和正文。
- generic platform capability used: 已验证的读取就绪依赖保留、等待 coverage 来源校验、选择注解错误诊断，以及只含布尔值/摘要的通用焦点效果事实。
- replay model calls: 普通节点 0；不增模型重试或全局完成 judge。
- site/task-specific code added: no

Reuse Assessment:
- capability: 保存原生探索事实后形成可审计复跑图，不复制浏览器或工作流控制能力。
- existing implementation in repository: browser-use 0.13.8 原生 Agent；workflow-use 0.2.11 fork 的公开 compile_request、现有 consumer_readiness_by_action / waits_owned_by_next_target / QuickJS 校验。
- mature candidates and pinned versions: 继续使用上述锁定组件；LangGraph StateGraph 保持正式图调度所有权。
- selected implementation: 修正 B-A-T 自有来源适配，不替换外部关键库。
- reused public surface: 同一 compile_request 与既有零模型来源重编译入口；prefix/final 同一规则。
- B-A-T-owned adapter and remaining gap: a33 合法选择函数已验证，却因唯一下游就绪读 a34 被值活性裁掉而留下悬空消费者；a6 分类器已证明等待归属，独立 coverage 校验不识别同一规则。保留最小必需就绪读；可由真实物理后态或另一已保留读取证明时仍裁掉冗余探查。
- license/runtime/platform fit: 不增删依赖；browser-use 沿用 MIT、workflow-use fork 沿用 AGPL-3.0，既有 Python/TS/QuickJS 运行时不变；本轮不宣称 Windows 验收。
- browser/runtime/state ownership conflicts: 离线重编译不控制浏览器、不写历史来源；正式执行仍是原单会话、LangGraph 和 SQLite 产品事实源。
- replay model calls: 不新增。
- rejected candidates and evidence: 不以重写 Agent loop、执行器或删除安全闸门补救；ADR0005 多缺陷复评表明这些缺陷位于自有 liveness/coverage 适配，不是外部组件控制能力缺失。若原生记录无法证明动作效果，仍保留 gap，不能由本修复强行发布。
- focused validation: 原失败 cad814b6 来源无模型/无浏览器重编译；先红的跨层回归与断因果、伪归属负例，再回原任务正式入口。a35 原源码/错误细节未保存，a3/a4/a5 效果证据尚未证明，分别处理，不归因于模型。

焦点证据补充复评：现有 `Page.get_elements_by_css_selector` / `Element.get_basic_info` / `Element.evaluate` 已覆盖焦点读取，不添加 DOM 控制组件。新采集可读取固定 `:focus` backend 身份集合摘要和 target 的 `:focus-within` 布尔值，不记录输入值、页面文本或 selector 猜测。旧 TaskChain 的 `target_state` 读取默认不包含新字段；只有新来源明确含 `focused` 的条件才启用，避免改变旧发布链的严格 JSON 比较。焦点动作效果仍须真实证据，不将未变化焦点或 trusted dispatch 本身冒充效果。

## 2026-09-30 两线修复：先需求对话阻断与局部 UI，再回主线编译

用户已明确授权：在原任务修复草案网址误解析、长标题、输入区双重焦点边框，以及报错/重试分离的布局；支线验证后继续原主线，不新增替代任务。原任务 `acf401e3-caed-40d9-8c1b-5d1d753f2194` 的 revision 5/6 原始输出在正式 `parseInterviewOutput` 中都报 `interview_draft_url_unverified`；已选来源保留，入口绑定正确。唯一变量探针去掉 Markdown 反引号后均通过：原 URL 提取器把末尾反引号解析为 `%60`。标题由首条请求截取 80 字，并非模型短标题过长。修正必须保留来源白名单，不允许任意同站深链。

```text
Product Alignment:
- natural-language task: 在原需求对话恢复合法准备草案提交，清晰呈现失败、重试与输入状态；之后继续原浏览器任务编译主线。
- reusable chain boundary: 用户来源事实与 Markdown 草案 -> 确定性来源校验；对话/任务事实 -> 标题与失败操作展示。适用于页面读取与表单/内容操作任务。
- runtime inputs: 原对话、已选来源、失败输出及最新访谈轮次；不新增业务输入。
- dynamic task outputs: 原准备草案与来源引用不变；不伪造结果或运行成功。
- generic platform capability used: URL 标准化、既有来源绑定、SQLite/Drizzle 投影、共享 InteractiveTimeline/Composer、Radix 主题与控件。
- replay model calls: 普通节点 0；同任务人工触发一次需求重试沿既有模型调用，不追加模型标题或 judge。
- site/task-specific code added: no

Reuse Assessment:
- capability: 合法 Markdown URL 与来源事实适配，以及需求对话局部状态布局。
- existing implementation in repository: source-resolution.ts、ProductStore.list、AI Connect InteractiveTimeline/Composer、Radix Themes。
- mature candidates and pinned versions: 标准 URL API；AI Connect React 0.3.2 cc7d94fe；Radix Themes 3.3.0；React 19.1.1。
- selected implementation: 保留以上现有实现，不增删库；只修正文 URL 字面边界与宿主显示组合。
- reused public surface: URL.href、既有 selectedSourceFacts/preparationEntryFacts、Timeline composition/entries/actions、Radix Button/Theme。
- B-A-T-owned adapter and remaining gap: 严格来源准入与任务标题派生、失败反馈的领域组合；不实现新 Markdown 渲染器、对话框架或重试队列。
- license/runtime/platform fit: 已锁定的现有依赖与 TypeScript/浏览器 CSS；不改变许可证、Node 或 Windows 路径边界。
- browser/runtime/state ownership conflicts: 不修改来源历史、用户命名、模型设置、浏览器所有权或执行器；不新建产品任务。
- replay model calls: 普通复跑 0；重试仍是需求对话一次原有调用。
- rejected candidates and evidence: 不更换组件或加完整 Markdown 框架；此次缺口是已证实的 URL 字面边界，不是渲染能力缺失。
- focused validation: 先红后绿的草案/来源与标题回归，原失败输出零模型重放，原任务一次正式 UI 重试，深浅色与窄屏布局核验。
```

主线当前 job `4cff3311-c8fc-4fc7-8d49-46ea8db41570` 已失败，不再是执行中；B-U 已读取详情并 done，终编仍拒绝。支线通过后基于保存来源处理读取依赖剪枝、supporting wait 规则接线与注解诊断证据，不将支线通过当作主线完成。

## 2026-09-30 真实展示证据与新准备验收边界

正式参数化新任务 job `ede1384b-0e40-4fb2-8aa4-6c43888a45e0` 已验证 `ChainPresentationContent` 的真实 prefix 保存/公开投影与阶段父节点 adapter：sequence 3→46 中 `stage-d66f280c217976b3`、内部 nodeId 和 `(0,0)` 坐标稳定，prefix 无伪 terminal。42 个动作、字段读取与 done 已完成，cleanup confirmed、`activeResources=false`；但 source `44140aee-fec5-42c7-8cac-4df4c6e4166d` 的 `a-0023` 选择证据不足，最终编译拒绝。选择程序仅收到 candidates，不能直接读取需求中的运行时仓库输入，故没有把样本仓库名固化进函数来冒充泛化。正式 UI 离线 job `c46c94a8-b23a-4c78-818f-d0369bfefb1c` 在不启动浏览器的情况下复现缺口。这些事实证明展示 seam 与资源闭合，不证明新任务 final 成功；本轮保持编译语义不变。

V4 正式新 execution `b3c37d38-dca4-4d9b-89eb-6f1a81848225` 以 19 transitions / 22 browserCommands / 0 llmCalls 完成且清理确认。Workbench 真实显示 8 个父阶段、内部动作与动作说明；节点输出缺少持久化事实时显示“本次节点输出未记录”，结果区按精确合同呈现标题/正文单条记录。这核验了现有发布链与本次展示改动的兼容，尚不能证明新的 final build 与 draft 保存内容相同。

真实重新准备暴露了画布身份边界：仅以 task/step 作为 React Flow key，会把旧发布链视口沿用到新的首个 prefix，首阶段被裁出画面。修正仅在新的 authoring job 首个 build 改变画布身份，并将该身份保留到同批 final、草稿和运行；build sequence、展开、主题与运行状态都不参与 key。复用 React 的现有组件身份与 React Flow 首次 fitView，不添加布局器或自动重试；6 项所属回归、Workbench typecheck 和真实 prefix 可见性通过。新增 Hook 热更新的开发页面在重载后恢复，后端探索未受影响。键盘详情、主题和窄屏下方面板已有真实 UI 证据，触屏硬件与 reduced-motion 的现场行为仍未单独测试。

2026-09-30 的正式新准备 job `4cff3311-c8fc-4fc7-8d49-46ea8db41570` 继续使用已确认无输入需求，观察到了 navigate/wait 两阶段 prefix 的稳定身份、归属和布局；当前尚无 final/draft/validation。完整验收结论须等该新记录实际闭环，不能用旧 V4、离线重编译或截图替代。

## 2026-09-29 准备期阶段嵌套与结果展示：现有能力足够，缺口在投影接线

本节最初是[准备期阶段嵌套画布、节点详情与结果展示开发方案](PREPARATION_STAGE_NESTED_WORKBENCH_20260929.md)的只读证据摘要；后续实施已验证原选型成立。产品代码只在既有 contracts/API presentation seam、Workbench React Flow adapter、详情和结果 renderer 内接线，没有新增依赖、数据库表、模型字段、浏览器动作、Agent loop、调度器或运行状态。聚焦回归、三个 workspace 类型检查与 Workbench production build 已通过；真实 Workbench 新任务和浏览器验收仍未执行。

- `hybrid-prefix-schema.ts` 明确不含完整入口、终点、output assembly 和 result binding；但 `hybrid-prefix-materializer.ts` 已只返回当前依赖闭合的真实 nodes/edges。因此准备期可以画真实局部阶段，不能画假完成、假终点或假结果。
- 实施前 `AuthoringBuild.accept` 已在每次 prefix/final checkpoint 保存 build，而 `TaskAuthoringActivity.build` 只有 nodes/edges。现已在同一保存屏障复用 `ChainPresentationContent`，没有让 React 根据 label、URL 或动作数量临时猜分组。
- `createStepChainPresentation` 已在完整候选链形成后、草稿和样本复跑前创建正式 presentation。最终阶段视图不需要等待样本或独立复验结束；需要的是 final build 与草稿 presentation 的覆盖、身份和布局一致性门。
- 实施前 `ChainCanvasGraph` 对准备 build 使用 LR Dagre 把每个动作画成 240×112 顶层节点，并只为多节点阶段画容器；这同时造成准备期横向长链和单/多动作两套层级语法。现已仅把阶段作为 React Flow 节点，仍只复用 React Flow、Dagre 和现有 ChainPresentation，没有引入 FlowGram、ELK 或第二张执行图。
- 既有结果合同已经区分 `payload.mode = execution|data`，`TaskOutput.kind = value|artifact`，值 schema 可区分 object、array 和标量。实施前 Workbench 只用 `ResultValue` 递归展示 JSON；现已按原合同选择 renderer，没有增加网站、Issue、商品或“报告类型” special case。
- 交互原型只验证“阶段父节点 + 动作列表 + 阶段间连线 + 独立结果区”的结构。视觉必须使用现有 Workbench/Radix 主题 token，不复制原型的颜色、尺寸或装饰。

复用结论：保持不新增关键依赖、数据库表、模型字段、浏览器动作、Agent loop、调度器或运行状态；API 现已拥有 prefix/final 阶段投影、公开降级和 final chain digest 一致性门，Workbench 只负责 React Flow adapter、选择、详情和结果渲染。实现前的 flat build 红灯已精确命中旧行为；最终聚焦证据为 contracts 12/12、API 16/16、Workbench 29/29。上述属于受控静态/行为证据，不替代 P4 真实任务验收。

## 2026-09-29 延迟导航 supporting wait 误拒绝：定因、修正与真实验收

旧 job `8c036479-d914-4671-868c-492e7dd063d3` 在 sequence 13 被宿主拒绝，artifact `4677984b-1e03-4c13-87cb-5c42160ba4fe`。保存证据表明 `a-0010` 点击 Issues 已派发；其即时 post `o-0020` 仍是旧仓库 URL，紧邻 `a-0011` 是成功的 `bounded_postcondition_wait/v1`，pre/post `o-0021/o-0022` 已在同一新 Issues URL 和同一 tab/document 稳定，随后 `a-0012` 正常读取 Next 候选。旧 `hybrid-runtime-scope` 只接受动作 post 与 supporting wait pre 同 URL，因而产生 `runtime_scope_supporting_wait_discontinuous`，再被投影成 `hybrid_consumer_readiness_boundary_unproven` / `hybrid_compilation_host_rejected`。旧运行 12 次模型调用均 completed；模型、选择结果和页面读取不是本次根因。

修正仍复用 workflow-use 已保存的 delayed postcondition coverage：只有 wait 类型/结果、相邻 observation sequence、同 tab、单调时间和 settle 上限、稳定新 URL、唯一 changed URL 后置条件、clauseRef、coverage 与 proofRefs 全部吻合时，才把 wait post 作为前驱动作的完成观察；普通同 URL supporting wait 仍先走原逻辑。消费者 readiness 复用同一次 scope 决策检查 URL 变化。任一顺序、时限、tab、URL 稳定、coverage 或引用被破坏时继续拒绝；没有新增依赖、浏览器动作、模型调用、重试或站点特例。

定点证据：真实形状回归先红，旧代码返回 `runtime_scope_supporting_wait_discontinuous`；修正后 `hybrid-read-scope.test.ts` 与 `consumer-readiness.test.ts` 合计 14/14，API package check 通过。原 rejected artifact 经正式 `materializeHybridPrefix` 只读重放为 12 节点/11 连线并保留消费者，未调用模型、浏览器或写数据库。

真实验收不是离线探针：新 job `31290e49-0ed3-4ce7-80d3-844764eff7e3` 跨过原 sequence 13，B-U 26 次 provider invocation 全部完成，final sequence 25、19 节点/18 连线。样本 `9ffd8c7b-c43e-4365-88bd-f9334f55a61f` 与独立复验 `e83d25cd-3e89-47a5-831a-dab6d767163a` 各为 19 transitions / 22 browserCommands / 0 llmCalls，cleanup confirmed；发布 Release V4 `eb5409ff-e3d1-4539-8c0b-6818b485a798` 后，正式 execution `52d8ccaa-1347-47ad-8f1b-b3dcc48a7c1f` 同样完成并返回 #9046 标题与正文，cleanup confirmed，精确 Profile 检查无残留。工作台可见 V4、运行完成和 8 个阶段。

剩余边界单列：其它普通编译 proof gap 是否允许 B-U 继续仍需 sequence/ACK 安全分类，不能因此吞掉来源损坏、越权或保存失败；工作台重试按钮无即时反馈和阶段标签/横向布局仍待定位；历史 V2 首败及旧启动/模型失败的底层原因不可恢复。上述缺口不推翻当前 V4 正式运行通过，也不能被本次通过冒充已解决。

## 2026-09-29 历史研究记录：已保存失败来源驱动的最小收尾修复

真实收尾证据：6320f07d准备→在线final→样本795d23f1→复验ed19a4e9→本地V2发布均完成；后续正式cff34d1b完成24节点/32浏览器命令/模型0，标题正文已保存。V2正式首跑d3959bd6在首页搜索按钮的target_state条件失败仍未定因：新临时profile和原正式profile经同一Runner/ManagedWindow执行保存的前两步均为单次trusted点击、aria-expanded false→true；源码证实锁定Mouse.click按下/释放坐标相同，不是up(0,0)。后续正式运行仅加固定布尔诊断，没有改规则，成功不能证明该首败已修。诊断插桩已删除、摘要恢复，既有状态条件保留，不再无证据叠加补丁。历史06dc启动与ae44模型底层错误缺证据，亦不列为已修。

同一准备9c8012df的B-U完成40动作、final41、26节点；样本96f87a0e在s-a-0022滚动后失败。原规则仅凭非navigation effect即要求后续读取值变化；滚动位置已经变化，但分页链接值可以完全相同，导致无意义等待30秒。删除这个按动作大类的推断：只有当前动作之前、未跨其它页面动作的同一已验证读取，与后态投影确实不同，才生成transition；否则生成ready。原URL/滚动位置/控件后置校验、字段schema和稳定读取保留。该规则同时适用于滚动到控件与点击已显示区域，不是网站特例；有实际前后数据变化证据的列表更新继续要求变化。prefix/final仍共用同一编译器，无新模型字段/次数/重派；TS同样核验ready与transition的真实来源。原失败source与草稿不改写。

ebb69527在搜索页确认仓库存在后，done(false)明确以“没有可点击索引且不能使用查询序号/样本href”为原因提前结束，7动作、无编译gap。现只澄清已有系统提示：find_elements不承诺点击索引，缺索引应先使用原生wait/scroll/search_page刷新或露出目标，再按新状态点击；不能仅凭查询输出没索引就判任务不可能。保留用户路径、原生done(false)、原生预算和错误处理，不添加宿主补问/重试/强制成功，也不虚构索引。此为模型指引修正，不是已证明解决所有模型提前放弃；只能由后续真实运行验证。

真实正式复跑 702b3b12 在 s-a-0024 的 `[0, attribute_href]` 绑定失败；样本与独立复验均成功，因此它们不能证明稳定性。已发布 IR 的 s-a-0023 允许空数组/缺 href，其前驱 readiness 也使用同一宽合同：旧页面 scope 不符时 baselineUnavailable=true，新页面连续空读取也可判成功。该漏洞可独立复现；本次失败未保留节点原始输出，不能声称已区分空数组与缺 href。

最小修复继续共用原编译/物化、字段读取和 Tenacity settle：仅当读取成功后**直接、无条件**进入消费它的能力节点时，将已验证的 ValueBinding 精确路径交给运行读取与对应 readiness。条件分支和整体列表绑定不收紧，不改变用户允许的空结果语义，不依据样本条数或内容猜阈值，不增加模型字段、等待秒数、重派动作或校验循环。requiredPaths 仅由物化器从已有绑定生成，不进入 ReadSpec 或 B-U 工具输入。原始事实、已发布 V1 和失败运行保留；新来源经同一 prefix/final 物化规则生成新版本，不能手工修改 V1 冒充修复。

初版 minItems/items.required 已撤换：实际只绑定第一项 href 时，其它项缺少该可选字段仍应通过；真实读取器反例先红后绿。保留原宽输出 schema，用精确路径存在性检查覆盖空数组/缺字段；未使用的其它行不受影响。普通节点仍无模型，既有 settle 只重读、不重派动作。

沿用下方 Product Alignment / Reuse Assessment，不增删库、模型或运行器。983c259d 的真实路径是动作→原生 wait→正式读取；原 scope 分类已正确保留 wait，但 consumer readiness 又强制直接前驱必须是动作，导致误拒绝。该历史修正仅允许沿现有成功边跨过有同 tab/URL 证据的原生 wait；跨 URL 的严格 bounded navigation wait 是本文件顶部随后增加并由 V4 验收的独立分支。跨 tab、断边与隐藏动作仍拒绝。普通复跑模型 0。

同批修正只作用于新任务：完整 final 收到并核验后将失败归在编译阶段；失败生成快照不得遮住已有草稿/发布链路，无链路时仍显示失败片段。另核对 prefix/final 的先前读取绑定是否受空业务输出影响；只有复现后才改。源码清单只更新本次实际修改文件的摘要，保留旧来源和失败历史。验证依次为已保存真实来源纯编译、所属边界回归、正式工作台新准备及普通复跑；前两者不冒充真实主线完成。

## 2026-09-28 减少模型交互与探索/编译断流修正（实施中）

2026-09-29 编译闸门减法（同一 Product Alignment）：983c259d 完成45个实际动作并读取详情，final 因 repeated_operation_reuse_unproven（两次原生wait）与 natural_empty_list_control_required（唯一下一页读取的数组索引绑定）拒绝。不是本次读到了空列表。原 rejected artifact 5269971b-c5fa-4b0e-8a02-6d1dcbe736ab 在无模型、无浏览器的正式重编译入口精确复现。删除仅按操作摘要相同推断业务循环的全局闸门，保留已声明 repeat_method/fold 和输入批量边界；相同等待/控件操作不等于重复处理N个业务输入。未声明空列表成功分支时，不替用户强造该业务行为，也不要求额外LLM/字段；既有 ValueBinding.readPath 在数据不足时抛 binding_path_missing，正常运行失败而非伪造空结果成功。已声明的 edgeCases 继续完整验证、生成原分支。两个最小生产编译回归均已先红，修正后还须回放原失败产物并走真实链路。

2026-09-29 同一来源过滤边界修正：job 62ab4bbe 的 B-U 正常完成41步，最终主机因 hybrid_consumer_readiness_boundary_unproven 拒绝（artifact 71170a11-7e53-4750-8508-866bbdbbbd63）。正式物化入口只读重放精确复现：未派发 a-0016/18 的原生历史有 URL/tab 与 dispatch entered=false，却没有尚未完成的额外 url_digest 采集；Python 已按未派发排除，TS scope 又要求该缺失事实。同一 Product Alignment 下仅调整自有 IR 来源适配：已证明未派发且没有完整现场 URL fact 的提议，只核对原生 URL/tab 元数据，不补造事实；有 URL fact 时仍核验，后继实际观察仍核验连续性。复用现有派发审计与分类器，不增加模型、依赖或恢复循环；原拒绝来源保持不变。

2026-09-29 延续同一 Product Alignment / Reuse Assessment：job 978a9267 点击 Issues 成功后，step10 尚未生成动作时，观察前后同一 target/document 的 URL 正常从仓库转到 Issues，被自有 scope 判为 observation_changed_during_capture 并 stop。source 99f77362-ac91-4598-8e8c-8ca81c46f91f 已关闭；9步8节点、重复事实0，不是原生模型或函数失败。修正同一受控 tab 的 URL/文档过渡：模型观察不交付混合快照，旧提议不派发，通过已有 ObservationRefreshRequired 回到原生 Agent.step 错误处理；动作后仍用已有 snapshot settle。tab/session 归属变化、读取身份失败、持久化失败继续停止。没有新增重试循环、字段、模型调用或上限。反例同时复现正常过渡误停和动作后归属变化误放；14项所属 scope/只读刷新/CDP读取检查通过，真实主线仍待验证。

在线选择接线补齐（沿用本节 Product Alignment / Reuse Assessment）：job d741b45e 已由原生 B-U 完成详情读取与 done；分页读 a-0014 的12条结果中，页码2与 Next 是同一 href，a-0015 navigate 因普通值绑定要求唯一路径而缺口。final 又移除未消费读取，连带使 a-0010 readiness 与其 Function 消费者不完整。只复用现有 selection annotation / FunctionDraft / QuickJS / ValueBinding：必要的动态导航同样按实际动作生成一个源码，输出候选 href，由原导航节点消费；不放宽唯一路径规则，不固化样本 URL，不添 Agent loop 或编译修复轮。输入/输出 schema 与绑定仍由动作和真实读取决定，模型响应仍只有 source。此属补齐既有通用能力，可用于分页控件和目录/搜索结果导航；无新库、无新运行器、普通复跑模型0。

同一 Product Alignment 下补齐原生错误恢复边界：真实 job d4b34548-c296-496c-8fb5-58587ab70ce6 的 a-0006 提议点击 index4771，尚未进入 Tools.act，因 B-A-T 将 `observation_target_index_unavailable` 判为来源破坏而 stop；此前5步在线保存、重复事实0。沿用已有 ObservationRefreshRequired 让同一已核验文档上的无效索引回到原生 step 错误处理，不另建重试/加次数/重新选目标；未派发审计保留，实际文档身份变化和保存失败仍拒绝。此修复必须先覆盖真实 callback → collector → scope → after_step 边界，再继续原任务，不能以局部验证宣布全链通过。

真实修正过程保留：job 387ad9bb-9ef6-4da1-84b9-531875872e0f 已在线生成选择函数并到达 Issues，但查询分页链接反复进行。原 a-0029/30/35 查询均有11条实际结果，原生 MessageManager 因 long_term_memory 优先而不交付 extracted_content。此次删除整个 enrichment 连必要结果交付也删掉了，属本轮减法错误；主动取消该轮并确认 browser busy/cleanup=false，不把取消算成功。修复只用原生 include_extracted_content_only_once 交付原生查询原文，不再添加 DOM 查询/祖先/额外摘要。原生 search_page 使用同样结果合同，也应一起交付，避免只修一个工具。

原候选集合检查还额外要求同位置元素 class 完全相等，会把 selected/visited 等样式差异当作集合不成立。删掉这层猜测：复用已验证 CSS 查询的实际 backend 成员以及原 DOM 树，要求全部命中属于同一重复条目组、每项至多一个命中；仍拒绝跨组和一项多个目标。复用既有 _walk_structural，不加选择器或语义打分；纯结构反例与原同组/跨组测试负责此边界，不能冒充真实 GitHub 全链通过。

```text
Product Alignment:
- natural-language task: 保留用户指定入口与动作顺序，在原生探索中生成可复跑节点。
- reusable chain boundary: 原生动作与现场证据 → 在线编译 → 同一持久化草稿；适用于列表导航与表单/控件操作。
- runtime inputs: 确认输入及运行时 DOM 候选；不固定样本身份。
- dynamic task outputs: 保留原字段读取与输出绑定。
- generic platform capability used: B-U 原生回调/重试、现有 selection annotation、QuickJS、前缀编译及 ACK。
- replay model calls: 普通节点 0；删除完成 judge，必要的选择函数按实际动作生成一次。
- site/task-specific code added: no
```

不增删关键依赖、不重造 Agent loop/选择器/执行器。当前失败 a-0039..43 来自逆序伪反例；随后潜在的完成审查仅已有观察就达 278452 字节，超过自己的 256000 上限（该次真实任务未到此阶段）。删除审查而非提高预算。

删除探索模型的 `bat_validate_selection` 前置任务；复用既有选择注解到在线回调，只让模型返回源码或 null，不要求 outcome/reason/examples。真实动作 ordinal 是检查样例，输入/schema/节点/连线全部由代码组装。唯一控件继续复用已证明单例的确定性保护。按动作来源键保留一次生成结果，包括失败；最终编译不重复请求。原 `bat_read_fields` 与人工接管保留：前者提供零模型复跑的字段方法，后者处理登录/验证码/访问限制。

普通前缀缺口记录并继续原生探索；不再在下一动作前用未完成的编译依赖拦截动作。最终有缺口仍不得发布或伪称成功。来源保存/身份/权限失败仍停止。模型或函数失败不生成替代节点、不自动重放动作、不新建重试队列。在线片段不是已发布链路；历史失败来源保持不变。

撤回上一小节“给 B-U 注入祖先结构”的修补：原生模型上下文不再由 action adapter 增加 DOM 祖先或压缩候选；结构证据仍由现有 collector 在 B-A-T 内部采集。下列旧记录是历史决策，凡与本节冲突均已被本节替代。

## 2026-09-28 删除逆序伪反例，保留在线节点主线

Product Alignment：同一确认任务在 B-U 实际动作后在线生成节点；选择输入来自原 DOM 顺序读取，输出仍绑定原 ordinal，复跑普通节点模型 0，不新增网站代码。保留原采集/前缀编译/持久化/画布/样本验证，不退回仅探索或结束后临时补节点。

真实 job `e50ab706-4f6d-422b-825e-e17945e00ee3` 到达第二页，a-0038 返回 ordinal 1..25。a-0039 的 `return candidates[0].ordinal` 用原 QuickJS 执行成功返回 1；同一程序仅因 B-A-T 追加逆序输入被拒绝为 actual25/expected1，随后五次拒绝后 B-U 失败退出。删除这项与读取器 DOM 顺序合同冲突的校验及“输入可能无序”提示，不更换函数实现或放宽真实 ordinal/来源检查。

另外，原 a-0009 结果有标题父级 h3 的结构，但只在 extracted_content；long_term_memory 没有 ancestry 且 include_extracted_content_only_once=false。锁定 Browser-Use 的 MessageManager 优先 memory，因而模型收不到这部分已采证据。复用原 ActionResult 的一次性读取字段来交付既有详情，不另建工具、选择器或 Agent 循环；以真实保存结果经过原 MessageManager 验证，不将仅原始输出中存在信息当成模型已收到。

## 2026-09-28 撤掉与任务规则冲突的选择校验

同一边界补齐空集合反馈：job `82bdbd3b-6d9b-480d-8c7a-5ac36a39dec6` 的原始五次选择请求都绑定到最新空读取，不是函数语法错。原工具现在在 HTTP 校验前明确要求纠正页面查询，不能跳回较早非空读取。保存来源重放五次均返回 `selection_candidates_empty`、HTTP 0；新增针对“旧非空/新空”组合的回归先红后绿。它只证明反馈归因修正，不证明 B-U 会正确恢复，也不替代完整任务验收。

```text
Product Alignment:
- natural-language task: 按确认规则选择条目，包括始终选择第一项或固定页码。
- reusable chain boundary: 真实 DOM 读取 → 需求规则对应的纯函数 → 原始 ordinal 绑定 → 点击。
- runtime inputs: 当前真实候选；不固化样本标题、URL 或临时元素编号。
- dynamic task outputs: 同版任务输出不变。
- generic platform capability used: 原生 B-U 选择工具、原 QuickJS 执行和既有 Function 物化。
- replay model calls: 0；不新增模型、语义裁判或重试流程。
- site/task-specific code added: no
```

上一轮“强制变化、单例另开例外”应删除，不继续堆例外。序号固定不等于写死样本；用户要求第一项时，各个合法输入都返回 1 才正确。额外示例改为可选辅助验证，不以数量、内容变化或序号变化充当语义证明。已有大小上限仅作资源保护，不能解释为正确性门槛。仍保留真实候选执行、schema/ordinal 归属、原始顺序身份检查、QuickJS 沙箱、需求/读取来源绑定及提供示例的实际断言。

沿用已验证来源事实幂等修正，不加大 8MB/超时预算。当前 500 动作合成来源测试不覆盖真实多步采集，不能用于宣布真实采集容量已通过。先让已保存反例经过正式校验入口，再进入实际任务；历史失败不改写。

唯一控件复用原 `unique_query_target` 的同文档/完整查询/单项双读证明，不再要求 B-U 编造业务选择算法。系统派生一个使用既有 Function/QuickJS 的唯一性保护（输入长度必须为 1，否则抛错），随原 `selection_function` 来源进入同一编译器；多项候选仍由需求对应的模型程序决定，已有已验证规则优先，不能以唯一性保护覆盖冲突规则。无新增公共类型、选择器或执行器。原失败 source `d3ee8809-04ca-4aa2-8528-745b0726191d` 的 a-0030 已在内存副本经真实准备准入、attach、编译、TS 物化与 QuickJS 执行：无 gap、返回 1；加入第二候选即失败。该核查不修改 SQLite，也不冒充实际浏览器复跑。

## 2026-09-28 点击前选择证据与在线编译统一

同需求重跑又暴露两个独立不变量：`maxItems=1` 的集合合同不允许任何合法的数量/ordinal 变化，却仍强制这种变化；在线归档重复调用 `SourceObservationScope.attach` 把同一个诊断追加多次。真实 32 动作来源有 2611 个同观察同 ID 重复事实，最终检查点触发 `hybrid_compilation_payload_limit`（不是 selection gap）。仍沿用上面 Product Alignment：前者只在合同本身严格限单例时验证不同内容而非不可能的序号变化；普通集合变化检查不放宽，运行读取超上限仍拒绝。后者复用现有事实 ID 去重/冲突拒绝语义，不提高 8MB 上限、不裁掉真实诊断、不修改旧来源。

```text
Product Alignment:
- natural-language task: 按确认步骤探索，成功动作当场具备节点编译证据。
- reusable chain boundary: 完整候选读取、规则校验、点击、在线编译；适用于导航控件与业务列表。
- runtime inputs: 当前候选和同版确认规则。
- dynamic task outputs: 原任务输出不变。
- generic platform capability used: 原 PreparedSelections、QuickJS 校验与 selection_function 事实。
- replay model calls: 0；沿用固定 Function 节点。
- site/task-specific code added: no
```

最小修正删除“完整单例直接放行”例外，所有已有 queryCandidate/readActionRef 的集合点击均要求匹配已验证规则，并在派发前记录。已有规则不再被提前返回丢弃；未校验时使用原 SelectionMethodRequired 让原生 Agent 在现场补齐，不新建重试循环。重复推进最终虽由 repeat 编译拥有，探索期间仍遵守相同点击准入，避免在 repeat 证据尚未闭合的在线前缀中漏掉节点证据。不改编译准入、不伪造历史规则。旧失败来源仍缺事实，不能靠重新编译将它变成成功。

复用当前锁定的原生 B-U Tools 注册和原 QuickJS 校验，无增删依赖、无新执行器或选择器。定点回归覆盖单例已有/缺失规则、规则 ordinal 不匹配，以及记录进入原 attach/编译路径；随后继续相同已确认真实任务。

## 2026-09-28 拼写提示与搜索结论边界

```text
Product Alignment:
- natural-language task: 保留用户路径；有证据时提示疑似拼写差异，搜索未命中时只报告实际查过的范围。
- reusable chain boundary: 同一需求确认版本到 B-U；用户明确纠正只替换对应输入。
- runtime inputs: 同版草案声明的输入，不引入自动改词。
- dynamic task outputs: 原输出字段不变；失败说明区分本次未找到与目标不存在。
- generic platform capability used: 现有访谈 Skill、原始用户消息、B-U 任务提示。
- replay model calls: 普通节点 0；不新增纠错模型、词典、循环或门槛。
- site/task-specific code added: no
```

仅修改现有提示和交接回归，不引入或替换基础设施。拼写识别为增强能力，不是主流程必过门；发现时说明原词、候选拼写与实际依据，未经用户明确纠正不静默替换，更不能借此绕过指定入口或步骤。未发现时如实保留尝试和范围，不能从局部未命中推断全站无结果或目标不存在。

本轮用户已授权把实际测试词改为 `LangGraph` 并重跑：通过原任务需求对话提交明确纠正，形成新版本，保留旧失败。只执行所属交接测试和该真实任务，不跑全量测试，不用手写节点或修改数据库代替正式入口。

### 正确任务实跑暴露的独立阻塞（未修）

job `aedbccd5-877f-4cb6-8009-5153ac4e7771` 到达 Issues 后停止，保存前缀 sequence32：a-0030 是成功的唯一 Issues 控件点击，a-0031 已读到分页链接；唯一编译 gap 是 `selection_function_evidence_required`。不是找不到仓库，也不是保存服务故障。

诊断复现使用只读 SQLite 中该 job 的 `authoring.build.payload.canonicalRequest`，按 `NaturalCompilationRequest` 解析；由正式 `output_model_for(schema, 'HybridAgentOutput')` 与 `author_tools_for_result_spec(model, request.plan.resultSpec, selection_methods=True)` 创建同一 ActionRegistry，先断言 `registry.schemaDigest == request.actionRegistryVersion`，再调用 `compile_natural_prefix(request, registry, output_schema=schema)`。输出与已保存 `response.compilation.gaps` 完全相等，断言无 gap 稳定失败：`real_online_prefix_not_replayable`。只运行纯编译，不创建 Browser/Agent、不调用模型、不改产品数据库。

进一步缩小至真实 a-0030 的 pre-observation、此前 verified read 与 `PreparedSelections.before_dispatch`：当前 query 为 `nav a#issues-tab`，候选完整且仅 1 项，`uniqueQueryBypass=true`。即使内存中提供匹配规则记录，`selectionRecordedAfterBeforeDispatch=0`；真实 trace 对该动作的 `selection_function` 事实也为 0。对应源码 `selection_tool.py:122-123` 提前返回与 `natural_selection.py:61-65` 强制要求事实不一致。该探针的内存记录只验证提前返回，不补写来源、不冒充真实工具成功记录。后续必须统一唯一控件与集合选择的准入合同，不靠换搜索词、改网站步骤或重开探索碰运气。

## 2026-09-28 需求明确程度修正（实施中）

```text
Product Alignment:
- natural-language task: 保留用户明确的起点、字面输入、步骤及顺序；仅澄清尚未授权的重要业务取舍。
- reusable chain boundary: 同一确认草案到 B-U，不新增计划或执行图。
- runtime inputs: 同版草案声明的业务输入。
- dynamic task outputs: 同版草案声明的输出字段；不冻结搜索所得内容。
- generic platform capability used: Pi 只读工具、来源引用、公共 Question、Markdown 草案、确认事实。
- replay model calls: 普通节点 0；不改探索或运行循环。
- site/task-specific code added: no

Reuse Assessment:
- capability: 区分来源事实与待决选择，并保留原始用户要求到准备阶段。
- existing implementation in repository: createSourceResolutionTools、projectProvidedDraftSources、InterviewCoordinator、syncConfirmedRequirement、browserUseTask。
- mature candidates and pinned versions: 当前锁定的 AI Connect 0.3.2 / Pi AgentSession 0.1.0 / Zod 4.1.8；不换库。
- selected implementation: 扩展现有候选提交工具，允许确无待决或明确委托时随同草案确认；原始用户消息作为同版确认事实传递。
- reused public surface: MainModelTool、现有 authoring parser / Question projector、原事务和 schema。
- B-A-T-owned adapter and remaining gap: 宿主只核对搜索 ID、候选引用、唯一候选与同版草案；明确程度由访谈模型按完整上下文判断。
- license/runtime/platform fit: 不新增依赖、后台服务或平台特例。
- browser/runtime/state ownership conflicts: 不启动第二浏览器；旧轮次/来源保留，新事实随成功轮次提交。
- replay model calls: 0；没有额外语义审核模型。
- rejected candidates and evidence: 原工具对唯一候选一律生成 Question，且原始要求未进入 B-U；不能仅修改措辞或按关键词自动选站。
- focused validation: 明确/模糊/混合/委托的交接回归、引用与确认门、API 类型检查；之后继续原 GitHub 真实任务。
```

已复现旧门允许以仓库深链替换用户指定首页路径，且首页缺引用时反而拒绝。此为内存诊断，不是 B-U 已执行绕路的证据。真实任务尚停在来源题板；本轮保留原历史，修改后继续同一任务。

实施核查补充：来源 URL 已包含确定的协议与主机，因此其无查询根首页可沿同一 resolutionId 追溯；确认门和计划投影共用 `sourceSupportsEntry`。这不是“同站任意 URL 放行”，未引用路径、查询、子域名和协议改变均拒绝。真实第 3 轮草案已保留完整路径，但被旧 exact-URL 门拒绝，此项修正后才继续原轮次。夹具进一步发现原数据库把所有搜索来源强制关联 Question，现仅为 status=open、唯一且成功搜索带 searchId 的候选允许无题板；确认时才选中。新能力没有另起来源语义判断器或计划模型。

## 2026-09-28 在线生成实施：共用规则与保存屏障已接通

承接下方复用评估，依赖与所有权不变：不增加库、Agent loop、浏览器、选择器、队列、表或调度器。B-A-T 新增部分仅承担前缀/完整准入适配、原 fd3/stdin 检查点确认、现有 job 保存与工作区投影。完整编译继续使用原读取活性/消费者重绑/重复折叠；普通运行仍使用原 LangGraph 路径。

实现入口：`natural_compile_actions.py` 为 prefix/final 共用分类；`capture_snapshot.py` 生成不修改原事实的快照；`author_compilation.py` 由原回调驱动；`compilation_control.py` 与 `hybrid-compilation-checkpoint.ts` 实现单批确认；`authoring-build.ts` 核对版本/来源、物化并保存。TS 共用物化拆至 `hybrid-materializer-{source,nodes}.ts`，完整与前缀没有分别维护节点转换规则。快照公开投影不包含 canonical 来源或原模型 history；正式新任务缺在线最终结果时明确失败，原离线重新编译只供显式操作。

### 实施验证及范围

- `online-compilation.test.ts` 从真实 TaskChainAuthoringService 进入原 Python 请求循环和 fd3/stdin，再回 TS 校验、SQLite、候选/原 TaskChainRuntime。普通执行返回不同于探索夹具的新读取值，模型调用为 0；离线补编译 stub 被调用即失败。浏览器动作/模型来源是夹具，不是真实网站，不能证明真实首次探索完成。另验证重复包只有一次保存/ACK、冲突拒绝、保存失败保留前有效快照、异步验证期间取消不覆盖状态、人工恢复先保存 running 再接受下一包、业务歧义回原确认入口。
- Python 编译/采集/回调与 ACK 定点测试保护：原始来源不变、派生事实不重复、无动作 LLM 错误允许原生重试、前缀不伪造终态、消费者/重复依赖严格分类、已派发失败不串接假后态、取消/超时不重发动作。TS 前缀/完整身份、来源、QuickJS、数字词法与原最终关闭/显式离线恢复检查通过。
- 最小 UI 只复用现有卡片/详情与一句状态；`chain-build-projection` 及原只读组件测试共 6 项通过，保护不伪造终点/运行、生成图只读、无草稿时仍有原人工/失败入口。生成片段仅在 preexecuting/compiling 投影，样本/独立验证由正式草稿与本次运行接管，此阶段交接有生产投影验证。API/Workbench package check 通过；真实挂载后的视口/选中保持和刷新尚未测。
- `hybrid-prefix-budget.test.ts` 实际调用 Python 和宿主：500 读取动作、1000 观察，5,610,341-byte 整包；Python 677.7ms，宿主物化 425.6ms；500 节点/499 边。在该形状下低于 8MB/10 秒余量。Function 预算另有包含逆序样例的两端用例，不把全读取性能外推到极端字段/Function 组合、所有平台或浏览器耗时。
- `LOCAL-CHANGES.json` 按实际变动逐项更新，来源校验通过，fork 摘要 `4411251ab85b6f6564728ebccbdfaecf1ec912bca21efad7a39dd8db433aadcd`。没有关闭来源校验、扫描 node_modules、改模型路由或相邻项目。

首次失败及对应处置：共享代码抽取时 TS 类型遗漏在类型检查中修正；UUID 测试改用生产 JSON 入口、方法夹具改回原输出 schema；prefix 的计划身份改为完整入口使用的原 canonical 计划，不采用 Zod 补默认值后的副本；跨进程测试发现 ACK/下一检查点同批到达时旧槽未释放，现为发送 ACK 前释放且旧 finally 只清自己的槽。收尾检查修正生成片段遮住验证阶段草稿的投影范围；新增工作台 SSR 夹具首次遗漏生产 Theme，补同一提供者后验证。unittest 类名和 `typecheck` 脚本名输入错误均属发现阶段失败，改用实际类名/`check` 后通过。以上没有靠新增模型重试、放宽来源或自动离线回退取得通过。

下列为已执行定点入口的复现索引，不要求每次重跑全部：

```sh
# workdir 必须为当前实际 checkout 根目录；不是根级/全量测试。
npm exec --workspace @browser-capture/api -- tsx --test tests/hybrid-prefix.test.ts
npm exec --workspace @browser-capture/api -- tsx --test tests/online-compilation.test.ts tests/hybrid-selection.test.ts
npm exec --workspace @browser-capture/api -- tsx --test tests/hybrid-prefix-budget.test.ts
npm exec --workspace @browser-capture/api -- tsx --test tests/hybrid-authoring-final-close.test.ts tests/preparation-offline-compilation.test.ts
npm exec --workspace @browser-capture/api -- tsx --test --test-name-pattern='保留数字词法' tests/hybrid-offline-annotation.test.ts
npm exec --workspace @browser-capture/workbench -- tsx --test tests/chain-build-projection.test.ts tests/chain-canvas-readonly.test.ts
npm run check --workspace @browser-capture/api
npm run check --workspace @browser-capture/workbench
```

Python 使用受管 `work/upstream-browser-hybrid/.venv/bin/python -m unittest -v`，`PYTHONDONTWRITEBYTECODE=1`、`ANONYMIZED_TELEMETRY=false`、`BROWSER_USE_CLOUD_SYNC=false`；`PYTHONPATH=apps/api/python:vendor/workflow-use/workflows:vendor/workflow-use/workflows/tests`，覆盖 `test_method_source_compile`、`test_natural_prefix`、`test_capture_prefix`、`test_author_compilation`、`test_author_callback_stop`；ACK 测试入口为 `apps/api/tests/test_compilation_control.py`。原 liveness/repeat/readiness 只运行受影响方法，未运行完整目录。

**验收未闭合：** 本轮没有启动产品服务/真实浏览器/模型或真实网站任务；真实新任务从需求到首次复跑、mounted UI、Windows、极端多 Function/字节前缀仍待验证。原 D6 和正式自动转人工等旧缺口不因此消失。后续真实任务必须保留第一次结果和失败，不把同任务修补后的成功计为首次通过。

## 2026-09-28 在线生成文档修订：来源不变，生成快照可更新

开发入口：[边执行边生成节点最小方案](INCREMENTAL_NODE_COMPILATION_20260928.md)。旧文档把“事实不可变”误加成“生成节点全部字段永久冻结”，与现有 `rebind_consumer_readiness`、读取活性裁剪、repeat 折叠及 TS scope/准备动作物化冲突。现已明确采用每步确定性重算有限前缀、整体保存一个可更新快照；prefix 不提前裁掉未来可能被消费的读取，最终完整编译执行原有归一化。不是在全量编译后忽略 gaps，也不是新写另一套编译器。

ADR 0012 原有“只能关闭后编译”同时作限定修订：允许在线纯编译与保存，但最终 source/v3 仍独立留档并核对身份、摘要及关闭事实，之后才进入正式候选与验证。显式离线重新编译保留，不成为在线失败的隐藏后备。架构基准已加对应说明。以下是设计与局部复用证据，不表示新在线入口已实施。

```text
Reuse Assessment:
- capability: 在同一 B-U 代表执行期间，将采集前缀转换并保存为现有节点。
- existing implementation in repository: AuthorCaptureCallbacks/EvidenceCollector、natural_compile、natural_read_liveness、hybrid-materializer/selection、RunnerProcess、job SQLite 仓储。
- mature candidates and pinned versions: 现有 browser-use 0.13.8 / workflow-use 0.2.11 受管 fork；LangGraph 运行层不变。
- selected implementation: 原生步骤回调串行等待；共用现有分类和物化，每步重算有界前缀；一份生成快照、一次保存确认。
- reused public surface: Agent.run(on_step_end)、现有 before_action 接点和 Agent.stop；原有 fd3/stdin、saveJob、节点 schema。
- B-A-T-owned adapter and remaining gap: 非终结来源快照、prefix/final 准入拆分、保存 ACK 与在线最终结果交接；不重写 Agent、浏览器控制、图调度或选择器。
- license/runtime/platform fit: 不新增或替换依赖；保留 workflow-use AGPL-3.0 来源及 Python 3.12/TS 进程边界。Windows/macOS 管道接线本轮未作运行验收。
- browser/runtime/state ownership conflicts: 一个 Agent/Browser；原始事实与未发布投影分开；关闭事实单列；不生成第二执行图/数据库或伪造可运行的部分 TaskChain。
- replay model calls: 普通节点 0；prefix 纯计算也为 0；既有准备注解保留原有有界时机和审计，不每步重新调用。
- rejected candidates and evidence: 永久冻结节点与现有消费者重绑冲突；缓存失效引擎增加第二套编译状态；fd4 最佳努力诊断不能承担保存成功确认；仅删除完整编译 gaps 会绕过终态门。
- focused validation: 下列两个无浏览器/模型探针 exit_code=0；新 prefix 入口、ACK/取消、上界性能、正式首次链路仍待实施验收。
```

### 两项已执行的局部探针

命令均以实际 checkout 根目录为 workdir；只读取仓库源码/夹具，不写测试文件、不启动浏览器/模型。下列命令为复现记录，本轮不会重复执行。

1. 消费者重绑：相同来源重复计算相同，旧来源及旧草稿副本未改变；节点 `s-a-0001` 的 consumerRef 从 `s-a-0002` 合法变为 `s-a-0004`。exit_code=0。

```sh
PYTHONDONTWRITEBYTECODE=1 ANONYMIZED_TELEMETRY=false \
PYTHONPATH=vendor/workflow-use/workflows:vendor/workflow-use/workflows/tests \
work/upstream-browser-hybrid/.venv/bin/python - <<'PY'
from copy import deepcopy
from types import SimpleNamespace
from test_natural_read_liveness import NaturalReadLivenessTests, REGISTRY
from workflow_use.hybrid.natural_read_liveness import prune_unused_queries, rebind_consumer_readiness

trace, initial, ledger = NaturalReadLivenessTests().fixture()
original, source_before, outputs = deepcopy(initial), deepcopy(trace), []
for _ in range(2):
    segments, rows, _, issues = prune_unused_queries(
        SimpleNamespace(trace=trace), REGISTRY, deepcopy(initial), deepcopy(ledger))
    assert not issues
    assert not rebind_consumer_readiness(trace, segments, rows)
    outputs.append((segments, rows))
assert outputs[0] == outputs[1]
assert trace == source_before and initial == original
assert initial[0]['id'] == outputs[0][0][0]['id']
assert initial[0]['postconditions'] != outputs[0][0][0]['postconditions']
print('PASS: deterministic derivation; source and old draft unchanged; same node ID')
PY
```

2. 前缀与完整准入分开：从方法合同夹具去掉终态、只保留首动作/两观察，保持 `completed=false`。现有 `classify_natural_action` 可产出同一个 read-fields 方法；完整 `compile_request` 仍返回 `completed_business_result_required` 且无可执行入口。exit_code=0。

```sh
PYTHONDONTWRITEBYTECODE=1 ANONYMIZED_TELEMETRY=false \
PYTHONPATH=apps/api/python:vendor/workflow-use/workflows:vendor/workflow-use/workflows/tests \
work/upstream-browser-hybrid/.venv/bin/python - <<'PY'
from test_method_source_compile import method_source
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.natural_compile import classify_natural_action
from workflow_use.hybrid.evidence import digest

request, registry, schema, verified = method_source()
body = request.trace.model_dump(mode='json', exclude={'digest'})
body.update(completed=False, finalResultRef=None,
            actions=body['actions'][:1], observations=body['observations'][:2])
trace = type(request.trace).model_validate({**body, 'digest': digest(body)})
prefix = request.model_copy(update={'trace': trace})
segment, paths, issues = classify_natural_action(
    prefix, registry, trace.actions[0], trace.observations[0], trace.observations[1], schema)
assert not issues and segment['operation']['name'] == 'browser.read-fields'
assert segment['operation']['specification'] == verified.specification.model_dump(mode='json')
full = compile_request(prefix, registry, output_schema=schema)
assert 'completed_business_result_required' in [item['reason'] for item in full.gaps]
assert full.controlGraph['entry'] == ''
assert trace.completed is False and trace.finalResultRef is None
print('PASS: partial classification reuses method; final compiler rejects incomplete source')
PY
```

第二项第一次导入失败：测试命令的 PYTHONPATH 未包含 `apps/api/python`，抛出 `ModuleNotFoundError: No module named 'browser_use_runner'`，尚未执行断言。只修正测试命令后继续该探针，生产源码未改。上方复现命令保留成功断言，输出文案简化；原回执另明确 browser_calls=0、model_calls=0。

另一次只选取消费者就绪/读取活性/重复方法的八项 unittest 批次已发起，但未取到终态回执；其通过数、失败数和退出码均未确认，不计入证据，也未重新运行该批次。没有运行全量/根级测试。

边界：探针 1 证明派生节点更新合法，探针 2 证明局部分类可复用；二者都没有调用尚未实现的 `compile_natural_prefix`。实际 prefix 组合、Python↔TS ACK、SQLite 持久化、取消/人工等待、最大规模性能、真实首次准备/复跑仍须按开发文档验收，不能由本节推断通过。

## 2026-09-28 逐动作生成：复用现有编译，先验证增量闭合

以下为本日较早方案的历史记录，其中 G0/G1 路线和“仍待决定增量闭合方式”已被上节及修订开发文档替代；不作为当前实施指令。

开发说明及证据入口：[边执行边生成节点最小方案](INCREMENTAL_NODE_COMPILATION_20260928.md)。本轮为源码核查/文档，不是运行验收或选型已冻结。

```text
Reuse Assessment:
- capability: B-U 执行中将已采集动作及时转换并保存为既有 TaskChain 节点。
- existing implementation in repository: AuthorCaptureCallbacks/EvidenceCollector、natural_compile、hybrid-materializer、RunnerProcess、job SQLite 仓储、React Flow 画布。
- mature candidates and pinned versions: 现有 browser-use 0.13.8 / workflow-use 0.2.11 受管 fork；LangGraph 继续负责正式运行，不替换依赖。
- selected implementation: 复用原生 Agent hook 与现有分类/物化，增加薄的串行保存交接；G0/G1 通过前不宣称可用。
- reused public surface: Agent.run(on_step_end)、既有动作前回调、公开 Agent.stop；现有节点合同与仓储。
- B-A-T-owned adapter and remaining gap: 来源前缀快照、局部闭合、产品保存确认；完整编译的终态依赖仍须先验证拆分。
- license/runtime/platform fit: 保留 workflow-use AGPL-3.0 来源和受管 Python 3.12/TS 进程边界；Windows/macOS 使用现有启动/管道，不新增依赖或重新选型。本轮未作平台运行验收。
- browser/runtime/state ownership conflicts: 同一 Agent/Browser；job 只存生成快照，不建调度器或框架检查点库；LangGraph 职责不变。
- replay model calls: 普通节点 0；准备期既有语义注解独立审计，不新增模型播报或隐式修复。
- rejected candidates and evidence: 不用 fd4 最佳努力诊断保存节点；不以全量编译忽略 gaps 冒充增量；不另加工作流/事件框架，现有 hook、IPC 和仓储已有基础能力。
- focused validation: 先 G0 局部转换与终态一致性，再 G1 正式协议/持久化/普通复跑；本轮未执行这些验证。
```

固定版本源码的 `Agent._execute_step` 在原生 step timeout 之外 await `on_step_end`；新保存确认必须单独有界并可取消。`capture.finish` 有终结行为，`natural_compile` 有完成来源门，终态包含读取重绑/裁剪与重复方法折叠，不能把 hook 可用推论成逐动作节点已经稳定。[B-U 官方 hooks](https://docs.browser-use.com/open-source/customize/hooks)仅佐证扩展点；具体时序以上述锁定版本为准。CodeGraph 工具在本轮会话不可用，采用已知文件定点读取，未初始化或重建索引。

## 2026-09-28 现有 Chrome 接入与同一任务慢速复跑验证（本次真实样本通过）

最终证据：同发布京东收藏任务在用户完成常用Chrome登录后，真实工作台按3000ms节奏产生execution `3da5ada2-ebcd-458b-83ba-27e627213b00` / run `282e2ce8-a69c-42de-8d73-63bb2983e950`，completed，9节点/9浏览器命令/模型0，实际2条结果；cleanup confirmed、原任务窗口交付active。重启API后的持久化与UI结果一致。采用当前SDK连接的适配在这一真实样本成立；未知iframe归属按拒绝处理、验证码和其他网站未测，未声称浏览器环境是历史风控的唯一原因。下列“进行中”描述为各阶段事实，详见PROGRESS最新记录。

追加恢复边界：真实正式运行 c58dde32 在 `function_output_invalid` 后仅 browser_close 未确认；原 close_protocol、child_exit、temporary_directory 均 confirmed。只读核实所属目标已全部消失，原用户页未变。恢复将复用现有 cleanup_execution/运行审计，加上同 execution owner、原控制器退出及其余清理阶段确认门，再通过 CDP 只读 verify_closed 核验目标消失；不终止用户 Chrome、不修改旧业务失败。适用于任意网站的关闭确认，模型调用0。

Product Alignment:
- natural-language task: 沿用用户当前浏览器完成已授权的只读任务，并设置每节点3秒间隔。
- reusable chain boundary: 不可变发布链路保持原样，替换本次执行的浏览器连接/资源所有权适配。
- runtime inputs: 既有链路、业务输入、显式本机CDP端点、execution owner、已有pacing。
- dynamic task outputs: 原发布结果合同，真实页面数量不足时保留实际数量。
- generic platform capability used: 用户浏览器连接、任务标签所有权、检查点、窗口交付与慢速运行。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: browser-use连接现有Chrome，同时只操作本次任务标签。
- existing implementation in repository: Browser/BrowserProfile(cdp_url)、ManagedWindow、RunnerProcess、ExecutionPacingController；已有节点节奏无需重写。
- mature candidates and pinned versions: 当前browser-use 0.13.8/cdp-use 1.4.5/workflow-use 0.2.11；Chrome原生144+远程调试。
- selected implementation: 保持当前SDK及编译/执行链路，用公开CDP连接和目标创建API；补充B-A-T所需的外部浏览器所有权适配，验证前不冻结。
- reused public surface: CDPClient、Browser(cdp_url,is_local=False)、BrowserProfile、Browser.stop、原SessionManager、既有pacing.beforeNode。
- B-A-T-owned adapter and remaining gap: 当前SDK无任务target白名单，connect会遍历既有页，SecurityWatchdog会关闭授权域外页。适配需在manager启动前限制目标池/入口枚举，限制弹窗处理和焦点恢复；不复制Agent loop、connect、selector或调度。
- license/runtime/platform fit: 使用仓库已锁定依赖和Windows当前Chrome，未安装或替换关键库。
- browser/runtime/state ownership conflicts: 用户Chrome进程不可由运行器终止；不得执行reset_automation_tabs；本次只创建/关闭自有窗口，交付只断开；不导出用户Cookie或Profile。
- replay model calls: 普通复跑0，保持原审计。
- rejected candidates and evidence: 直接把cdp_url传入旧启动路径会导航用户newtab并触发域限制关页；已读session.py:1921-1988、security_watchdog.py:73-89。切回BrowserSkill不符合已确定迁移方向。
- focused validation: 先空白页连接/目标范围/清理检查，再真实UI发起同一京东发布任务、pacing=3000；首次失败分别保留。当前仅Chrome连接已成功，任务尚未执行。

连接记录：用户已授权自行处理，不再提问。原生设置页实测开关未勾选；在该页启用后生成9222端口，使用原生连接确认后Browser.getVersion返回Chrome/153.0.8010.53。未请求京东。运行弹窗已设3000ms，证据work/human-existing-chrome-pacing-proof.json；调试连接证据work/existing-chrome-connection.json。官方入口说明：https://developer.chrome.com/docs/devtools/agents/get-started/configuration 。

首次空白验证失败保留：诊断程序在启动生产 Runner 之前的 CDP inventory 连接超时（`TimeoutError:timed out during opening handshake`），现场 Chrome 原生 Allow 确认框尚在；未创建任务窗口、未请求站点，不能归为京东拒绝。用户随后明确已点击 Allow。`cdp-use 1.4.5` 的公开构造器没有握手超时参数；不复制传输实现。适配收窄为在 SDK 已连接、尚未枚举页面的 SessionManager 启动钩子中创建/验证任务页，复用同一连接完成运行、交付前核验和关闭，避免建页/验页短连接。证据 `work/existing-chrome-smoke-proof.json` 按 attempts 保留。

## 2026-09-28 BrowserSkill webdriver 实测补证

- 在已连接的 Chrome 153 中通过 BrowserSkill 创建本次所属空白窗口，实际 evaluate 得到 `navigator.webdriver=false`；随后 session stop 成功，未访问京东。证据 `work/browser-skill-webdriver-proof.json`。
- 与上一轮当前 B-U 正式 ManagedWindow 实测 `true` 对照，现已确认本机 B-S 为 false、当前 B-U 正式入口为 true；下文“未实测 B-S”保留为上一阶段历史状态。
- 首次 CLI 查询因 Windows Job Object 无法独立启动 daemon 而失败；使用 CLI 提示的官方前台模式启动成功，再完成测量。首次失败和恢复方式均写入证据。

## 2026-09-27 BrowserSkill 与当前 browser-use 访问环境差异：实测

### 已证实的差异

- BrowserSkill 已有源码通过 `chrome.windows.create({type: 'normal'})` 在扩展所在浏览器创建窗口，并通过 `chrome.debugger.attach/sendCommand` 控制标签页。结合用户陈述，其此前使用日常浏览器环境；它不需要本项目另起一个独立 Profile 的浏览器进程。证据：`work/browser-skill-diagnostic-source/apps/extension/src/session-manager/agent-window.ts:35`、`browser-driver/chromium-cdp.ts:73`。本轮没有重新连接用户日常浏览器，不能声称实测了其当前页面属性。
- 当前 hybrid 路径使用 `data/browser-profile/default`，与日常浏览器 Profile 独立。`owned_browser` 未指定 executable/channel，由 browser-use 定位器选择；`ManagedWindow._launch` 明确优先定位系统 Chrome，自行拼接启动参数，随后让 browser-use 附加。这是当前集成的两套浏览器启动配置。
- 使用同一个新建临时 Profile、均有界面、仅访问 `about:blank`，分别调用这两个现有生产启动入口各一次，实际读到：

| 属性 | 准备/验证入口 owned_browser | 正式交付入口 ManagedWindow |
| --- | --- | --- |
| 实际可执行文件 | ms-playwright/chromium-1161/chrome-win/chrome.exe | Program Files/Google/Chrome/Application/chrome.exe |
| 页面 UA 主版本 | Chrome/134.0.0.0 | Chrome/153.0.0.0 |
| navigator.webdriver | false | true |
| 页面 innerWidth × innerHeight | 2544 × 1292 | 1249 × 1277 |
| 调试端口参数 | 显式非零端口 | --remote-debugging-port=0 |
| 语言/时区 | zh-CN, zh / Asia/Shanghai | 相同 |

- browser-use 自己的启动参数包含 `--disable-blink-features=AutomationControlled`；自建 ManagedWindow 启动参数未复用 BrowserProfile.get_args。这里只记录已有参数差异，未修改参数或注入脚本隐藏自动化。Google Chrome 官方参数说明确认端口参数 0 会令 webdriver 为 true：https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md 。扩展 CDP 机制说明：https://developer.chrome.com/docs/extensions/reference/api/debugger 。
- 两次空白页探针均清理 confirmed，模型调用 0，没有请求京东。证据 `work/browser-environment-comparison-proof.json`；复现入口 `work/browser-environment-comparison.py`。首次纯配置探针漏传 get_args 所需 user_data_dir，失败后补上临时路径；该失败已保留在证据中。没有新增 tests 文件或运行根级/全量测试。

### 原因判断与边界

- 已定位的工程缺陷是迁移后没有保持浏览器环境一致性：日常浏览器改为独立 Profile；当前准备/验证与正式运行还会选中不同内核版本、启动参数及窗口尺寸。同一路径正常完成验证，不能证明另一种浏览器环境也可完成正式运行。网页可直接看到上述 UA、webdriver 和尺寸差异。
- 既有同任务样本和独立验证均读取了真实收藏结果，正式运行在读取入口候选后、点击派发前失败。故不能归结为 browser-use 完全无法访问京东，也不能把全部失败直接归因于反自动化。窗口尺寸变化也可能影响元素布局/可见性，当前没有失败页面快照证明这一分支。
- 用户报告正式窗口受到反自动化限制；已保存机器错误是 `ordinary_target_missing`。原失败浏览器已关闭，未保留拦截页/挑战响应证据，因此不能确认京东具体读取了哪个信号，不能声称 webdriver 是唯一触发条件。历史 BrowserSkill 评论采集与本次收藏任务也不是同时间、同页面的受控对照。
- 当前排查优先级：统一现有 browser-use/workflow-use 路径的可执行文件选择、Profile 所有权及启动配置来源，使验证覆盖正式使用的环境；在保留真实现场的前提下定位站点响应。不能仅把端口 0 改掉就宣称已修复，也不切回 BrowserSkill。生产实现本轮未改，正式主线仍未验收。

## 2026-09-27 BrowserSkill 既有能力与当前链路接入核对

- 用户纠正：项目就是从 BrowserSkill 迁移到当前 browser-use + workflow-use；这是已确定的技术方向。此前将保留的旧适配器视为“接回主线”的修复方向是本轮判断错误，撤回该建议。后续沿当前栈定位问题，BrowserSkill 的历史成功仅作为浏览器环境、会话连续性和操作节奏的对照证据。
- 用户反馈此前 BrowserSkill 借助日常浏览器可以完成京东采集；历史小样本成功不能被本次正式复跑失败否定，也不自动证明今天的账户/页面状态。
- 当前仓库保留 `BrowserHost` 与 `TaskChainBrowserAdapter`。前者通过官方 `session start --no-focus [--browser ...]` 创建所属会话，每条命令绑定 session，finally 执行 session stop；不是缺少 BrowserSkill 依赖。
- `TaskRuntimeHost.group` 的 hybrid 分支调用 `upstream.withCapabilities`，提前返回；当前已发布 hybrid 链路不会进入后面的 BrowserSkill 分支。这符合已确定的迁移方向，不能据此判为接入断点。已有 BrowserSkill capability 配置为 `mode/operation/arguments/capture`，与当前 hybrid 配置不同；旧适配器存在不构成切回依据。
- 本机公开 CLI `bsk --version` 返回 `0.3.0`；`--help` 正常。首次 `--json status` 长时间无输出，本轮已按确切父子 PID 终止自己发起的查询；保留既有 daemon。后续 `browsers` 未执行，因此当前扩展连接/可用实例仍未核实。没有启动会话、访问京东或读取日常浏览器页面。
- 本轮仅做既有接入核对，没有替换浏览器库、修改指纹参数或重试京东。正式复跑仍失败；不能将历史 BrowserSkill MVP、CLI 存在或适配器存在记为当前产品通过。下一项沿 browser-use + workflow-use 核对准备、样本、独立验证与正式运行的浏览器启动、会话保持及访问节奏差异，定位后修复当前路径；不再以切回旧适配器作为处理方向。

## 2026-09-27 同一来源的重复注解恢复

Product Alignment:
- natural-language task: 分页或滚动任务的代表来源已经保存，但派生方法注解因适配错误未通过。
- reusable chain boundary: 原来源→既有离线注解→新编译结果；不重新运行浏览器。
- runtime inputs: 不可变来源、原缺口、用户发起的重新准备/编译上下文。
- dynamic task outputs: 仅追加已验证的repeat_method派生事实；旧动作、观察、摘要和失败记录不改。
- generic platform capability used: 现有hybrid_annotate RPC、annotate_repeat_method及同一来源校验。
- replay model calls: 0；离线准备注解另计semantic_annotation。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 已保存重复来源的派生注解重试。
- existing implementation in repository: 原生准备已调用annotate_repeat_method；离线compile_offline/recompileHybridSource却只接selection注解。
- mature candidates and pinned versions: 沿用现有Browser-Use模型接口、B-A-T既有注解器和Python/TS证据校验，不新增库。
- selected implementation: 在既有RPC接上同一个repeat注解器；只允许已知可重试重复缺口。
- reused public surface: 原annotate_repeat_method、AIConnectModel、hybrid_annotate、validateNaturalRepeats。
- B-A-T-owned adapter and remaining gap: 只接已有编译生命周期；附加事实必须属于原缺口中的成功读取，旧事实必须逐项不变。
- license/runtime/platform fit: 现有锁定Windows运行时及许可证，无新依赖。
- browser/runtime/state ownership conflicts: 离线compiler不启动浏览器，不接管京东窗口或其他owner。
- replay model calls: 0。
- rejected candidates and evidence: 不重开B-U来重取同一批已存在证据，不手写方法事实，不把index:null改写进原source。
- focused validation: 原失败来源null index生产守卫修前/修后、追加事实完整性拒绝，再同源一次离线注解/编译/真实普通复跑；无新tests文件。

## 2026-09-27 查询属性进入原生模型消息

Product Alignment:
- natural-language task: 从动态列表提取方法，或根据表单控件状态选择操作。
- reusable chain boundary: 既有find_elements结果到下一轮Agent观察。
- runtime inputs: 实际selector/attributes及原生ActionResult。
- dynamic task outputs: 有界摘要中保留实际请求的属性与空串布尔属性。
- generic platform capability used: Browser-Use公开find_elements、CDP和MessageManager。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 已有DOM查询结果的长期摘要投递。
- existing implementation in repository: enrich_find_elements_result仅摘要固定7类属性，遗漏模型请求的style/id/class；if(value)还遗漏空串属性。
- mature candidates and pinned versions: 现有锁定Browser-Use 0.13.8的ActionResult/MessageManager。
- selected implementation: 沿原生结果和有界摘要，仅修请求属性优先与缺失/空串区别。
- reused public surface: ActionResult.long_term_memory、已有CDP Runtime.evaluate、原生MessageManager。
- B-A-T-owned adapter and remaining gap: 已有观察增强薄适配，不复制查询器、Agent loop或记忆框架。
- license/runtime/platform fit: 现有许可证及Windows环境，无新依赖。
- browser/runtime/state ownership conflicts: 同一受管浏览器会话，不新开或转移所有权。
- replay model calls: 0。
- rejected candidates and evidence: SDK实际实现默认include_extracted_content_only_once=false且优先long_term_memory；只把属性写入extracted_content无法交给下一轮，须修现有摘要。
- focused validation: 真实SDK MessageManager与生产enrich入口的修前/修后消息对比，不用mock替代消息消费，不调用模型。

## 2026-09-27 取消原因与资源清理保持独立

Product Alignment:
- natural-language task: 任意准备或浏览器运行超过时间预算、被用户取消时，准确保留中断原因。
- reusable chain boundary: RunnerProcess请求失败边界与独立cleanup报告。
- runtime inputs: 原AbortSignal、pending请求和当前child。
- dynamic task outputs: 原始取消reason，不被子进程退出码覆盖。
- generic platform capability used: Node AbortSignal及既有runner进程清理。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 取消错误归属。
- existing implementation in repository: launch监听abort并调用现有terminate/close，close事件却覆盖原reason。
- mature candidates and pinned versions: 当前Node原生AbortSignal.reason/throwIfAborted；无依赖变更。
- selected implementation: 原生reason直接拒绝既有pending请求，保留原清理路径。
- reused public surface: AbortSignal.reason/addEventListener，现有RunnerProcess.rejectAll/terminate。
- B-A-T-owned adapter and remaining gap: 请求错误映射；注册后检查取消，覆盖临时目录创建期间的取消窗口。
- license/runtime/platform fit: 现有Node/Windows运行时，无新增许可证。
- browser/runtime/state ownership conflicts: 只清理本runner拥有的进程树与临时目录，不修改浏览器控制/任务调度。
- replay model calls: 0。
- rejected candidates and evidence: 无需另建取消框架；真实临时Python runner已复现TimeoutError被覆盖。
- focused validation: 真实RunnerProcess的超时、自定义取消、普通异常退出及cleanup；不调用模型/浏览器，不新增tests文件。

## 2026-09-27 顺序第3项：同页原生推进适配（实施中，未验收）

9ZWvfC真实来源确认准备提示混淆了两种角色：click的查询结果是可操作目标，scroll的查询结果仅是继续谓词。该来源已观测明确结束提示及其隐藏状态，却因“所有eligible controls必须排除隐藏”的反馈拒绝方法。修正仅限通用准备指导：按钮仍须可见可操作；滚动允许按已观察终止标记的非终止状态建立唯一查询，缺标记不能冒充终止，读取仍须新稳定键且依赖实际页面就绪。DOM条件复用原生CSS查询，TaskChain/registry/运行调度均不变；不在平台源码写网站ID或选择器。此项属于上述证据到IR的适配职责，不引入库或自行实现CSS判断。

rnvXxu实际普通复跑已读取62条，末次查询也读到了终态属性，但裸marker查询始终1项，因多一次scroll而TimeoutError。不能把已取得数据或sourceSuccess当运行成功。进一步明确当前IR的唯一语义：重复控制只看查询匹配数量，绝不解读返回属性；持续存在的结束标记必须在selector中编码非终态。该约束同时进入准备指导、读取反馈及重复注解指导；不按站点/selector名称加编译猜测，不给运行末尾追加judge，旧错误source/chain/run均不修改。

Product Alignment:
- natural-language task: 收集分页/增量加载的公开结果，或逐批处理动态列表中的任务项。
- reusable chain boundary: 同一读取、继续条件、原生推进组成复用循环，代表来源必须证明新稳定键。
- runtime inputs: 原有TaskChain输入、完整DOM读取、唯一继续控制、预算。
- dynamic task outputs: 按稳定键累积的所有批次，包括末批；无新数据、含糊目标或预算耗尽保持失败。
- generic platform capability used: Browser-Use原生click/scroll、已有read_fields transition、既有LangGraph loop/append_unique。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 同页按钮/滚动触发增量内容的准备证据与IR适配。
- existing implementation in repository: natural_readiness已生成消费者投影transition；natural_compile保留原生动作；natural_repeat及TS物化却限定navigate/href。
- mature candidates and pinned versions: 沿用当前锁定Browser-Use、workflow-use fork和LangGraph StateGraph，不引入/替换库。
- selected implementation: 上述现有公开原生动作与循环能力。
- reused public surface: Tools click/scroll、已有browser.workflow-step、data.transform、loop及append_unique。
- B-A-T-owned adapter and remaining gap: 证明同文档推进与下一批稳定键、折叠代表动作、绑定唯一继续控制。只扩展版本化证据到现有IR的映射。
- license/runtime/platform fit: 沿用当前许可证/Windows运行时，真实样本验证前不宣称选型冻结或能力通过。
- browser/runtime/state ownership conflicts: 原Browser-Use单会话；LangGraph推进；原持久化不变。
- replay model calls: 0。
- rejected candidates and evidence: 不另建通用循环/等待器；natural_readiness._verified_consumer_readiness已拥有操作前后读取变化条件，现有执行器负责轮询。
- focused validation: 生产编译与物化入口验证新模式、旧href来源兼容及拒绝假进展；再使用真实公开网页验证。不开第二条正式G6，不新增tests文件。

运行时补充：SAME_DOCUMENT证明必须贯穿advance动作前后。此前scope仅在派发前检查，成功回执可把同URL的新document接纳为前驱；现在同一scope实例保存派发文档并在succeed前比较、失败清空，不增加调度器或状态数据库。7项受控生产验证及API check通过（work/repeat-same-document-after-proof.json）。真实按钮候选使用NuGet公开版本列表；其官方page-display-package脚本在加载成功后替换版本表并隐藏按钮父容器，浏览器预检8→55条已观察，接下来才检验自然编译及普通复跑。

真实首次来源qn3bc2又暴露两类不同问题：继续查询忽略控件的隐藏/禁用状态且两次attributes不同，这是来源缺证，继续拒绝并改进通用准备指导；成功原生wait被当作不属于repeat的动作，则应复用已有纯等待/原生回执分类，将有同文档且无副作用证明的准备等待归入支持证据。正式循环仍靠既有read_fields transition轮询，不引入固定秒数等待器；缺回执、换文档或有事件的等待必须拒绝。原来源不可改，也不能把提示词修正算作验收通过。仅完善B-A-T证据映射；复用组件/会话/模型边界沿用上述Reuse Assessment。

第二来源HzfopD仍在事后改查询，停止原样调用模型。最小改进复用Browser-Use ActionResult.long_term_memory，在bat_read_fields成功结果旁提供当前readRef之后宿主已捕获的完整查询参数候选；不改extracted_content摘要、不自动改模型参数、不替模型判断哪个继续条件正确。另用实际Browser-Use registry.create_action_model核实当前ActionModel是Pydantic RootModel，旧normalize_author_action直接查顶层属性而一直没有生效。适配入口应通过Pydantic公开root解包，再执行既有默认属性/viewport index规范化；保留显式参数，不改旧来源。无新工具/注册schema/运行调度或依赖。


本文件只保留当前选型和仍有效的边界。阶段进度见 [PROGRESS](PROGRESS.md)，执行顺序见 [ROADMAP](ROADMAP.md)。

本轮按全项目落实成熟组件复用，职责矩阵、实际反例、保留/替代依据见[PROJECT_REUSE_REVIEW](PROJECT_REUSE_REVIEW_20260927.md)。该审查不以安装依赖数证明系统已完成，也不将阶段性样例代替通用产品目标。

## 2026-09-27 准备函数失败关联：沿原来源定位，不新增tests文件

### 第2项：编译失败仍可沿原需求重新准备

Product Alignment:
- natural-language task: 任意已确认任务的技术准备失败后，沿原需求补充代表执行。
- reusable chain boundary: 保留原来源/失败job；沿既有prepare_task建立新准备，不改需求版本。
- runtime inputs: 当前已确认requirement、failed activity及现有离线恢复诊断。
- dynamic task outputs: 可重编译时仍提供原准备入口，不把来源可读取误当作一定能编译成功。
- generic platform capability used: 现有Radix Button、React条件展示、prepare_task命令与持久化。
- replay model calls: 本次验证0；用户重新准备仍按已有授权边界调用准备模型。
- site/task-specific code added: no。

定点验证：实际WorkbenchContext在失败/compiling/来源可用下渲染，修前仅重编译、无重新准备；改条件后核验两个入口及不可用/运行中分支。后端沿现有真实准备失败消费者命名用例核验技术缺证不回访谈。不上新库，不新增tests文件。

### 后续修复：选择方法在原生探索循环内先验证

Product Alignment:
- natural-language task: 按规则选择列表目标，或选择后续表单操作的对象。
- reusable chain boundary: 当前候选读取→已验证纯函数→原生点击；普通复跑使用同一程序。
- runtime inputs: 当前完整候选、原 ordinal、确认规则与变化样例。
- dynamic task outputs: 本次选定目标与来源关联；方法错误回原 Agent 工具结果。
- generic platform capability used: Browser-Use Tools 注册和 Agent 原生循环、既有 QuickJS Function 验证、同一授权 HTTP 桥。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在实际点击前验证准备方法，避免事后另生成不一致程序。
- existing implementation in repository: `selection_annotation.py` 在来源结束后调用模型；`validateAndMaterializeFunctionDraft` 已由 QuickJS 验证完整样例。
- mature candidates and pinned versions: Browser-Use 0.13.8、quickjs-emscripten 0.32.0、已受管 workflow-use commit 5d2d19fe8835cc86f1bf3e04302a5000d590f249。
- selected implementation: 复用 Browser-Use 原生工具和错误反馈循环、现有 QuickJS；不增加依赖。
- reused public surface: Tools.registry.action、ActionResult、Agent.run、现有 executeFunctionNode。
- B-A-T-owned adapter and remaining gap: 从宿主捕获读取提供不可伪造的当前候选，将已验证程序绑定到后续真实 click 的既有 selection_function；约束是 B-A-T 证据身份，不自写模型循环或 JS 执行器。
- license/runtime/platform fit: 沿用现有许可证与 Windows 受管 Python/Node 运行时；本轮需真实验证。
- browser/runtime/state ownership conflicts: 工具仅计算 JSON，无浏览器或模型控制；原 Agent 继续唯一控制浏览器，编译不再重生这份方法。
- replay model calls: 0；选择校验端点不调用模型。
- rejected candidates and evidence: 上游 DeterministicWorkflowConverter.convert_history_to_steps 逐条处理历史，不拥有 B-A-T 读取身份/Function 证据；BuilderService 产出上游 WorkflowDefinitionSchema 并可包含 Agent 步骤，不能替代当前版本化 IR 及零隐式模型契约。仅复用其浏览器基础能力。
- focused validation: 原失败来源保持原拒绝；生产 HTTP+QuickJS 检查错误样例与合法方法；再走新自然来源、编译、变化输入普通复跑。不开第二条正式 G6，不新增 tests 文件。

Product Alignment:
- natural-language task: 按确认规则选择条目，或计算后续填写/操作所需值。
- reusable chain boundary: 准备生成的纯函数经已有沙箱验证，失败必须关联本次来源中的实际动作。
- runtime inputs: 不可变来源、已有Function segment与真实/变化样例。
- dynamic task outputs: 原失败码和对应actionRefs；不改写样例或放宽校验。
- generic platform capability used: 现有QuickJS验证器、Error cause、CompilationGap。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment: 保留quickjs-emscripten 0.32.0、现有validateAndMaterializeFunctionDraft和gap持久化；仅适配所属动作关联，不引入库、不实现另一个校验器或修复循环。真实失败SfWUgg中程序/样例不一致被正确拒绝，但withSelectionValidation固定写actionRefs=[]，丢失定位。用同一不可变来源经生产离线编译检查失败码、动作关联与原文件摘要；不新增tests文件，不启动浏览器/模型，不把定位改进说成错误程序已能执行。

当前补齐的复用/输入输出依据分别见 [人工等待](HUMAN_WAIT_CLOSURE_20260927.md)、[嵌套选择证据](NESTED_SELECTION_CLOSURE_20260927.md)、[只读画布局部核验](UI_REMAINING_CHECK_20260927.md)。均沿既有Browser-Use、LangGraph、React Flow与产品持久化边界适配，不新增调度器/浏览器控制器或隐式复跑模型。

## 2026-09-27 跨语言原生动作参数的JSON数值等价

Product Alignment:
- natural-language task: 滚动列表选择结果，或滚动表单到填写区域。
- reusable chain boundary: 已绑定原生参数经过公开schema校验后值不变；JSON number的整数/浮点表示不构成改变。
- runtime inputs: 从TS JSON传回Python的原生action参数。
- dynamic task outputs: 合法等价参数继续执行，真实改值仍拒绝。
- generic platform capability used: 既有ActionRegistry、jsonschema、Pydantic。
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: JSON值等价校验。
- existing implementation in repository: ActionRegistry先jsonschema校验，再Pydantic规范化，最后比较Python词法digest；4→4.0被误判。
- mature candidates and pinned versions: 当前已锁定jsonschema Draft202012Validator；不新增依赖。
- selected implementation / reused public surface: 使用公开const schema + is_valid比较JSON值，复用其布尔/数值、数组和对象语义，不自写递归比较器。
- B-A-T-owned adapter and remaining gap: 原input schema门保持；只替换参数校验后的等价判断，不改变不可变来源digest或模型参数。
- license/runtime/platform fit: 沿用当前Python/Windows依赖。
- browser/runtime/state ownership conflicts: 无额外派发、浏览器或模型。
- rejected candidates and evidence: Python序列化SHA不能表达TS number语义；真实source首复跑在scroll pages=4被拒绝。
- focused validation: 真正Browser-Use公开scroll模型接受4/4.5，字符串/布尔拒绝；规范化改值仍拒绝；同来源离线重编译复跑。

## 2026-09-27 导航失败保留本次主文档拒绝

Product Alignment:
- natural-language task: 采集或打开页面遇到认证拦截，保留原现场等待用户。
- reusable chain boundary: 原生导航失败时仍按本次实际HTTP响应归类；不推断登录完成。
- runtime inputs: 同次导航URL及既有Network.responseReceived的Document状态。
- dynamic task outputs: authentication/access/rate typed failure，或原始普通动作失败。
- generic platform capability used: 现有 Browser-Use Tools.act、CDP主文档事件和hybridExternalFailure。
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 原生动作失败后的精确HTTP拒绝投影。
- existing implementation in repository: execute_checked会先抛ordinary_action_failed，Runner只在成功分支检查document_status，真实401未进等待。
- mature candidates and pinned versions: 当前Browser-Use/Chrome CDP已有事件监听；不加网络客户端或第二次导航。
- selected implementation / reused public surface: 单次原生导航前清除目标旧状态；仅ordinary_action_failed时检查本次同URL主文档状态，沿既有capture_*错误映射。
- B-A-T-owned adapter and remaining gap: 只修错误边界；无响应、其他URL响应、陈旧401不能推导认证等待；Basic Auth对话与成功认证仍单独记录。
- license/runtime/platform fit: 沿现有Python/Windows依赖。
- browser/runtime/state ownership conflicts: 不启动Browser、不重派动作、不改已有业务结果。
- rejected candidates and evidence: 根据任意异常文本或旧URL状态猜401会误报；外部HEAD401仅用于选定协议现场，不能充当本次Browser证据。
- focused validation: 本次401/无响应/异URL/陈旧拒绝四种边界，以及真实Runner再次验证。

## 2026-09-27 执行型选择的准备复核边界

Product Alignment:
- natural-language task: 按列表规则打开详情，或选择表单中符合条件的选项后停留。
- reusable chain boundary: 只补准备阶段模型上下文，不修改普通运行完成规则。
- runtime inputs: 已有 AuthorInput.resultSpec.mode、outputSchema、同现场读取证据。
- dynamic task outputs: 可追溯的选择方法或明确缺证；execution 模式无记录列表输出。
- generic platform capability used: 已有 Browser-Use Agent/find_elements/click、准备复核与 Function 选择编译。
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 已确认结果类型传递和动态选择动作的可编译性指引。
- existing implementation in repository: author_step 已接收 resultSpec，_review_completion 未向复核传递结果类型；annotation 只对有完整候选证明的 click 编译动态选择。
- mature candidates and pinned versions: 现有 Browser-Use 0.13.8 与 pinned workflow-use fork；版本/依赖不变。
- selected implementation / reused public surface: 原 Agent 公开工具、既有 CompletionReview/ResultSpec、Function 和严格绑定；无新工具或执行循环。
- B-A-T-owned adapter and remaining gap: 将结果模式/合同送入准备复核，说明空 collectionProofCandidates 对无数据输出并非缺项；仍要求真实范围证据。提示动态列表选链接使用有目标证据的 click，不把代表 href 直接导航当可复跑选择方法。
- license/runtime/platform fit: 沿用现有许可证、Python/Windows/TS 桥。
- browser/runtime/state ownership conflicts: 不增加 Browser，不重置预算/trace，不覆盖旧来源。
- rejected candidates and evidence: 第二次真实来源在执行型任务的续查后索要“记录列表输出”的 collectionProofCandidates；未携带 resultSpec 是明确上下文缺口。不得跳过所有准备复核或伪造 collectionProofCandidate。
- focused validation: 单条生产复核输入边界测试；随后一次相同公开页面的自然来源验证，记录首次失败。

后续明确选择输入的顺序合同：真实基础筛选来源给出正确点击，但模型程序用数组 `.find()` 表达“正文第一项”，被既有保留ordinal的数组重排校验拒绝。原指引仅说明返回原ordinal，未明确数组包装顺序可变、正文顺序由ordinal定义；现只补这项既有合同说明，不改变校验、输入字段或旧来源。纯指引改动定点核对，不新增镜像测试；在新的真实来源上验证，原拒绝保留。

## 2026-09-27 G6：原窗口前台激活的真实回执

### OS 拒绝的 API 与界面反馈边界

Product Alignment:
- natural-language task: 查看采集或表单任务保留的原窗口。
- reusable chain boundary: 聚焦失败独立于已完成链路与结果。
- runtime inputs: 已验证 execution/owner 的显式 focus。
- dynamic task outputs: 固定可读错误；刷新后的原完成状态和租约。
- generic platform capability used: 既有 DomainError 与 TaskChainConnection 状态刷新。
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 精确系统拒绝的安全错误投影与交互反馈。
- existing implementation in repository: UpstreamProtocolError、DomainError、controlBrowserHandoff、controlHandoff/reload。
- mature candidates and pinned versions: 当前 TypeScript/Error、Fastify 错误处理与既有连接；无新增依赖。
- selected implementation / reused public surface: 只在 focus 边界匹配已知 runner code/reason，转为固定 DomainError；刷新后保留本次操作错误。
- B-A-T-owned adapter and remaining gap: 不透传未知异常；不改变已完成结果、active 租约或增加重试。
- license/runtime/platform fit: 沿用现有依赖及 Windows Python 协议。
- browser/runtime/state ownership conflicts: 不控制窗口、不写执行状态。
- replay model calls: 0
- rejected candidates and evidence: 全局异常透传会泄露非公开错误；现有 UI catch 中 reload 成功会清空刚写入的操作失败。
- focused validation: 一个连接回归保护成功刷新后仍显示错误，一个既有 handoff API 测试保护固定映射与持久化结果不变。

Product Alignment:
- natural-language task: 采集结果或填写表单后，保留本次原窗口并由用户打开查看。
- reusable chain boundary: 资源交付证明同 owner/target 仍存在；显式聚焦独立证明 Windows 前台窗口已切换。
- runtime inputs: 已核验租约中的浏览器 PID 和目标，不接受任意窗口句柄。
- dynamic task outputs: 保留的 active 租约，或明确的前台激活拒绝；已有 TaskRun 和业务输出不改。
- generic platform capability used: 既有 ManagedWindow 租约、CDP activate 与 Windows User32。
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 本次受管原窗口的可见性和前台激活回执。
- existing implementation in repository: ManagedWindow._visible_window 枚举 owned PID，但忽略 SetForegroundWindow 返回值，只要窗口可见就报成功；handoff 又直接复用了 focus。
- mature candidates and pinned versions: 当前 Windows User32 系统 API；沿用 Python ctypes，不增加库。
- selected implementation / reused public surface: EnumWindows、GetWindowThreadProcessId、GetWindow、IsWindowVisible、IsIconic、ShowWindow、SetForegroundWindow、GetForegroundWindow。
- B-A-T-owned adapter and remaining gap: 只筛选已核验 owned PID 的可见主窗口，恢复后请求聚焦并核对实际 HWND；拒绝时保留租约并给明确错误。handoff 返回同一已核验活租约，显式 focus 独立验证前台。
- license/runtime/platform fit: 系统公开 API，无新依赖；明确 ctypes 的 HWND/BOOL/LPARAM 类型以适配 Windows 64 位。
- browser/runtime/state ownership conflicts: 不附着其他进程输入队列、不模拟输入、不改前台锁、不重开浏览器；只操作 owned 主窗口。
- replay model calls: 0
- rejected candidates and evidence: 不使用 AttachThreadInput 或按键技巧跨越系统前台保护。Microsoft 明确后台进程即使满足部分条件也可能被拒，不能把 CDP activate 或“窗口存在”作为前台成功证据。
- focused validation: 单个所属 Python 测试文件验证拒绝保留租约、真实前台回执及 handoff 独立性；同一正式 UI 再次 focus 由主 agent 核验，不新建任务/浏览器。

官方依据：[SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)、[GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow)。现场只读诊断确认 owned Chrome PID 1968 有主窗口 HWND 2622766，另一个可见 HWND 1574350 是主窗口的 owned 辅助窗口；前台仍为 PID 19260。原两次截图门 `owned_window_not_foreground` 保留，具体 OS 拒绝条件不能仅凭此诊断断言。

## 2026-09-27 G5：Profile 所有权与浏览器检查点关联

- Profile 的 Product Alignment / Reuse Assessment：账号窗口维护是登录后查阅、表单等任务共有的资源所有权门；复用既有 ManagedWindow.start/handoff/end/inspect、RunnerProcess 分阶段清理和 psutil 身份核验。只新增私有 owner 适配，持久化 controller/Windows launcher 的 PID/创建时间/exe 与目录 owner token；旧空记录保留明确拒绝，不新增进程控制框架。TS 6/6、Python 10/10；真实临时窗口在两次适配失败修正后完成 open→handoff→重建 service→recover，零模型调用、共享 Profile 保留、finally 清理确认。
- 检查点的 Product Alignment / Reuse Assessment：多页读取、表单等链在纯计算节点后恢复，需要精确浏览器前驱；复用原 TaskCheckpoint/finished event、digestJson 和 LangGraph 运行驱动，只增加可选 browserNodeId/browserStateDigest。末事件不能代表末浏览器动作，单 nodeId 不能绑定具体摘要；新关联必须独立核验最新回执/同 invocation/现场身份，无 pendingEffect，旧缺字段不猜。生产 runtime 无浏览器测试 6/6，另 4 个现有恢复用例通过；真实已编译链恢复脚本已备，尚未运行。

两项均不新增网站专用代码、模型调用或第二份检查点存储；版本、许可证与 Windows 运行条件沿用既有依赖。完整设计、首次失败及未测项见 [PROGRESS](PROGRESS.md) 的两个 G5 所属小节；Profile 原始失败和成功结果保留在 `work/profile-owner-smoke-*.json`。

## 2026-09-27 G1：F1 调用身份与 F4 发布事务

Product Alignment:
- natural-language task: 任意浏览器任务的同一条已确认链路可按参数复跑，已验证草稿由用户手动发布。
- reusable chain boundary: `invoke` 的每次调用绑定父运行、节点、外层执行现场、子链完整版本和本次输入；发布绑定唯一草稿修订、不可变 Release 与同请求回执。
- runtime inputs: 父执行 binding/idempotencyKey、当前子链/输入、草稿 revision/checksum 与 publish requestId。
- dynamic task outputs: 独立子链输出或明确身份冲突；单次发布事实和可幂等读取的同一回执。
- generic platform capability used: 现有 TaskChainRuntime、LangGraph 检查点、SQLite/Drizzle 事务和 Zod；不新建缓存或发布状态机。
- replay model calls: 普通复跑只在显式 `llm` 节点调用模型；F1/F4 都不调用模型。
- site/task-specific code added: no

验证设计：F1 用生产 TaskChainRuntime 区分同子链的不同 invoke 节点、输入、版本及外层循环，同时确认同次恢复不重派已完成副作用；F4 用隔离 SQLite 的真实发布入口注入请求回执写入失败，核对 Release/草稿/回执同成同败、同 ID 同内容重试幂等、同 ID 不同内容被拒。两项各做最小所属验证，静态类型和单个 helper 不能替代真实入口。现有运行器、仓储和事务提供所需通用能力，无关键库引入、替换或删除。

## 2026-09-27 G2：F2 缺结果形状与 F3 选择注解拒绝

Product Alignment:
- natural-language task: 用户用业务语言确认要得到单条、列表或其他形状；准备阶段只能从真实页面证据提炼可复用选择方法。
- reusable chain boundary: 唯一确认草案及同版来源不因缺字段或缺证被改写；编译只消费合法方法或明确 gap。
- runtime inputs: 模型原响应、当前需求版本、固定来源的选择候选和实际证据；不把猜测默认值当运行输入。
- dynamic task outputs: 合法草案/方法，或可定位的缺项/缺证/服务错误，均经现有状态与审计保存。
- generic platform capability used: 现有 Zod 准入、Pi 结果解析、workflow-use SelectionProgram/QuickJS 和 B-A-T 编译 gap；不新增 Agent loop。
- replay model calls: 普通复跑仅显式 `llm` 节点；F2/F3 属访谈和首次编译，失败不触发额外模型重试。
- site/task-specific code added: no

验证设计：F2 从真实草案解析消费者输入合法数据形状与缺失形状，核对旧版不覆盖且给具体拒绝；F3 在现有 selection_annotation 生产者→来源→编译消费者区分成功方法、证据不足和服务故障，拒绝不得伪装为成功。沿现有公开结果边界做最小扩展；不引入/替换关键库，保留 vendor 工作流的 QuickJS 校验与真实来源审计。纯解析定点样本不代表模型稳定性或正式浏览器验收。

## 2026-09-27 G3：F5 精确搜索引用与读取响应减法

Product Alignment:
- natural-language task: 访谈按需只读搜索并让用户确认真实来源；准备从真实页面证明一次可复用读取方法。
- reusable chain boundary: 来源提案只引用本轮模型确实可见的指定搜索调用和结果；读取的代表样本仍由宿主保存并进入同版编译证据。
- runtime inputs: 模型选的调查对象、原样查询、搜索调用/结果引用，以及读取方法的 DOM 投影参数；数量和 proof 由工具事实推导。
- dynamic task outputs: `none/unique/multiple` 来源 Question 或明确引用错误；短模型读取回执与完整宿主证据对应的可验证来源。
- generic platform capability used: 现有 Pi MainModelTool、搜索事件旁听、Zod、Browser-Use ActionResult、workflow-use ReadSample 与编译验证；无新搜索或浏览器框架。
- replay model calls: 搜索属于访谈，读取属于首次准备；普通复跑只在显式 `llm` 节点调用模型。
- site/task-specific code added: no

真实交接字段表：`search_sources` 已把 `searchId/results[].id` 放进模型可见文本，宿主另外持有原 URL/标题/摘要和调用记录；现行 proposal 却重复生成 `searchTool/query/outcome/candidateUrls`，按同词选末次搜索。Pi `web_search` 模型可见原结果文本，宿主旁听产生的候选 ID 尚不可见。新 proposal 只让模型给 `subject/query/searchId/candidateIds`；宿主从精确调用记录推导 provider、URL、数量分支并保存，`query` 必须是该调用的原样查询。Pi 通过现有 MainModelTool 暴露完成调用的精确 ID 和可选结果 ID 后才准提交；后备直接使用原本可见 ID。业务相关性仍由模型判断。用户 Question 和历史来源保留原摘要/URL；缺引用不回退到“同词最近一次”。

`bat_read_fields` 模型输入保留 `outputPath/container/fields/maxItems`，宿主从最终输出合同推导类型/读路径。当前模型响应含整个 `ReadSample`，其中 `specificationDigest/outputDigest/pageIdentity/documentRootId/containerIdsDigest` 是宿主内部证明，模型只需 `readRef/outputPath`、至多三条代表值和当前 DOM 覆盖提醒；完整 ReadSample 保留在 `MethodReadRecords`，编译继续校验原始样本、文档身份、digest 和覆盖。缩短可见响应不是把证明移入内层字符串。验证采用生产工具边界的同词多次搜索、未展示 Pi 引用拒绝、题板/持久化投影，以及读取工具→证据验证→编译映射的所属现有用例；这些用例不证明真实 provider 的稳定语义或真实浏览器页面。

## 2026-09-27 G4：正式能力路径与缺口矩阵

矩阵按当前生产源码核对；“已有路径”仅说明代码可达，所需真实样本另列。受管真实浏览器定点样本使用独立临时 Profile：`managed-window-runner.acceptance.ts` 1/1 证明原窗口同 owner/target 在 Runner 退出后恢复与结束；`hybrid-interaction-read.acceptance.ts` 1/1 证明点击后态等待、读取与遮挡后处理在同一会话，普通动作模型调用 0。这两项没有生成新 source、编译完整业务链或创建正式工作台任务。

| 能力 | 当前生产者 → 持久化 → 编译 → 运行 | G4 结论 / G5 最小缺口 |
| --- | --- | --- |
| 1 按需访谈/来源/题板 | `InterviewCoordinator.runShared` + Pi/后备工具 → ProductStore messages/aiEvents/sourceResolutions/drafts → `syncConfirmedRequirement`/`projectPreparationPlan` 同版入口 → `TaskChainAuthoring.explorePlan`。 | 静态路径连通，G3 精确 ID/SQLite 定点通过；新版真实 Pi、全阶段 UI 与重启服务未测。 |
| 2 局部 query 与业务范围 | workflow-use `author_step`/完成复核可沿同 Agent/Browser/job 有界 `add_new_task` → source/v3 artifact → `recompileHybridSource` → fixed chain。 | 代码有续查边界；多组/跨页真实范围证明未测。`authoring.ts` 先以 `sourceSuccess=false` 抛通用错误，再检查 `confirm_intent` gap，业务歧义返回访谈可能被遮蔽，需定点修。 |
| 3 action/read/document/后态 | B-U `EvidenceCollector`/ActionDispatchAudit → source/v3 原文 → `natural_compile` 裁剪/补消费者后态、`hybrid-materializer` 证据校验 → RuntimeHost/普通能力。 | 真实 Runner 点击/后态/read 1/1；本轮同版真实 source→裁剪→编译→运行未测，模型 `done` 不能代替证明。 |
| 4 方法/选择/重复/累积 | `method_read_tool` 与 `selection_annotation` → 代表样本及 source → `natural_selection`/TS 选择 Function → QuickJS；Runtime 有 loop/condition/accumulator。 | 动态选择有代码路径、缺证可拒；`natural_compile_result` 对重复签名给 `repeated_operation_reuse_unproven`，只建 linear graph，TS authority/control loops 为空；**真实来源到循环未接通**。不能把运行器已支持循环说成任务已支持跨页/重复。 |
| 5 定位/一次派发/等待/取消恢复 | `RuntimeHost.group` → hybrid runner → `OrdinaryCapability.execute_checked` + TargetResolver/StepVerifier → checkpoint + owner 验证。 | 同会话点击、后态、读取受控样本通过；稳定定位、取消后副作用计数/恢复以及不同 DOM 时失败仍需真实受管样本。普通 `bat_scroll_to/bat_wait_for` 存在，首次创作工具入口尚未核实，不计已接通。 |
| 6 人工等待 | `TaskPlanExecutor` 的 human_wait handoff → execution/browserHandoff/cleanup 与事件 → `resume_execution` 原现场门 → UI `ExecutionActions`。 | 代码不允许正式运行在原 lease 未 active 时静默重开；真实人工等待/取消/重启恢复未测。 |
| 7 原窗口交付与清理 | plan `browserHandoff=keep_open` → execution owner/lease/targetDigest → Runner `handoff`/`managedWindowAction` → UI 聚焦/结束。 | 同 owner 原窗口真实测试 1/1；Profile `close()` 的 `finally reset()` 会把未确认清理误报 closed，需修。正式任务原页可见及 TaskRun/cleanup 分离待 G6。 |
| 8 彻底删除 | `/api/tasks` DELETE → `TaskDeletionService` 查 idle/owner、Pi sessions/journal → `ProductStore.deleteTask` 定向 operations/业务表；共享配置不在删除表。 | `source-lifecycle-diagnostics/<owner>.jsonl` 用 job.id 或 job.browserRunId 命名，删除服务未覆盖；需按任务真实 owner 精确清理、两任务隔离及重启核验。旧无 owner 回执仅可按存活事实归属，不能猜测归属。 |

G4 的矩阵已给 G5 确定适配范围；重复方法、歧义回访谈、Profile 未确认关闭和来源诊断删除是当前明确缺口。真实来源的跨页方法、取消恢复及正式 UI 尚无证据，G4 的全能力行为退出门仍未通过；G5 只沿现有组件补缺并取得这些证据后才重新判门。无新库选型，本轮只读审查及既有受管 Runner 样本不引入/替换关键组件。

## 2026-09-27 G5：按 G4 矩阵接通缺口的改动边界

### 重复方法适配的具体实施边界（进行中，尚未验收）

2026-09-27 G6 真实来源离线复核（实现前）：`work/g6-valid-source.json` 保留原始成功来源；Python 编译零 gaps，TS 首次拒绝为 `hybrid_repeat_advance_binding_invalid`。差异已定位为推进动作显式携带 `new_tab=false`：URL 仍是已验 `repeat_destination`，另一个 `authorized_constant` 由该动作的 `natural_binding/native_parameter` 事实证明。TS 把推进绑定总数固定为 1，误拒合法同 tab 参数。拟仅额外接受唯一 `new_tab=false` 常量，继续经过现有 `assertNaturalBinding` 的事实与 proofRefs 校验；URL 动态绑定、同 tab/页面谱系和未知参数拒绝规则保留。不引入库、调度或网站分支，不改来源，不以当前失败推断正式验收通过。

Product Alignment:
- natural-language task: 读取分页记录或分批列表，按已确认结果中的稳定来源键汇总。
- reusable chain boundary: 一个尾部收集步骤复用同一读取、继续查询和推进动作；代表样本不会被展开成固定页数。
- runtime inputs: 当前页 DOM、每轮新查的继续地址、已确认结果合同与现有执行预算。
- dynamic task outputs: 完整累计值，或保留运行检查点的失败/预算耗尽；最后一页先累积再判断结束。
- generic platform capability used: 已有 verified_natural_read、普通导航、loop.repeatCondition、append_unique、LangGraph 和 output assembly。
- replay model calls: 仅准备阶段至多一次结构化方法注解；普通循环零模型。
- site/task-specific code added: no

实现选择：模型只引用真实读取/查询/推进动作及稳定键路径，宿主核验同构 ReadSpec、单个继续地址、至少一次实测转移及第二页同方法读取和完整继续查询、全部动作归属；来源保存 `repeat_method` 事实。最后 `advanceActionRef=null` 只表示代表采样结束，不表示终页：最后查询可以非空，只有完整查询实际为零才记录“已观察终页”。Python 将代表样本折叠为已有能力节点并生成控制图，TS 再验来源与图后物化现有 loop/branch/accumulator。首次循环先读，后续循环在预算门通过后才推进；每轮返回先累积，复跑只有完整继续查询为空才正常结束，预算耗尽保留失败和累计检查点。已有 StateGraph/loop 足够，继续沿下方 Reuse Assessment 的组件和许可证，不新增调度器或浏览器控制器。准备无需预抓到终页；可选终页探查仍须有实测 owner/URL，不能省略未知副作用。首版仅接受一个尾部方法、显式 scalar 稳定键和可证实的地址推进；按钮状态、滚动加载、多个重复方法仍须明确缺证。

Reuse Assessment（代表样本边界增量，无新库）：沿用已审查的 LangGraph StateGraph、`read_fields`、`data.transform/deduplicate`、`loop.repeatCondition` 与 `append_unique`；组件版本、许可证、Windows/会话所有权不变。B-A-T 仅修正重复方法证据的准入：两页正例与一次真实推进即可证明可复用方法，所有非空继续查询（包括最后代表查询）仍须指向唯一合法地址，不修改来源 ReadSpec、稳定键、预算或运行调度。复跑模型调用仍为零。最小新增验证：Python 编译正反例 1/1、Python→TS 生产桥 1/1；新桥最后完整查询仍有 4 个同值链接，明确 `terminalObserved=false`，非法地址/两个目的地拒绝。首次 Python 验证如实拒绝旧的强制空终页规则，修正后通过；没有修改任何失败真实来源，也未以此替代真实浏览器或 G6 验收。

2026-09-27 真实页面补证：GitHub 发布列表的完整 Next 查询返回4份相同 href；单元素 max_results=1 会截断，不能作为唯一目的地证明。现复用既有 data.transform 的 deduplicate，完整查询后按 href 去重，输出合同最多1个目的地；新派生 repeat_destination 仅在整份重复方法证据核验后成立。普通值绑定的唯一路径规则保持；两个不同目的地必须在推进前拒绝。完整性继续依赖现有 read_fields 的 includeOrdinal/requireComplete 拒绝截断，不添加第二个DOM读取器。原失败来源不重写。

最小验证：完成接口错误码与两次复核原因持久化；方法正反例、来源篡改/遗漏动作拒绝；编译后的真实 TaskChainRuntime 在变化数据中重新查询、累积末页，并在推进前执行预算门。浏览器真实来源、正式 UI 和 G6 必须另有证据，单元测试不替代这些门。

复核更正：现有证据证明 G5 尚未实现和验证，不证明技术上无法解决。三页受控样本只覆盖基础读取/翻页。原始 done 回执显示 `[r1,r2,r3]` 被完成接口拒绝，后续分别选择 r3/r1 只返回一页；同路径读取冲突被 `AuthorTools.done` 的统一错误码掩盖。完成复核的详细拒绝理由未持久化，不能从通用 gap 推定具体语义根因。下一步应修清代表样本、重复方法与完成引用的契约衔接，并补可追溯的失败事实，而不是原样增加模型试跑；当前不能宣称正式产品通过或问题不可解决。

Product Alignment:
- natural-language task: 用户确认普通浏览器任务后，从真实页面方法执行可复跑链路；多组记录逐组处理，必要时人工处理并在原现场继续，最后能看原窗口和彻底删除本任务。
- reusable chain boundary: 每个业务主步骤只有一条参数化链；同版 source 的重复方法映射到现有 loop/condition/accumulator，已发布版本与独立运行不改写。
- runtime inputs: 当前需求/计划/来源 digest、实际页面选择与读取方法、执行 owner/lease、每轮变化输入和用户显式控制。
- dynamic task outputs: 可证明的每轮累积或明确 gap/limit/等待/清理；准确窗口交付、删除回执与本任务私有文件清理。
- generic platform capability used: 现有 Browser-Use、workflow-use 原生 capture/selection/read、B-A-T IR、LangGraph StateGraph、SQLite 事务、Pi session store 与受管 Runner；不另造浏览器控制或调度器。
- replay model calls: 普通复跑只允许显式 `llm` 节点；首次方法注解独立审计，循环/删除/清理不暗中调用模型。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从真实重复方法的同版证据编译可复跑循环，并由已有运行器推进、取消、恢复和累积。
- existing implementation in repository: workflow-use capture/natural compiler 与 Browser-Use 工具持有动作/读方法；`packages/runtime` 的 loop/condition/accumulator 和 LangGraph StateGraph 已负责推进及检查点；TS materializer 负责 B-A-T IR 映射。
- mature candidates and pinned versions: 保留当前锁文件固定的 Browser-Use、workflow-use fork、LangGraph、Zod；不新增/替换库，具体版本以本 checkout 锁文件和 fork 清单为准。
- selected implementation: 只在自然来源证据→现有 IR 映射补可证明的循环，不复制 graph scheduler、Agent loop 或读取/定位实现。
- reused public surface: 现有 source/v3、workflow-use compiler/capture、`TaskChainRuntime`/LangGraph 与 Browser-Use 原生 action/read。
- B-A-T-owned adapter and remaining gap: 固定来源身份、方法绑定、每轮输入输出/稳定键及审计；自然重复合同与真实跨页验证尚待最小样本确认，不预写第二套 DSL。
- license/runtime/platform fit: workflow-use fork 已保留 AGPL 许可证和来源清单；当前受管 Windows Runner 两项真实浏览器局部测试通过，跨平台未测。
- browser/runtime/state ownership conflicts: 同一 execution 一个受管浏览器 owner；人工等待、交付租约及 Profile 清理各自保持可核验状态；不借现有归属不明的 Chrome。
- replay model calls: 循环只运行固定普通节点；模型调用仍限显式 `llm`。
- rejected candidates and evidence: 自写循环调度器会与现有 StateGraph 重复；把重复项展开成 N 条链会破坏参数化复跑；模型逐项操控页面会破坏普通执行器边界。
- focused validation: 当前只完成 G4 矩阵和受管 Runner 的窗口/动作局部样本；循环需真实来源、编译、变化数据复跑与最后一轮累积/limit 证据后才冻结。

局部故障进展：`BrowserProfileService.close()` 未确认时保留 busy 状态并以私有标记跨服务重启阻止误报可用；现有 Runner close 缓存结果、丢弃句柄，重复调用不是有效重试，独立资源核验和恢复入口仍待完成。删除已按 task 的 job.id/browserRunId 精确清理来源诊断且保留其他任务/共享 Profile；准备遇仅含 `confirm_intent` gap 会回需求对话，缺证/服务故障不伪装成业务歧义。隔离 service/SQLite/文件定点通过，真实窗口、产品任务删除与重启恢复未测；不以类型检查替代。

G5 真实来源审查结论：隔离三页受控现场第三次生产 Runner 采集确实包含两次 Next 点击、三次成功读取与终页无 Next 查询；但最终 `sourceSuccess=false`，`trace.completed=false`，输出只有首个代表标题，复核 gap 为 `completion_review_after_continuation_unresolved`。两个点击的 `selectorIndex` 分别为 19/42，虽然历史 XPath 同为 `html/body/main/a`，宿主 `dom_structure` 明示 `query_candidate_unavailable` 和 `upstream_dom_coverage_not_proven`；终页的完整查询不能反推前两页的动态选择方法。当前来源没有可验证的循环体、继续/停止条件、每轮累积和稳定键合同；将重复动作按 XPath 合并或把已访问的三页展开成三条链都会猜测方法。故不冻结 loop 映射、不把被拒来源伪装成可编译来源；G4/G5 行为门仍未过。独立 Profile 清理恢复也缺确切 owner 核验面，不能因标记存在就自动清除。详见 PROGRESS 的三次首次失败、局部验证和未测项。

## 2026-09-27 先删后写实施：D1 智能修复退役的产品边界与验证设计

Product Alignment:
- natural-language task: 普通用户确认浏览器任务，准备可复跑链路，查看失败事实，并手动发布已验证草稿。
- reusable chain boundary: 唯一确认草案、同版来源、一个活动 TaskDraft、不可变 Release 和每次独立 Execution；退役另外一条模型改链候选流程。
- runtime inputs: 已确认需求、明确的运行参数与当前链路版本；调整反馈不再作为普通运行输入。
- dynamic task outputs: 来源、草稿、样本及独立复验、正式运行结果和准确的失败/等待/清理事实。
- generic platform capability used: 现有 Pi、Browser-Use、Zod、SQLite、LangGraph 和工作台组件；只移除智能修复专属消费者，不替换基础设施。
- replay model calls: 普通复跑仅显式 `llm` 节点可调用模型；需求访谈、准备注解独立审计，智能修复模型调用退出。
- site/task-specific code added: no

验证设计：先核对调整命令的生产者/消费者和共享作业、取消、草稿发布职责；改动后运行受影响 package 的类型检查、旧调整命令拒绝及普通草稿/发布/失败路径的最小现有用例。类型检查只能证明接线和类型，不能证明真实浏览器或正式产品闭环；UI 动态阶段仍留到 G6。

## 2026-09-27 D2/D3：手工写图、人工拾取与布局写入退役

Product Alignment:
- natural-language task: 用户确认任务后查看由真实来源编译的草稿/发布链，并从同一画布试跑、发布和再次运行。
- reusable chain boundary: 唯一草稿与不可变 Release 共用一张只读动作图；取消普通用户写节点、改路线、拾取 selector 和拖拽保存布局的第二条创作路径。
- runtime inputs: 确认需求、同版来源、草稿/发布版本及本次业务输入；画布位置不是运行输入。
- dynamic task outputs: 节点说明、阶段及运行事件、试跑/正式运行结果；查看或缩放不改变 revision/checksum/验证事实。
- generic platform capability used: 保留 React Flow、既有自动布局、BrowserProfile 登录、B-U 原生动作/TargetResolver、IR/绑定校验及 LangGraph。
- replay model calls: 普通复跑只允许显式 `llm` 节点；移除编辑/拾取不引入模型代替操作。
- site/task-specific code added: no

验证设计：先从现有调用链确认写图、拾取和布局保存是专属消费者；删除后检查合同/API/Workbench 及必要 Python runner 边界，定点覆盖草稿创建/试跑/发布、账号 Profile 以及草稿/Release 同一只读节点说明。验证查看、平移、缩放不产生 `save_task_draft` 命令；类型检查及静态组件验证不能代替真实浏览器或 G6 工作台验收。

## 2026-09-27 D4：旧格式读取退役

Product Alignment:
- natural-language task: 用户从当前工作台查看同一任务的来源、草稿、已发布链路及本次或历史运行事实。
- reusable chain boundary: 当前 source/v3、TaskDraft、Release、Execution 作为读取权威；旧 plans/chains/executions 原文读取和诊断摘要退出产品入口。
- runtime inputs: 当前任务 ID、发布版本及 execution 引用；历史旧表原文不是运行输入。
- dynamic task outputs: 当前可审计来源、结果和事件；旧格式摘要不再混入用户诊断。
- generic platform capability used: 既有 SQLite schema/migrations、Zod、当前仓储和工作台按需历史；迁移结构和防重复导入标记保留。
- replay model calls: 普通复跑仍只允许显式 `llm` 节点；删除只读旧格式入口不增减模型调用。
- site/task-specific code added: no

验证设计：沿 `legacyOriginal`、`legacyContractRows`、诊断 `legacy` 字段和路由的真实消费者删除；保留必要的旧库迁移与导入标记。用所属包类型检查及定点仓储/历史/诊断用例证明现行记录可读、旧路由拒绝或不再注册。类型检查不能证明运行态产品历史或重启后的实际持久化，后者留到 G6。

## 2026-09-27 U01–U35：主线界面收敛

Product Alignment:
- natural-language task: 用户从需求对话确认草案、生成并试跑链路、手动发布、再次运行、查看结果及原窗口。
- reusable chain boundary: 工作台只投影一份确认草案、活动草稿、不可变 Release 和单次 Execution；页面减去重复展示，不增加产品状态或第二份执行图。
- runtime inputs: 当前草案/发布引用、本次业务输入及用户明确触发的确认、运行、等待、清理和删除操作。
- dynamic task outputs: 真实搜索/题板、阶段进度、节点事件、结果、失败、原窗口与历史审计。
- generic platform capability used: 现有 Radix、AI Connect Timeline/Question Panel、React Flow、服务端投影和 SQLite 事实源。
- replay model calls: 普通复跑只允许显式 `llm` 节点；展示减法不引入模型判断。
- site/task-specific code added: no

验证设计：逐项从现有 UI/回调/投影核对重复内容与共享职责；静态文案只做定点差异，跨组件/合同的变化做 Workbench 类型检查和所属现有用例。U11/U12 未证明的共享组件重复先核对真实渲染，不先改合同；U28/U33/U35 只核验保留。成功/失败/等待、原窗口、删除确认及即时反馈必须仍可达。动态全阶段 UI/API/SQLite 与重启证据留给前置门通过后的 G6，不提前造任务截图。

U26/U27/U28/U34 补充边界：用户在本次原窗口处理登录或等待并继续，输入是所选 execution 的 ID/sequence、handoff owner/lease 与 Profile 状态；输出是本次运行结论及窗口可用事实。复用已有 resume/cleanup/cancel/handoff/Profile 命令，不修改 IR；普通复跑模型调用仍只来自显式 `llm` 节点，不加入站点特例。检查 UI 文案时区分 TaskRun 结论、窗口交付与清理结论，不把 Profile 未知或失败关闭显示为空闲。

## 2026-09-27 基础设施与模型交接的只读审查

用户要求先核验基础设施正确性和充分性：非 LLM 环节必须按明确输入、版本及现场条件返回结果或错误；模型只承担必要语义，宿主能确定或推导的事实不重复交给模型填写。逐环节证据、四个确定边界问题及字段减法见[基础设施审查](MAINLINE_METHOD_COMPILATION_GAPS.md#8-基础设施正确性充分性与-llm-字段所有权审查)。本轮仅审查和记录，未修改生产代码、运行验证或冻结新选型。

后续修复继续复用已存在的调用进度/输入摘要/循环身份、SQLite 事务、草案解析与来源失败保存、原生 Tools 和已有注解边界。不新增依赖、控制器、调度器或平行计划；既有 TargetResolver、OrdinaryCapability、StepVerifier、ReadSpec 和 LangGraph 职责应保留。

模型负担按真实工具调用和模型响应核对：AuthorInput/source/v3 是宿主协议；search_sources 的 ID 确实进入模型工具结果，原生 Pi web_search 的宿主 ID 则没有。不能从“宿主有字段”直接推断“模型能引用字段”。可推导的来源 outcome 及模型不消费的内部读取证明是明确的精简候选；完整动作能力和正式入口尚未接通的高级合同应分别记录。

## 2026-09-24 新建任务恢复实施边界

Product Alignment:
- natural-language task: 从已确认的浏览器需求继续生成可复跑草稿；准备失败时说明准确原因并从原阶段恢复
- reusable chain boundary: 一个 Requirement、一个活动 TaskDraft、显式 Release、每次独立 Execution
- runtime inputs: 当前确认需求、原计划候选、草稿 revision/checksum 与本次运行输入
- dynamic task outputs: 合法 TaskPlan、Browser-Use 来源、候选链、试跑和正式运行结果
- generic platform capability used: 现有 AI Connect、Pi AgentSession、Browser-Use、workflow-use、LangGraph、SQLite、Radix 与 React Flow
- replay model calls: 普通复跑 0；仅显式 llm 节点例外；计划纠正属于准备期独立审计
- site/task-specific code added: no

当前 checkout 为 `master@7d590363`，既有 dirty work 保留。计划失败候选只从该 job 的审计事件读取；恢复不得重建未知候选、放宽 ResultSpec 校验或自动重开 Browser-Use。新增工作仅适配上述既有能力和 B-A-T 的候选、并发、诊断及生命周期合同，不引入或替换关键库。正式通过范围以本轮页面、API、SQLite 与重启证据为准。

本轮对 `result_spec_path_conflict` 核对了 `resultSpecSchema`、workflow-use 的 `compile_result_binding` 和宿主 `assertResultBinding`：完整数组路径与第 0 项子字段不能同时拥有结果，且不同 `producerRef` 代表不同逻辑来源。第三份京东候选的父子来源各不相同，自动折叠会改变来源含义，所以没有把删掉子归属、放宽合同或重开浏览器作为修复。宿主只补充精确路径、来源及必填集合缺口诊断，交给既有计划纠正入口；第四份模型候选仍缺集合归属，按四次上限停止并保留全部审计。输出 schema 的业务字段未改。

### 自然语言调整建议与成功结果归属

Product Alignment:
- natural-language task: 用户对已有链路的步骤或运行结果说明问题，收到有前后差异、可拒绝的修改建议
- reusable chain boundary: 当前 Requirement／Release、准确 Execution 与 TaskRun 证据、唯一活动 TaskDraft；接受建议后仍须独立试跑和显式发布
- runtime inputs: 保存的用户反馈、链路 revision、执行证据及当前草稿校验值
- dynamic task outputs: 带来源审计的结构化修订候选、可审阅差异和接受后的新草稿 revision
- generic platform capability used: AI Connect `AIModelProvider.generateObject`、Zod、既有 ChainRevisionOperation／编译校验、SQLite 与工作台侧栏
- replay model calls: 普通链路复跑 0；调整建议是用户单独发起、独立审计的模型调用
- site/task-specific code added: no

Reuse Assessment:
- capability: 从已保存反馈与准确版本／运行证据生成链路修订建议
- existing implementation in repository: AI Connect 结构化输出、TaskAuthoringJob 审计、revision preview／编译／可执行校验、SQLite 草稿事务
- mature candidates and pinned versions: 沿用仓库固定的 AI Connect、Zod 和现有任务链合同；不新增依赖
- selected implementation: 复用现有结构化模型接口，新增范围受限的调整指令和 B-A-T 证据投影／候选适配
- reused public surface: `AIModelProvider.prepare().generateObject`、Zod 边界与既有 revision operations
- B-A-T-owned adapter and remaining gap: 候选来源重校验、差异确认、过期／取消／拒绝和唯一草稿接受事务；正式页面、真实建议质量和新版发布仍待验
- license/runtime/platform fit: 不变更依赖或运行时，Windows 本轮定点类型检查与假模型测试通过，macOS 未测
- browser/runtime/state ownership conflicts: 建议生成不持有浏览器；接受仍核对精确版本与运行证据，不改旧发布或执行
- replay model calls: 普通试跑／正式运行 0，只有显式 llm 节点例外
- rejected candidates and evidence: Pi Main 服务于访谈／浏览器探索，不是无工具的结构化链路修订建议接口；现有计划提示明确不生成节点图，不能挪用
- focused validation: contracts／API／Workbench 类型检查、调整聚焦测试 9 项及 BrowserProfile 门测试通过；正式 UI／API／SQLite／重启待验

用户在本轮明确授权**仅新增调整建议专用 prompt**，不扩大为访谈、计划或探索 prompt 改动。先前真实 Python About 试做来源已保存并正常关闭，但其计划要求必填 `status` 而确认需求没有给成功枚举值，来源也没有对应可执行事实；不能仅凭 `sourceSuccess` 或模型技术任务文字合成业务结果。离线内存模拟证明，当确认需求明确给出成功状态字面值时，现有自然读取和静态值归属可组装成功分支；不同需求摘要的旧来源不得复用。编译器只补可选字段缺省处理与缺失路径诊断，未虚构输出或放宽必填归属；该旧来源仍不能发布。

### G12 后续复用与正式证据边界（2026-09-24）

上方 Reuse Assessment 的“正式 UI／API／SQLite／重启待验”记录的是实施时状态。本轮随后在正式页面恢复失败建议 `b8a57468-f2f0-4172-8e1d-56108e1b9940`，沿原反馈和精确运行证据生成 `a2f0e1a2-3a01-41c4-874a-35db46798e4a` 的待确认候选；接受前活动草稿为 0，接受后才形成唯一草稿 `e6fc816c-8a24-420e-8ca8-30b0f23af7d9`。样本和独立复验执行 `c5bb324c-9720-45b7-8c2c-6c9b86b42fcc`、`e165c0be-ccbe-4ac7-8c29-028d28ab93dd` 完成且清理确认；用户手动发布 Release V2 `930d7739-f6f7-4ad7-8984-93fd3f3f5bfe`，随后正式执行 `57193eb7-6b1f-43d5-82a6-e5a585dbf01f` 完成且清理确认。V1 与原四次执行保留。七次执行均无普通复跑模型／LLM 调用，输出 digest 同为 `7a5808fac2bce36b837bfaef3673b44eb15e7207fba861c4af9a079a7ca7623b`；重启前后快照文件 SHA256 同为 `11D3469DFC73645741F76564C21FE1233DA3130D839BA16F7742852BBD4E6851`。证据索引为 `work/recovery-20260924/g12-acceptance.json`、`g12-before-restart.json`、`g12-after-restart.json` 及同目录正式 UI 的亮／暗色、390px 截图。

候选只执行一次 `replace_node`，V1/V2 同一链的节点数均为 5，变更只落在 `output-assemble.label`，路线和执行输出未变。由此验收的是既有 AI Connect 结构化建议、服务端完整操作校验、用户确认、唯一草稿、两次固定链路试跑、手动发布及重启后的持久化；**不能推断行为缺陷已修复**。G12 拒绝、过期和验证失败的正式 UI 路径仍缺证据；G9 当前 provider 的联网搜索也尚未验。上述缺口继续阻止整体完成声明。

### G12 运行结果反馈交接（2026-09-25）

Product Alignment:
- natural-language task: 用户在本次运行结果旁说明哪里不符合预期，进入链路调整时保留这段未提交的业务反馈。
- reusable chain boundary: 反馈仅在同一任务当前运行的结果与调整侧栏间传递；生成建议仍由用户显式提交，并绑定准确运行和链路版本。
- runtime inputs: 当前 execution、用户已输入的反馈、所选步骤和链路引用。
- dynamic task outputs: 调整侧栏预填反馈；建议、草稿、发布和历史运行事实仍由原有流程产生。
- generic platform capability used: React 本地状态、现有 Workbench 侧栏与 TaskChainConnection。
- replay model calls: 0；用户明确点击生成修改建议后才发生独立的调整模型调用。
- site/task-specific code added: no

结果侧栏原先把反馈保存在自己的局部状态，切到调整侧栏时组件卸载，文字随之丢失。此次只修同次运行的前端临时状态交接；不改 API、持久化合同、prompt 或普通复跑。

### G9 当前 provider 搜索与来源选择正式证据（2026-09-24）

上段 G9“尚未验”是该时点状态。正式 UI 新任务 `882f4bb3-7a58-4986-b633-83f4c5769dd4` 没有用户填写的 URL；Pi 自行发起 `web_search`，query 为 `site:docs.python.org "What's New in Python 3.14"`，随后用 `present_source_candidates` 提交来源候选。SQLite `messages.aiEvents` 为两次 `tool.execution.completed` 保存了原始 `output.content` 和 `output.details`；候选事实的 provider 是 `pi-web-access:web_search`。这核验的是 Pi 工具事件经现有 adapter 进入正式 Timeline 与受限来源候选的真实一次调用，不把普通业务调研搜索强制转为来源选择，也不以宿主词表判断语义相关性。

Question Panel 展示 1 个官方候选，用户选中 `source:009bfe70f430076c645b`，准确 URL 为 `https://docs.python.org/3/whatsnew/3.14.html`；下一轮继续确认“首个实际正文段落”的业务含义，才形成 Requirement `a34888db-4de3-4f92-85b4-cbd1b1faeae8@1`。确认事实包含这条所选搜索来源；该任务的 `taskContracts` 只有 1 条需求记录，准备、草稿、发布和执行均为 0。重启前后 `work/recovery-20260924/g9-before-restart.json` 与 `g9-after-restart.json` 的 SHA256 同为 `367C12B25E5860A0C273CD20370D4AB00301ED2FE89E5ED2736DBF6807733240`；正式 UI 的搜索进度、来源选择、澄清和确认截图为同目录 `g11-g9-*.png`。

此次只覆盖当前 provider 的一次只读搜索和来源确认。可选 `summary`、凭据及其他 provider 分支仍缺正式证据；该专用任务未进入计划、Browser-Use、发布或复跑，不能据此扩大 G11/G12 或整体完成结论。

## 2026-09-22 AI Connect / Pi 能力对齐与新建任务审计

完整缺口、UI↔逻辑对应和退出门见 [PRODUCT_LOOP_CAPABILITY_AUDIT](PRODUCT_LOOP_CAPABILITY_AUDIT.md)。继续复用现有 AI Connect 连接/Authoring/Question、ai-connect-react Timeline/Composer、Pi AgentSession/ResourceLoader，不另建聊天、工具或 Agent 框架。

实际固定版本为 AI Connect `0.3.2-e61cfe91`、React `0.3.2-15d6e5f0`、Pi AgentSession `0.1.0-52e0e9c6`。vendor 归档 SHA256 与 release.json 一致；实际安装包公共模块可导入。ResourceLoader 离线加载搜索 extension 成功，注册 `web_search/source_check/fetch_content/get_search_content`，BAT 只激活 `web_search`。未执行联网搜索，不能把注册成功写成搜索端到端已通过。

实际公共事件 bridge 可把合成工具事件变为 AIEvent；公共 `projectAIInvocationTimeline` 接收 extension adapter 后可生成搜索 hook。BAT 当前调用没有传该 adapter，是明确的共享 UI 接线缺口，不是共享包没有能力。需求宿主另将任何搜索强制绑定来源选择，尚未对齐任务驱动的通用业务调研；修复应区分调研依据与用户来源决定，不能写成每个任务必须搜索/补 URL。

当前最新任务的两次模型计划均因 ResultSpec 结果所有权失败，未进入真实浏览器。不能放宽合同、删除字段或重开 B-U 掩盖问题；需要准确诊断、保存候选并复用既有纠正/恢复能力。正式 UI 另确认无图失败态无处理面板，完整新建任务闭环尚未通过。本次只有审计和文档，无产品实现或 prompt 修改。

## 2026-09-22 节点修订交互与验证含义修正

继续复用 React Flow、Radix Themes、ValueSchemaForm、现有 revision API 与编译器，不新增公共字段、图模型或编辑调度器。用户从画布选择动作，在右侧调整名称、输入绑定、输出和动作设置；新增/删除通过一批既有 revision operations 同时维护执行图和 ChainPresentation。删除前保护节点输出、变量、完成条件和循环引用，只有明确单一后继才自动接回，不能替用户猜测分支合流。

Radix `Select.Label` 必须放在 `Select.Group` 内；[官方 Select 文档](https://www.radix-ui.com/themes/docs/components/select) 的结构示例与 Group / Label 说明构成复用依据。首次新增节点弹窗暴露该组合错误，修复分组后正式 UI 通过，不替换现有组件库。

界面将 sample / verification 解释为“试跑整条链路 / 独立复跑检查”。只有输入合同声明的参数才显示表单；当前链路合同为空对象，剧名是固定节点值，无参数试跑使用保存的配置，不能在验证区直接换动漫，更不能把输入自然语言当作任务泛化。发布仍须既有候选验证门满足。

聚焦测试与类型检查已通过；正式编辑证据 `work/node-editor-1790017262509/result.json` 覆盖名称与固定输入保存还原、Function 新增/删除、执行内容与展示恢复、历史不变。正式 UI sample `work/node-trial-1790017373294/result.json` 精确绑定 chain v3 候选，completed / cleanup confirmed / llmCalls=0。仅完成本次 sample，独立复跑未执行、未发布。草稿事件独立读取并按候选精确引用及验证记录隔离，修改后立即清空旧候选显示；`work/node-trial-1790017373294/restart/result.json` 只读复核同次试跑的四阶段及 11 动作完成，未重跑浏览器任务。

## 2026-09-22 阶段展示与通用异常缺省处理

复用现有 LangGraph StateGraph、TaskChainRuntime 的结果和人工恢复机制，不新增调度器、错误状态字段或另一份执行图。`stable/v2` 正常/业务端口仍必需；可选通用错误端口有显式路由时优先执行，未处理时在当前节点沿现有结果合同收束。`stable/v1` 保持原有完整端口合同。新自然链物化复用 `compactGeneratedFailureRoutes`，只压缩来源和终态结构均与受管编译原样匹配、无业务结果/自定义原因/引用的异常路线。

画布仍用 React Flow / Dagre；业务阶段和动作节点使用同一版本化 presentation，不把任务实例写入平台。通过既有修订 API 保存用户确认的四阶段与节点名称，实际执行图精简后重新验证发布，旧发布与历史执行不改。局部验证包含 10 项稀疏链/合同/分支、4 项既有取消/人工恢复、5 项 UI 投影及相关类型检查；正式产品证据在 PROGRESS 记录，未运行全量测试。

正式复核已发布 chain v2 / release v7，sample、verification 与 Workbench replay 均零模型调用完成且清理确认；四阶段实时推进、逐阶段动作及节点类型、重启持久化均通过，汇总 `work/stage-chain-1790016501961/closure.json`。另补草稿覆盖运行及终态提前绿色两项定点回归；草稿与发布图使用显式模式切换，运行状态只来源于本次事件。

## 2026-09-22 离线编译与正式产品验收

本轮继续复用现有 browser-use / workflow-use、AI Connect bridge、QuickJS 与 LangGraph，不引入或替换关键库。删除批量可遗漏的选择函数响应，改为每个缺失函数一次有界 `semantic_annotation`：模型仅返回 source / examples，宿主拥有 actionRef、schema、绑定及节点身份。旧函数不覆盖；缺口只能形成明确编译失败，不能触发新的浏览器探索。

离线 `hybrid_annotate` 复用 compile 请求和已有模型连接合同，runner 必须没有 Browser owner。Python canonical/sourcePayloads 保留原数字词法；TS 边界禁止改写需求、计划、输入、动作及旧观察，只能追加对应动作的派生函数。新来源另存，历史来源和旧运行不变；没有引入新业务字段、Agent loop 或调度器。

局部准入为 Python 6 项、TS adapter 3 项及严格类型检查。正式门为 `work/i7-reprepare-1790013905749/result.json` 与 `source-reuse-audit.json`：原失败来源离线追加一个函数、探索次数 0、新增注解调用 1；sample / verification / Workbench replay 均完成、清理确认且模型调用 0。修订、清理恢复与需求回流的组合证据见 [PROGRESS](PROGRESS.md#当前状态)。当前 Windows x64 通过，macOS 未测。

删除未消费截图是已证明的冗余删除，不能等同性能根因已解决：当前普通 a4 点击仍耗时 47.558 秒，普通路径缺少内部阶段计时；后续优化须先取得同一 command 的阶段耗时，不扩大公共业务协议。

## 2026-09-21 紧急修复：公开动作准入与已有能力接线

本轮沿用 browser-use 0.13.8 / workflow-use 0.2.11 / QuickJS 0.32.0，不新增 Agent loop、浏览器控制器或运行调度器。
实际安装源码证明 `StructuredOutputAction.success` 默认 true 且从模型 schema 隐藏；`Agent` 构造还会再次调用公开 `Tools.use_structured_output_action`。
薄 `AuthorTools` 适配该公开方法，通过 `registry.action` 保留原生 done 的输出实现，只补必填 success/reason。结束声明仍不代替正式产品验收，也不增加语义 judge。

| 实际 action | 处理与合同 |
| --- | --- |
| navigate/go_back/wait/click/input/scroll/send_keys/select_dropdown | 由现有 workflow-step 承接，仍须当前来源绑定、目标和后置事实；Enter/click 共用唯一新增 tab 的实时 URL 收敛。 |
| find_elements | 完整查询转 read-fields，保存 text、请求属性和原 ordinal；缺属性如实省略。动态规则独立为需求绑定 Function，不由样本末项猜 count。 |
| search_page/dropdown_options | 原生只读文本发现，仅在同页事实连续时作探索证据；后续选项值仍须需求/输入绑定。不是复跑输出。 |
| extract | 仅 data 准备可用；已有确定性字段投影/显式语义合同负责复跑，不隐式重复原生提取模型。 |
| done | 显式成功/失败及原因，业务 data 合同保持不变；不产生执行节点。 |
| search | 未暴露：内建搜索引擎 URL 缺来源/输入绑定；已确认入口 navigate、站内 input/Enter 保留。 |
| find_text | 未暴露：包含滚动副作用而无复跑目标合同；search_page、scroll 和完整查询保留。 |
| switch/close | 未暴露：随机 tab suffix 无跨运行身份合同。唯一新 tab 前进由共享导航适配处理，不能将任意切页/关闭隐藏为探索。 |
| save_as_pdf、原有文件操作/evaluate/screenshot | 未暴露：当前无自然编译的文件交付或执行合同；不能调用后再静默丢弃。 |

Function 注解对每个缺失函数只有一次有界准备调用；模型只提交纯程序与变化样例，宿主拥有输入 schema、节点身份、边、预算与绑定。
来源事实和需求摘要不可分离，正式接收前复用既有 QuickJS 执行实际样本、变化样本和保留 ordinal 的数组重排；拒绝程序保留为编译 gap 和不可变来源。
代码只适配这些既有公共能力，不增加网站或业务类别固定逻辑。Windows 定点验证见 PROGRESS；macOS 仍为未测，不扩大为跨平台通过。

补充读取合同核验：browser-use 0.13.8 `tools/service.py` 的原生 `find_elements` 对全部 CSS 匹配元素使用 `textContent`，`href/src` 优先读取解析后的 DOM 属性；原有 read-fields 的默认可见 `innerText` 不能等价重放该查询。ReadField 因此明确区分 `rendered` 与 `textContent`，查询适配选择后者，默认业务字段和旧序列化摘要保持原合同。缺属性省略、完整集合上限和原 ordinal 仍由宿主校验。真实无头 Chrome 的三候选样本覆盖隐藏文字、隐藏元素、相对链接和缺属性，同时证明默认可见字段仍拒绝隐藏值。此证据只证明适配合同修复；最新正式 a-0005 的旧通用错误没有保留底层错误码，不能追溯断言它只有这一个原因。

补充导航观察核验：原生 DOMWatchdog 的摘要 URL 来自 SessionManager 异步 Target 缓存；公开 `Page.get_target_info/get_url` 则查询 CDP `Target.getTargetInfo`。本次 author scope 仅包装本次 Browser 的公开摘要方法，前后核验实时 URL、target 与 html backend，并与原生 DOM 树对应；只有稳定同一文档时才校正过期摘要 URL。模型等待后真正换 URL/document 仍拒绝旧索引，动作后的合法导航交既有 Tenacity settle 重读，不重派动作。finally 恢复原方法，诊断仅保存摘要与时间，并按 pending/native step 关联到同次 action。五项定点验证（含真实 Chrome 文档身份）和一个新增证据归属验证通过；真实站点是否命中缓存问题须等正式来源诊断，不能由本地样本推定。

## Reuse Assessment

- capability: 浏览器 Agent 探索、原生动作/DOM 能力、history 证据、确定性工作流执行和条件核验。
- existing implementation in repository: B-A-T 已有 TaskChain、LangGraph、版本、输入输出绑定、预算、幂等、恢复、持久化和模型审计。
- mature candidates and pinned versions: browser-use 0.13.8；workflow-use 0.2.11，
  commit `5d2d19fe8835cc86f1bf3e04302a5000d590f249`；Python 3.12。
- selected implementation: 受管 workflow-use fork 的运行源码子集，通过公开 schema/history/Tools/Agent/StepVerifier surface 适配。
- reused public surface: browser-use Browser、Agent、Tools、action schema、history、DOM/element 查询；
  workflow-use schema、executor、StepVerifier 和 Tenacity。
- B-A-T-owned adapter and remaining gap: Requirement/TaskPlan 输入、证据规范化、TaskChain 物化、版本、审计和产品生命周期；
  A 的受控页和实际任务页已通过，B/C/D 与组合验收未完成。
- license/runtime/platform fit: browser-use 为 MIT；workflow-use 为 AGPL-3.0。仓库保留许可证、固定 commit、archive digest、
  留存源码逐文件 digest 和本地变更 digest；来源校验以 LF 为规范字节，兼容 Windows checkout 的 CRLF。Windows 运行由当前 checkout 的正式验证决定。
- browser/runtime/state ownership conflicts: 一个产品运行只占用一个 Browser 会话；借用节点不关闭外层会话；
  LangGraph 是唯一图执行器，产品数据库是运行事实源。
- replay model calls: 普通节点为零；仅显式 `llm` 节点允许调用模型。
- rejected candidates and evidence: 上游 mechanical conversion 缺少任务意图、动态绑定和完整控制依据；
  LLM 整图生成会漏步骤、重排和固化样本；旧多层 patch 路线已退出。
- focused validation: 固定来源校验、主链测试、受控真实 Browser、实际任务页、变化输入/状态、模型审计和 finally 资源关闭。

## 当前结论

fork 只保留 B-A-T 运行和主链回归需要的文件：生产 Python 包、锁文件、包 README、许可证、来源/本地变更清单、
来源校验器，以及两个生成主链 fixture 的 Python 文件。上游扩展、独立 UI、示例、CI、开发测试、样本 storage 和重复文档
不参与产品运行，已从 checkout 删除。

首次探索可调用模型和浏览器；成功且业务结果完整后，程序依据 Requirement、TaskPlan、真实 trace 和 provenance 编译。
固定输入与编译版本必须产生稳定 TaskChain。复跑只执行普通能力和显式声明的 LLM 节点，所有模型调用进入运行审计。

选型尚未由完整业务验收冻结。A 已通过；B 的稳定读取、C 的异步顺序、D 的共享会话模型节点以及 E 的同链换输入仍须分别通过。

## 需求对话搜索工具复用（2026-09-20）

Product Alignment:
- natural-language task: 访谈模型在来源身份或入口确有歧义时自行决定是否搜索、搜索词和相关候选，再由用户确认来源。
- reusable chain boundary: 搜索只是需求对话的只读工具能力；确认后的来源事实供任意后续准备任务使用。
- runtime inputs: 完整对话、Pi 当前活动工具、搜索请求、真实结果/引用和用户候选选择。
- dynamic task outputs: 可审计搜索事实、稳定候选 ID、用户来源决定和仍未解决的待决事项。
- generic platform capability used: Pi ResourceLoader、extension/package、tool registry、active tools；AI Connect Question 与持久化事实。
- replay model calls: 只发生在需求对话；普通 TaskChain 复跑仍为 0，显式 `llm` 节点除外。
- site/task-specific code added: no

Reuse Assessment:
- capability: 在 Pi AgentSession 中向任意支持工具调用的访谈模型提供可发现、可审计的只读搜索工具，并允许无额外搜索密钥的后备。
- existing implementation in repository: B-A-T 已有 Bing RSS 只读 resolver、候选引用校验和 Question 投影；共享 Pi adapter 现已公开“准确 extension 来源 + active tools”入口并投影同一工具生命周期。
- mature candidates and pinned versions: `@earendil-works/pi-coding-agent` 0.84.2 tag `914cf1472e715297caa30db4b9535d534a9eb718`；`pi-web-access` 0.30.0 commit `6c5afa1d0d43eef8552284ad73f4bd9f0612a378`，MIT，支持 Pi `modelRegistry` 凭据解析和无需额外密钥的公开搜索后备。
- selected implementation: 复用 Pi `DefaultResourceLoader`、extension/tool registry 和 `pi-web-access` 的 `web_search`；只在需求访谈会话启用该工具，现有 Bing RSS 作为工具失败时的通用只读后备。模型连接仍只负责模型，搜索工具是否可用由 Pi 注册表和 extension 自身决定。
- reused public surface: `DefaultResourceLoader`、package `pi.extensions`、`pi.registerTool()`、active tools、`modelRegistry.getApiKeyAndHeaders()`、extension tool lifecycle/result，以及 `pi-web-access` 的 provider routing 与 keyless fallback。
- B-A-T-owned adapter and remaining gap: B-A-T 只声明允许的 package/tool、观察 Pi 的原始工具结果、把其中真实 URL 规范化为稳定候选并校验模型引用，然后持久化用户决定；不复制凭据、不选择搜索词、不判断相关性。R1 已从正式 Workbench 产品入口通过，剩余仅为 R5 组合复验，不再实现搜索后端。
- license/runtime/platform fit: Pi 与 `pi-web-access` 均为 MIT；Node 24/Windows x64 下，`pi-web-access` 精确版本安装、类型检查和真实 keyless 搜索通过。上游 38 个定点测试中 36 个通过，2 个 Windows 失败只涉及本项目未启用的可选命令凭据来源；macOS 延期未测。
- browser/runtime/state ownership conflicts: 搜索 extension 不启动 B-A-T 任务浏览器；需求对话仍不读取 Profile、不登录、不点击。只允许审查后的 extension 集，不能隐式加载用户全局任意 extension。
- replay model calls: 搜索由当前访谈模型发起，不增加第二个语义判断模型；普通复跑无搜索工具。
- rejected candidates and evidence: `pi-web-search` 1.6.0 只覆盖 provider 原生能力，不能给不带搜索的当前模型提供通用后备；不在 B-A-T 按供应商维护搜索矩阵，不在模型弹窗增加搜索配置，不删除 Bing 后备，不复制 Pi extension/runtime。`pi-web-access` 的可选命令凭据来源未启用，因为其 Windows 定点测试存在 2 个失败，而 `web_search` 本身不依赖该路径。
- focused validation: `opencode` 的 extension/custom tool 与多 assistant item 整轮输出投影测试 3/3（13 assertions）、包类型检查、平台持久化/confirmed tests 11/11（51 assertions）通过；同步 digest 为 `52e0e9c6630c47cb41874591dc4e5e9f7db36aca8180e4fca47b379b91be01f5`。B-A-T 实际加载 1 个 `pi-web-access` extension 且 `web_search` 恰好注册一次；来源合同测试 4/4 与 API 类型检查通过。正式 headless Workbench/API 入口完成 `web_search → present_source_candidates → Question → requirement v2`，未决事项 0，需求阶段产品浏览器命令 0；证据为 `work/requirement-dialogue-workbench-unique-2026-09-20T15-44-31-667Z`。

## 首次业务完成后的确定性读取补证（已撤销）

2026-09-18：本节记录的第二轮 Agent follow-up 已从生产入口删除。真实运行证明“再让模型选择 DOM refs/字段工具”仍把
复跑证据交给随机模型，且会增加 provider 调用。当前方案改为原生 `extract` 同页回调中的宿主记录投影；以下内容仅保留为否决证据。

Product Alignment:
- natural-language task: 首次浏览任务已完成业务读取，但原生 `extract` 尚未留下可供普通执行器复跑的字段读取证据。
- reusable chain boundary: 在同一首次探索和同一 Browser 会话内，对编译器明确报告的字段读取缺口执行一次有界补证，然后重新编译。
- runtime inputs: 已确认的输入/输出合同、首次业务结果、标准化 trace、编译缺口和仍存活的 Browser 会话。
- dynamic task outputs: 新增的 `bat_read_fields` 验证事实、重新编译后的剩余缺口和原首次业务结果。
- generic platform capability used: browser-use Agent 的公开 follow-up API、现有 `bat_read_fields`、标准化证据和编译门。
- replay model calls: 0；补证属于首次探索，冻结后的普通复跑仍只允许显式 `llm` 节点调用模型。
- site/task-specific code added: no

Reuse Assessment:
- capability: 业务完成后继续使用同一 Agent、消息历史和 Browser 会话收集缺失的确定性读取证据。
- existing implementation in repository: `author_step` 已拥有同一 Browser、Agent、Tools、EvidenceCollector、字段读取工具和编译器；缺口是业务 `done` 后没有补证阶段。
- mature candidates and pinned versions: browser-use 0.13.8 的 `Agent.add_new_task()` 与再次 `Agent.run()`；workflow-use 0.2.11 的既有编译和证据适配层。
- selected implementation: 复用 `add_new_task()` 发起至多一次有界补证；只在首次业务 `done` 成功、输出合同通过且编译器仍报告 `natural_field_read_evidence_missing` 时启动。首次 judge 已通过则保留原业务结果；首次 judge 未通过时，只接受补证后再次通过 judge 的完整结果。
- reused public surface: `Agent.add_new_task()` 明确保留同一 task id 和消息历史、重置控制状态并重建 Agent event bus；`run()` 重新启动同一外部 keep-alive Browser 会话。
- B-A-T-owned adapter and remaining gap: B-A-T 只识别自己的编译缺口、生成通用补证指令、合并新 trace 并重编译；不实现新的 Agent loop、选择器推理器或网站专用路径。
- license/runtime/platform fit: 延续已固定的 browser-use MIT / workflow-use AGPL-3.0 与 Windows Python 3.12 运行边界，不新增依赖。
- browser/runtime/state ownership conflicts: 不创建第二个 Browser 或并发运行；补证仍在原产品运行中，最终由既有 `finally` 关闭外层会话。
- replay model calls: 0；补证模型调用只发生在首次 authoring。
- rejected candidates and evidence: 不把 `extract` 伪装成确定性读取；不复制 Agent loop；不靠重复整次任务碰运气；不写 GitHub 页面或业务字段 special case。
- focused validation: 先用受控多字段列表/详情样本证明单次 follow-up 只在目标缺口出现时触发且沿用同一 Agent；再执行一次真实 GitHub B 验收，要求三个字段读取缺口消失或输出新的固定失败原因，禁止无变化重试。

上述 follow-up 的“模型先用 `find_elements` 猜出 CSS，再交给 `bat_read_fields`”接口不再作为 B 的实现方向。
真实运行已经证明，即使提示词要求复用已匹配 selector，字符串参数仍允许模型自行增加父子组合；这不是可由更多提示词修复的执行契约。

## 真实 DOM 节点引用到确定性字段读取（已撤销为生产入口）

2026-09-18：opaque refs、DOM 检查工具和字段读取工具仍保留历史回归代码，但不再注册给 authoring 模型，也不再参与新的来源补证。
它们证明了 backend node/live DOM 反查边界，也证明“让模型声明字段—节点关系”并不可靠；生产迁移入口由宿主自动推导并反读验证。

Product Alignment:
- natural-language task: 首次 Agent 已从截图和 Browser-Use DOM 状态识别业务字段，需要把它实际选择的页面节点编译成零模型复跑读取。
- reusable chain boundary: 模型只选择当前观察中的真实节点并声明节点到输出字段的对应关系；B-A-T 保存有界局部 DOM 关系，机械生成并验证复跑定位表达。
- runtime inputs: 当前 Browser-Use `BrowserStateSummary`、原生 selector index、输出 schema、页面身份和同会话节点引用表。
- dynamic task outputs: 经当前页反查证明的容器与相对字段定位、字段值、局部 DOM 来源摘要和固定失败原因。
- generic platform capability used: Browser-Use `selector_map`、`EnhancedDOMTreeNode` 父子关系/backend id、Actor `Element` 与现有 `browser.read-fields`。
- replay model calls: 0；普通复跑只执行已验证定位和字段投影。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从模型已选择的真实 DOM 节点形成可持久化、可重新解析的字段读取描述。
- existing implementation in repository: `dom_evidence.py` 已复制交互节点的祖先、直接子节点、XPath、结构属性和页面身份；`read.py` 已拥有受 schema 约束的容器/相对字段读取及双读一致性校验。
- mature candidates and pinned versions: browser-use 0.13.8 的 `selector_map`、`EnhancedDOMTreeNode`、`DOMInteractedElement` 和 Actor `Element`；workflow-use 0.2.11 的原生 Agent/Tools 生命周期。
- selected implementation: 新增有界 DOM 检查工具，以 Browser-Use 当前 selector index 为锚点返回仅在本次 authoring 会话有效的 opaque node refs；`bat_read_fields` 只接受这些 refs。适配层从真实父子关系机械生成 CSS 路径，并用浏览器原生查询反查 backend id；只有容器集合和每个相对字段都与所选节点完全一致时才生成现有 `ReadSpec`。
- reused public surface: Browser-Use 负责页面观察、交互节点编号、完整增强 DOM 树、CDP 页面和 Element 包装；Chrome 负责解析生成后的 CSS；现有 `read_fields_with_proof` 负责页面、集合和双读一致性。
- B-A-T-owned adapter and remaining gap: 只维护 authoring 会话内节点引用、局部结构投影、从已选真实节点到已验证 `ReadSpec` 的转换及证据脱敏；不实现第二个 Agent loop、CSS 解析器或站点规则。当前切片先支持同一主文档内的有界对象/对象数组和标量叶；frame/shadow 边界保持显式不支持，后续复用原生能力扩展。
- license/runtime/platform fit: 不新增依赖；延续 browser-use MIT、workflow-use AGPL-3.0 与 Windows Python 3.12 边界。
- browser/runtime/state ownership conflicts: 不创建 Browser 或 Agent；节点引用绑定当前 target/url/backend node，只能在产生它的活跃页面消费。
- replay model calls: 0。
- rejected candidates and evidence: 拒绝模型提交 raw CSS；拒绝把旧 backend node id 当作跨页面持久定位；拒绝保存整页原始 DOM；拒绝复制 Browser-Use 的 Agent rerun。原生 `find_elements` 只返回扁平文本且仍以模型 CSS 为输入，不能作为节点来源证明。
- focused validation: 先证明任意模型 CSS 已从字段工具契约消失、跨页/伪造 ref 被拒绝、生成定位反查到同一 backend node、节点重建和记录重排后现有 reader 仍读取新值；再只运行一次真实 GitHub B。

首次真实 GitHub B 运行暴露了 Browser-Use `ActionResult` 的一个集成语义：同时设置
`long_term_memory` 与 `extracted_content` 时，默认只把前者放入下一轮模型上下文；只有
`include_extracted_content_only_once=true` 才会把后者放入一次性 read state。旧实现因此让动作成功、证据也被采集，
但模型实际只看到“检查了 N 个节点”的摘要，看不到任何 `dom-*` 引用。修复必须使用 Browser-Use 已有的一次性 read state
公开 surface；不能删除长期摘要，也不能把含页面文本的局部 DOM 长期保留在模型记忆或持久化证据中。

同一次修复后的第二个请求没有启动 Browser，而是复用了修复前的 source artifact。检查确认复用门只校验需求、计划、输入、
业务结果和关闭状态，没有校验 artifact 的 `forkSourceDigest` 是否仍等于当前受管 fork。编译 gap 仍是派生结果：在同一 fork
摘要下允许当前编译器重新判定；但 fork 摘要变化意味着 authoring 工具、采集或编译实现至少一项已变化，旧来源不能假装由当前
实现产生。复用门因此必须新增当前 fork 摘要匹配；不通过时重新探索，而不是继续重编译旧 trace。

修复后真实 B 已能连续提交 opaque refs，但五次 `bat_read_fields` 都返回同一个固定错误
`dom_reference_container_mismatch`。按持久化 ActionResult 的 canonical digest 反算确认了该错误，不是猜测。根因是适配层从
Browser-Use 的增强 DOM 树计算 `:nth-of-type`；该树服务于模型观察，会裁剪普通 DOM 节点，因此其兄弟序号不等于浏览器完整
DOM 的 CSS 序号。下一步保留 opaque backend-node refs，但不再从增强树推算定位：通过 Browser-Use 已有 `Page.get_element` 和
`Element.evaluate` 在被选真实节点上读取完整 live DOM 的机械路径，再由 `Page.get_elements_by_css_selector` 反查同一 backend id；
字段相对路径也只从容器和字段节点各自的 live 路径求差并在容器内反查。模型仍不提交或编辑 CSS。

真实 Browser-Use 受控页进一步暴露了 Actor 的公开前置条件：仅有 backend id 时直接调用 `Page.get_element`，
`Element.evaluate` 会因当前 CDP document 尚未请求而返回 `Document needs to be requested first`。这不是 selector
不匹配，也不能继续折叠成未知工具错误。修复复用现有 `element_from_backend`：先通过公开页面 API 初始化并核验当前主文档，
再包装已保存 backend node；容器和字段节点的查询仍反查同一 backend id。节点已被替换或离开当前文档时分别固定为
`dom_reference_container_mismatch` / `dom_reference_field_mismatch`，不回退到相似节点。

真实 GitHub job `58786140-294c-4f29-8cd0-d23254379d39` 证明上述 document 初始化修复成立：详情正文和标题的两次
`bat_read_fields` 都从 opaque refs 成功读取。新失败 `dom_reference_outside_container` 的证据中，模型为同一列表记录选择了
准确的编号、标题、标签、时间和链接节点，却把标签节点 `dom-965` 同时声明为整条记录的父容器；其余字段自然不在该节点内。
这不是目标节点失效，也不是 CSS 解析问题，而是协议仍要求模型判断父子范围。后续不得放宽为跨容器任意拼接，也不得让模型重猜
父节点；记录范围应由 B-A-T 从同一受控 DOM 中所选字段 refs 的有界最近公共祖先机械推导并用 live backend ids 反查。

Product Alignment:
- natural-language task: 首次 Agent 选择一条页面记录的真实字段节点，后续将该记录编译为可复跑字段读取。
- reusable chain boundary: 模型只声明输出记录及字段到 opaque DOM refs 的对应关系；记录容器由程序从真实父链推导。
- runtime inputs: 同一当前页面的字段 refs、Browser-Use 增强 DOM 父链、输出 schema 和 live backend nodes。
- dynamic task outputs: 经有界公共祖先和 live DOM 反查证明的记录容器、相对字段定位和值。
- generic platform capability used: Browser-Use 节点父链/backend id、现有 `browser.read-fields` 与证据门。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从多个已选字段节点确定同一记录的读取范围。
- existing implementation in repository: `DomReferenceStore` 已持有真实父链、页面身份和 backend id；`ReadSpec` 已要求容器内字段完全匹配。
- mature candidates and pinned versions: browser-use 0.13.8 `EnhancedDOMTreeNode.parent_node` 与 Actor `Element`。
- selected implementation: 移除模型可填的 `containerRef`，在每个显式 record 内对全部字段 refs 求有界最近公共祖先；跨页面、跨 frame/shadow、超过有界父链、落到文档根或多记录得到同一容器均固定失败。
- reused public surface: 继续复用 Browser-Use 父链和 `element_from_backend`；不新增 DOM 解析器或浏览器控制层。
- B-A-T-owned adapter and remaining gap: 只负责记录分组、公共祖先门和现有 `ReadSpec` 适配；字段跨刷新重绑定仍由后续字段 history target 切片完成。
- license/runtime/platform fit: 不新增依赖，延续固定 Python/Browser-Use 版本。
- browser/runtime/state ownership conflicts: 不创建新 Browser/Agent，会话和页面仍由现有 authoring 持有。
- replay model calls: 0。
- rejected candidates and evidence: 不信任模型提供父容器；不接受 `body/html` 级公共祖先；不在失败后回退到相似文本、CSS 或任意跨记录拼接。
- focused validation: 两条结构不同记录能从字段 refs 推导各自容器并读取；跨记录混选被固定拒绝；模型 schema 不再暴露 `containerRef`；DOM 错误进入诊断而非折叠为 unavailable。

## 本地环境安装

Reuse Assessment:
- capability: 一条命令安装 npm workspace、Python 3.12 和固定 Python 依赖。
- existing implementation in repository: 根 `package-lock.json`、workflow-use `uv.lock` 与
  `scripts/setup-upstream-browser-runner.mjs` 已拥有依赖同步和版本核验。
- mature candidates and pinned versions: npm 11 的 lockfile 安装；Astral uv 0.12.15 官方独立安装器及受管 Python。
- selected implementation: `npm run setup` 调用 `npm ci`，再把固定 uv 安装到忽略的 `work/tools/uv`，
  最后复用现有 `uv sync --frozen --python 3.12`。
- reused public surface: uv 的 `UV_UNMANAGED_INSTALL`、`UV_PYTHON_INSTALL_DIR`、`UV_CACHE_DIR`、
  managed Python 下载和 frozen sync。
- B-A-T-owned adapter and remaining gap: 只负责版本门、项目内路径、跨平台进程调用和最终版本核验；首次安装需要访问 npm、
  Astral/GitHub 与 Python 包源。
- license/runtime/platform fit: uv 采用 MIT OR Apache-2.0；官方安装器支持 Windows、macOS 和 Linux。
- browser/runtime/state ownership conflicts: 安装阶段不启动 Browser、模型、队列或产品服务；环境位于忽略的 `work/`。
- replay model calls: 0。
- rejected candidates and evidence: 不依赖全局 Python/pip 或手写虚拟环境；不复制解析器和安装器。
- focused validation: 全新工具目录执行 setup、重复执行 setup check、来源 digest、Python/包版本和 API TypeScript 检查。

## 旧批次计划读取兼容

Product Alignment:
- natural-language task: 启动最新代码后仍能读取任务列表并进入需求对话。
- reusable chain boundary: 已持久化计划的只读兼容；执行门继续拒绝缺少批次聚合声明的计划。
- runtime inputs: 同一协议版本下、尚未包含 `aggregates` 的历史 `batch` invocation。
- dynamic task outputs: 读取时规范化为空聚合列表，并返回明确的不可执行问题。
- generic platform capability used: Zod 持久化协议解析与 `taskPlanExecutionIssues` 执行门。
- replay model calls: 0。
- site/task-specific code added: no
# 交互节点跨页面重绑定（2026-09-18）

Product Alignment:
- natural-language task: 首次由模型选择交互节点，后续打开同类页面时由普通执行器定位并操作同一业务目标。
- reusable chain boundary: 交互动作保存 Browser-Use 历史元素身份，复跑映射到当前 selector index。
- runtime inputs: 参数化动作参数与当前页面 DOM。
- dynamic task outputs: 当前唯一目标 index、动作结果和声明的后置条件。
- generic platform capability used: 版本化目标、证据、能力节点与运行审计。
- replay model calls: 0。
- site/task-specific code added: no。

# 动作后精确目标核验（2026-09-20）

Product Alignment:
- natural-language task: 输入值后页面立即出现通知或动态层时，确认本次输入已经完成，再执行预执行学到的后续准备节点。
- reusable chain boundary: 同一普通动作派发目标的只读后置条件；后续动作仍重新解析目标和遮挡状态。
- runtime inputs: 已验证的稳定目标、本次派发保留的原生 element 与声明式 postcondition。
- dynamic task outputs: 输入/选择动作的完成事实或确定性失败。
- generic platform capability used: OrdinaryCapability、TargetResolver 和现有确定性 postcondition verifier。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: Browser-Use 历史交互元素在新 DOM 快照中的重绑定。
- existing implementation in repository: `dom_evidence.py` 已保存局部图，但编译器只产出 CSS/XPath，运行器未消费原生历史身份。
- mature candidates and pinned versions: browser-use 0.13.8 `DOMInteractedElement`、`element_hash`、`compute_stable_hash`、XPath、AX name 与 selector map。
- selected implementation: 直接保存原生哈希/结构身份；运行时及动作后控件值复查都在新 selector map 按原生层级匹配，并在每层强制唯一。
- reused public surface: `DOMInteractedElement.load_from_enhanced_dom_tree`、增强节点哈希、稳定哈希、XPath、AX 与属性。
- B-A-T-owned adapter and remaining gap: 只负责隐私安全序列化、页面范围约束、唯一性门和当前 index 输出；frame/shadow 仍显式不支持。
- license/runtime/platform fit: 不新增依赖，继续使用固定 browser-use 0.13.8 与现有 Python 3.12 进程。
- browser/runtime/state ownership conflicts: 不创建 Agent/Browser，不接管循环或会话，只读取当前 BrowserSession selector map。
- replay model calls: 0。
- rejected candidates and evidence: `Agent.rerun_history` 会接管整段历史、最终调用摘要模型并关闭会话；私有 `_update_action_indices` 返回首个弱匹配且不能作为稳定公开契约；复制 raw DOM 或 backend id 不能跨刷新。
- focused validation: selector index 改变仍按稳定哈希命中；同层多候选明确失败；编译产物保留 history identity 且不降级为 CSS/XPath；无 `aria-label` 输入框仍能在动作后唯一重绑定并读取值。

# 消费者驱动的异步就绪（2026-09-18）

Product Alignment:
- natural-language task: 首次 Agent 完成真实异步交互后，把同一过程冻结为动作一次、零模型的确定性复跑。
- reusable chain boundary: 有副作用动作到其后第一个已验证目标或结构化读取之间的消费就绪合同。
- runtime inputs: 动作参数、动作前同一投影基线、下游目标/投影、页面作用域和有界等待策略。
- dynamic task outputs: 当前运行实际解析出的唯一目标或通过 schema 且稳定的投影结果。
- generic platform capability used: 现有目标重绑定、`browser.read-fields`、workflow-use `StepVerifier`/Tenacity 和 TaskChain capability。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 异步动作后等待真正的下游可消费事实，同时保证副作用动作不重试。
- existing implementation in repository: `OrdinaryCapability.execute_checked` 已先取基线、执行一次动作、再通过 `StepVerifier`/Tenacity 重查后置事实；`TargetResolver` 已重新解析当前 DOM；`ReadSpec` 已有 schema 和有界基数。
- mature candidates and pinned versions: workflow-use 0.2.11 `StepVerifier`、Tenacity 9.1.2、browser-use 0.13.8 页面/元素 API；Playwright web-first assertion 作为职责边界参考，不新增依赖。
- selected implementation: 编译器从相邻成功轨迹引用第一个 `VerifiedNaturalRead`；导航使用 `ready`，同文档/外部状态使用 `transition`；目标型消费者在目标解析入口只重试缺失。
- reused public surface: `StepVerifier.verify_step`、Tenacity 有界重试、现有 `read_fields`、目标解析和页面 scope。
- B-A-T-owned adapter and remaining gap: 生产者/消费者因果连接、基线不可读到稳定可读的转换语义、两次一致门和固定错误分类；字段投影已移出模型工具，正式结构目标 IR 与 E4 仍待冻结。
- license/runtime/platform fit: 不新增依赖，不改变 Python/TypeScript/Windows、浏览器会话或许可证边界。
- browser/runtime/state ownership conflicts: 动作仍只由现有 capability 执行一次；不创建第二个等待器、Agent loop、Browser 或状态机。
- replay model calls: 0。
- rejected candidates and evidence: 不用 DOM 静止、network idle、URL 变化或 fixed sleep 单独证明完成；不让模型选择等待类型；不建立分页/筛选/导航/懒加载场景枚举；不把歧义当作加载中。
- focused validation: 同文档投影必须变化且连续两次一致；动作创建的投影允许不可读到稳定可读；导航投影不读旧页面基线；目标缺失重试、多候选立即失败。

# 宿主拥有的记录投影与结果配方（2026-09-18）

Product Alignment:
- natural-language task: 首次 Agent 用原生浏览器能力取得业务结果后，程序自动形成零模型复跑所需的记录读取和最终输出绑定。
- reusable chain boundary: 一个同页原生 `extract` 对应一个经 live DOM 反读证明的对象/对象数组读取；多个动态来源按 `ValueBinding` 装配最终输出。
- runtime inputs: 同页连续两份增强 DOM、当前 document 身份、输出 schema、任务输入、需求原文和最终成功业务输出。
- dynamic task outputs: 当前页面实际记录数、字段值、绝对链接、运行输入映射和最终任务输出。
- generic platform capability used: browser-use 增强 DOM/Actor Element、现有 `ReadSpec`/`read_fields_with_proof`、`ValueBinding` 和 `data.transform`。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 在不要求模型描述 DOM、等待或输出绑定的前提下，把首次业务读取转成候选复跑规则。
- existing implementation in repository: `EvidenceCollector` 已拥有原生 extract 回调和最终输出；`ReadSpec` 已有 schema/基数/双读门；输出装配已有 merge/assemble 数据节点。
- mature candidates and pinned versions: browser-use 0.13.8 `SerializedDOMState`/`EnhancedDOMTreeNode`/Actor Element；Chrome `innerText`、属性和 URL 解析；workflow-use 0.2.11 证据生命周期。
- selected implementation: 模型只执行原生 Browser-Use 业务动作。每次 extract 后宿主在内存连续捕获两份同页增强 DOM；业务成功后用最终输出反向寻找两份快照都能唯一复现的最大字段投影，生成迁移 `ReadSpec`。数字文本只允许共同固定前后缀，空白规范化必须由最终值证明。结果配方接受 node、唯一同 schema input 和需求原文授权字符串 constant；后续动作可绑定前序读取的唯一精确值路径，未覆盖输出叶子可唯一复用已验证读取的同 schema、同值叶子。
- reused public surface: 不复制 Browser/Agent/图执行器；继续使用 browser-use 页面事实、现有 reader、TaskChain `ValueBinding` 与 `data.transform`。
- B-A-T-owned adapter and remaining gap: 当前只支持同一主文档、有界对象/对象数组、标量/标量数组字段和共同直接子路径；正式 `RecordProjection` 结构目标、frame/shadow/虚拟列表和派生数据节点仍待分阶段验证。
- license/runtime/platform fit: 不新增依赖；保持固定 Python、TypeScript、Windows 与许可证边界。
- browser/runtime/state ownership conflicts: 只读取当前 authoring Browser；没有第二轮 Agent、第二个 Browser、第二套等待器或输出运行时。
- replay model calls: 0。
- rejected candidates and evidence: 不再注册五个 B-A-T 模型工具；不信任 `extract` 回执或 metadata；不把重复值绑定到第一个节点/输入路径；不保存每条样本 selector；不把宿主生成但未由两份 DOM 共同证明的 CSS 当作证据；不把 DOM index 当作业务绑定。
- focused validation: 合成结构测试覆盖 2 条记录、普通兄弟、同节点文本+href、多值字段、重复值拒绝、一个读取节点映射多个输出字段和整体数组绑定；hybrid Python 40/40、TypeScript 定点 7/7、API 类型检查通过。最新真实 GitHub B 来源成功，但编译尚有 9 个缺口，修复后未重跑，E4 未执行。

真实 job `6d6c0e9e-4ab7-4f06-8429-1585046ece55` 的关键反证：三个原生 `extract` 均未提供可用结构化 metadata；第二页回执仍含第一页列表，
而最终 `done` 中第二页列表已经正确；详情回执又比最终输出选择的正文范围更宽。因此 `extract` 回执只能是 Agent 探索材料，不能作为编译事实源。
新的权威链为“同一动作时刻的两份同页 DOM + 最终成功输出 + 确定性反向投影”；无法唯一复现即缺口，不调用模型补证。

# 干扰与滚动可观测性（2026-09-19）

Product Alignment:
- natural-language task: 复跑浏览器动作时，准确区分原生 dialog、DOM 遮挡和滚动无效，不靠模型猜测页面语义。
- reusable chain boundary: 一个普通浏览器动作的准备、实际派发、事件命中和后置事实。
- runtime inputs: 当前稳定目标或有界 scroll 参数、当前页面状态和声明的后置条件。
- dynamic task outputs: dialog occurrence、DOM 命中关系、scroll 前后坐标/范围/事件及稳定失败原因。
- generic platform capability used: `browser.workflow-step`、browser-use Browser/Tools、CDP 事件和现有 StepVerifier。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 原生 dialog 去重、实际点击机制核验、滚动输入与效果核对。
- existing implementation in repository: browser-use 0.13.8 watchdog/Tools/ScrollEvent，A 的 `DialogEventBridge`，C 的 `NativeEventCapture` 与后态验证。
- mature candidates and pinned versions: browser-use 0.13.8、cdp-use 1.4.5、workflow-use 0.2.11、Tenacity 9.1.2。
- selected implementation: 复跑动作级复用已有 dialog bridge；scroll 派发窗口同时捕获 wheel/scroll，并读取前后固定数值事实。
- reused public surface: BrowserSession、Tools.act、现有 CDP EventRegistry、Page.evaluate、StepVerifier/Tenacity。
- B-A-T-owned adapter and remaining gap: owner 生命周期、无位移原因分类和审计 metadata；不拥有任意 DOM 弹窗语义判断或关闭策略。
- license/runtime/platform fit: 不新增依赖、浏览器或执行循环；沿用受管 AGPL fork 和 Windows/Python 3.12 环境。
- browser/runtime/state ownership conflicts: authoring 继续拥有 run-scoped bridge；普通复跑只在单次动作内借用并恢复同一 registry handler。
- replay model calls: 0。
- rejected candidates and evidence: `role=dialog`/样式不能证明业务语义；browser-use 合成 click 与物理鼠标机制不同；ActionResult 成功不能证明 scroll 实际位移。
- focused validation: 一个真实 Chromium 会话覆盖 native confirm、DOM 完全/部分覆盖、合成/物理点击、正常/无范围/边界/CSS 锁定/事件取消滚动；相关 Python 35/35。

# D 节点职责与沙箱选型（2026-09-19）

Product Alignment:
- natural-language task: 在确定性浏览器复跑中加入纯函数、多路条件和明确声明的语义判断，同时不让未知页面干扰触发模型接管。
- reusable chain boundary: 一个 stable/v2 TaskChain；Function、Branch、LLM 和可选准备动作均为跨网站通用语义。
- runtime inputs: 值绑定、当前页面观察或截图产物和随链版本保存的函数/prompt。
- dynamic task outputs: Function 的一个 JSON 值、Branch port 和 LLM 的一个类型化 `result`。
- generic platform capability used: Zod、LangGraph、QuickJS/WASM、browser-use/CDP、AI Connect。
- replay model calls: Function/Branch/干扰处理为 0；每个实际到达的显式 LLM 节点为 1。
- site/task-specific code added: no。

调研结论：

- [Dify Workflow 快速入门](https://docs.dify.ai/en/guides/application-orchestrate/creating-an-application) 将参数提取/LLM、IF/ELSE、列表处理和模板格式化分开，并明确规则格式化用非 LLM 节点可以获得稳定、零 token 的结果。
- [Dify 错误处理](https://docs.dify.ai/zh/use-dify/build/predefined-error-handling-logic) 把失败终止、默认值和 failure branch 作为节点运行合同，不要求模型生成错误字段。
- [Coze Studio 后端节点文档](https://github.com/coze-dev/coze-studio/wiki/11.-Add-new-workflow-node-types-%28backend%29/e4f740cd15c24f89fb9289592420bdc706fc02b5) 使用动态普通 port、default port 和 exception port；分支选择由节点实际输出映射到 port。
- [Coze Studio Code Runner 配置](https://github.com/coze-dev/coze-studio/wiki/5.-%E5%9F%BA%E7%A1%80%E7%BB%84%E4%BB%B6%E9%85%8D%E7%BD%AE/a95a5bcb378ffed2e75add220aa969cbba0ddb0d) 区分 sandbox/local，并为环境、读写、进程、网络、超时和内存提供许可边界。
- [Dify Sandbox](https://github.com/langgenius/dify-sandbox) 是 Apache-2.0 的成熟独立服务，但依赖 Linux、seccomp 和 chroot，不符合 B-A-T 当前 Windows 本地默认运行条件。
- [Node.js `vm` 文档](https://nodejs.org/download/release/latest-v21.x/docs/api/vm.html) 明确说明 `node:vm` 不是安全机制，不能执行链路内不受信任代码。
- [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten) 通过 QuickJS/WASM 在 Node 中隔离执行 JavaScript；当前固定候选版本 0.32.0、MIT，适合作为 Windows 与 macOS 共用 Function 执行器的直接候选，但理论可移植性不能代替双平台实测。

Reuse Assessment:
- capability: stable/v2 Function、N 路 Branch、单次单值 LLM 和确定性页面干扰处理。
- existing implementation in repository: stable/v1 六类节点、ValueBinding、TaskDataContract、LangGraph runtime、browser-use/CDP adapter 和 AI Connect 审计。
- mature candidates and pinned versions: quickjs-emscripten 0.32.0；Dify Workflow/Dify Sandbox；Coze Studio workflow/code runner。
- selected implementation: Function 复用 QuickJS/WASM；Branch 采用动态 port；LLM 复用现有单次模型桥并移除 delegate。
- reused public surface: QuickJS runtime/context/interrupt；现有 Zod、LangGraph、BrowserSession/CDP 和模型审计。
- B-A-T-owned adapter and remaining gap: stable/v2 合同、v1 只读、沙箱输入输出、port 物化、固定 prompt、可选准备动作、UI 和运行证据。
- license/runtime/platform fit: quickjs-emscripten 为 MIT 且无需 Linux sidecar；安装后必须在同一 commit/lockfile 的 Node 24/Windows x64 与 macOS arm64 上验证中断、内存、栈、宿主隔离和清理；若产品支持 Intel Mac，再补 macOS x64。
- browser/runtime/state ownership conflicts: Function/LLM 无 Browser 权限；干扰处理继续借用唯一 Browser；不新增 Agent loop、图引擎或 checkpoint store。
- replay model calls: 普通路径 0；显式 LLM 每节点最多 1。
- rejected candidates and evidence: Dify Sandbox 缺 Windows 默认支持；Coze local runner 无安全隔离；`node:vm` 不是安全边界；browser-use Agent 会混合模型决策和浏览器动作。
- focused validation: React/Radix 干扰站可见 + headless；QuickJS Windows/macOS 双平台 spike；stable/v1/v2 保存加载；Function/Branch/LLM 正常和错误出口；真实页面不同输入。

# Hybrid 复跑的 HTTP 外部状态与恢复（2026-09-20）

Product Alignment:
- natural-language task: 已发布任务复跑时，主文档要求登录则暂停同一运行等待处理，主文档限流或拒绝访问则给出外部阻断且不启动修复模型。
- reusable chain boundary: 一个普通 `browser.workflow-step` 在真实主文档响应与当前浏览器观察之间形成通用外部状态结果。
- runtime inputs: 已发布链路固定 URL、真实 Chromium 主文档 HTTP 状态和当前 browser summary。
- dynamic task outputs: authentication `human_required`、rate-limit/access `blocked`、恢复观察和类型化 external failure。
- generic platform capability used: browser-use Browser、cdp-use Network 事件、TaskChain capability outcome、checkpoint 与 verifyResume。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 不读站点文案地识别主文档认证、拒绝和限流，并把人工处理后的页面重新接回同一 run。
- existing implementation in repository: BrowserSkill 路径已把 `authentication_required`/`verification_required` 映射为 `human_required`，把 `rate_limited`/`access_denied` 映射为外部阻断；TaskChain runtime 已拥有 checkpoint、resume condition 和同 run 恢复。
- mature candidates and pinned versions: browser-use 0.13.8 的现有 Browser/CDP session；cdp-use 1.4.5 的 `Network.responseReceived` 注册面与 `Network.enable` 命令。
- selected implementation: hybrid runner 订阅同一 Browser 的主文档响应，只保留当前 URL 的 401/403/429 数值；TypeScript adapter 将受控错误码映射到既有 capability outcome/externalFailure，并只对全链可安全导航恢复的场景使用当前 URL 作为恢复条件。
- reused public surface: `CDPClient.register.Network.responseReceived`、`BrowserSession.get_or_create_cdp_session`、现有 `NodeCapabilityResult`、`TaskCheckpoint` 和 `verifyResume`。
- B-A-T-owned adapter and remaining gap: 只承担 Python 安全错误码到产品通用失败合同的适配；验证码等没有协议级信号的页面仍不能靠文字猜测，本阶段不扩展 Profile/账号管理。
- license/runtime/platform fit: 不新增依赖，继续使用已固定的 Python 3.12、browser-use 0.13.8、cdp-use 1.4.5 和 Windows x64 产品范围；macOS arm64 保持延期未测。
- browser/runtime/state ownership conflicts: 不创建第二个 Browser、Agent loop 或 checkpoint store；HTTP 事实来自 hybrid runner 已拥有的唯一 Chromium。
- replay model calls: 0。
- rejected candidates and evidence: 不按登录页文字、CSS class、站点 URL 或业务弹窗做识别；不复制网络抓取器；不把 403/429 当确定性 selector 失败；不为恢复创建新 execution/run。
- focused validation: 401 等待并在受控外部状态解除后恢复同一 run；403/429 为 external block 且无 repair；普通 200 页面不改变既有 hybrid 运行。

# 无参数任务的准备输入语义（2026-09-20）

Product Alignment:
- natural-language task: 用户确认一个无需填写业务参数的浏览器任务后，系统自动完成样本验证、独立复验和发布。
- reusable chain boundary: 一份输入合同为 `null` 的通用任务计划及其两次独立验证运行。
- runtime inputs: 合同允许的 JSON `null` 值；它是已捕获输入，不是“尚未提供”的哨兵。
- dynamic task outputs: 两次执行回执、不可变 release 和默认 preset。
- generic platform capability used: ValueSchema、准备状态机、TaskExecution 和产品发布投影。
- replay model calls: 0；首次准备阶段的模型调用保持原有审计。
- site/task-specific code added: no。

# 根对象业务结果的字段绑定（2026-09-20）

Product Alignment:
- natural-language task: 浏览器一次读取返回完整业务对象时，按已确认的 ResultSpec 字段将该对象发布为可复跑业务结果。
- reusable chain boundary: 一份已验证的根对象输出与若干不重叠的声明字段之间的确定性绑定。
- runtime inputs: verified output assembly、有限 ValueSchema 和计划拥有的 producerRef。
- dynamic task outputs: 每个声明字段对应的 `ResultBinding.assignment`，来源仍指向同一个已验证节点的子路径。
- generic platform capability used: workflow-use output assembly、ResultSpec/ResultBinding、ValueBinding path。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 将一个已验证根对象拆分绑定到多个声明结果字段。
- existing implementation in repository: workflow-use 已拥有 output assembly、字段所有权检查与 ResultBinding 编译；TypeScript host 已逐 assignment 校验源/目标 schema。
- mature candidates and pinned versions: 受管 workflow-use 0.2.11 fork；无需新增库。
- selected implementation: 扩展现有 `compile_result_binding`，仅在根/祖先来源覆盖多个不重叠声明字段时追加相对子路径。
- reused public surface: 已有 `ValueBinding.path`、`ResultBinding.assignments` 和 host `assertAssignmentSchemas`。
- B-A-T-owned adapter and remaining gap: 无新增运行时；只补齐已有公共合同的确定性 lowering。
- license/runtime/platform fit: 不新增依赖或平台要求，继续由受管 fork 哈希门保护。
- browser/runtime/state ownership conflicts: 无；不创建浏览器、Agent loop 或状态库。
- replay model calls: 0。
- rejected candidates and evidence: 不把两个业务字段合并成一个虚构 producerRef，不按字段名猜来源，也不放宽无证据输出。
- focused validation: Python 定点测试覆盖根对象拆分；TypeScript host 继续校验每个子路径 schema；随后以真实业务结果任务验收。

# 修复探索来源身份（2026-09-20）

Product Alignment:
- natural-language task: 用户授权依据某次真实确定性失败重新准备任务，并保留失败证据与旧版本。
- reusable chain boundary: 修复探索任务文本、Python 返回的自然来源和 TypeScript host 身份核验使用同一份失败证据。
- runtime inputs: 已确认需求、计划、失败运行输入和持久化 `TaskExecutionFailureEvidence`。
- dynamic task outputs: 绑定该失败证据的新候选链、两次验证与新不可变 release。
- generic platform capability used: 既有 repair coordinator、browserUseTask、source artifact 和 host source identity gate。
- replay model calls: 0；只有用户授权的修复探索允许模型调用。
- site/task-specific code added: no。

# 自然来源中的可选页面准备（2026-09-20）

Product Alignment:
- natural-language task: 预执行遇到会遮挡后续业务操作的对话层时，把已验证的关闭动作编入新版本；复跑页面没有该对话层时直接跳过。
- reusable chain boundary: 同文档内一个有单次派发证据的准备动作和紧随其后的稳定目标消费者，物化为“检查消费者；必要时准备；再次检查”的通用分支。
- runtime inputs: 原始自然 trace 的遮挡变化、对话语义、原生派发、文档身份及消费者稳定目标证据。
- dynamic task outputs: `ready | missing | blocked | ambiguous` 目标就绪性和确定性分支结果。
- generic platform capability used: 既有 workflow-use 稳定目标解析、`materializePreparationGraph`、stable/v2 Branch 和同一 Browser session。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 已准备页面变体的可选动作及后续目标就绪性检查。
- existing implementation in repository: workflow-use 已拥有唯一目标解析、命中遮挡检查和文档身份；host 已有未接入的 `materializePreparationGraph`。
- mature candidates and pinned versions: 受管 workflow-use 0.2.11、browser-use 0.13.8、现有 stable/v2 runtime；无需新增库。
- selected implementation: 从已校验原始事实保守识别“对话内单次 click 改变 overlay 状态，且同文档后续目标变为唯一可操作”的相邻动作；复用现有准备图并给 runner 增加只读目标就绪性命令。
- reused public surface: `TargetResolver.prepare_action_target`、目标准备的 document identity、TaskChain capability/branch ports。
- B-A-T-owned adapter and remaining gap: 只负责证据到版本化准备图的适配和 TS/Python 协议；无法证明的页面变化仍显式中断并要求重新准备。
- license/runtime/platform fit: 不新增依赖；Windows x64 当前范围，macOS arm64 继续延期未测。
- browser/runtime/state ownership conflicts: 检查、准备和消费者共用一个 runner/Browser；不新增 Agent loop、运行时或 checkpoint store。
- replay model calls: 0。
- rejected candidates and evidence: 不按网站、文案、业务字段、CSS class 或 URL 猜弹窗；不让模型在复跑时临时找关闭按钮；不把准备动作无条件执行。
- focused validation: 纯合同测试覆盖证据不足拒绝与图改写；真实 headless 页面同时覆盖 overlay 存在和不存在，两条路径都零模型。

# 修复候选的零派发验证重试（2026-09-20）

Product Alignment:
- natural-language task: 用户已授权并生成新候选后，若验证在任何节点或 Browser 命令派发前因宿主预检失败，修好宿主后继续验证同一候选。
- reusable chain boundary: 同一失败证据、同一已保存不可变候选和一次新的显式重试授权。
- runtime inputs: 失败修复任务、候选链引用、零 transitions/commands/invocations 的验证执行事实。
- dynamic task outputs: 新的验证执行；通过后继续双输入验证和发布。
- generic platform capability used: 已有 repair job、TaskExecution consumption、不可变 chain reference 和验证队列。
- replay model calls: 0；只有没有可复用候选时才重新探索。
- site/task-specific code added: no。
## 2026-09-20 自然语言站点入口与只读链路画布

```text
Product Alignment:
- natural-language task: 用户只说目标站点名称和业务目标，准备任务自行确定预执行入口；用户可查看实际发布的节点链路
- reusable chain boundary: 计划保存需求授权范围内的预执行入口，链路画布只投影已保存的计划、链版本、节点和运行证据
- runtime inputs: 只有复跑时会变化的业务值；入口 URL 不进入用户运行表单
- dynamic task outputs: 经预执行验证的 TaskChain、版本状态、节点图和运行审计
- generic platform capability used: TaskPlan、受控 origin grant、React Flow、既有 TaskChainConnection
- replay model calls: 普通复跑不增加模型调用；入口只在规划/预执行阶段形成
- site/task-specific code added: no
```

真实新建任务暴露了 P6 样本未覆盖的合同断层：已确认需求明确写有站点名称，但 `collectOrigins` 只识别完整 URL，准备流程把空 `allowedOrigins` 直接交给 hybrid runner，两次均在任何浏览器动作和探索模型调用前失败。修复把通用 `entryUrls` 保存为计划事实，由规划模型根据已确认来源生成，宿主再派生受控 origin；不向用户请求 `startUrl`，也不为具体网站加映射。旧计划继续可读，新规划候选必须提供至少一个 http/https 入口。

原 React Flow `LiveChain` 组件和节点投影从未删除，但产品导航曾移除唯一入口。当前恢复为“链路画布”只读标签页，保留平移、缩放、版本选择、节点详情与运行证据；JSON 输入框和内部样本/换输入验证按钮不回到正常产品路径。

# 执行资源清理与链路工作台修订（2026-09-21）

第三次真实正式复跑证明：当前上游 runner close 的非零退出码会覆盖已经 completed 的 TaskRun，并被通用 catch 误分类为可模型修复的确定性链路失败。
当前清理实现已经拥有 ChildProcess、browser-use Browser owner、Windows 精确 PID 树终止和临时目录删除；缺口是结构化清理报告、幂等 close、
持久化恢复和产品投影，不是缺少另一个进程框架或浏览器驱动。新增第三方进程管理库不能解决 owner、Profile、历史结果和 cleanup_required 合同，因此不采用。

最初调研先后把问题误判为“只缺自动布局”和“需要容器/子画布编辑器”。当时进一步核验后形成“阶段总览 + 单个临时动作摘要 + 聚焦真实动作子图”的结论；2026-09-29 的准备期长链反例证明单个摘要仍不足，项目最高层级规则又明确禁止切换成另一张子图。当前决定改为每个阶段父节点内常驻紧凑动作列表；分支、循环和复杂出口也只在原父节点原位展开。列表行和展开路由只引用同一 TaskChain 的真实 nodeId/edge，不是 React Flow compound child、第二份图或可执行子链。

仓库已经使用 `@xyflow/react@12.11.6`。其公开节点、边、Handle、选择、重连、视口和 MiniMap 足以覆盖阶段父节点总览；阶段内的动作列表和原位展开路由是同一父节点的 DOM/SVG 内容，不需要 React Flow `parentId` 的复合 sub-flow 或另一张 focus graph。`@dagrejs/dagre@3.1.1` 为 MIT，含 TypeScript 声明，直接依赖 `@dagrejs/graphlib@4.0.5`；npm 元数据的 unpacked size 分别约 1.41 MB 与 0.47 MB，约 1.9 MB 不是浏览器最终 bundle，也不是启动时解包 8 MB。Dagre 只在首次投影、阶段结构改变或用户点击“整理布局”时计算父节点坐标，不在每次渲染运行。

FlowGram.AI 与 Coze Studio 仍是有价值的产品参考，但不作为生产编辑器依赖。官方 free-layout loop 示例用 `isContainer` 建立容器；`toggleLoopExpanded` 在折叠/展开时改变容器尺寸并隐藏/显示子节点和连线。当前方案拒绝由第二批画布节点组成的 compound sub-flow；阶段卡里的动作列表与展开路由是同一父节点的 DOM/SVG 投影，不参与运行调度。FlowGram 的 editor/document/form/history/variable 等广泛状态所有权也会与 B-A-T 已有服务端 revision、checksum、digest 和持久化事实源重叠。ELK 对阶段父节点布局没有 Dagre 之外的已证实价值，因此本轮不引入。

节点详情不能由 UI 递归解释任意 config。需要新增通用 capability descriptor registry，为每种平台能力声明标题/摘要生成、类型化字段、控件、目标要求、端口、兼容替换和验证支持。它不认识网站、业务字段、页面文案或 CSS class。缺少 descriptor 的 capability 只读，不能用 JSON 编辑器兜底。修改原子动作时必须连同所属阶段、前置条件、后置条件和下一动作展示；任何执行语义改变使旧验证失效，直到聚焦验证重新证明阶段具名出口可达。

CodeGraph 对当前接线的核验还显示：任务行选择只更新选中项；运行命令在侧栏/独立 Dialog，accepted 后没有把新 execution 交给链路画布；现有节点投影会跨多个 TaskRun 按节点取最后事件。故“增加运行按钮和动画”不是完整修复，必须先增加幂等 accepted execution 回执、按 execution/sequence 的事件续接，再由画布绑定单次运行。左侧列表只保留选择和即时反馈。

参考：

- https://github.com/coze-dev/coze-studio/blob/main/README.md
- https://github.com/bytedance/flowgram.ai
- https://github.com/bytedance/flowgram.ai/blob/main/apps/demo-free-layout/src/nodes/loop/index.ts
- https://github.com/bytedance/flowgram.ai/blob/main/apps/demo-free-layout/src/utils/toggle-loop-expanded.ts
- https://reactflow.dev/learn/layouting/layouting
- https://reactflow.dev/learn/layouting/sub-flows
- https://reactflow.dev/learn/advanced-use/performance

Reuse Assessment:
- capability: 正式 execution 所属资源的可靠清理与恢复；带阶段总览、阶段内原位展开编辑和单次 execution 实时运行态的链路工作台。
- existing implementation in repository: ChildProcess/browser-use owner/Windows PID 树终止/临时目录清理；`@xyflow/react@12.11.6`、revision draft layout/checksum/digest、TaskRun 持久化事件。
- mature candidates and pinned versions: 保留现有 runner/browser 公共面；`@xyflow/react@12.11.6`、`@dagrejs/dagre@3.1.1`；FlowGram 1.0.14 与 ELK 仅为对照候选。
- selected implementation: 现有 runner adapter 增加结构化 cleanup report；UI 保留 React Flow，Dagre 只布局阶段父节点，复杂路由在父节点内原位展开。
- reused public surface: ChildProcess close/exit、browser-use Browser close/kill；React Flow nodes/edges/handles/selection/reconnect/viewport/minimap；Dagre graph/layout/rankdir。
- B-A-T-owned adapter and remaining gap: cleanup 持久化与产品状态、accepted execution/事件续接、ChainPresentation/CapabilityDescriptor 服务端事实、TaskChain/阶段/事件到编辑器模型映射、发布布局来源和上下文节点编辑。
- license/runtime/platform fit: 不为清理新增依赖；React Flow/Dagre 均为 MIT，Dagre 含类型声明；Windows/Vite headless 隔离原型已通过，生产接线仍待 I5，macOS arm64 仍延期未测。
- browser/runtime/state ownership conflicts: 不新增 Browser/CDP owner；编辑器不拥有 runtime、版本或执行状态。
- replay model calls: 0，显式 llm 节点除外。
- rejected candidates and evidence: 忽略 close/按退出码改判、第三方进程框架、固定网格、两套可执行图、永久大容器子画布、FlowGram 的重叠状态所有权、无证据引入 ELK、自研画布/布局和原始 JSON 编辑均不能满足当前不变量。
- focused validation: I0 React Flow+Dagre 隔离原型；I2 真实 child cleanup；I4 presentation/descriptor 服务端合同；I5 生产运行台；I6 修订发布；I7 正式 Workbench/API 画布内复跑、cleanup_required 恢复和产品闭环。
# 2026-09-24 新建凡人任务样本观察恢复

Product Alignment:
- natural-language task: 从新建需求准备并复跑“在 Bilibili 播放当前最新可播放的《凡人修仙传》正片”。
- reusable chain boundary: 已编译草稿的普通执行器只重取当前页面观察；失败的样本执行和链版本保持不可变。
- runtime inputs: 当前浏览器会话、标签页、URL 与 DOM；无业务输入。
- dynamic task outputs: 同一次浏览器动作之后一致的页面身份与观察摘要，供运行检查点审计。
- generic platform capability used: 已有 Browser-Use 页面状态读取、workflow-use 页面身份检查、TaskRun 事件和清理协议。
- replay model calls: 0；重取观察不重发浏览器动作或调用模型。
- site/task-specific code added: no。

新建任务 `2a777a77-353e-4894-9b96-1e505827d366` 的一次 headless Browser-Use 代表试做成功并编成唯一草稿；首个样本运行在 `s-a-0008` 点击后以 `target_document_identity_unavailable` 失败，前面节点已完成，14 次浏览器命令、0 次模型调用，清理已确认。当前错误把页面身份探测的底层异常折叠为同一代码，尚不能证明唯一根因。点击后的 URL 变化与观察时 DOM 尚不可用存在竞态风险；修复只在普通观察读取暂不可用时短时重取整份快照，保持标签页和 URL 一致，不重发动作。现有 Browser-Use 和 workflow-use 已提供全部读取能力，不引入新依赖。

Product Alignment:
- natural-language task: 同一新建任务必须每次重新选择 Bilibili 当前可播放的最新正片，并排除非正片。
- reusable chain boundary: 只修订该任务的唯一草稿；从当前剧集列表读取候选，经纯函数选出序号，再让同一链路继续点击和播放。
- runtime inputs: 无；剧集列表是本次浏览器页面的动态观察。
- dynamic task outputs: 当前候选序号及播放状态，历史失败样本和旧任务发布版本不改写。
- generic platform capability used: 已有 read-fields、function、结构目标序号绑定、草稿修订 API 与画布展示。
- replay model calls: 0；普通样本和正式运行只用固定执行器。
- site/task-specific code added: no；剧集筛选表达式和页面选择器仅保存在此任务草稿数据中。

原始新草稿在进入剧集页后直接点预执行时记录的 `a[6]`，没有读取剧集列表或绑定最新候选，不能满足已确认需求。开发者随后通过 headless 页面脚本直接调用草稿 API，参考此项目中该任务旧 Release V8 的“读取列表→纯函数选序号→结构目标点击”任务数据，为新草稿补入两个节点并替换点击配置，同时在非正片过滤中加入本次需求明确的 PV；其余计划和动作保持不变。这是开发者手工构造的修订数据，没有使用产品给用户的修订入口或自然语言调整建议确认。后续样本、独立复验和页面发布的技术事实不能替代新任务的完整产品验收；历史 V8 的运行也不能替代新任务验收。

Product Alignment:
- natural-language task: 修订后的浏览器链路要在已确认计划额度内完成样本与复验，发布后工作台要展示当前版本的真实状态。
- reusable chain boundary: 预算修订生成新的草稿版本和候选快照；历史执行和准备失败保留审计，不回写发布链路。
- runtime inputs: 当前计划步骤授权上限、草稿命令额度、准备活动与发布的时间顺序。
- dynamic task outputs: 当前草稿的预算、验证记录与当前工作台活动状态。
- generic platform capability used: TaskDraft 修订、TaskPlan 额度校验、TaskExecution/Release 投影。
- replay model calls: 0；这些改动不增加普通复跑模型调用。
- site/task-specific code added: no；站点和剧集规则只在任务草稿与发布数据中。

新任务的开发者修订链 v2 增加了当前页面读取和函数选择，仍保留旧的 15 次命令额度，第二次样本在 15/15 后于目标点击前被预算阻断。计划步骤授权上限为 3850；开发者再次通过页面脚本直接调用草稿修订 API 将额度显式设为 24，产生草稿 revision 2 / 链 v3，清空旧验证。新的样本及独立复验各使用 17 次浏览器命令、0 次模型调用，均完成并确认清理，随后从正式画布点击发布 Release V1。审计曾发现一段只沿成功直线推算命令数的自动算法，无法覆盖分支、循环和异常观察，且本任务没有实际用到；已删除，只保留受计划上限约束的显式修订和真实试跑验证。发布后的旧准备失败一度仍被工作台投影为当前活动；按当前草稿/发布与准备活动的时间顺序修正投影，旧失败记录不删除。发布后普通执行已完成两次，但依赖前述开发者直接修订，故完整用户产品路径仍未通过验收。

Product Alignment:
- natural-language task: 浏览器任务中的一次点击或 Enter 打开新标签页后，预执行仍须保存可编译的真实页面证据。
- reusable chain boundary: 仅给本次 Browser-Use owner 新附加的页面会话解除调试暂停；不改动作、链路或来源合同。
- runtime inputs: 受管 Browser-Use 会话及 Target.attachedToTarget 的 page/session 身份。
- dynamic task outputs: 原生新页面继续导航后由现有观察、编译和运行路径生成的事实。
- generic platform capability used: browser-use 0.13.8 SessionManager attach 流程与 cdp-use 1.4.5 Runtime.runIfWaitingForDebugger。
- replay model calls: 0；附加页恢复不调用模型或重复浏览器业务动作。
- site/task-specific code added: no。

本地安装包源码核验：`SessionManager._handle_target_attached` 仅在事件 `waitingForDebugger=true` 时调用 `Runtime.runIfWaitingForDebugger`，而 `BrowserSession.get_or_create_cdp_session(focus=True)` 已对聚焦页面无条件调用同一命令并将失败视为非致命。`cdp-use` 事件注册每个 method 只有一个 handler，因此 B-A-T 不能另注册 `Target.attachedToTarget` 以免覆盖 Browser-Use 的会话池。已验证的实验适配限于本次 Browser 实例：对该事件标识的 page session **先**有界发送相同恢复命令，再执行原 attach 回调；已关闭标签页的会话缺失按短生命周期处理。此前仅由采样推测的标签发现扩窗和 DOM 重读补丁已经撤回；它们没有证明针对本故障。

Product Alignment:
- natural-language task: 每次运行都从当页可能变化的候选集合中按已确认规则选择目标。
- reusable chain boundary: 首次 Browser-Use 试做必须留下完整候选读取与目标绑定；缺证的集合点击不进入可发布候选。
- runtime inputs: 当前页面的候选集合，不使用样本序号、站点名称或剧集编号。
- dynamic task outputs: 已证明的读取、纯函数选择结果及本次目标序号。
- generic platform capability used: Browser-Use find_elements、既有 verified_natural_read、selection_function 与编译 gap。
- replay model calls: 0；选择函数仅在准备时生成，普通复跑不调用模型。
- site/task-specific code added: no。

原始凡人来源 a-0008 的同级链接共享结构 class，但没有该页的完整候选读取，编译器误把历史 a[6] 当成可复跑目标。通用修正对这种未绑定集合点击在原生派发前向探索 Agent 返回读取要求，并在离线编译时拒绝固定 XPath；不允许历史成功运行或开发脚本修订回填这个来源。以该来源的原始持久事实离线检查，现返回 `collection_selection_read_required`，目标为 null。此门只阻止假成功；后续仍须用新的正式预执行、两次验证、手动发布和再次运行证明首次编译真正完成。

2026-09-25 接入核验：沿用 `browser-use@0.13.8` 和 `cdp-use@1.4.5`，复用实验项目 `PopupResumeAdapter` 的单实例方法包装，不替换库、不接管 B-U 会话池。B-A-T 的 `Runner.start`/`start_profile` 在 `Browser.start()` 后安装，`Runner._close` 的 `finally` 还原；本地 headless Enter 开页样本新增 1 页，恢复 2/2、清理确认，见 `work/recovery-20260925/popup-smoke-result.json`。这是通用新标签行为证据，正式《凡人》准备与链路编译仍需单独验收。

Product Alignment:
- natural-language task: 每次从当前页面的完整候选集合按用户已确认规则点击目标。
- reusable chain boundary: 集合点击只消费本次同页 `find_elements` 的已验证读取；准备期纯函数将读取转换为运行时 ordinal，候选漂移要求重新读取。
- runtime inputs: 当前 DOM 集合及准确页面身份；不得沿用探索时的序号。
- dynamic task outputs: 已验证读取引用、纯函数所选原始 ordinal、同次目标点击。
- generic platform capability used: 现有 `find_elements`、`verified_natural_read`、`browser.read-fields`、QuickJS function 与结构目标绑定。
- replay model calls: 0；模型只在准备期生成并校验选择函数。
- site/task-specific code added: no。

合同审查发现：`verified_collection_query` 只核对页签、URL、数量与被点击 backend，未核对当前集合身份/内容仍等于原读取；`selection_read` 未核对读取 targetId 与点击前 tab，`bind_selection_function` 在匹配失败时放行原样点击。修正只关联内部集合读取来源并在原 Browser owner 内复核，保留唯一语义标签目标的固定路径；不引入浏览器控制、图调度或模型后备。

Product Alignment:
- natural-language task: 从 Bilibili 现场查到作品入口后继续进入剧集页，再按本次页面列表选择最新正片。
- reusable chain boundary: 导航地址必须绑定到此前已验证读取的确切输出字段；多次读取同一值时，以最近一次仍能唯一定位该值的读取为来源，单次读取内重复值仍拒绝。
- runtime inputs: 当前页面重新读取的链接集合；无用户业务参数。
- dynamic task outputs: 已验证的链接字段和后续当前剧集选择，不固化一次性页面 URL。
- generic platform capability used: 既有 `verified_natural_read`、node output binding、编译器来源校验和 `browser.read-fields`。
- replay model calls: 0；普通复跑只消费确定性读取输出。
- site/task-specific code added: no。

2026-09-25 正式新任务首编译事实：代表试做已通过新页进入 Bilibili 搜索页，完成 10 次浏览器命令并观察到播放；`a-0006` 的精确作品链接读取只含一条，`a-0007 navigate.url` 与其中 `attribute_href` 相等。先前更宽的 `a-0005` 读取也含同一 URL 四次，旧绑定器把所有历史匹配并在两次读取之间判为歧义，留下唯一 `natural_binding_evidence_missing:url` gap。收集器已改为优先最近的唯一读取，同次读取多路径歧义仍拒绝。

Product Alignment:
- natural-language task: 准备任务已有有效方案、代表试做却缺少可编译的页面来源时，从该方案重新采集一次证据。
- reusable chain boundary: 仅在完整旧来源的编译缺口全部要求 `collect_evidence` 时显示显式续做；旧来源、运行和失败审计不可改写。
- runtime inputs: 当前已确认需求、保存的方案与代表输入，以及本次新浏览器页面事实。
- dynamic task outputs: 新的独立试做来源和草稿候选；旧编译缺口保留可追溯。
- generic platform capability used: 既有准备任务 `resume_preparation_from_plan`、source artifact 校验和 Browser-Use 单会话 owner。
- replay model calls: 0；重新采集只发生在准备任务，正式复跑仍无隐式模型调用。
- site/task-specific code added: no。

旧来源的 `a-0007` 预观察里没有 URL 绑定事实，但完整 trace 已保存更早的已验证读取。续做门据来源 artifact 的 `collect_evidence` 缺口开放，明确从保存方案开启新的代表试做；旧来源和失败审计始终保留。第二次真实试做解决了入口 URL 绑定问题，后续却因宽泛按钮查询导致入口点击的自动 Function 样本无有效输出，且最新剧集 Function 的变化样本超出读取规格的 ordinal 上限，留下 `function_output_invalid`。不应直接第三次试做或修改模型答案。

Product Alignment:
- natural-language task: 已保存试做中，若导航参数与此前已验证读取的唯一字段完全相等，可以从不可变 trace 恢复来源绑定。
- reusable chain boundary: 离线编译器只派生来源决策，不修改原浏览器事实；TS 入库侧独立复核原始读取、动作顺序、值和唯一字段路径。
- runtime inputs: 运行时的 `browser.read-fields` 节点输出，而非本次试做 URL 常量。
- dynamic task outputs: 后续导航地址随实时读取更新；原 trace 和旧失败记录不改。
- generic platform capability used: 现有 `verified_natural_read`、node output binding 和离线编译恢复。
- replay model calls: 0。
- site/task-specific code added: no。

Product Alignment:
- natural-language task: 从页面候选中读取首项后继续执行；候选为空时明确失败，不报告任务完成。
- reusable chain boundary: 已验证读取的输出 schema 若保证所用索引存在，编译器可直接使用该索引；读取不满足 schema 时由运行时进入失败路径。未受 schema 保证的索引仍须有显式控制流。
- runtime inputs: 当前浏览器读取结果，不使用探索样本列表。
- dynamic task outputs: 当前读取的首项字段及其后续动作；空列表产生可审计的运行失败。
- generic platform capability used: `browser.read-fields` 输出 schema 校验、已有失败路由和节点输出绑定。
- replay model calls: 0。
- site/task-specific code added: no。

Product Alignment:
- natural-language task: 首次试做必须能把中间页面动作和最终动态目标分别编译为可复跑链路；页面候选变化时仍按相应步骤的规则选择。
- reusable chain boundary: 选择注解只使用当步真实读取、动作上下文与已确认需求；模型变化样例必须落在该读取的输入和输出合同内，异常直接留下编译缺口。
- runtime inputs: 本次页面重新读取的候选与其原始 ordinal，不使用上次试做的候选位置。
- dynamic task outputs: 当步纯函数选择的 ordinal、动作结果及后续播放状态。
- generic platform capability used: 既有 Browser-Use find_elements、verified_natural_read、准备期 selection annotation、QuickJS 合同校验和 CollectionReadRequired 补读回路。
- replay model calls: 0；仅首次准备期对缺失的选择规则生成程序。
- site/task-specific code added: no。

2026-09-25 第二次新来源的首编译失败分两处：中间页的宽泛 `button` 查询包含 41 个不同用途的控件，模型把最终“最新正片”规则错套到只显示“立即观看”的中间动作，真实观察样例即失败；最终剧集选择程序的变化样例输出 ordinal 91/52/77，超出浏览器读取 `maxItems=50`。修正必须在新的 B-U 之前作用于常规准备路径：让当步动作语义和候选合同进入注解边界，保留严格的实际样例与变化样例校验；不能通过删除失败样例、放宽运行合同或复用旧来源宣称成功。

2026-09-25 新任务 `b1e38157-4e23-4511-9dbe-7eaaf6ca07c2` 的第一次正式准备：B-U 已完成并观察到播放，14 次浏览器命令，入口导航绑定与宽泛中间按钮问题未再出现；自动首编译仍在 a-0013 留下 `selection_annotation_unavailable` 和 `selection_function_evidence_required`，没有草稿。结构化选择输出改成按 `maxItems` 动态 Pydantic 模型后，调用仍以原 `SelectionProgram.model_validate` 解析完成对象；Pydantic 对不同基类的模型实例报 `model_type`，定点复现了该跨模型交接缺口。动态模型现继承原合同，并新增“真实结构化模型实例”测试；下一次只能用新 B-U 来源验证正常首编译，不能把这份来源的重编译算验收。

2026-09-25 验收复核：模型桥接 `apps/api/python/browser_use_runner/ai_connect.py` 在带 `output_format` 时把完成值先解析成对应 Pydantic 实例，证明上述跨基类交接是真实运行路径。修正后新建的另一任务 `3286024e-09c8-45b0-a342-488597ebfe99` 有唯一准备作业、唯一新来源，B-U 成功后在同次作业自动编译为 12 段且零缺口；样本与独立复验、手动发布 V1、两次普通零模型复跑、每次 `media_playback=playing` 节点成功及重启恢复均有正式 UI/API/SQLite 证据。未以旧来源重编译或开发者草稿注入作为该结论。G12 异常分支与 macOS 真机仍各自保留未验边界。

2026-09-25 有界面复跑失败的诊断准备：正式 UI execution `7e6680f2-18a1-4aac-838f-962d9ed091f0` 在 `s-a-0004` 的 30 秒后置核验失败；Chrome 历史证明动作访问了与发布链 scope 完全相同的搜索 URL。该节点同时检查 URL 变化和搜索页 `a` 集合读取；现有 `StepVerifier` 已返回失败检查名，`postconditions.verify_once` 却折叠成统一 `ordinary_postcondition_failed`，因此持久记录无法区分页焦点、候选超额、投影或稳定性。先补不含页面内容的有限诊断，再依据同一次正式运行的事实修复；不凭页面 URL 猜测或复用旧 headless 成功记录。

Product Alignment:
- natural-language task: 从浏览器页面进入下一页后，若运行未满足后置条件，指出具体失败的通用检查条件以便修复。
- reusable chain boundary: 保留不可变发布链与单次运行事件；失败只携带有限检查种类和固定诊断码，不携带页面正文、URL 或账号数据。
- runtime inputs: 本次动作前后由既有 StepVerifier 检查的页面事实。
- dynamic task outputs: 本次失败的安全检查类别；业务输出仍按原链路合同。
- generic platform capability used: workflow-use StepVerifier、Tenacity settle、既有错误码安全边界。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 复跑后置条件失败的有限诊断。
- existing implementation in repository: `workflow_use.hybrid.postconditions.verify_once` 已调用上游 `StepVerifier.verify_step`，后者返回 `checks_failed` 和详情；`safe_runtime_error_code` 已限制可透传的受管错误码。
- mature candidates and pinned versions: 当前受管 workflow-use 0.2.11 的 StepVerifier、Tenacity 9.1.2；无需新库。
- selected implementation: 复用 StepVerifier 的结构化失败检查，仅在受管适配层映射成固定安全码。
- reused public surface: `VerificationOutcome.checks_failed`、已有 `VerificationCheck.parameters` 和 settle 策略。
- B-A-T-owned adapter and remaining gap: 只补安全诊断映射，不重写校验器或浏览器动作。
- license/runtime/platform fit: 沿用现有受管 fork、Python 3.12、Windows x64 路径；无新依赖。
- browser/runtime/state ownership conflicts: 不改变一次动作、单浏览器 owner、checkpoint 或清理。
- replay model calls: 0。
- rejected candidates and evidence: 不把页面原文或上游任意异常直接写入运行理由；现有统一错误码已使本次失败缺乏可判定条件。
- focused validation: 受管适配层定点测试和一次正式 UI 有界面复跑；结果待取得。

2026-09-25 定点诊断结果：正式有界面运行 `9c49f1f7-584b-4936-85ee-19b15b508ee7` 在 `s-a-0004` 报 `ordinary_postcondition_failed_read_fields_read_collection_limit`，清理已确认。来源 `618229f3-0d6c-456e-8068-5f95fccee37b` 的完整全页 `a` 查询当时恰好读到 200 条；其后失败的点击未派发，窄范围查询读到一条目标链接，后续导航只消费窄查询的链接。发布链却保留无人消费的全页读取，并使前一步的 ConsumerReadiness 指向它；页面链接数后来超过读取上限，触发严格拒绝。不能截断集合、调大上限、手改旧 Release，或把旧来源的重新编译算作全新任务验收。

Product Alignment:
- natural-language task: 浏览器先宽泛观察页面，再用更准确的完整候选读取决定后续导航或选择，并在普通复跑中可靠执行。
- reusable chain boundary: 只把有实际动作、绑定或输出职责的已验证读取纳入 TaskChain；被排除的纯探索读取仍须由来源和覆盖账本审计。动作后的就绪条件指向保留且真正被消费的读取。
- runtime inputs: 当前页面的真实候选集合、源动作顺序、读取查询与后续值绑定；不复用探索时的 200 条样本。
- dynamic task outputs: 正式运行时重新读取的目标链接或候选序号，以及原来源动作的完整覆盖分类。
- generic platform capability used: 现有 natural compiler、verified natural read、ConsumerReadiness、source coverage 和输出绑定。
- replay model calls: 0；普通读取、导航和选择不隐式调用模型。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 已验证纯读取的依赖裁剪与动作就绪条件重绑。
- existing implementation in repository: 受管 workflow-use 0.2.11 的 natural compiler 已有逐动作读取编译、绑定、ConsumerReadiness、coverage 和输出合同；缺少最终依赖裁剪。
- mature candidates and pinned versions: 继续复用受管 workflow-use 0.2.11 的编译与证据模块；该局部编译规则无需另引图优化库。
- selected implementation: 在现有编译最终化阶段依据真实绑定和输出消费判断读取是否存活；对经过原始查询与读取证据验证的死读取记录排除覆盖，再用保留读取重建就绪条件。
- reused public surface: 现有 compiled segments、verified natural read、source coverage 和 ConsumerReadiness 合同。
- B-A-T-owned adapter and remaining gap: 只补 B-A-T 的来源到可复跑 TaskChain 的编译决策与审计，保留原 Browser-Use 浏览器控制。
- license/runtime/platform fit: 不引入依赖，沿用当前受管 fork、Python 3.12、Windows x64。
- browser/runtime/state ownership conflicts: 不创建第二个浏览器 owner，不改变运行时图调度、检查点或清理职责。
- replay model calls: 0。
- rejected candidates and evidence: 提高 `maxItems` 或截断会掩盖完整候选合同；直接修改发布版本或复用旧来源无法验证首次编译；全新编译器会重复已有成熟能力。
- focused validation: 编译/coverage/输出/ConsumerReadiness 定点测试，受管 fork 校验；之后正式工作台全新 B-U 来源的首次编译、样本、独立复验和有界面普通运行。

Product Alignment:
- natural-language task: 用户在每次正式运行前选择是否显示浏览器窗口，适用于视频播放、网页读取和表单等任务。
- reusable chain boundary: 展示模式属于本次 execution 的启动设置，不属于不可变 TaskChain、发布版本、节点或业务输入；恢复同次 execution 时沿用已保存设置。
- runtime inputs: 已发布链路的业务输入、每次运行明确选择的 headless 布尔值。
- dynamic task outputs: 本次运行事件、业务输出和可审计的浏览器启动设置。
- generic platform capability used: 既有运行弹窗、`run_task` Zod 边界、TaskExecution 持久化、单一 Browser owner 和 BrowserProfile.headless。
- replay model calls: 0；展示模式不改变模型调用边界。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 单次正式运行选择有界面或无界面浏览器。
- existing implementation in repository: 运行设置弹窗已有节奏控件，后端已有 Python hybrid runner 的 `headless` 参数及 BrowserProfile 启动能力；当前仅由全局环境变量决定。
- mature candidates and pinned versions: 现有 Radix Themes、Zod、browser-use/BrowserProfile 与已接入的 Python hybrid runner；无需新增库。
- selected implementation: 在既有 UI/API/TaskExecution 合同中保存本次布尔设置，并将其穿过现有单会话 owner 传给 runner。
- reused public surface: Radix 表单控件、Zod 解析、现有 `startHybrid` 和 `BrowserProfile(headless=...)`。
- B-A-T-owned adapter and remaining gap: 为正式运行补齐每次 execution 的展示设置交接；显式的 `false` 必须覆盖服务端旧环境变量。
- license/runtime/platform fit: 沿用仓库已有依赖与 Windows 运行路径，无新依赖。
- browser/runtime/state ownership conflicts: 单次运行仍只启动一个产品浏览器控制会话；设置写入当前 execution 后不随环境变化漂移。
- replay model calls: 0。
- rejected candidates and evidence: 不用全局环境变量代替用户本次选择；它无法表达同一发布链路不同 execution 的模式，也无法作为恢复事实。
- focused validation: 合同解析与持久化、runner 启动参数定点测试，以及发布链路的实际有界面/无界面运行。
## 2026-09-25 同文档 URL 变化后的安全重观察（实施前记录）

Product Alignment:
- natural-language task: 浏览器试做在动态页面中选择真实可播放内容，页面地址在模型观察与点击之间发生同文档变化时继续查明当前页面。
- reusable chain boundary: 首次探索中的旧索引动作必须不派发，新观察与新选择由原探索 Agent 完成；已失败且无可复用来源时，工作台可显式创建同一 Requirement 版本的新准备 job，原失败记录保留。
- runtime inputs: 当前浏览器标签、文档身份、模型曾见的观察与拟执行动作。
- dynamic task outputs: 只有重新观察后真实完成的来源、浏览器命令和错误证据。
- generic platform capability used: 现有 workflow-use `SourceObservationScope`、`AuthorCaptureCallbacks`、Browser-Use Agent 回合、来源审计及 `prepare_task` 工作台命令。
- replay model calls: 正式复跑 0；只影响首次 B-U 探索中的观察恢复。
- site/task-specific code added: no

Reuse Assessment:
- capability: 同一标签同一文档发生 SPA 地址变化时，在派发旧索引动作前请求 Agent 重新观察。
- existing implementation in repository: workflow-use `verify_before_action` 已比较标签、文档和 URL，`CollectionReadRequired` 已证明回调可拒绝动作并允许 Agent 下一轮重新决策。
- mature candidates and pinned versions: 沿用已固定的 browser-use 0.13.8、workflow-use 0.2.11；不引入新库。
- selected implementation: 扩展现有受管 workflow-use 捕获回调，仅对稳定的同标签、同文档、仅 URL 改变抛可恢复的观察刷新信号；无来源可续时工作台提供手动重新试做入口。
- reused public surface: Browser-Use 原生回合及现有单次 Browser owner；不复制浏览器控制或 Agent loop。
- B-A-T-owned adapter and remaining gap: 只把可恢复的观察失效映射为未派发动作、下一轮重新观察；不同文档或不稳定观察仍失败关闭；UI 手动重试复用现有 `prepare_task`，不改旧 job。
- license/runtime/platform fit: 沿用仓库现有受管依赖、Windows Python 3.12；无新运行时依赖。
- browser/runtime/state ownership conflicts: 仍由同一个 B-U 会话拥有浏览器；未重新启动会话，不接受旧观察作为新动作证据。
- replay model calls: 0。
- rejected candidates and evidence: 当前新任务的第 9 个动作在 `before_action` 被拒；持久化诊断显示 targetId 和 documentDigest 相同、stable=true，只有 urlDigest 改变。直接放行旧索引会破坏来源证据；整次失败会丢失可安全恢复的探索机会。
- focused validation: 新增同文档 URL 变化回调测试、不同文档仍拒绝测试；随后仅在同一新任务中按真实失败状态恢复。

同一新任务的再次试做在第 13 步 `wait` 前置观察耗时约 60 秒后失败，但 Python `author_step` 随后正常返回；该次未保存来源。持久化事实把最终失败限定在 Python 返回到 TS `session.author` 返回之间，无法区分 fd3、结果 schema 与响应校验。为避免无证据重跑，只在既有 owner 诊断 JSONL 增加固定的 TS 接收阶段码；不改变浏览器动作、业务合同、UI 或发布版本，也不记录异常正文及页面内容。下一次同任务试做只用于定点查明该交接层，再据实修复。

# 2026-09-25 唯一准备计划草案的代码交接（实施前记录）

Product Alignment:
- natural-language task: 用户在同一需求对话确认来源、试做入口、运行输入、业务步骤与结果；随后从工作台启动 B-U 代表试做。
- reusable chain boundary: 一份已确认准备计划草案版本投影内部 TaskRequirement/TaskPlan；B-U 来源、链路草稿和验证均绑定该版本与摘要。
- runtime inputs: 只来自草案明确列出的可变业务输入；没有输入时使用 null。
- dynamic task outputs: 按草案的交付形式与字段合同保存；执行状态和数据结果分别投影，不能凭任务网站或关键词推断。
- generic platform capability used: 现有访谈 Authoring、来源候选事实、Zod 合同、SQLite 版本记录、B-U 代表试做与 TaskChain 编译/运行。
- replay model calls: 普通复跑为 0，只有发布链中的显式 llm 节点例外；确认后不再调用模型生成业务计划。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从同一确认草案投影内部计划并核验来源/入口证据。
- existing implementation in repository: 访谈 Markdown 草案、sourceResolutions、TaskRequirement/TaskPlan、Zod、SQLite、TaskChainAuthoring 与 browserUseTask。
- mature candidates and pinned versions: 沿用仓库固定的 Zod 4.1.8、Drizzle 0.45.2、browser-use 0.13.8 和当前 AI Connect Authoring；不引入新库。
- selected implementation: 在现有确认边界与计划合同中做确定性投影和引用校验。
- reused public surface: 现有 Authoring 草案输出、Zod parse、TaskPlan/ResultSpec 与 B-U author API。
- B-A-T-owned adapter and remaining gap: 草案到技术合同的映射、入口引用/摘要绑定及失败关闭；真实页面动作仍交给 B-U。
- license/runtime/platform fit: 不新增依赖；当前 Windows x64 验证，macOS 尚无本轮设备证据。
- browser/runtime/state ownership conflicts: 仍只有每次产品运行的单一 Browser owner；确认草案本身不启动 Browser。
- replay model calls: 0，显式 llm 节点除外。
- rejected candidates and evidence: 已持久化任务显示确认草案没有入口引用，独立模型计划增添错误深链；因此不复用确认后 `planPrompt` 生成路径。
- focused validation: 入口/版本投影定点测试、类型检查、同一新任务的正式 Workbench/API/SQLite 验收；不重复整跑旧任务。

# 2026-09-25 browser.read-fields 可见模式定点诊断与安全错误码

持久化 execution `6771d738-8191-429d-8c0f-27803639d6c9` 为 `headless=false`，TaskRun `16cf3692-c699-44a1-8b3e-5ba14eac34aa` 在 `s-a-0004 browser.read-fields` 失败，累计 7 次浏览器命令、0 次复跑模型调用，清理已确认。该节点读取全页 `div`，`maxItems=100`、`includeOrdinal=true`；首次 B-U 来源中的同类查询为 64/100 条，但不是失败瞬间的 DOM。旧运行发生在 14:04；当前 Python runner 的读取/观察阶段包装直到 15:03 的 `43ed385` 快照才存在。旧 SQLite 只保存 `hybrid_runner_failed:RuntimeError`，runner stderr 未保存。只读复核又确认：前驱 `s-a-0003` 的 ConsumerReadiness 使用与 `s-a-0004` 完全相同的 ReadSpec 和 scope，稳定后置检查在 `06:04:05.139Z` 成功；`s-a-0004` 在 `.142Z` 开始、`.369Z` 失败，仅隔 227 毫秒。故不能把旧故障归因为已确认的集合上限或当前隔离样本的输出 schema 错误；更具体的底层异常仍不可恢复。

一次独立临时 Profile 的可见浏览器只读样本在进入公开番剧入口后立即读取 `div`，得到 `FieldReadError:read_output_schema_mismatch`，随后浏览器已关闭。它与旧运行的错误类型和任务前态不同，只能证明当前合同有可诊断的另一种失败，**不是旧故障复现，也不是新任务或旧 Release 的通过证据**。为保留下一次定点故障的可判定条件，Python owner 现在只将受管读取层固定错误码透传 fd3；字段名、页面正文、任意依赖异常继续留在 owner 内，未知错误仍映射为 `hybrid_read_collection_failed`。这修复了错误归因的证据缺口，旧可见失败的运行时根因及新任务可见复跑仍待正式证据。

Product Alignment:
- natural-language task: 通用网页任务从实时页面读取候选或字段，再据此筛选、导航或形成结果。
- reusable chain boundary: 已发布 TaskChain 的 `browser.read-fields` v2 只读节点；本次只改 Python owner 的错误回执，不改业务链路或执行语义。
- runtime inputs: 当前浏览器页面、已编译且受校验的 ReadSpec、运行时 DOM。
- dynamic task outputs: 字段值、属性和 DOM 顺序；失败时仅有固定诊断码，不把原始页面内容当作业务输出。
- generic platform capability used: 现有 Browser-Use 页面查询、受管 workflow-use 字段读取、fd3 协议和 TaskRun 审计。
- replay model calls: 0；诊断不调用模型或重派浏览器动作。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 保留确定性字段读取的安全、可区分错误原因。
- existing implementation in repository: workflow-use 的 `FieldReadError` 与 `read.py` 已产生固定读取错误码；Python hybrid runner 原先将它们统一包装为 `hybrid_read_collection_failed`。
- mature candidates and pinned versions: 沿用受管 workflow-use 0.2.11、browser-use 0.13.8 与既有 Python 3.12 runner；不引入或替换库。
- selected implementation: 在既有 runner 边界以固定白名单透传已知读取错误码，未知异常仍保留安全阶段码。
- reused public surface: 现有 `read_fields`、`FieldReadError`、runner fd3 响应和 TaskRun 错误传播。
- B-A-T-owned adapter and remaining gap: 只负责安全错误投影；浏览器 DOM 查询和字段投影仍由现有组件承担；旧异常原始栈不可恢复。
- license/runtime/platform fit: 不新增依赖或许可证；定点验证在当前 Windows x64/Python 3.12 环境完成，其他平台未测。
- browser/runtime/state ownership conflicts: 不新增浏览器 owner，不改变动作派发、检查点、发布版本或清理。
- replay model calls: 0。
- rejected candidates and evidence: 不持久化原始异常栈、字段名或页面文本；现有 SQLite 未保存旧异常，不能凭一个不同的可见样本假定旧根因或做猜测性重试。
- focused validation: `test_hybrid_read_stage.py` 所属 3/3 通过，补充检查错误码白名单的单项 1/1 通过，`git diff --check` 通过；正式新任务的可见读取与完整链路未测。

# 2026-09-25 B-U 成功来源到业务可复跑链路的证据交接（实施前记录）

Product Alignment:
- natural-language task: 每次运行从已确认来源动态选择目标，执行浏览器动作，并以用户确认的可观察状态证明完成。
- reusable chain boundary: B-U 的来源动作和观察交给现有 hybrid 编译器；编译后的 TaskChain 必须保留能证明完成的通用浏览器后置条件，不能只凭动作覆盖和合法终点宣布业务成功。
- runtime inputs: 已确认草案的输入合同、运行时页面候选和浏览器观察。
- dynamic task outputs: 运行时选中对象以及实际观察到的状态；若草案要求在结果中说明动态字段，应使用现有 data ResultSpec 和字段绑定。
- generic platform capability used: 现有 workflow-use 自然动作编译、media_playback 观察与后置条件、TaskChain 节点运行、ResultSpec 和输出绑定。
- replay model calls: 普通复跑为 0；不添加全局语义 judge。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 把首次成功试做的可观察状态编译为普通复跑时可核验的条件，并保留动态结果字段。
- existing implementation in repository: 受管 workflow-use 已有 media_playback 事实和后置条件，hybrid materializer 已映射后置条件；ResultSpec data、outputAssembly 和执行结果投影已有类型与运行路径。
- mature candidates and pinned versions: 沿用当前受管 workflow-use 0.2.11、browser-use 0.13.8、Zod 4.1.8；不引入、替换或删除库。
- selected implementation: 在现有编译器的动作观察关联处修正有证据的 media_playback 漏编译；访谈 Skill 明确要求把用户期待的动态结果说明写成 data 字段。
- reused public surface: workflow-use 的自然编译与媒体事实、现有 TaskChain postconditions、ResultSpec/data outputAssembly。
- B-A-T-owned adapter and remaining gap: 宿主继续验证编译产物与已确认草案的类型/版本，不根据网站、标题或页面正文推断播放；当前成功来源中的 playing 观察没有进入链路，而执行模式只交付技术状态。
- license/runtime/platform fit: 沿用已有依赖、许可证与 Windows 运行时；未改变浏览器 owner。
- browser/runtime/state ownership conflicts: 一个产品运行仍只有一个 Browser owner；不重发已完成动作，不改旧 Release 或历史运行。
- replay model calls: 0，发布链显式 llm 节点除外。
- rejected candidates and evidence: 不增加全局语义 judge、网站/剧集特例或另一轮业务规划；持久化新任务的 B-U 来源有 playing，已发布链末尾仅 URL 不变，三次技术完成运行的结果均无实际播放证据。
- focused validation: 仅运行编译器媒体事实定点测试、受影响包的必要类型/协议测试；边界修复通过后，用一个全新正式工作台任务验证从对话到复跑的同版证据。

同一媒体交接的运行期核验补充（实施前）：

Product Alignment:
- natural-language task: 目标页的导航和播放状态都必须在同一次普通浏览器运行中成立。
- reusable chain boundary: 现有 StepVerifier 逐项核验后置条件；一次有界重查中的多个页面事实应来自同一个受控 Page，焦点或页面身份漂移应继续重查事实而不重派动作。
- runtime inputs: 当前 Browser owner、已声明的页面级后置条件与既有 settle 预算。
- dynamic task outputs: 本次核验通过或固定失败码；不记录页面 URL、选择器、正文和媒体内容。
- generic platform capability used: 现有 Browser-Use Page 公共 API、TargetResolver.assert_scope、workflow-use StepVerifier/verify_declared。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 一次后置核验的页面事实身份一致性。
- existing implementation in repository: workflow-use 已有 Browser owner、Page.get_target_info/get_url、TargetResolver.assert_scope 与有界 settle 重试。
- mature candidates and pinned versions: 复用当前受管 workflow-use 0.2.11 与 browser-use 0.13.8；无新依赖。
- selected implementation: 在现有 verify_once 边界固定本次 Page，给页面事实复用，并在结束时复核焦点/身份；漂移交给已有 PostconditionNotMet 重试。
- reused public surface: 上述 Browser/Page/TargetResolver 与 StepVerifier，不复制动作派发或等待调度。
- B-A-T-owned adapter and remaining gap: 只补运行证据的一致性，不能从可见媒体布尔事实推导具体流身份。
- license/runtime/platform fit: 沿用已有 Python/Windows 运行路径；macOS 未在本轮实测。
- browser/runtime/state ownership conflicts: 仍由一个 Browser owner 执行；漂移时只重读，不再次点击。
- replay model calls: 0。
- rejected candidates and evidence: 不用动作完成后的一次稳定观察倒推核验期间两项事实同页；当前 URL 与媒体各自调用 get_current_page，现有代码没有跨两次读取的页面身份约束。
- focused validation: 页面在两项读取间切换的定点测试、现有后置条件定点回归及受管 fork 摘要核验；不做浏览器整跑。

# 2026-09-25 可见 read-fields 的缺失阶段证据（实施前记录）

Product Alignment:
- natural-language task: 通用网页任务需要从可见浏览器页面完整读取候选集合以驱动后续动作。
- reusable chain boundary: 已发布的 browser.read-fields 节点仍通过单一 Python Browser owner 执行；只为故障记录安全阶段码，不改变读取结果或旧 Release。
- runtime inputs: 已编译 ReadSpec、当前页面身份及实时 DOM。
- dynamic task outputs: 读取到的候选字段；异常时只记录固定阶段与异常类，不记录页面内容或选择器。
- generic platform capability used: 现有 workflow-use read_fields、Browser-Use/CDP 查询和 hybrid runner 回执。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 判定 read-fields 失败发生在页面身份检查、集合查询、字段投影还是读后观察。
- existing implementation in repository: Runner.execute 已分派 ReadCommand，现有受管读取器执行集合和字段读取，安全错误码可沿 fd3 返回。
- mature candidates and pinned versions: 沿用受管 workflow-use 0.2.11、browser-use 0.13.8 和 Python 3.12；不引入新库。
- selected implementation: 在既有边界增加不含页面数据的固定阶段诊断，保持原异常类型和动作语义。
- reused public surface: 现有 read_fields/TargetResolver 与 Runner.execute；不复制查询实现。
- B-A-T-owned adapter and remaining gap: 只负责阶段回执和审计。旧运行未保存 traceback、浏览器已关闭，旧瞬间无法唯一还原。
- license/runtime/platform fit: 无新依赖；先以当前 Windows 运行路径定点验证。
- browser/runtime/state ownership conflicts: 不新增 Browser owner，不重派已完成的读取或观察。
- replay model calls: 0。
- rejected candidates and evidence: 不按后来 64/100 的来源样本推断旧故障是集合上限；旧前驱曾以相同 ReadSpec 稳定通过，旧节点 227 毫秒后出现未分阶段的 RuntimeError。
- focused validation: 仅运行所属 Python 错误阶段测试和静态检查；同条件现场只做一次定点读取验证，不整链撞运气。

# 2026-09-25 B-U 前观察与 Python→TS 返回边界诊断（实施前记录）

已持久化准备 job `992070a0-c171-4448-879f-152df55b1557` 的 owner JSONL 显示：第 13 步 `wait` 的 `before_action` 从 `08:17:19.913Z` 至 `08:18:19.903Z` 失败，没有动作派发；Python `author_step` 在 `08:21:20.412Z` 返回，但 SQLite 来源数组仍为空。TS 只在 `session.author` 返回后加入来源，所以第二个故障位于 Python 完成之后、TS 来源接收之前。旧诊断既没有前观察子阶段，也没有 fd3 序列化/写入结果，不能唯一确定旧运行的具体 CDP 方法或返回故障。当前固定 browser-use 的每个 CDP 请求默认上界为 60 秒，Agent step 上界为 180 秒；前观察的 59.990 秒与 CDP 读取超时吻合，但多个读取方法共享该上界。

Product Alignment:
- natural-language task: 通用浏览器任务在代表试做中按实时页面完成动作，并把首次来源交给编译。
- reusable chain boundary: 同一 Browser owner 的动作前只读观察及 Python fd3→TS 来源返回；仅补固定阶段和安全异常类别，绝不改动作或结果。
- runtime inputs: 当前 Page、动作前观察、Python 结构化来源响应。
- dynamic task outputs: 已验证来源或固定故障阶段码；页面、网址、选择器、异常原文不进入诊断。
- generic platform capability used: browser-use Page/CDP、既有 workflow-use 捕获、fd3 响应、fd4 owner JSONL、Zod 准入。
- replay model calls: 0；诊断也不调用模型。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在现有 Browser-Use 会话中识别动作前读取失败，并确保 Python 来源响应序列化失败时仍返回固定错误。
- existing implementation in repository: `SourceObservationScope`、`ObservationCapture`、`AuthorCaptureCallbacks`、`DiagnosticChannel`、`RunnerProcess` 和 `SourceLifecycleDiagnostics` 已构成单 owner 的读取及安全诊断通道。
- mature candidates and pinned versions: 复用当前 browser-use 0.13.8、cdp-use 1.4.5、Python 3.12、Zod 4.1.8；不引入新库。
- selected implementation: 只在现有调用边界发固定子阶段/异常类和 fd3 响应阶段事件，Python 序列化失败用既有 `hybrid_runner_failed` 协议回固定原因。
- reused public surface: Browser-Use Page API、现有 fd3/fd4、Zod schema 与 owner JSONL。
- B-A-T-owned adapter and remaining gap: 仅拥有来源交接与安全错误投影；旧运行无原始栈，新增诊断不能追认旧根因。
- license/runtime/platform fit: 不改变依赖、许可、进程或 Windows 浏览器所有权；其他平台待产品证据。
- browser/runtime/state ownership conflicts: 仍为同一 Browser owner；不修改超时、重试、Agent loop 或浏览器控制。
- replay model calls: 0。
- rejected candidates and evidence: 不能凭 59.990 秒把所有 CDP 方法归为一个具体故障；扩大超时或盲重试不能修复已证实的结果丢失，且缺乏恢复浏览器状态的证据。
- focused validation: fd3 序列化失败、固定诊断码和原异常链的所属包定点测试；受管 fork 摘要核验，不跑浏览器整链或根级测试。

# 2026-09-25 专用 Profile 的浏览器版本与 owner 启动边界（实施前记录）

专用 Profile 的 `Default/Preferences.profile.created_by_version` 为 Chrome 153；当前 Browser-Use 0.13.8 默认发现 bundled Chromium 134。专用 Profile + Chromium 134 的启动产生 breakpoint crash dump；空 Profile + Chromium 134 可启动，同 Profile 的临时副本 + Chrome 153 可启动。版本组合是当前启动失败的最强证据。Browser-Use `BrowserProfile(channel=CHROME)` 或显式 `executable_path` 含 chrome 时会把指定 Profile 复制到系统临时目录；B-A-T 精确 `user_data_dir` owner 检查正确拒绝这种路径。外部 CDP attach 虽是公共 API，Browser-Use 不拥有外部进程，现有关闭回执不能证明 Chrome 已退出。受管 fork 无需修改；`LocalBrowserWatchdog._find_installed_browser_path` 可通过标准 `PLAYWRIGHT_BROWSERS_PATH` 指向不含 bundled Chromium 的 owner 临时目录，让默认 channel 回退发现系统 Chrome，仍由原 Browser-Use watchdog 启动和清理。该行为依赖固定的 browser-use 0.13.8 查找顺序；同一原 Profile + 系统 Chrome 153 已在可见模式经 Browser-Use 与正式 RunnerProcess 各做一次定点启动/关闭，通过且无该 Profile 的残留浏览器进程。正式 API 尚未加载代码，也没有新任务 B-U 证据。

Product Alignment:
- natural-language task: 在现有账号 Profile 中执行已确认的通用浏览器任务，避免启动时版本回退使任务在 B-U 前失败。
- reusable chain boundary: 仅修 Browser owner 选择兼容二进制的启动配置；不改 Requirement、B-U Agent loop、TaskChain、headless 或新页恢复。
- runtime inputs: 当前实际专用 Profile、系统安装的浏览器及单次 runner owner 临时目录。
- dynamic task outputs: 同一 Profile 的成功启动、关闭及资源所有权回执；后续仍由正式任务自身产生业务输出。
- generic platform capability used: Browser-Use 0.13.8 `LocalBrowserWatchdog` 原生浏览器发现、启动和清理，Playwright 标准浏览器目录环境变量。
- replay model calls: 0；浏览器选择不调用模型。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 持久 Profile 兼容浏览器的单 owner 启动及清理。
- existing implementation in repository: `owned_browser` 保证精确 Profile 路径；`RunnerProcess` 保证唯一 Python owner、fd3/fd4 与关闭回执。
- mature candidates and pinned versions: 复用 browser-use 0.13.8、cdp-use 1.4.5 和已安装的系统 Chrome 153；不引入新依赖。
- selected implementation: 只在 Windows runner 子进程的环境中把 Playwright 浏览器目录指向本次 owner 的空临时目录，让 Browser-Use 原生查找回退到系统浏览器；不显式指定 Chrome channel 或另起 CDP owner。
- reused public surface: `PLAYWRIGHT_BROWSERS_PATH`、Browser-Use 默认 BrowserProfile/LocalBrowserWatchdog、现有 RunnerProcess owner。
- B-A-T-owned adapter and remaining gap: 只传递受控发现配置并验证实际二进制、Profile 路径及清理；若系统 Chrome 不存在或旧 Profile 仍崩溃，不把解析成功算启动修复。
- license/runtime/platform fit: 沿用现有 Browser-Use/Playwright 许可和 Windows 运行路径；其他平台未测。
- browser/runtime/state ownership conflicts: Chrome channel 的临时 Profile 副本与外部 CDP 进程均不满足现有所有权约束，不能采用；正常 Browser-Use watchdog 仍是唯一 owner。
- replay model calls: 0。
- rejected candidates and evidence: 不降级或重建现有 Profile，不放宽精确所有权检查，不用第二个外部浏览器进程；前者可能丢登录态或掩盖启动根因，后者在现有关闭路径会留下进程。
- focused validation: 系统 Chrome 153 路径解析通过；原 Profile 可见模式 Browser-Use 启动/关闭、原 Profile 路径核验通过；正式 TS RunnerProcess `profile_start=ok`、`cleanup=confirmed`，结束后无该 Profile Chrome 进程；API package TypeScript 检查通过。正式服务加载及同任务 B-U 仍未测。

# 2026-09-25 新任务 B-U 结果接收后的 API 退出事实

正式工作台新任务 `0d9f377d-d83b-477d-bafa-b768146a7312` 的首次准备 job `e27d9627-1314-4d5a-8b70-cbd1c9428dec` 使用已确认草案 v1 投影的 Plan v1。Python 第 10 步 `done` 后完成两次语义注解，并在 `12:16:33Z` 序列化、写出 fd3 响应；TS owner JSONL 已记录 `author_response_received`，但未记录 schema 失败、校验失败或接受。API 随后退出，SQLite 对该任务没有来源 artifact，重启后 job 为 `interrupted`。原 API 未保留 stderr，Windows 未生成对应的 node.exe 崩溃报告；目前**不能唯一断定 API 的具体退出机制**。旧同入口约 0.5 MB 来源和最大约 1.24 MB 来源在隔离 Node 进程中通过现有 schema/校验，只能排除这些旧样本上的必现失败，不能代替当前任务验收。Python 原始 history 已删除，本次 fd3 payload 未落盘。现有可证明的交接缺口是 `session.author` 返回且 Browser owner 关闭之前没有来源 artifact。

随后查到此前漏检的 Windows System 事件 2004：`20:16:18` 系统提交量 `35,983,015,936 / 36,081,029,120` 字节，仅余约 98 MB，物理内存使用 `16,446,586,880 / 16,984,236,032` 字节。最大进程是已有的 `browser.exe` PID 11984（约 6.41 GB）、`chrome.exe` PID 8580（约 4.89 GB，创建于本次 B-U 浏览器根进程启动后约 2 秒）和 `League of Legends.exe` PID 18868（约 2.01 GB）。这是本次响应交接时**确定存在**的系统级内存耗尽条件，时间上比 API 退出早约 15 秒；进程创建时间强烈支持 Chrome 属于本次试做，但缺少当时的父子进程快照，不能当作已验证所有权。该事件足以解释 Node 分配失败的风险，仍没有 API 退出码或 stderr 可证明唯一机制。`20:31` 时游戏进程已退出、提交余量约 6.57 GB，其他用户进程不由项目关闭。此处仅补持久化事实，不冻结新增源码方案或把旧来源当作当前任务通过。

# 2026-09-25 中断准备作业的工作台恢复入口（实施前记录）

同一新任务的 job 在 SQLite 为 `interrupted/preexecuting`，API `/api/task-chain/diagnostics` 的 `preparation.planRecovery=null`，工作台因此只显示“正在核对已保存方案与预执行恢复条件”，不显示“重新试做当前草案”。`TaskPreparationCoordinator.planRecovery` 仅接受 `failed`，而 UI 对 `failed` 与 `interrupted` 都进入恢复面板，且要收到 `planRecovery.available === false` 才开放同版草案重新试做。当前 job 已有浏览器动作、无来源 artifact，不能沿旧 Browser 状态或旧方案直接续做；它需要明确的不可续做诊断，旧 job 保留。

Product Alignment:
- natural-language task: 已确认草案的代表试做因服务退出中断后，用户从正式工作台看到原因并可重新试做同一草案。
- reusable chain boundary: 仅修准备诊断从 API 到 UI 的状态投影；不改访谈、B-U、编译、发布或复跑。
- runtime inputs: 当前 job 的 interrupted 状态、阶段、动作记录和来源引用。
- dynamic task outputs: planRecovery.available=false 与原层原因，工作台显示正式重试入口；旧 job 不改写。
- generic platform capability used: 现有 planRecovery、canResumeSavedPlan、Workbench preparation context。
- replay model calls: 0；诊断不调用模型。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 将中断的预执行 job 投影为可判断的恢复诊断。
- existing implementation in repository: TaskPreparationCoordinator.planRecovery 已返回可用/不可用及原因；WorkbenchContext 已按该返回值显示操作。
- mature candidates and pinned versions: 复用现有 TypeScript/Zod 合同和 UI；不引入库。
- selected implementation: 让 planRecovery 对 interrupted/preexecuting 进入同一安全核查，保持浏览器动作已发生时 available=false。
- reused public surface: 现有诊断 API、canResumeSavedPlan 和 prepare_task 工作台命令。
- B-A-T-owned adapter and remaining gap: 只修 API/UI 状态交接；原始 B-U 来源仍缺失，不能由此声称首次成功。
- license/runtime/platform fit: 无新增依赖和平台分支。
- browser/runtime/state ownership conflicts: 不恢复旧 Browser、不重用无 closed=true 的来源；重试会产生新 job。
- replay model calls: 0。
- rejected candidates and evidence: 不把 interrupted job 改写成 failed，也不开放无来源的离线编译；SQLite/正式 UI 已证明状态不一致。
- focused validation: 所属 API 恢复合同测试覆盖中断后返回 available=false；API 类型检查和正式工作台只读按钮核验。

实施与验收结果：只把 `TaskPreparationCoordinator.planRecovery` 的状态门扩至 `interrupted`；当旧 job 已有浏览器动作却无 closed source 时，诊断返回 `available=false`，正式工作台显示“重新试做当前草案”。所属 `preparation-plan-resume.test.ts` 最终 3/3 通过，API 类型检查通过；未增加来源 checkpoint、第二 Browser owner 或业务计划生成。工作台的第二 job `f6d17aa7-c418-438a-8f42-b3de517317c2` 真实完成 B-U、零缺口首编译及两次草稿验证，随后手动发布并在同一 Release 上完成两次零模型正式执行；完整证据与保留的失败见 [PROGRESS](PROGRESS.md#2026-09-25-同一全新任务最终验收与资源清理)。这证明当前状态交接恢复入口可用，不证明第一次 job 的 API 退出机制已修。发布后重启命令被自动审批以 `blocked by policy` 拒绝，重启持久化未测。

# 2026-09-25 B-U 最后响应与 Function 校验的资源交接（实施前记录）

首次 job `e27d9627-1314-4d5a-8b70-cbd1c9428dec` 的 fd3 响应已由 API 接收，尚未记录 `author_response_accepted`；系统事件在约 15 秒前记录提交内存仅余约 98 MB。现有 `withHybridAuthoring` 在仍持有 Browser owner 时执行 `withSelectionValidation`，该校验可启动隔离的 Function Worker；只有整个 `work(session)` 结束后才调用已存在的 `RunnerProcess.close()`。同版草案第二次 job 成功且没有同期内存耗尽事件。首次 payload、API 退出码和 stderr 未保存，因此无法把具体退出机制或两次差异唯一归于内存或 LLM 输出。修正目标仅为消除可证实的 Browser/Worker 生命周期重叠；不能据定点测试宣称首次一次通过稳定性已验收。

Product Alignment:
- natural-language task: 任意已确认浏览器任务的 B-U 代表试做在最终响应后交付可编译来源。
- reusable chain boundary: 最后一个计划步骤收到完整响应后，先确认同一 Browser owner 关闭，再做来源 Function 校验和 artifact 准入；中间步骤仍在同一会话连续试做。
- runtime inputs: 同版计划步骤位置、fd3 响应、既有 owner 清理回执。
- dynamic task outputs: 校验后的来源或原层校验/清理失败；不补写业务目标、网址或旧来源。
- generic platform capability used: 现有 `RunnerProcess.close()`、Browser-Use owner、QuickJS Function 校验与来源合同。
- replay model calls: 0；B-U 代表试做的模型调用及普通链路复跑行为均不变。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 最后 B-U 响应之后释放 Browser，再运行纯数据 Function 校验。
- existing implementation in repository: `RunnerProcess.close()` 已缓存关闭结果并核验 Python/browser/child/temp；`withSelectionValidation` 已负责 Function 准入。
- mature candidates and pinned versions: 继续复用 browser-use 0.13.8、现有 QuickJS/Node Worker 与 Zod 4.1.8；不引入或替换库。
- selected implementation: 仅在最后计划步骤的 TS 会话调用元数据中标记响应后关闭，沿用既有关闭回执和最终来源准入。
- reused public surface: `RunnerProcess.close()`、现有 `HybridAuthorSession.author` 与 `withSelectionValidation`；标记不进入 Python 来源或公共合同。
- B-A-T-owned adapter and remaining gap: 调整交接顺序，保留多步同 owner 和清理失败不能标 closed 的规则；旧 API 退出机制仍缺直接证据。
- license/runtime/platform fit: 无新依赖、许可、进程或平台分支；Windows 定点测试后仍需新任务产品验收。
- browser/runtime/state ownership conflicts: 不建立第二 Browser owner，不延长会话，不重放旧动作；最终步已完成才关闭同一 owner。
- replay model calls: 0。
- rejected candidates and evidence: 不重写 B-U Agent/Function 引擎，不因旧退出猜测而增大超时或整链重试；这些做法均不解决已证实的内存重叠。
- focused validation: 所属 API 测试断言最终步关闭先于校验、非最终步保持同一 owner、关闭未确认时不接受来源；API 类型检查及差异检查。正式一次性稳定性另需新任务从工作台验证。

# 2026-09-25 简短需求的来源调查与题板证据准入（实施前记录）

正式工作台任务 `a40711c9-91f0-4e07-a022-dfa67f9ecf03` 的首句由验收操作者写成含来源类型、最新规则、排除项、受限停止和完成标准的长指令，故该任务**不能验收**访谈能否从普通简短需求主动拆解。该首句没有“腾讯”。访谈模型在 22:07:21 自行用 `凡人修仙传 动画 官方 腾讯视频` 调用 Pi `web_search`；22:07:29 的原始结果中，同一页既有两条腾讯视频单集/旧集线索，也有“bilibili独家呈现”“B站独播”的反证。模型于 22:07:33 仍把两条腾讯短播放页提交为 `multiple`。宿主只核验 URL 确实出现在本轮结果，题板丢弃原摘要，统一写“来自 Pi web_search 的原始只读搜索结果”，并按首位加“推荐”。首轮未打开播放页；搜索成功和引用合法不能证明版权身份或可供动态最新选集的入口。用户随后在正式题板选择“都不是”，第二轮模型才改查 Bilibili；该任务草案 v2 仍未确认、未启动 B-U。

Product Alignment:
- natural-language task: 用户可以只说简短目标，由需求对话调查来源、澄清结果差异并形成唯一准备计划草案。
- reusable chain boundary: 访谈模型比较完整只读搜索证据并提交业务相关候选；宿主仅保留原始结果引用和摘要、展示 Question，不代替模型决定网站或业务身份。
- runtime inputs: 本任务完整对话、Pi `web_search` 的本轮标题/URL/摘要、模型提交的候选 URL。
- dynamic task outputs: 有摘要证据的来源候选或保留待决；最终目标和入口仍由用户确认，B-U 再调查现场。
- generic platform capability used: 现有 Pi 搜索事件、`PiSourceSearchObserver`、`SourceCandidate.description`、公共 Question Panel。
- replay model calls: 0；仅需求访谈在用户发起的轮次调用模型。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 将现有只读搜索的候选摘要带到来源 Question，并使模型处理搜索假设与反证。
- existing implementation in repository: Pi `web_search` 已在事件中返回标题、URL 和摘要；`piSearchCandidates` 目前只保存标题/URL并写统一占位描述；访谈 Skill 与 `present_source_candidates` 已规定模型语义判断、宿主引用校验。
- mature candidates and pinned versions: 继续复用当前 `pi-web-access` 0.30.0、Pi AgentSession、AI Connect Question 与 Zod 4.1.8；不引入搜索、打分或网页抓取新库。
- selected implementation: 只适配 Pi 原始 `Source:` 行旁的摘要到既有 `description`，题板用“搜索候选”与原始摘要，不把首位自动标成有证据的推荐；在既有访谈指令中要求中性搜索、比较相反证据和动态目标入口适配。
- reused public surface: Pi `web_search` 工具结果/事件、现有来源合同和 Question projector；没有第二搜索事实源。
- B-A-T-owned adapter and remaining gap: 只验证引用真实性与投影摘要，不能由规则判断“腾讯/B站”等业务语义；模型仍可能判断错，须用简短新需求的真实访谈定点验收。
- license/runtime/platform fit: 无新依赖、许可或浏览器会话；Windows API/UI 可定点核验。
- browser/runtime/state ownership conflicts: 访谈只读，不启动 Browser owner，不访问登录态或页面控件。
- replay model calls: 0。
- rejected candidates and evidence: 不加入网站词典、平台名单、标题关键词评分或宿主来源推荐；它们会把任务实例写入平台并违反模型语义职责。也不把这次过度详细的首句当作简短需求验收。
- focused validation: Pi 原始摘要到候选/Question 的所属包测试、访谈提示定点检查、API 类型检查；随后只用自然简短的一句需求从正式工作台验证来源选择与草案交接，完整 B-U 需先满足资源前提。

实施与定点结果：沿用 Pi `web_search` 和既有 `SourceCandidate.description`，把原始搜索结果中紧邻 `Source: title (URL)` 的摘要按 URL 关联到候选；来源题板显示原摘要、称为“搜索候选”，所有原始候选均不因排序自动获得推荐标记。Skill、访谈阶段指令和候选提交工具说明要求模型比较未限定平台的结果及相反证据，不增加网站词表或宿主语义评分。所属来源测试 11/11、API package TypeScript 检查、`git diff --check` 通过。

正式工作台随后以一句普通需求“帮我播放《凡人修仙传》最新一集。”创建任务 `b3726b40-02ab-4d0b-b1fd-78e199c67f82`。本轮 Pi 搜索词为“《凡人修仙传》 动画 官方 在线观看 最新集”，候选 `https://www.bilibili.com/bangumi/play/ss28747` 的原摘要含“高清独家在线观看”；来源题板未标推荐。验收操作者在正式 UI 选择该来源后，访谈继续询问“最新一集”是否包括会员抢先看；选择“公开可看的最新正片”后生成唯一草案 v1，并在正式 UI 确认。草案写明动态选集、排除预告花絮、受限时停下和实际播放状态。API 返回 `confirmedVersion=1`，来源状态 `selected`；这证明简短输入到已确认草案的访谈路径，不证明 B-U 或网页可访问性。最初过长输入任务 `a40711c9-91f0-4e07-a022-dfa67f9ecf03` 的草案 v2 仍未确认，不计入本次验收。

该短句本身未指定“动画”，模型的首次搜索却加了“动画”；题板题干明确写了动画，验收操作者选择哔哩哔哩国创页，因而本次对象经题板确认，但首次搜索可能排除同名其他形态。已将“未指定同名作品形态时不得只用猜测形态限定唯一搜索；让用户看清或确认对象”补入通用访谈 Skill 和阶段指令。该提示增量尚无新的短句运行证据，不把本次旧提示下的表现算成它的验证。

确认草案后关闭本次 UI 驱动 Chrome，回执 `closed=true`；系统可用提交内存仍只有约 2.11 GiB，而旧可见 B-U 时项目 Chrome 曾占约 4.89 GiB，且曾出现仅余 98 MB 的系统事件。未结束用户游戏或归属不明的 `browser.exe`，也未在已知低余量下启动 B-U。待资源满足再沿这条已确认草案由正式工作台启动首次代表试做；不得用旧任务、旧来源或另一个草案代替。

同域候选缺少 URL 路径会让用户难以区分页面，已在既有来源 Question 描述中补入经本轮搜索校验的完整 URL，并把 Skill 中误写的“提交结果 ID”统一为工具实际接受的“提交真实结果 URL”；没有改来源语义判断。所属来源测试 11/11、API 类型检查通过。对 API PID 11936 的加载新代码重启命令被自动审批直接拒绝，仅返回 `blocked by policy`；命令未执行，服务仍健康。因此完整 URL 展示尚无正式 UI 运行证据。

# 2026-09-25 可见 read-fields 内层阶段证据补齐（实施前记录）

旧可见 execution `6771d738-8191-429d-8c0f-27803639d6c9` 只保留 `hybrid_runner_failed:RuntimeError`，没有旧 Python 异常链或阶段；它不能被追认为已修。当前安全诊断把 `read_fields` 内的第一次/末次 `TargetResolver.assert_scope`，以及 `resolve_collection` 查询前的 `_snapshot(scope)` 异常统称 `hybrid_read_fields_*`；现有 `target_query` 标记只覆盖实际 CSS 查询。三种页面身份读取和字段投影仍混在一个阶段，下一次同类失败无法定点归因。

Product Alignment:
- natural-language task: 通用网页任务在可见或无界面浏览器中从当前页面读取动态候选与字段。
- reusable chain boundary: 既有 `browser.read-fields` v2 调用和单一 Python Browser owner；仅补安全诊断阶段，不改变读取、运行或业务合同。
- runtime inputs: 已验证 ReadSpec、页面 scope、当前 Browser-Use Page。
- dynamic task outputs: 原字段结果；失败只给固定阶段与异常类别，不外传页面内容。
- generic platform capability used: 受管 workflow-use `read_fields`/`TargetResolver`、现有 fd3 错误回执。
- replay model calls: 0；不重试或重派动作。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 区分 read-fields 内层页面 scope、集合快照、CSS 查询、字段投影与读后观察失败。
- existing implementation in repository: Runner 已有安全阶段码，`TargetResolver.resolve_collection` 已给 CSS 查询异常加固定 `__notes__`；Python 3.12 异常链与 `add_note` 可保留原因。
- mature candidates and pinned versions: 继续复用受管 workflow-use 0.2.11、browser-use 0.13.8、Python 3.12；无新依赖。
- selected implementation: 仅在既有三个异常边界补固定 note，由 Runner 现有安全映射输出固定码；原异常类型和控制流不变。
- reused public surface: `read_fields`、`TargetResolver.assert_scope`、`TargetResolver._snapshot`、Runner fd3 回执。
- B-A-T-owned adapter and remaining gap: 只负责阶段归因与敏感信息隔离；旧运行的底层异常不可恢复，新阶段码本身不修复 CDP/页面错误。
- license/runtime/platform fit: 沿用现有依赖与 Windows/Python 3.12；其他平台仍未测。
- browser/runtime/state ownership conflicts: 不创建 Browser、CDP owner、检查点或第二调度器；同一次只读调用的异常原样上抛。
- replay model calls: 0。
- rejected candidates and evidence: 旧 `s-a-0003` 同规格就绪检查刚通过，`s-a-0004` 227 毫秒后只留泛化 RuntimeError；无证据支持扩大超时、重试、修改 Release 或归因集合上限。
- focused validation: 所属 Python 测试注入内层前/后 scope、集合快照、CSS 查询故障，核验固定码、异常链、安全边界和单次调用；现有正常读取合同定点回归，不启动浏览器整链。

实施与定点结果：在 `read_fields` 内两次 `assert_scope` 和 `TargetResolver.resolve_collection` 的 `_snapshot` 异常处加固定 note；Runner 沿既有 fd3 安全错误投影分别输出 `inner_pre_scope`、`inner_post_scope`、`target_snapshot`，原 CSS 查询仍为 `target_query`，其余字段异常仍为 `fields`。同时只在带有 CSS 查询阶段 note 时把对应 DOM 查询错误投影为容器定位失败，避免集合快照异常碰巧含同一文字时被误分类。没有改读取结果、动作、重试、超时、浏览器 owner 或旧 Release。所属 Runner/受管读取测试 8/8 通过，正常读取合同 2/2 通过（真实浏览器项按现有显式门跳过）；改动文件 Ruff 在排除 `hybrid_main.py` 既有 F401 未使用导入后通过，原样全文件 Ruff 仍报该文件既有 F401；受管 fork 来源清单更新 `read.py` 和 `targets.py` 哈希，规范 setup 与 `--check` 均通过，最终来源摘要 `80bbe96277d770752d150432a5534ad0a84f5eceb3c5b06df245e7c7b3d71b5b`；`git diff --check` 通过。没有启动真实浏览器，旧可见故障的原始子因仍未知；本改动只使下一次同类错误可在安全回执中区分阶段。

# 2026-09-25 显式清理开发端口的 npm script（实施前记录）

用户运行 `npm run dev` 时，4175 被此前独立启动的本项目 API PID 11936 占用。该进程命令使用相对入口 `apps/api/src/main.ts`，健康接口没有 `development` 根目录身份；`scripts/dev.mjs` 的自动接管守卫无法从进程命令推断 checkout，正确拒绝停止。只读 SQLite 已确认没有活动访谈、准备或执行；随后核对精确 PID/命令并仅停止 11936，4173/4175 均释放。用户需要一个显式的 npm script，在此类已知端口占用时主动清理本项目开发端口，而不改自动启动守卫的保守行为。

Product Alignment:
- natural-language task: 用户主动清空本地工作台/API 开发端口，再重新运行开发服务。
- reusable chain boundary: 仅开发期进程与端口管理；不接触 Requirement、B-U、TaskChain、发布或正式执行数据。
- runtime inputs: 工作台端口 4173、当前配置的 API 端口、OS TCP LISTEN 的 PID 集合。
- dynamic task outputs: 被终止的端口/PID 与端口释放结论。
- generic platform capability used: 现有 `scripts/dev.mjs` 的 TCP listener PID 查找、开发服务安全 shutdown、Node `process.kill`。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 显式清理当前项目开发服务器端口。
- existing implementation in repository: `tcpListenerPids` 已区分 TCP LISTEN 与 UDP/客户端端口；`requestDevelopmentShutdown` 可优先关闭带开发身份的单进程宿主；`selectedPorts` 统一 4173 与可配置 API 端口。
- mature candidates and pinned versions: 复用 Node 24、既有 Windows `Get-NetTCPConnection`/Unix `lsof`、现有 `find-process` 2.1.1；无新依赖。
- selected implementation: 根 `npm run clean` 显式调用现有开发端口探测，二次核对端口与 PID，只停止初始占用者，等待端口释放；如新占用者出现则失败且不终止它。
- reused public surface: 现有 `dev.mjs` 的端口选择、OS listener 查找及优先开发服务 shutdown。
- B-A-T-owned adapter and remaining gap: npm 命令只对开发端口作明确终止，不能替用户判断其他端口或操作系统服务的归属。
- license/runtime/platform fit: 现有 Node/OS 命令，Windows 本机定点验证；macOS/Linux 行为待对应设备。
- browser/runtime/state ownership conflicts: 不关闭 Browser owner、不删除 Profile、数据或工作区文件；清理命令本身是用户对指定开发端口占用进程的显式授权。
- replay model calls: 0。
- rejected candidates and evidence: 不放宽 `npm run dev` 的自动接管身份门，不加入宽泛 `taskkill`/全部 node 进程清理；那会误停其他项目和用户程序。
- focused validation: 清理函数的稳定/变化 PID 定点样本与 `npm run clean` 空端口行为；不运行根级或全量测试。

实施与定点结果：根 `package.json` 增加 `clean` script，调用 `scripts/dev.mjs --clean`。它复用现有 TCP LISTEN PID 查询与开发宿主 shutdown；初始 PID 集合二次核对后仅终止这些 PID，若出现新占用者则停止而不杀新进程，5 秒内等待端口释放。`node --check scripts/dev.mjs` 通过，4173/4175 空闲时 `npm run clean` 返回“开发端口已空闲”；本项目临时子进程监听随机端口 49858，调用同一清理函数后子进程退出且端口释放；注入 PID 从 8001 变为 8002 的样本返回“新的占用者”，终止调用为零。未运行根级或全量测试，也未停止用户服务。

# 2026-09-26 新需求输入被旧执行清理状态误锁（实施前记录）

截图中新建任务 `6416bb34-f72c-4066-9b80-ee065f90c496` 的输入框无法聚焦。旧任务 `0d9f377d-d83b-477d-bafa-b768146a7312` 的 execution `82bdc9d7-e341-4d0d-8885-cd091f56c15b` 自 23:42 起为 `cleanup_required`/`unconfirmed`；清理审计记 `activeResources:false`。`projectTaskSummary` 将该状态投影为 `executing`，工作台再把它选为全局 running，`TaskWorkspace` 将其他任务的 `blocked` 传给共享 Timeline 的 `disabled`，所以文字输入本身被禁用。截图创建于 23:56，另一 B-U job 23:58 才启动，不能把截图归因于那次试做。命令行调用现有 `cleanup_execution` 被 API 的 `Sec-Fetch-Site` 门以 `forbidden_ai_origin` 拒绝，旧记录未被改写；不得伪造浏览器来源来绕过产品边界。

Product Alignment:
- natural-language task: 用户在已有运行记录待清理或其他任务正运行时，新建需求并先写下自然语言目标。
- reusable chain boundary: TaskRun/Execution 的清理状态独立于浏览器活动；全局互斥只阻止实际受限操作，不阻止本地编辑对话草稿。
- runtime inputs: 已持久化的 execution/cleanup 状态、任务列表状态、当前受控 composer 草稿。
- dynamic task outputs: 如实显示待清理状态；新任务文字可聚焦输入，真正的并行发送限制仍由现有 UI/API 执行。
- generic platform capability used: 既有 TaskSummary 投影、AI Connect Timeline 的 `sendDisabled` 与 `composerDraft` 公共属性。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在禁发消息期间保留可编辑的对话草稿，并准确显示执行清理状态。
- existing implementation in repository: `ChatTimeline` 已持有受控草稿，`TaskWorkspace` 已显示全局任务提示；TaskChain execution 合同已有 `cleanup_required`。
- mature candidates and pinned versions: 沿用本仓库现有 `@agent-platform/ai-connect-react` 0.3.2 与 Zod 4.1.8，不引入库。
- selected implementation: 用共享 Timeline 明确支持的 `sendDisabled` 控制发送、保留 composer 可编辑；TaskSummary 明示待清理，避免投影成进行中的浏览器活动。
- reused public surface: 已打包的 `InteractiveTimelineProps.sendDisabled` 文档明确“阻止聊天发送，同时保留草稿、控件和停止动作”；继续使用现有 `composerDraft`。
- B-A-T-owned adapter and remaining gap: 只调整 B-A-T 的状态投影和传参；旧 execution 仍须经工作台的受控清理恢复，不自动改写审计。
- license/runtime/platform fit: 无新增依赖或进程；沿用现有许可和 Windows 服务。
- browser/runtime/state ownership conflicts: 不关闭浏览器、不释放未知 owner、不重试 B-U、不改旧运行结论。
- replay model calls: 0。
- rejected candidates and evidence: 不把 `cleanup_required` 直接改为业务失败或成功，不用 `npm run clean` 清理浏览器；这两者都不能表达持久化清理状态。命令行请求被同源门拒绝，不绕过。
- focused validation: task status 合同与投影的定点测试、Workbench composer 门的定点验证、所属包类型检查；不跑根级或完整任务链。

实施与定点结果：TaskSummary 增加 `cleanup_required` 展示状态，执行投影不再把它写成 `executing`；实际仍在处理的其他任务继续禁止发送，但共享 Timeline 用其现有 `sendDisabled` 保留输入框可编辑。合同、Workbench、API 三个所属包的 TypeScript 检查通过，Workbench 现有模型发送门测试 3/3、改动文件 `git diff --check` 通过。确认最新 B-U job 已终止且项目 Python/Chrome owner 已退出后，仅用用户要求的 `npm run clean` 清理 4173/4175 并重启 `npm run dev`。新 API `/api/tasks` 返回旧任务 `cleanup_required`、新任务 `new`，4173 页面 200，Vite 当前模块已加载新的 `sendDisabled`/`disabled` 属性。未通过浏览器实际点击与键入复验；旧 execution 的清理审计仍未确认，未改写原失败结论。

# 2026-09-26 样本复跑 read scope 来源交接（实施前记录）

正式任务 `b3726b40-02ab-4d0b-b1fd-78e199c67f82` 的第二次准备 job `ea2ccf85-cda3-4f63-8f64-87ddcb5f637c` 已完成 B-U 和首编译，但样本运行 `2a0c20dd…` 在 `s-a-0003 browser.read-fields` 读前范围核验失败，固定码 `hybrid_read_inner_pre_scope_value_error`。首次导航 `s-a-0001` 成功；源轨迹在导航后到一个未编译的只读 `find_elements` 之前，同一 tab/同一 document 的 URL 从合集页转为剧集页，并保存了 `before_action_read_refresh/readonly_observation_refreshed` 证明。`advanceReadOnlyBoundary` 仍要求这段 URL 完全相同，分类为 `runtime_scope_read_exclusion_discontinuous`；运行节点因此只剩 B-U 的静态剧集页 URL scope。本次样本重新从合集入口导航，读前校验失败。固定错误码没有原始 ValueError 和现场 URL，不能进一步断定底层三种 ValueError 中的哪一种。

Product Alignment:
- natural-language task: 用户确认动态最新内容后，第一次试做编译出的读取步骤须在新一次合法导航后重新读取页面。
- reusable chain boundary: B-U 来源提供同文档只读刷新证据；编译只准入经证明的页面交接，运行时以本次 Browser owner 的页面状态绑定 read scope。
- runtime inputs: 来源轨迹的前后观察、URL digest、document identity、只读刷新诊断及本次运行浏览器状态。
- dynamic task outputs: 运行时 read scope 和字段结果；异文档、缺证据或跨 tab 仍拒绝。
- generic platform capability used: 现有 `classifyRuntimeScopeDecisions`、`HybridRuntimeScopeState` 与 `browser.read-fields@2`。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 试做中的同文档只读 URL 变化后，安全地重绑本次运行的读取范围。
- existing implementation in repository: 已有 `runtimeScopeFrom`/`runtimeScopeReadOnlySameDocument` 标记、来源证据验证、运行时同 session/tab/document 核验；当前缺口只在被排除的只读动作边界传播。
- mature candidates and pinned versions: 继续复用现有 Zod 4.1.8、workflow-use 0.2.11 和 browser-use 0.13.8；不引入或替换库。
- selected implementation: 在现有 TS 分类器内，仅凭已验证同文档刷新诊断接受中间只读动作 URL 漂移，并把只读同文档标记传到运行；不改 Python 浏览器控制。
- reused public surface: 现有来源 `observation_diagnostic`、`document_identity` 与 RuntimeScopeState 公开边界。
- B-A-T-owned adapter and remaining gap: 仅对 B-A-T 自有的来源到版本化链路适配补齐证据交接；旧失败运行不能逆改，完整新任务仍需正式验收。
- license/runtime/platform fit: 无新依赖、平台分支或会话；Windows 定点验证。
- browser/runtime/state ownership conflicts: 保持一个 Browser owner，运行时换 tab、换 session、换 document 拒绝；不加入网站特例。
- replay model calls: 0。
- rejected candidates and evidence: 不删除 read scope、不忽略 ValueError、不放宽浏览器页面身份检查；这会让错误页面字段进入结果。
- focused validation: 分类器中间只读 URL 漂移正反例、RuntimeScopeState 同文档/跨文档正反例、API 所属包类型检查；不整跑 B-U。

实施与定点结果：`advanceReadOnlyBoundary` 仅在 `find_elements` 的已验证同文档只读刷新诊断存在时接受中间 URL 漂移；分类器把该漂移传成现有 `runtimeScopeReadOnlySameDocument` 标记，并核验前驱到当前读取仍为同一文档。点击等非读取节点不能获得此标记。所属 API 测试 5/5、API 类型检查通过。对失败 job 的持久化来源只读重新分类，`s-a-0003` 由旧的 `runtime_scope_read_exclusion_discontinuous` 变成 `runtimeScopeFrom=s-a-0001` 且 `readOnlySameDocument=true`；该来源没有可选准备图，物化阶段不会移除标记。这只验证原失败来源的分类/交接，不证明新 B-U、样本、独立复验或播放。

# 2026-09-26 最新目标与访问限制的访谈边界、来源题板长度（实施前记录）

正式工作台任务 `6416bb34-f72c-4066-9b80-ee065f90c496` 原话只要求在指定服务播放“最新一集”，没有免费限制。首轮 `web_search` 真实执行，用户确认了作品入口。随后访谈生成推荐选项“最新已公开正片”，副说明却规定最新集需会员时回退到最新免费集；用户点击后，草案 v1 固定了回退规则。准备任务按该草案运行，打开第 180 话；这不能算用户原目标的成功。该来源候选的 333 字选项说明来自 URL 与原始搜索摘要拼接；完整摘要应作为可追溯证据保留，但题板只需简洁地辅助选择。用户本轮明确纠正：有证据显示最新集需会员时，应先问是否具备并愿意使用会员；回答没有后，只有先查明具体可访问替代集、再问是否接受，才能变更目标。门槛若在 B-U 现场才发现，须退回需求对话，正式运行不自行择旧集。旧草案须保留为历史版本，后续纠正须走正式需求版本。

Product Alignment:
- natural-language task: 用户给一句普通动态目标，访谈识别真正最新对象；有证据表明它需额外资格时先问用户，否定回答后另行确认具体替代对象。
- reusable chain boundary: 访谈 Skill 决定业务歧义和提问，来源 Question 只投影已持久化搜索候选；B-U 执行用户确认的唯一草案，不替换目标。
- runtime inputs: 原始需求、用户后续纠正、已确认来源、只读搜索候选及原摘要。
- dynamic task outputs: 语义一致的草案版本、简短来源候选预览及完整可追溯证据。
- generic platform capability used: 现有 Pi 搜索、Common Question、SourceCandidate 和版本化访谈状态。
- replay model calls: 0；访谈模型调用不进入普通链路复跑。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 让动态目标排序与访问资格分离，并控制来源候选题板的信息密度。
- existing implementation in repository: 私有访谈 Skill 和 stage guidance 已负责语义；`sourceQuestion` 使用 Common Question，`SourceCandidate.description` 保留既有摘要片段，`aiEvents` 保留完整工具输出。
- mature candidates and pinned versions: 沿用已接入的 `@agent-platform/ai-connect` 0.3.2 Common Question、Pi AgentSession 与 Zod 4.1.8；无新依赖。
- selected implementation: 在 Skill 和访谈指令中明确资格确认与替代目标确认是先后两个决策；B-U 新发现的业务门槛退回需求对话；来源题板只展示有长度界限的摘要预览，原候选描述与完整工具输出分别保留在来源和搜索事件。
- reused public surface: `createCommonQuestionFromPanel`、现有访谈 prompt 层与 SourceCandidate 合同。
- B-A-T-owned adapter and remaining gap: 仅调整 B-A-T 的访谈规则及候选显示投影；模型实际是否遵守仍须用新的自然短句从正式 UI 验证。
- license/runtime/platform fit: 沿用现有组件及 Windows 开发运行环境。
- browser/runtime/state ownership conflicts: 不启动浏览器、不改 B-U owner、运行时、旧任务或旧草案。
- replay model calls: 0。
- rejected candidates and evidence: 不用站点剧集词典、会员关键词过滤或宿主打分来替模型判断语义；不默默改写已经确认的 v1 草案。
- focused validation: 所属来源题板长摘要预览测试、访谈 prompt 定点检查、API 包类型检查；正式 UI 的下一条全新短句和完整任务链验收单独记录。

实施与定点结果：访谈 Skill 和阶段指令已写明资格确认、替代对象调查与第二次确认的顺序；访问门槛在 B-U 才显现时返回需求对话。`sourceQuestion` 只对题板摘要作 88 字符预览，候选原描述和 `aiEvents` 原始工具输出不改。来源所属测试 12/12、API 包 TypeScript 检查、改动文件 `git diff --check` 通过。新规则尚无新的正式任务模型行为证据；旧任务 v1 与试做、样本、复验不计作修后通过。

# 2026-09-26 访谈搜索历史在 Timeline 中可见（实施前记录）

任务 `6416bb34-f72c-4066-9b80-ee065f90c496` 的 `aiEvents` 持久化了真实 `web_search` 开始和完成事件、两条查询及原始结果；现有 `projectInterviewTimeline` 也产出 `tool-progress` hooks。但当前接入的 `@agent-platform/ai-connect-react` 0.3.2 `InteractiveTimeline` 从 `entries` 构造可见内容，`hooks` 只留在 value，不进入该组件的历史活动区；所以搜索完成后页面看不到搜索 UI。搜索结果原文约 8.9 千字符，须折叠呈现并保持可检查，不能再贴入题板。

Product Alignment:
- natural-language task: 用户用普通短句提出任务后，访谈按需只读搜索，并能看到真实搜索及其依据。
- reusable chain boundary: 搜索由访谈工具执行；Workbench 只把持久化事件投影成用户可读历史，不伪造工具调用或把搜索写入任务链。
- runtime inputs: 访谈消息的 `aiEvents`、工具 callId、查询和实际工具输出。
- dynamic task outputs: 每次实际搜索的简短状态、查询和可展开的原始结果，刷新后仍可见。
- generic platform capability used: 既有 `InteractiveTimelineItem.kind="content"` 与 `ConversationEntry` 投影接口。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在共享 Timeline 中显示已完成的访谈搜索记录和完整证据。
- existing implementation in repository: 搜索事件已由 API 持久化，`projectSearchHook` 已解析开始/完成/失败、查询和引用；Workbench 使用共享 `InteractiveTimeline`。
- mature candidates and pinned versions: 复用当前 `@agent-platform/ai-connect-react` 0.3.2 公开的 `content` entry，不新增库或另造 Timeline。
- selected implementation: 保留现有 hooks 供其他 Timeline 消费；同时仅对真实 `web_search`/`search_sources` 事件投影一条历史 content entry，主行简短，原始工具结果放折叠区。
- reused public surface: `projectInteractiveTimelineValue`、`InteractiveTimelineItem.kind="content"`、原生 HTML `details`。
- B-A-T-owned adapter and remaining gap: 只补 Workbench 的事件到 UI 投影；不修改共享组件、搜索工具或持久化事实。
- license/runtime/platform fit: 沿用已验证组件和浏览器原生折叠控件，Windows/React 19 可用。
- browser/runtime/state ownership conflicts: 仅只读展示，不发起第二次搜索、不控制浏览器。
- replay model calls: 0。
- rejected candidates and evidence: 当前共享 `InteractiveTimeline` 的可见活动只从 `entries` 的 reasoning/tool part 读取，忽略 `value.hooks`；更换/复制 Timeline 或把完整搜索摘要塞进 Question Panel 都会扩大职责和界面负担。
- focused validation: 对真实结构事件的投影与可见 markup 定点测试、Workbench 包类型检查；不运行根级或完整任务链。

实施与定点结果：Workbench 在共享 `InteractiveTimeline` 的公开 `content` entry 内，把每次真实搜索调用压成一条可见记录，查询与终态在主行，原始结果和提取的引用在原生折叠区；旧来源 Question 仅在有匹配 `sourceResolution.questionId` 时生成最多 88 字的只读预览，原始问题、来源候选与工具输出均未改写。两个所属包定点测试 2/2、Workbench 类型检查、`git diff --check` 通过。对正式任务 `6416bb34-f72c-4066-9b80-ee065f90c496` 的持久化状态只读重投影，得到 1 条真实搜索记录、可展开原始结果；原来源副标题 333 字，历史 UI 投影为 137 字。浏览器实际页面呈现由后续工作台验收核验；本验证不代表业务目标正确或完整任务链通过。

# 2026-09-26 业务调查误入来源提案后的状态恢复（实施前记录）

新任务 `7dc29061-f591-4559-ab72-8a3fcca21464` 的首版草案没有主动核查会员资格；操作者随后错误地代用户发了指导性补充，故该任务不得计作自然短句一次通过。该轮 `web_search` 用于调查已选来源内的观看资格，模型仍调用 `present_source_candidates`，生成了多余来源 Question。下一轮普通纠正消息将该 Question 标为 `superseded`，但对应 `sourceResolution` 仍为 `open`；`assertRequirementReady` 会将此孤儿来源误判为待决，阻止日后新草案。原已选来源必须保留，未确认草案和用户对话不能由脚本改写。

Product Alignment:
- natural-language task: 用户纠正对话中的错误提问后，系统保留原来源与完整历史，并能继续就真正的业务问题提问。
- reusable chain boundary: Question 的待决生命周期与来源决议状态一致；来源解析只服务入口确认，业务事实搜索不成为新入口。
- runtime inputs: 已持久化的 Question 状态、`sourceResolution.questionId` 与用户新一轮消息。
- dynamic task outputs: 被取代的来源候选标为 superseded，原 selected 来源不变，新业务问题仍可继续。
- generic platform capability used: 现有访谈状态、`beginRound`/`finishRound` 和确认门。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 访谈来源题板被新对话取代时同步撤销对应来源待决事实。
- existing implementation in repository: `finishRound` 已把旧 open Question 标为 superseded；`sourceResolution` 通过 questionId 关联，`assertRequirementReady` 已拒绝未决来源。
- mature candidates and pinned versions: 沿用现有 `@browser-capture/contracts` 访谈状态与 Zod 4.1.8；不引入依赖。
- selected implementation: 在已有轮次边界按 questionId 同步 open 来源决议；对已持久化的孤儿状态在下一轮开始时同样收敛。原 selected、answered 决议不变。
- reused public surface: `InterviewState.unresolved`、`sourceResolutions`、`beginRound`、`finishRound`。
- B-A-T-owned adapter and remaining gap: 仅维护 B-A-T 的版本化访谈事实一致性；被指导性消息污染的任务仍不可作一次通过验收。
- license/runtime/platform fit: 仅 TypeScript 状态投影；Windows/SQLite 既有环境。
- browser/runtime/state ownership conflicts: 不运行浏览器、不修改旧草案或旧执行。
- replay model calls: 0。
- rejected candidates and evidence: 不直接改 SQLite 或静默选择多余来源；这会抹去错误问答的审计，也不能修复一般状态交接。
- focused validation: 所属 transition 测试覆盖 open Question 被取代与持久化孤儿下一轮收敛，API 包类型检查；不整跑产品任务。

# 2026-09-26 用户自身事实题不预设推荐答案（实施前记录）

新任务 `7dc29061-f591-4559-ab72-8a3fcca21464` 的会员题板把“有且愿意使用大会员”标成推荐。该题只询问用户自身资格和使用意愿，访谈搜索无法证明用户的答案；更早的需求对话是操作者用用户身份补写指导才引出此题，因此该任务不构成自然短句首轮成功证据。`commonQuestionAuthoring` 当前强制每道选择题恰有一个推荐，Skill 也作同样要求，这是无依据推荐的直接协议原因。

Product Alignment:
- natural-language task: 用户只说普通目标，访谈在需要时主动调查并向用户确认其个人资格，不替用户暗示答案。
- reusable chain boundary: 访谈模型判断该问什么；公共 Question 仅表达问题与可选推荐，宿主不根据网站或词语猜测用户身份。
- runtime inputs: 用户原话、可追溯搜索证据、访谈历史和已知用户决定。
- dynamic task outputs: 对用户自身事实的无推荐业务 Question；有证据支持的方案取舍仍可给一个推荐。
- generic platform capability used: AI Connect Common Question Authoring 的 `recommendation: "optional"`。
- replay model calls: 0；访谈不进入链路复跑。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 区分有依据的方案建议与只有用户能回答的事实题。
- existing implementation in repository: `apps/api/src/interview/protocol.ts` 已复用 Common Question parser/projector；当前设置 `recommendation: "required"`。
- mature candidates and pinned versions: 已固定 `@agent-platform/ai-connect` 0.3.2 的公开 `CommonQuestionAuthoringOptions` 支持 `forbidden | optional | required`，已装组件支持无推荐选项；不引入库。
- selected implementation: 改用公开的 `optional`，在访谈 Skill 和阶段指令中约束事实题不推荐答案；保留有依据的方案推荐。
- reused public surface: `commonQuestionAuthoring` 与 `createCommonQuestionFromPanel`。
- B-A-T-owned adapter and remaining gap: 仅调整访谈呈现规则；模型是否自主调查并正确提问尚需未受操作者指导的新任务证明。
- license/runtime/platform fit: 不变，沿用现有 TypeScript/Windows 包。
- browser/runtime/state ownership conflicts: 无浏览器操作或状态迁移。
- replay model calls: 0。
- rejected candidates and evidence: 不由宿主按会员或其他业务关键词自动删推荐，也不把用户自身事实伪装成有优劣的方案；这会把语义判断移出访谈模型。
- focused validation: 协议测试核验无推荐事实题可被接受、多个推荐仍拒绝，并执行 API 包类型检查；不运行正式任务或全量测试。

# 2026-09-26 自然语言纠正与未决 Question 的轮次交接（实施前记录）

正式工作台任务 `449e20e7-91aa-46ed-bac1-2cdc93b0ad8c` 在无开发指令的普通短句及同版来源选择后，访谈自己调用 `web_search` 调查访问资格，给出无推荐的会员 Question。随后使用普通用户表达“资格不确定、只要最新、受阻不换旧集”，模型完整生成了符合草案段落语法的 Markdown，API 却将轮次记为 failed。持久化输出和源码可定位：`parseInterviewOutput` 在 `finishRound` 把上一道 open Question 标为 superseded **之前**调用 `assertRequirementReady`，仍见 `interview_unresolved_items_open`；失败后旧 Question 仍 open。该时间顺序使自由纠正不能成稿，用户只能点不能如实表达的二元选项。不得用点击“有会员”或重复整跑掩盖。

Product Alignment:
- natural-language task: 用户可以用正常语言纠正上一道题，说明“不知道资格但保持原目标、受阻停止”，访谈在此基础上形成可审阅草案。
- reusable chain boundary: 模型判断纠正是否消除业务歧义；宿主只在验证本轮候选草案时投影本轮成功提交后会发生的 Question 生命周期，不替模型选择答案。
- runtime inputs: 当前 active turn、此前 open Question、来源决议、用户自然语言回复和模型本轮草案。
- dynamic task outputs: 通过机械确认门的同版草案，或仍可核验的未决错误；真实状态只在成功轮次提交后改变。
- generic platform capability used: 现有 `InterviewState`、`beginRound`/`finishRound`、Common Question 与 `assertRequirementReady`。
- replay model calls: 0；仅访谈轮次调用模型。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 自然语言回复可以取代过时题板，且草案验证看到与成功提交一致的待决状态。
- existing implementation in repository: `finishRound` 已在成功时 supersede 旧 open Question 并同步 open 来源决议；`parseInterviewOutput` 当前在此之前检查原状态。
- mature candidates and pinned versions: 沿用 AI Connect Common Question 0.3.2、现有 Zod 4.1.8 和既有访谈状态；无新依赖。
- selected implementation: 对正在运行的轮次，草案准入用纯投影模拟其成功提交后对旧 open Question/关联来源的 supersede；成功时仍由 `finishRound` 原子写回，失败不抹掉历史 Question。
- reused public surface: `parseInterviewOutput`、`finishRound`、`assertRequirementReady`、`sourceResolution.questionId`。
- B-A-T-owned adapter and remaining gap: 仅修 B-A-T 访谈轮次状态与草案门的先后次序；语义充分性仍由访谈 Skill 判断，不增加关键词分类器。
- license/runtime/platform fit: 无新增库或平台路径，Windows 现有环境。
- browser/runtime/state ownership conflicts: 不触碰浏览器、不改旧任务草案、不自动确认草案或启动 B-U。
- replay model calls: 0。
- rejected candidates and evidence: 不代用户点会员选项、不跳过所有待决校验、不在失败轮次原地标记回答；这些会伪造决定或丢失可恢复 Question。
- focused validation: 自然语言纠正后本轮草案可验证、失败轮次原状态不变、未证实入口仍拒绝，所属 API 测试与类型检查；不整跑 B-U。
## 2026-09-26 Pi 搜索来源列表标题的证据保真

Product Alignment:
- natural-language task: 用户只说要在指定服务播放某作品的最新一集，访谈自行搜索并让用户核对来源。
- reusable chain boundary: 草案确认后才把一个有引用的入口交给 B-U；动态目标由版本化链路在运行时选择。
- runtime inputs: 无；账号资格与页面现场状态由浏览器观察，不能由搜索或宿主猜测。
- dynamic task outputs: 目标正片已开始播放，或明确报告无法播放；不可回退到旧集冒充成功。
- generic platform capability used: Pi `web_search` 工具事实、来源候选引用、公共 Question 与草案版本门。
- replay model calls: 0；来源解析只属于访谈。
- site/task-specific code added: no

Reuse Assessment:
- capability: 把 Pi 只读搜索返回的原始来源列表标题与 URL 原样保留到来源题板。
- existing implementation in repository: `PiSourceSearchObserver`、`piSearchCandidates`、`SourceCandidate` 和公共 Question 投影已经存在。
- mature candidates and pinned versions: 继续复用仓库现有 Pi 搜索 extension 与 AI Connect；不引入新的搜索/解析库。
- selected implementation: 在既有解析适配层识别搜索结果中编号标题紧邻 URL 的结构，以该原标题更新同一 URL 的候选展示。
- reused public surface: `web_search` 的原始文本事件及现有来源候选/Question 合同。
- B-A-T-owned adapter and remaining gap: 仅保存真实搜索文本的标题和引用；来源业务相关性仍由访谈模型与用户判断，页面真实身份由 B-U 核验。
- license/runtime/platform fit: 无新依赖或运行时要求。
- browser/runtime/state ownership conflicts: 不启动浏览器、不更改来源选择或既有版本。
- replay model calls: 0。
- rejected candidates and evidence: 不以站名、链接路径、关键词相似度或候选顺序推断来源身份；本次原始搜索有“凡人修仙传 _ 国创 _ bilibili ...”的来源列表标题，但持久化候选只显示内联动作文字“点击观看/追番”及“身份尚待确认”，属于证据提取丢失。
- focused validation: Pi 搜索格式回归用例、访谈来源用例和 API 类型检查；本次旧任务的已确认候选不改写。

## 2026-09-26 动态候选域覆盖失败（调查记录；未实施修复）

正式新任务 `449e20e7-91aa-46ed-bac1-2cdc93b0ad8c` 的用户已确认需求明确要求“最新已发布正片；受限时停止，不改播旧集”。B-U 只读取当前页面的 177–184 分组，`li[title]` 查询的 10 项包含 2 个模式项和 8 个正片项，因 `dom_query.complete=true` 就把组内最大 184 当作全域最新。官方播放页近期显示第 192 集会员正片、第 193 集预告（[官方页面](https://www.bilibili.com/bangumi/play/ep3854807?from_spmid=666.5.banner.6)）。隔离只读 Chrome 核验了页面确有多个范围分组。后续编译、样本、独立复验和正式复跑技术完成，但沿同一局部候选集运行，业务结果失败。

**设计修正（2026-09-26）：** 最初提出的“编译候选域覆盖门”方案已撤回；编译器无法还原 B-U 未访问的页面，业务调查和纠错必须发生在 B-U 原现场。

### 修正后的 B-U 修复边界（未实施）

Product Alignment:
- natural-language task: 根据已确认草案，在 B-U 现场调查可能改变动态选择的页面内容，执行动作并观察结果；无法判断时明确未完成。
- reusable chain boundary: 需求对话确定业务目标；B-U 用浏览器现场完成探索；编译器只转换已记录的技术路径；普通复跑执行发布版本。
- runtime inputs: 已确认草案、当前页面、同一浏览器观察和账号现场状态。
- dynamic task outputs: 实际选择、动作后态和来源轨迹，或未查清的具体原因。
- generic platform capability used: browser-use Agent 原生观察/动作及同 Agent 后续任务接口、workflow-use 现有证据和编译接口。
- replay model calls: 0，显式 LLM 节点除外；B-U 的有界复核仍属于首次探索。
- site/task-specific code added: no。

Reuse Assessment:
- capability: B-U 动态选择前的现场调查和同 job 有界续做。
- existing implementation in repository: `author.py:251-253` 把增大 `max_results` 描述成覆盖完整候选列表，容易混同当前查询与业务范围；当前只调用一次 `Agent.run`。`natural_selection.py` 只验证已记录读取、函数和点击一致，不能还原未访问的页面。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8 Agent、受管 Browser 和 workflow-use fork；[上游 Agent.add_new_task/run 源码](https://raw.githubusercontent.com/browser-use/browser-use/0.13.8/browser_use/agent/service.py) 支持同 Agent/history/browser 的后续任务。其内建 judge 仅附 verdict，不自动纠错或续做。
- selected implementation: 待定点协议核验后，优先在 B-U 首次 `Agent.run` 与 collector.finish 之间做一次有界完成复核；若发现具体未调查的可见入口，则给同一 Agent 加后续任务并继续原 Browser。预算用尽或仍无法判明时，来源未完成。复核不能只靠模型自述“已看全”。
- reused public surface: browser-use 的原生动作、Agent.run 与 add_new_task；保留现有 capture、EvidenceCollector 和来源输出，不新建 Agent loop 或浏览器控制会话。
- B-A-T-owned adapter and remaining gap: 须核验二次 run 的总步数、模型用途审计、回调 step_number/trace 连续性，以及首次临时 done 不污染最终编译；编译保持技术一致性职责。
- license/runtime/platform fit: 不引入依赖，沿用现有 Windows Browser owner；跨平台效果未测。
- browser/runtime/state ownership conflicts: 同一 B-U job、Agent 和 Browser；不改写旧来源或已发布 V1。
- replay model calls: 0，显式 LLM 节点除外。
- rejected candidates and evidence: 增大 `max_results` 只能扩大单次查询；分页/候选域专用编译门无法重现漏看的现场；只打开 `use_judge=True` 不会续做，且压缩历史和截图仍可能漏判。
- focused validation: 先做二次 run 的步骤编号和 trace 定点协议测试，再用通用多视图现场验证 B-U 能在同一 job 续查并纠正局部选择；最终仅以一个全新正式任务验收。未运行这些测试。

## 2026-09-26 修复前记录：同版结果、人工等待与原窗口交付

Product Alignment:
- natural-language task: 用户可要求获取数据或文件，也可要求操作完成后继续使用当前网页；访问限制发生时由用户在原站点处理。
- reusable chain boundary: 已确认准备草案的结果意图与来源证据投影到 Plan、候选链和不可变 Release；正式复跑沿发布链执行，结束后由本次 browser owner 交付或清理现场。
- runtime inputs: 草案版本、运行时输入、页面观察、当前 execution 的 browser owner 与可见模式。
- dynamic task outputs: 本次实际值、目标页面引用、人工等待事实，以及窗口交付或清理的独立事实。
- generic platform capability used: 既有 outputContract、TaskRun checkpoint、TaskAuthoringJob.waitpoint、RunnerProcess、BrowserProfileService owner、Workbench 状态投影。
- replay model calls: 0，除已发布链中的显式 llm 节点。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在同一浏览器现场等待用户处理访问限制，并在需要时交付已完成任务的原窗口。
- existing implementation in repository: browser-use 0.13.8 的 Agent/Browser、hybrid Runner 和 browser owner；TaskRun human_required/checkpoint、准备 job waitpoint、单次 headless 合同与工作台组件已存在。
- mature candidates and pinned versions: 复用固定 browser-use 0.13.8 与现有 RunnerProcess、BrowserProfileService；先核验其公开 CDP 附着/会话停止接口与 Windows 行为。
- selected implementation: 待 Windows 最小真样证明同一 owner 可在关闭自动化控制会话后保留原窗口，才冻结查看租约和同 owner 人工交还适配。
- reused public surface: browser-use 的 BrowserProfile.cdp_url/is_local、BrowserSession 生命周期及现有 Runner/TaskRun 协议；不复制 Agent loop 或浏览器驱动。
- B-A-T-owned adapter and remaining gap: 草案通用交付标记的同版投影、运行时结果与目标页绑定、人工等待/恢复、查看租约审计及跨任务通知。
- license/runtime/platform fit: 沿用仓库已固定依赖；Windows 同窗存活、Profile 锁及服务重启认领尚须实测。
- browser/runtime/state ownership conflicts: 每个产品运行一个控制会话；人工等待与交付只转移本次可证明的 owner，不重开 URL 冒充原现场。
- replay model calls: 0，显式 llm 节点除外；首次 B-U 续做属于准备模型用途。
- rejected candidates and evidence: 当前 runner.close 会关闭其拥有的 Chrome；单改 headless、keep_alive 或跳过 close 不能证明安全交付，重开 URL 不是同一页面。
- focused validation: 先用固定依赖做 Windows 原窗口断开控制/留存/结束清理真样，再做同 owner 等待与恢复、重启失主门；最后从正式工作台验 UI/API/SQLite 和可见原窗口。

Windows 最小真样（独立临时 Profile，`work/handoff-lifecycle-probe/result.json`，未使用产品任务）：系统 Chrome 由 B-A-T 样本进程持有，browser-use 0.13.8 通过公开 CDP URL 附着；`Browser.stop()` 后 Chrome owner PID、原 page target ID、data URL 与可见窗口仍在，随后只终止经专属 Profile 命令行核验的该 owner 树并清理专属临时 Profile。首次样本把 `cdp_url/is_local=False` 只传给 `BrowserProfile`，但该版本 `Browser` 构造器在直接 `cdp_url` 缺失时会覆盖 `is_local=True`，因此该次不能证明非本地附着；改为同时传给 `Browser(..., cdp_url=..., is_local=False)` 后二次样本 `attachedNonLocal=true`、`sameTargetAfterStop=true`、`windowAfterStop=true`、`ownerAliveAfterCleanup=false`。这只验证基本断开/存活/定点结束，不验证视频连续播放、Runner 协议、租约持久化或服务重启认领；这些仍是实施门。[固定版本 BrowserSession.stop 源码](https://raw.githubusercontent.com/browser-use/browser-use/0.13.8/browser_use/browser/session.py)、[LocalBrowserWatchdog 源码](https://raw.githubusercontent.com/browser-use/browser-use/0.13.8/browser_use/browser/watchdogs/local_browser_watchdog.py)。

实施后底层真样（`apps/api/tests/managed-window-runner.acceptance.ts`，Windows，1/1）：真实可见 Chrome 在首次 Runner 导航与观察后 handoff，自动化 Runner 清理确认且原 owner/target 保留；同 owner 新 Runner 的 sessionId/tabId 与首次一致，二次 handoff 保持 leaseId/targetDigest，再经 focus 与 end 定点结束。异主启动和异主 end 均拒绝。复用 browser-use 0.13.8 公开 `Browser(..., cdp_url=..., is_local=False)`、`Browser.stop()`；Chrome 可执行文件定位暂借固定版本 `LocalBrowserWatchdog._find_installed_browser_path('chrome')` 内部方法，只用于定位，不复制浏览器驱动或 Agent loop。Chrome 原生 localhost DevTools HTTP 仅验证 PID、Profile、CDP、target 身份及激活 target；浏览器动作仍走既有 Browser-Use capability。该真样不证明正式工作台、真实访问限制、视频连续播放或服务重启恢复。

## 2026-09-26 修复前记录：任务永久删除与全局通知

Product Alignment:
- natural-language task: 用户能永久移除自己选择的任务及其私有历史，同时在切换任务后仍看见需要处理或已经完成的任务状态。
- reusable chain boundary: 删除只作用于一个 task 的访谈、准备、发布和运行事实；通知仅投影已有持久化 job/execution 事实，不更改链路或任务结果。
- runtime inputs: 目标 taskId、已确认的删除命令、本次任务与 browser owner 状态；通知读取持久化状态和单调事件。
- dynamic task outputs: 删除成功或可操作的拒绝原因；跨任务待处理、完成和失败提示。
- generic platform capability used: Fastify、SQLite/Drizzle 事务、Pi session 删除导出、cleanupOwned、既有工作台列表与 Radix 组件。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 安全删除任务拥有的持久化记录和私有 session，并投影跨任务状态。
- existing implementation in repository: TaskStore/TaskChainRepository、现有 archived 列表、BrowserService.cleanupOwned 与任务状态 API；Pi binding/sessionId 分别以 taskId/jobId 关联。
- mature candidates and pinned versions: 复用已固定 @agent-platform/pi-agent-session 0.1.0 的 platform-internal 删除导出、better-sqlite3 12.10.0/Drizzle 0.45.2 事务、Radix Themes 3.3.0；删除前核验导出与残留行为。
- selected implementation: 先拒绝活动或 owner 不明的任务，清理可证明属于目标的 Pi 私有状态，再在单个 SQLite 事务中按外键顺序删除 task 专属行；UI 收到成功才移除列表。通知由既有 job/execution 数据派生。
- reused public surface: PiAgentSessionBindingStore/deletePiSessionData、SQLite transaction、现有 Fastify route 和工作台组件；不重写 Pi 路径校验或文件删除。
- B-A-T-owned adapter and remaining gap: task 到 Pi session/job、运行 owner、外部审计和各关系表的所有权映射；失败可重试诊断与当前/归档列表更新。
- license/runtime/platform fit: 既有本地 Windows 依赖，无新增库；platform-internal 是固定版本的弱稳定接口，须定点验证。
- browser/runtime/state ownership conflicts: 活动执行、cleanup_required、未知 owner 均拒绝删除；只清除该 task 自有资源，不动全局 aiSettings 或其他任务 Profile。
- replay model calls: 0。
- rejected candidates and evidence: archive 仅改 tasks.archived；SQLite 外键没有自动级联，直接删 tasks 会失败或遗留记录；直接递归扫 Pi/浏览器目录无法证明所有权。
- focused validation: 隔离新任务的活动拒绝、无活动删除、重启后 task 各专属表与 Pi binding 无残留、其他任务与全局设置不变；跨任务通知按真实 job/execution 状态显示并在切换后保留。

实施前核验（删除切片）：当前 SQLite 为 v18，`operations` 只有 scope/requestId/digest/resultId，没有 taskId；现存全局旧键中有 14 条旧修订／布局操作，其 resultId 已无存活事实可证明归属。新记录须写入显式 owner；旧记录只能按直接任务 scope 或仍存在且唯一的结果事实归属定向删除，14 条不可猜删。当前主库没有 `researchRuns`，但迁移链中的新库会创建它，删除须按真实表存在性处理。`originAccessEvents`/`originAccessBlocks` 是跨任务来源访问限制事实，不能为删除一个任务清空全局限流。Pi 0.1.0 `platform-internal` 明确导出 `PiAgentSessionBindingStore` 与 `deletePiSessionData`；该删除先去 binding 再删 session 文件，文件删除失败时适配层须恢复原 binding，保留重试入口。Browser journal 是全局 owner 文件与追加日志；只可在 owner 已关闭且日志每行可验证 taskId 时移除该任务记录，遇到损坏或未知归属须拒绝，不能粗删。

## 2026-09-26 访谈结果形状：同版记录列表

正式工作台新任务 `486738b7-00fb-4d7d-9e23-93d2dc62f49c` 暴露通用合同缺口：自然需求要求返回多条各含标题和链接的记录，但已确认 v1 草案把标题和链接声明为两个顶层文本字段，投影为单个对象，无法表示逐项对应关系。该首次确认和 B-U 尝试保留为原始事实；修复只约束后续草案，不回写任务数据。

Product Alignment:
- natural-language task: 一次运行交付来源范围内多条对象，每项保留相互对应的业务字段。
- reusable chain boundary: 访谈草案确认结果形状；同版 Plan/ResultSpec 只投影草案；B-U 读取并编译实际来源，普通复跑按不可变 Release 返回记录数组。
- runtime inputs: 已确认来源、运行时业务输入与真实页面内容。
- dynamic task outputs: 逐项的字段记录及空集合；字段值、条数和顺序由本次真实执行决定。
- generic platform capability used: 现有 ValueSchema 数组/对象、ResultSpec 根路径、ResultBinding 与 typed outputContract。
- replay model calls: 0，除显式 llm 节点。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在可审阅草案中表达并验证多条配对字段记录的结果合同。
- existing implementation in repository: `ValueSchema` 已有 `array<object>`，`ResultSpec` 的 `valuePathSchema` 接受空根路径，TypeScript `requiredPathsCovered` 和现有 Python `compile_result_binding` 均支持整份结果一个根路径 producer；草案 parser 之前只生成顶层 object 字段。
- mature candidates and pinned versions: 直接复用仓库已固定的 Zod、TypeScript ResultSpec、workflow-use 既有输出绑定；不新增或替换库。
- selected implementation: 数据草案显式写“单条记录”或“记录列表”，后一种将字段解释为每条记录的属性，投影一个数组对象合同和根路径 `[]` 的整体 producer；旧无形状草案按原单对象读取。
- reused public surface: `valueSchemaSchema`、`resultSpecSchema`、同版 `projectPreparationPlan` 与既有 B-U 请求序列化。
- B-A-T-owned adapter and remaining gap: Markdown 语法投影、访谈提示和固定形状验证；B-U 对全域来源、编译、正式 UI 与 SQLite 的真实验收另行记录。
- license/runtime/platform fit: 无新依赖或跨平台行为。
- browser/runtime/state ownership conflicts: 不改任务浏览器、原任务、数据库或 Release。
- replay model calls: 0，显式 llm 节点除外。
- rejected candidates and evidence: 顶层平行“标题列表”和“链接列表”没有逐项配对合同；让 Plan 或编译器从“全部”猜出数组形状违反同版草案唯一事实源。对每个数组元素声明固定索引路径也会冻结动态条数。
- focused validation: `preparation-draft-handoff.test.ts` 与 `interview-protocol.test.ts` 共 22/22 通过，`@browser-capture/api` TypeScript 检查通过；真实 B-U、首编译、正式复跑和 UI/SQLite 的新形状验收未测，不会重跑旧任务冒充首次通过。

## 2026-09-26 列表来源同现场证据门与编译装配

正式目录任务的第一个 B-U 把一次精确查询的 0 命中及两次宽查询的 156/175 命中当作“全部一级章节”，最终输出两个拼接字符串；来源标成功，但编译因精确字段读和结果装配缺证失败。新草案的记录列表合同解决上游形状，来源阶段还需在原 Browser 关闭前核对业务集合与实际可复跑读取。

Product Alignment:
- natural-language task: 用户可要求某个来源范围内全部有序记录，每条记录带相互关联字段。
- reusable chain boundary: 访谈确认范围与输出形状；B-U 同一 Agent/Browser 调查范围并给出实际读取；编译只映射已证明的动作和值；发布后普通链路零隐式模型复跑。
- runtime inputs: 已确认草案与来源、真实页面和运行时数据。
- dynamic task outputs: 每条记录的字段、顺序和数量，以及现场证据不足时的明确未完成。
- generic platform capability used: browser-use 0.13.8 原生 `extract`/`find_elements`、既有宿主 DOM ReadSpec 双次现场重验、同 Agent `add_new_task`、workflow-use 输出装配。
- replay model calls: 0，显式 `llm` 节点除外。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在来源关闭前核对结构化集合输出的范围查询与成对字段读取，保留给编译器可验证的证据。
- existing implementation in repository: `record_projection_snapshot` 可从原生 extract 的增强 DOM 两次重验 ReadSpec；`find_elements` 可保存完整查询与有序容器身份；已有 completion review/continuation 与 compiler gap/coverage。
- mature candidates and pinned versions: 沿用已固定的 browser-use 0.13.8 Agent/Browser 与受管 workflow-use fork，无新增依赖。
- selected implementation: 对实际输出中的记录数组要求宿主配对读取的 schema/value digest、同页完整非零查询、同序容器 identity digest/数量一致；复核须引用具体查询并判断业务范围。证据不足时同一 Agent 续查一次，仍不足则来源失败。探索查询只有与最终值/schema 精确相符才进入输出装配。
- reused public surface: browser-use 原生动作及 `Agent.add_new_task`/`run`；现有宿主 ReadSpec、来源 collector、编译器输出装配与 action coverage。
- B-A-T-owned adapter and remaining gap: 连接来源查询、宿主读与结果合同的证明；模型对“业务全集”的判断仍需真实页面和正式新任务检验，机器 cardinality 不单独证明业务范围。
- license/runtime/platform fit: 既有固定依赖与 Windows Runner；没有新许可证或平台能力。
- browser/runtime/state ownership conflicts: 同一准备 job、Agent、Browser 和累计步数；只在关闭前续查，不启动第二个控制会话。
- replay model calls: 0，显式 `llm` 节点除外。
- rejected candidates and evidence: 调大 `max_results` 只扩大一次局部查询；在编译器猜未访问页面、接受无 read 的输出、把查询完整等同业务全集均会重复第一次失败。
- focused validation: 新增集合门槛 5/5、输出范围 1/1、完成复核 7/7、输出装配 15/15、fork 摘要核验通过；记录投影 19/20，唯一 `host_record_projection_ambiguous` 在原始 HEAD 相关模块上也复现。正式新任务产品全链另记，不把定点测试当成验收。

## 2026-09-26 根数组结构化输出的 JSON 值适配

第二条从正式工作台新建的普通目录任务 `233dd9fe-0be6-4927-8f05-d326f0721b53` 在首次 B-U 就失败。持久化来源显示原生 `done(success=true)` 返回了 `data.value` 中 15 条成对的标题/链接记录，且两次完整候选查询各为 16 项；宿主却保存 `output=null`、`sourceSuccess=false` 和 `business_output_schema_not_proven`。只读解码确认 `AgentHistoryList.get_structured_output(output_model)` 可以解析该原生结果；旧 `output_model_for` 对根数组直接取 `.value`，其中元素仍为 Pydantic 子模型，随后 JSON Schema 校验期待 JSON 对象而拒绝。它是输出适配边界的类型错误，不能把这一条失败来源重写成成功。

Product Alignment:
- natural-language task: 用户可以要求一组动态记录，每条记录保留对应字段，也可以要求单值或单条对象结果。
- reusable chain boundary: 已确认草案定义结果形状；B-U 的原生结构化 `done` 经既有结果适配和 JSON Schema 校验成为来源事实；编译只消费通过校验的真实输出，普通复跑使用发布的结果绑定。
- runtime inputs: 已确认的动态输出 schema、B-U 原生结构化结果与现场读取证据。
- dynamic task outputs: 符合草案 schema 的 JSON 数组、标量或对象；数组项数和值由实际运行决定。
- generic platform capability used: 既有 browser-use 结构化输出、Pydantic v2 `model_dump(mode='json')` 和 JSON Schema 校验。
- replay model calls: 0，除发布链路中的显式 `llm` 节点。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 将根层非对象结构化输出转换成真正的 JSON 值，再交给已有 schema 校验。
- existing implementation in repository: `apps/api/python/browser_use_runner/output_schema.py` 已用 `create_model` 包装根层非对象 schema；对象根原本通过 `model_dump(mode='json')` 处理，但非对象根直接返回 `.value`，保留嵌套 Pydantic 对象。
- mature candidates and pinned versions: 沿用 `vendor/workflow-use/workflows/uv.lock` 固定的 browser-use 0.13.8、Pydantic 2.12.5、jsonschema 4.25.1；没有新增、替换或删除库。
- selected implementation: 对非对象根使用已有 Pydantic `model_dump(mode='json')['value']`；原对象根的可选字段处理与后续 JSON Schema 校验不变。
- reused public surface: browser-use `AgentHistoryList.get_structured_output`、Pydantic `BaseModel.model_dump` 和既有 `output_model_for`/结果校验边界。
- B-A-T-owned adapter and remaining gap: 只做 B-A-T 输出合同的 JSON 值适配；16 个页面候选到 15 条业务结果的过滤缺少可复跑、确定性的读取/选择合同，不能靠序列化修复来证明。还须从全新正式工作台任务验证首次 B-U、首编译及后续全部门槛。
- license/runtime/platform fit: 复用现有 Python 运行环境和库公开 API；无新增许可或平台依赖。
- browser/runtime/state ownership conflicts: 不增加浏览器会话、不修改 Agent 探索或持久化旧来源；数据转换只在原生 `done` 的结果适配边界执行。
- replay model calls: 0；首次 B-U 的模型调用仍按准备用途单独审计。
- rejected candidates and evidence: 让 JSON Schema 直接接受 Pydantic 子模型会改变通用值合同；把这次 15 条按网站或条数特判、忽略 16→15 差异，均不能证明结果在普通复跑时可从页面确定性重现。
- focused validation: 所属 Python 定点用例覆盖 `list<object>`、`list<string>`、标量与 `null`，1/1 通过；旧失败 artifact 只读解码为 15 条普通 JSON 记录，schema gap 为 0；受管 fork manifest 核验通过。16→15 的确定性过滤合同与正式新任务首轮 B-U/首编译仍未由这些检查证明，旧失败记录不改写。

## 2026-09-26 动态记录列表的现场读取与滚动动作效果

第三条正式工作台新任务的首次来源输出与两次完整候选查询均为同序 16 项，包含 Appendix，但来源仍因配对字段现场读取缺失而失败。定点追踪发现原有记录投影要求结果 JSON Schema 明写 `maxItems`；用户要的是动态列表，合法根数组合同没有这个字段。另一个独立 gap 来自编译器把末尾 `scroll_position changed` 一律判为不能证明业务完成，尽管运行能力已有对滚动位置变化的定点后置检查。两项都不能通过删除来源动作、固定 16 项或弱化结果证据来绕过。

Product Alignment:
- natural-language task: 用户要求从实际页面范围读取动态数量的有序记录，每条含对应字段；探索时也可能滚动以调查页面。
- reusable chain boundary: 首次 B-U 同一 Browser/Agent 采完整查询和宿主双快照配对读；编译保留滚动的物理效果，但结果完成仍单独依赖 ReadSpec、输出装配和集合范围证据；普通复跑按固定链路运行。
- runtime inputs: 本次页面、完整 DOM 候选、结果 schema 和实际滚动前后态。
- dynamic task outputs: 数量及值均由页面决定的记录列表；缺失字段、超出安全预算或来源不完整时明确失败。
- generic platform capability used: browser-use 0.13.8 的原生 `find_elements`、既有宿主 ReadSpec 的 300 项上限、`OrdinaryCapability.execute_checked` 的 `scroll_position changed` 后置条件。
- replay model calls: 0，显式 `llm` 节点除外。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 对无声明 `maxItems` 的动态数组安全取得成对页面记录，并为已发生的滚动保留可复验的物理效果。
- existing implementation in repository: `record_projection_capture` 的宿主双快照、ReadSpec 限额与 backendNodeId；`collection_completion` 的完整查询同序核验；`natural_compile` 的普通动作效果编译；运行器已有滚动变化核验。
- mature candidates and pinned versions: 复用当前固定的 browser-use 0.13.8、受管 workflow-use fork 与现有 ReadSpec；无新库、框架或浏览器控制路径。
- selected implementation: `maxItems` 缺省时只在读取器内部采用现有 300 项安全上限，显式超限仍拒绝；宿主容器摘要采用与原生查询相同的 backendNodeId 顺序格式；滚动只编译位置 `changed` 后置条件，不充当结果完成证明。
- reused public surface: browser-use 原生浏览器动作、宿主 ReadSpec 与已实现的 `OrdinaryCapability.execute_checked` 后置条件。
- B-A-T-owned adapter and remaining gap: 把同现场候选、成对读取和结果合同接成可核查来源；旧失败产物没有宿主双快照，离线不能证明修后会成功。完整候选到经业务规则过滤的子集仍缺通用确定性变换合同。
- license/runtime/platform fit: 没有新增依赖，继续使用当前 Windows Runner 和固定 Python 环境。
- browser/runtime/state ownership conflicts: 不创建第二个 Browser，不回写失败 task/source；现场读取仍受单 owner 和同页目标约束。
- replay model calls: 0，显式 `llm` 节点除外。
- rejected candidates and evidence: 给结果 schema 强加固定 `maxItems` 会把动态业务数量冻结；只看原生 `done` 和查询数量无法证明配对字段可复跑；丢弃末尾滚动会改变动作 trace；用滚动证明业务完成会跳过独立数据核验。
- focused validation: `test_host_read_mapping` 6/6、`test_collection_completion` 5/5、`test_natural_scroll_effect` 2/2；`test_record_projection_capture` 14/15，唯一 `host_record_projection_ambiguous` 与交接中原 HEAD 同样复现，属基线。旧来源的 16 条输出与两次完整查询逐项同序同值，但没有持久化宿主双快照，不能离线证明修后首 B-U/首编译；须由另一条全新正式工作台任务实证。受管 fork 清单核验另记。
## 2026-09-26 完整原生查询对齐 extract 双快照

Product Alignment:
- natural-language task: 从页面范围返回全部配对记录，字段与条数由实际页面决定。
- reusable chain boundary: 原生查询记录候选身份；extract 双快照证明读取；编译输出普通 ReadSpec。
- runtime inputs: 已确认输出 schema、同页完整查询、两次冻结 DOM。
- dynamic task outputs: 逐项有序记录与明确证据不足。
- generic platform capability used: 已有 browser-use DOM/query、ReadSpec 和宿主 selector 证明适配器。
- replay model calls: 0，显式 llm 节点除外。
- site/task-specific code added: no

Reuse Assessment:
- capability: 将完整原生查询中的成对字段映射到业务字段，保留同一批节点身份与双快照证明。
- existing implementation in repository: find_elements_read_spec/read_fields_with_proof 已有稳定读取；record_projection_snapshot/record_projection_dom 已有双快照与 selector 证明。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8、受管 workflow-use、jsonschema 4.25.1；无新依赖。
- selected implementation: 在既有双快照投影失败时，用完整原生查询约束唯一逐字段映射和有序 backendNodeId 摘要；两个快照分别复现相同值、节点身份及选择器后输出现有 ReadSpec。
- reused public surface: Browser DOM snapshot、原生 find_elements、现有 ReadSpec/读运行器。
- B-A-T-owned adapter and remaining gap: 只连接原生来源到 B-A-T 输出合同，不重写查询、Agent 或执行器；机器集合一致仍须原有业务范围复核。
- license/runtime/platform fit: 既有固定依赖与 Windows；无新增许可证。
- browser/runtime/state ownership conflicts: 不增浏览器控制会话，不改原始查询事实，不回写旧任务。
- replay model calls: 0，显式 llm 节点除外。
- rejected candidates and evidence: 直接改写 find_elements 的 VerifiedRead 会破坏原生查询规格和消费者绑定；只去掉可见性过滤会误选重复导航项。无模型现场诊断中 16 条记录仅 5 条可由原快照投影定位，其余为 anchor_missing；原生查询完整保存 16 项。
- focused validation: 将用所属 Python 测试覆盖完整映射、重复导航项、隐藏于视口外的记录、子集/歧义/顺序或身份变化拒绝，以及来源到编译装配；真实产品验收另记。

补充复跑边界：完整集合的新 ReadSpec 标记 `requireComplete=true`，若实际集合超过内部读取预算则抛出既有 `read_collection_limit`，不静默返回前缀；缺省 false 的旧规格 canonical bytes 保持不变。TypeScript/Zod 边界显式保留此可选标记。快照投影另核验 query/read actionRef 配对并限制最多 20,000 个 DOM 节点，超限明确拒绝。基础读取、普通执行和预算均复用既有能力。

## 2026-09-26 来源接收与编译协议准入分离

第六条新任务 Python author/序列化/传输均结束，API 的 `hybridAuthorResultSchema` 拒绝结果；旧边界只记固定失败码，未保留具体 Zod 路径或来源产物，因此无法追溯精确字段。接收事实须先于严格编译准入保存。

Product Alignment:
- natural-language task: 任意浏览器任务的首次代表执行结束后，其来源不能因编译协议不兼容而丢失。
- reusable chain boundary: Runner 规范化响应接收 → 私有未验证产物 → 严格来源及编译准入。
- runtime inputs: 原确认需求/计划/步骤/输入摘要、受管源码摘要、Runner 响应。
- dynamic task outputs: 独立的接收证据与通过准入的来源；前者不具备可执行资格。
- generic platform capability used: 既有 TaskArtifact、SQLite、Zod 和 owner 生命周期诊断。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 跨语言边界失败证据保留。
- existing implementation in repository: saveArtifact、source/v2 准入、SourceLifecycleDiagnostics、ZodError。
- mature candidates and pinned versions: 既有 SQLite/better-sqlite3 12.10.0、Zod 4.1.8；不新增依赖。
- selected implementation: 复用任务产物持久化；新增 received-source/v1 明确 unverified，不进入既有 source/v2 复用路径。
- reused public surface: repository.saveArtifact、Zod.parse/ZodError.issues。
- B-A-T-owned adapter and remaining gap: 接收回调连接任务身份；固定协议字段的安全错误路径；未验证记录只供诊断，不修补或篡改原响应。
- license/runtime/platform fit: 沿用仓库既有依赖，Windows 本地 SQLite。
- browser/runtime/state ownership conflicts: 接收保存发生在关闭和校验前；关闭仍在既有 finally 路径完成，无第二浏览器。
- replay model calls: 0。
- rejected candidates and evidence: 只记笼统失败码已使第六次真实失败丢失子因；记录 raw error.message 会扩散页面内容，不采用。
- focused validation: schema 拒绝前回调保存且正常关闭、不进入候选；嵌套 union 安全路径与敏感键/值/错误文字不落日志；API TypeScript。

## 2026-09-26 主线单一来源与采集、离线编译分离（第 0/1 步进行中）

第六条正式新任务的第一次 Python author/序列化/传输完成，但 TS 对复合 author 结果的 schema 准入失败，持久化来源数为 0、编译调用数为 0；精确字段子因缺历史记录。当前 `source/v2` 把采集请求与 `compilerResponse` 放在同一产物，`received-source` 又为诊断形成一条未验证保存热路径。上一节的 `received-source` 双保存只记录当时的局部诊断做法，不是新主线。决定见 [ADR 0012](../adr/0012-mainline-single-source-and-phase-boundaries.md)。下列选型是修复边界，不能写成已经通过产品验收。

Product Alignment:
- natural-language task: 任意浏览器任务从已确认需求开始，在一条真实浏览器路径上采集来源，再生成可验证、可复跑的链路；数据读取和页面交互均适用。
- reusable chain boundary: 唯一已确认草案 → 同版确定性投影 → 单 Browser 代表采集 → 每次采集唯一不可变来源 → 显式离线编译 → 样本/独立复验 → 手动 Release → 独立 Run。
- runtime inputs: 草案版本及来源引用、步骤/动态输入、Browser 原生 trace、当前 owner 关闭事实和固定输出合同。
- dynamic task outputs: 实际 `output`、完整 `canonicalRequest`、`sourceGaps`、从 trace 派生的来源技术摘要，以及独立编译结果或缺口；值与条数来自真实运行。
- generic platform capability used: browser-use Agent/Browser、workflow-use 编译、现有 Pydantic 规范化序列化、Zod 边界、SQLite TaskArtifact 和 LangGraph 运行调度。
- replay model calls: 普通节点为 0；仅发布链中的显式 `llm` 节点可调用模型。首次代表采集与准备期注解分别审计。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 把一次代表采集固定为单一、可重读的来源，让编译在浏览器关闭后独立消费它。
- existing implementation in repository: `author.py` 已调用 browser-use 并生成 natural request；`hybrid-artifact.ts` 的 `source/v2` 仍含 `result.response`/`compilerResponse`，`hybrid_compile`/workflow-use 已有离线编译入口，`hybrid-received-source.ts` 保存未验证诊断产物，TaskArtifact/SQLite 已持久化任务私有版本事实。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8、Pydantic 2.12.5、Zod 4.1.8、better-sqlite3 12.10.0 与 Drizzle 0.45.2；workflow-use 继续使用受管 fork，LangGraph 继续承担既有图运行。无新增、替换或删除依赖。
- selected implementation: Python author 仅返回 `{ output, canonicalRequest, sourceGaps }`，复用既有 Python canonical serializer 完整保留 trace 和 request 数值；history、技术 `sourceSuccess`、browser command count 从同一 trace 派生。TS 在接收 JSON 时先存唯一不可变 `source/v3` 原文，标记 `received`，随后才严格解析三字段并核对同版身份；拒绝时只留下这份不可编译的原文。owner close 的结论另记在 job 来源引用；恢复时严格重读该来源，只有已确认关闭、显式指定且与确认草案同版/身份/摘要匹配的来源可进入离线编译，编译响应只进入独立产物。
- reused public surface: browser-use Agent/Browser、受管 workflow-use natural compile、Pydantic 序列化、Zod.parse、既有 TaskArtifact/SQLite 持久化和 LangGraph StateGraph。
- B-A-T-owned adapter and remaining gap: 跨 Python/TS 的来源 schema、版本/digest/owner 绑定和一次保存由 B-A-T 实现；原文保存不等于来源准入，恢复入口仍须严格校验。旧 `source/v2`、`received-source` 与旧模型计划只供历史查看，不作为计划、编译或恢复执行输入，也不设执行兼容层。旧模型计划生成、纠正和方案续接入口已删除，API/Workbench 类型检查通过；后续仍须让 LLM 输出引用真实读取并正式验收产品链路。
- license/runtime/platform fit: 复用本仓库已固定的 Python/TypeScript 依赖和 Windows 本地运行环境；无新许可证、外部服务或平台要求。
- browser/runtime/state ownership conflicts: 一个准备 job 内只使用一个 Browser owner；接收时保留来源以免关闭失败丢证，关闭确认后才允许编译。编译失败保留来源，不自动启动第二个 Browser，也不从旧失败任务找来源；旧来源/Release/SQLite 事实不改写，历史记录仅供查看。
- replay model calls: 普通复跑 0，显式 `llm` 节点除外；采集/注解模型调用保持独立用途审计。
- rejected candidates and evidence: 继续把含编译响应的复合 author 结果当来源会重现第六条的跨语言准入耦合；活跃地双写 `received-source` 与正式来源会形成两份状态；编译失败自动重采会掩盖首次失败并占用新 Browser；给 v2 或旧模型计划保留执行兼容会让两套业务事实源继续并存。
- focused validation: Python canonical 输出/trace 所属定点 4/4、TS 来源/关闭/离线注解等独立定点合计 26/26；原文拒绝后留存、关闭失败和首编译失败相关的 5 项重跑通过，属于这 26 项的子集，不另计。最近来源回调修改后的 API 类型检查与 Workbench 类型检查通过。尚无新合同的正式产品验收，且旧入口拒绝/历史只读须继续按实际证据核对。之后从正式工作台新建普通需求，逐门记录首次来源、首编译、样本、独立复验、发布、正式 Run 与 UI/API/SQLite/交付现场。

## 2026-09-27 现场方法编译差距与读取裁剪后的证据保留

### 正确性复审后的本轮最小修复

Product Alignment:
- natural-language task: 从任意列表读取数据或判断下一步是否存在，准备保存方法，正式执行产生完整结果。
- reusable chain boundary: 原生查询结果/宿主方法采样 → 来源事实 → 正式输出绑定。
- runtime inputs: 既有 ReadSpec、当前页面、确认后的结果合同；不增加网站或业务字段。
- dynamic task outputs: 实际读取结果及其派生数量；代表样本不冒充最终结果。
- generic platform capability used: 既有 DOM 字段投影、ReadSpec、ResultBinding、数据 count 和原生查询采集。
- replay model calls: 0；显式 llm 节点除外。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 样本范围准确、空查询证据贯通、正式绑定基数可满足性。
- existing implementation in repository: read.py 的逐字段 DOM 投影、_read_shape 的标量数组包装、DomQueryEvidence/capture、natural_output/ResultBinding；这些公开阶段的职责已审查。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8、受管 workflow-use 0.2.11、既有 Pydantic/Zod/JSON Schema；不引入、删除或替换库。
- selected implementation: 在原字段投影中增加宿主采样参数，复用同一投影脚本和原 ReadSpec；coverage 沿既有 readPath 计数。空查询修真实生产者；准备兼容和正式结果兼容分层，正式阶段拒绝互斥基数及已知缺少集合选择的直接绑定。
- reused public surface: 现有 browser element.evaluate/Tools 结果、字段投影、capture、自然编译和 TS 物化入口。
- B-A-T-owned adapter and remaining gap: 只修上述阶段连接，不实现第二个读取引擎或调度器；重复控制仍须单独闭合。
- license/runtime/platform fit: 同一 Windows/Python/TS 依赖和许可证，无额外服务。
- browser/runtime/state ownership conflicts: 不创建 Browser，不改会话所有权或原有运行历史。
- replay model calls: 普通读取与绑定检查均不调用模型。
- rejected candidates and evidence: 把旧 maxItems 的截断恢复为业务选择会混淆预算和语义；继续放宽正式结果合同会放行 max300→min1000 的不可能链；只测手造 complete=true 空查询会绕过真实生产者。
- focused validation: 新增所属测试从实际方法/原生 ActionResult 进入采集及编译消费者；验证真实投影次数、样本与正式读取分离、静态必失败绑定拒绝。结果随后记录于 PROGRESS，不跑产品任务或全量检查。

本轮结果：确定断点已有局部修复；所属 Python 19、TS 9 项最终通过，含修正夹具后仅重跑失败项，详细分类见 PROGRESS。所谓“实际方法/原生 ActionResult”是调用生产函数并提供模拟 DOM/CDP，不是让真实浏览器访问测试页面。用户复核后停止继续添加数量夹具；该证据只保护局部程序边界，不冻结自然重复方法编译为已实现，也不证明产品可用。本轮最终 API 类型检查、真实浏览器和产品验收未做。

后续实施更新：复用 ReadSpec、字段投影、原生 Tools 注册和 capture callback，新增宿主采样/证据适配；公开 `bat_read_fields` 只声明方法，`done` 只交读取引用。正式读取继续使用同一个 `read_fields`，不新增浏览器、Agent loop、图调度器或依赖。capture 已移除最终输出反推 DOM 的主线兜底。跨语言只在真实采样路径校验代表输出，原正式输出合同与每页预算保留。循环执行器已有，自然来源到 loops 的连接仍未实现；补充工具在 runtime 存在但 author 未注册的问题单列于差距清单，不能称已启用。

本阶段所属验证：采样 13、工具 7、证据 8、引用完成 4、done 边界 6、完整自然编译 2、准备边界 5 项，TS 方法来源 11 项以及 API 类型检查通过。首次运行有夹具失败，修正后只重跑受影响项；未运行根级/全量检查或任何新产品任务。普通原生动作现经 `Runner.execute → OrdinaryCapability.execute_checked → TargetResolver/Tools/StepVerifier`；字段读取经 `Runner.execute → read_fields`，这些是已有配套能力的实际调用。

主线核查见 [方法编译差距](MAINLINE_METHOD_COMPILATION_GAPS.md)。预执行的产物是现场方法及代表证据，完整业务集合由编译链路在运行时取得。当前方法交接和自然循环入口尚未补齐，禁止以新产品任务碰运气代替能力实现。

Product Alignment:
- natural-language task: 读取目录、查阅工单、逐页处理记录等通用任务；探索提炼 DOM 读取与重复操作方法。
- reusable chain boundary: 现场方法与代表证据 → 唯一来源 → 离线编译 → 既有读取、值绑定和循环节点。
- runtime inputs: 同版确认合同、运行参数、当前页面与动态继续条件。
- dynamic task outputs: 正式运行实际读取并累积的结果；代表样本不宣称为全集。
- generic platform capability used: 既有 ReadSpec/read_fields、browser-use Tools/callback、workflow-use 编译与证据、ValueBinding、LangGraph loop/predicate/accumulator。
- replay model calls: 普通复跑 0；显式 llm 节点除外。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 现场读取方法与重复执行的编译交接；本轮代码切片仅修复读取裁剪后的动作后态保留。
- existing implementation in repository: read.py/natural_reads.py、未注册的 field_read_tool、natural_compile_result.py、natural_read_liveness.py、hybrid-materializer.ts 和 runtime loop.ts。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8、受管 workflow-use 0.2.11 和已有 LangGraph StateGraph；没有新增、替换或删除库。
- selected implementation: 继续使用已有浏览器读取、字段映射、后态和图运行器。方法入口及自然控制适配的具体变更须经过 A/B 门验证，尚未冻结为已实现选型。
- reused public surface: Browser-Use 原生动作及公开 Tools 注册/callback；已有 ReadSpec、natural_effect_condition、consumer_readiness、ActionCoverage、TaskChain loop/predicate/accumulator。
- B-A-T-owned adapter and remaining gap: 方法与样本分离、真实读取引用、自然来源到循环 IR 的适配仍缺失；不复制 Agent loop、浏览器控制或调度器。
- license/runtime/platform fit: 不新增依赖或许可证边界；局部修复在当前 Windows Python 环境验证，未声称跨平台真实验收。
- browser/runtime/state ownership conflicts: 本轮只有离线编译代码与文档，未启动 Browser；后续仍由一个产品 owner 持有一个控制会话，来源仍只保存一次。
- replay model calls: 0；当前修复是确定性的编译行为。
- rejected candidates and evidence: 不能原样恢复旧逐条 DOM refs 工具，其采样/最终数量耦合未解决；不能把旧 CompilationRequest/authority 执行兼容接回新自然入口；不能把 done 扩成第二张图；loop.ts 已支持所需调度，不应新建循环执行器。
- focused validation: 本轮仅运行 test_natural_scroll_effect 与 test_natural_read_liveness 一次，9/9。保护物理 scroll 证据在裁剪后仍存在，以及失去唯一后态时仅返回 typed gap/不可编译审计而不发送空后态执行段。方法读取、自然循环和正式产品 A/B/C 门尚未通过。

## 2026-09-27 读取方法引用的精确复用

Product Alignment:
- natural-language task: 分页目录或工单列表等任务在后续页面继续读取相同字段。
- reusable chain boundary: 已成功验证的读取方法引用 → 当前页代表读取 → 原生 capture → 自然编译。
- runtime inputs: 当前 owner 的已验证 readRef、页面与既有输出合同。
- dynamic task outputs: 当前页面新样本与运行时实际数据，保留原方法的 ReadSpec/outputPath/maxItems。
- generic platform capability used: MethodReadRecords、ReadSpec、sample_read_fields、verified_natural_read、既有编译器。
- replay model calls: 普通读取 0；没有新增模型或浏览器控制循环。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 方法参数的显式引用复用与来源严格验证。
- existing implementation in repository: method_read_tool.py 的记录集和展开器、method_read_evidence.py、natural_reads.py。
- mature candidates and pinned versions: 沿用受管 workflow-use 0.2.11（上游 5d2d19fe8835cc86f1bf3e04302a5000d590f249）及已有 browser-use 范围 >=0.13.8,<0.14。
- selected implementation: 扩展现有 bat_read_fields 参数；复用已有 sample_read_fields/read_fields，不引入库。
- reused public surface: browser-use Tools action 的 Pydantic 参数模型、现有成功记录、capture 与编译读取事实。
- B-A-T-owned adapter and remaining gap: 把只含 readRef 的模型参数绑定到同 owner 更早成功记录；引用调用仍产生独立当前页证据。
- license/runtime/platform fit: 不变更依赖、许可证或进程；使用当前 Windows 既有 Python 解释器作离线定点验证。
- browser/runtime/state ownership conflicts: 不创建浏览器；引用在注册本工具返回的 MethodReadRecords 内解析，不跨 owner。
- replay model calls: 0。
- rejected candidates and evidence: 不放宽规格相等；已知旧来源 normalizeWhitespace true/false 不相同，必须保留失败证据。
- focused validation: 只做所属参数/引用/capture/自然编译生产入口测试；结果追加 PROGRESS，不启动新真实来源。

## 2026-09-27 根数组读取路径的合同提示

Product Alignment:
- natural-language task: 目录清单、工单清单等任务以记录根数组交付。
- reusable chain boundary: 确认输出合同 → 工具参数说明 → 当前页读取方法与既有 capture。
- runtime inputs: 真实 output_schema、显式 outputPath=[] 或已验证 readRef。
- dynamic task outputs: 仍由当前页面读取；说明不含页面猜测或业务数据。
- generic platform capability used: 现有 Pydantic 工具 schema、MethodReadToolParams、sample_read_fields。
- replay model calls: 0；未新增重试或控制循环。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 将真实根数组路径与 Browser-Use 结构化响应包装的 value 字段区分。
- existing implementation in repository: output_schema.py 的非对象响应 value 包装；method_read_tool.py 已按真实合同验证路径。
- mature candidates and pinned versions: 继续使用现有 Pydantic create_model 和 browser-use Tools，依赖版本不变。
- selected implementation: 为根数组注册参数 schema 的路径 description/examples，并给路径校验错误追加固定安全提示。
- reused public surface: 既有 Tools.action param_model、严格路径验证和 ActionResult.error。
- B-A-T-owned adapter and remaining gap: 仅说明 outputPath=[] 来自真实业务合同；不改业务 schema、不把错误参数自动改成有效参数。
- license/runtime/platform fit: 没有新依赖、进程或平台行为。
- browser/runtime/state ownership conflicts: 不启动浏览器、不改变 owner 或记录所有权。
- replay model calls: 0。
- rejected candidates and evidence: 不把根数组包装成业务对象，不允许 ['value'] 或 ['value',0]，不加自动重试。
- focused validation: 新增所属定点测试验证工具 schema、真实 Tools 调用、无效包装路径拒绝及 readRef 兼容；仅 mock 采样，不开浏览器或模型。

## 2026-09-27 选择动作与需求冲突保持为准备缺证

Product Alignment:
- natural-language task: 通用自然语言浏览器任务的准备与方法编译。
- reusable chain boundary: 已确认需求下，从真实候选读取绑定参数化选择动作。
- runtime inputs: 当前候选集合及已确认需求。
- dynamic task outputs: 来源一致的选择方法，或带动作引用的准备缺证记录。
- generic platform capability used: 既有 annotate_selections、Pydantic 结构化拒绝与 CompilationGap。
- replay model calls: 0；本次验证使用受控拒绝返回，不调用模型或浏览器。
- site/task-specific code added: no

本次仅修正错误归属：observed_choice_conflicts_requirement 表示已执行的选择与既定需求冲突，落到既有 missing_binding / collect_evidence，不能单凭技术选错向用户要求重新确认需求。保留来源与动作引用，不增加协议、修复循环或 tests 文件。

最小行为验证通过：使用保存来源构造仅去除 selection_function 派生注解的内存输入，调用生产 annotate_selections，注入一次受控 observed_choice_conflicts_requirement 拒绝；结果为 actionRefs=[a-0003]、missing_binding、collect_evidence。原来源 SHA256 仍为 9cbd70faefdb1101386fa71939f2761db4e652a82fc08e0dc3145f3aaf08ef33，原 trace、探针输入和返回 trace 均未改变；真实模型调用 0，浏览器命令 0，无新增 tests 文件。证据：work/selection-refusal-classification-proof.json。限定文件 git diff --check 通过（仅现有 LF/CRLF 提示）。

## 2026-09-27 同页追加记录的宿主代表样本

Product Alignment:
- natural-language task: 通用清单读取、检索结果展开等同页追加任务。
- reusable chain boundary: 已验证 ReadSpec 的准备样本，不改变正式读取或循环编排。
- runtime inputs: 原 ReadSpec、宿主确认的完整 DOM 容器顺序、sampleLimit。
- dynamic task outputs: 在正式 maxItems 范围内最多三条代表记录，默认首一条与末两条；ordinal 保留真实 DOM 位置。
- generic platform capability used: 既有 sample_read_fields、project_field_records、JSON Schema 校验和页面身份快照。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 同页追加后，有限准备样本能够包含新增记录的稳定键。
- existing implementation in repository: read_sampling.py 只选择 DOM 前缀；read.py 的 project_field_records 已拥有字段投影、类型转换和字段错误处理。
- mature candidates and pinned versions: 沿用已固定的 Browser-Use 原生 DOM 元素与现有 jsonschema/Pydantic；没有依赖版本变化。
- selected implementation: 只适配宿主所选记录的索引，所有字段读取仍调用 project_field_records。
- reused public surface: 原元素 evaluate 与现有生产字段投影入口；不新增字段提取器。
- B-A-T-owned adapter and remaining gap: 宿主为代表样本保留原始 DOM ordinal；对象包装的 scalar-array 字段内部仍按原有 field_samples 前缀读取，本改动仅覆盖记录容器采样。
- license/runtime/platform fit: 无新库、进程或平台要求。
- browser/runtime/state ownership conflicts: 不创建浏览器，不改 ReadSpec、coverage.total/runtimeTruncated 或正式 read_fields。
- replay model calls: 0。
- rejected candidates and evidence: 不复制 Browser-Use DOM 控制与项目字段投影；该职责仅为已有投影选择有界容器子集，不需要另加库。
- focused validation: inline 调用生产 sample_read_fields，受控 DOM 传输返回覆盖一/二/三条、追加前后新稳定键、真实 ordinal、截断边界及正式 read_fields 全量读取；不开真实浏览器或模型，不新增 tests 文件。

本组最小验证已通过：生产 sample_read_fields/read_fields 加受控 Browser-Use 传输共九例；0/1/2/3 条不变，5→8 条追加时样本从 ordinal=[1,4,5] 变为 [1,7,8] 并读出真实新增稳定键；sampleLimit=1/2、正式 maxItems=5 截断及 coverage.total=8/runtimeTruncated=true 保持原语义。正式 read_fields 仍按原 DOM 顺序返回全部预算内记录，ReadSpec 摘要不变。首轮无失败；真实浏览器与模型调用均为0。证据 work/read-sampling-tail-proof.json；未声称真实按钮/滚动验收已通过。

## 2026-09-27 第4项京东人工登录恢复

Product Alignment:
- natural-language task: 用户完成登录/验证码后，在同一任务窗口继续只读检查。
- reusable chain boundary: 稳定IR中的显式人工等待能力交还现场，恢复继续同一run；不把跳到首页当成登录证明。
- runtime inputs: 已发布IR内人工条件、原owner/session/tab/checkpoint和授权来源。
- dynamic task outputs: 人工等待/恢复结果和后续真实页面读取。
- generic platform capability used: 现有capability.human、withHybridCapabilities、managedWindow handoff/observe和恢复条件。
- replay model calls: 0。
- site/task-specific code added: no（京东URL与标记仅属于隔离验证任务数据）。

Reuse Assessment: 现有LangGraph/TaskChainRuntime的capability.human、waitForCapabilityHuman和resumeState已拥有等待/恢复，不新增状态机。最初检查把legacy human节点当成当前stable节点，发现schema实际不支持后已撤掉该未验证适配，改用稳定IR能力browser.wait-for-human v1：必须显式human合同、read效果、空参数/配置，仅observe原现场并返回human_required。只增加B-A-T边界胶水，复用原managedWindow交接及原检查点。恢复仍按原条件验正，仅让现有equals-url条件和exists-url一样支持同owner授权站点内人工导航。站点URL与登录标记仅在隔离验收任务数据中，平台无京东分支。最小验证先验生产等待/条件未满足仍暂停/条件满足同run恢复，再打开用户选择的京东人工现场；受控回执不能替真实登录。
# 2026-09-27 通用人工介入主流程补接（实施中，未验收）

Product Alignment:
- natural-language task: 在登录、验证码或访问确认挡住任务时交给用户处理，随后完成原任务；本次实际样本为读取京东收藏商品前5项名称及链接。
- reusable chain boundary: 同一准备 Agent 的人工交接，以及编译后的同一 TaskRun 检查点恢复；适用于账户内读取和需要人工确认后继续的表单任务。
- runtime inputs: 版本化任务的人工作业说明、允许站点及恢复条件。
- dynamic task outputs: 用户确认范围内的实际业务结果；登录标记不代替任务结果。
- generic platform capability used: Browser-Use Tools/Agent 回调、原 human 合同、原检查点和受管浏览器身份。
- replay model calls: 0，显式 llm 节点除外。
- site/task-specific code added: no

Reuse Assessment:
- capability: 准备阶段等待人工并继续，以及把该操作编译成既有通用人工能力。
- existing implementation in repository: TaskChainRuntime.resumeState、browser.wait-for-human v1、HumanWaitpoint、TaskAuthoringJob.waitpoint、RunnerProcess 请求关联。
- mature candidates and pinned versions: 已有 browser-use 0.13.8、Python asyncio；不换库、不新增 Agent loop。
- selected implementation: 复用原生 Agent.run(on_step_end)；人工等待置于该公开回调内，宿主只适配受限控制消息。
- reused public surface: Tools.registry.action、Agent.run(on_step_end)、ActionResult、asyncio 任务/事件。
- B-A-T-owned adapter and remaining gap: 当前准备进程只接受顺序请求，尚无人工请求/继续命令和自然来源到 human 节点的映射，需补齐；运行期检查点已有，不重写。
- license/runtime/platform fit: 沿用仓库固定的 MIT Browser-Use、Python 3.12、Windows 运行配置。
- browser/runtime/state ownership conflicts: 等待时原 Agent 停在回调，保留一个浏览器；继续须绑定请求及原 session/tab，不能换窗口或凭用户回复直接判成功。
- replay model calls: 0；准备阶段恢复后仍由原探索 Agent 完成代表任务。
- rejected candidates and evidence: 不在 tool 函数内长期等待。官方 0.13.8 agent/service.py:2254-2271 将 step 放在 wait_for 内，而 on_step_end 在超时范围外；后者满足人工时间不消耗单步超时。
- focused validation: 待执行：真实生产入口的等待/错误身份/条件未满足/继续/取消；真实受限账户任务的业务结果、编译及普通复跑。当前均不记通过。

源码依据：https://raw.githubusercontent.com/browser-use/browser-use/0.13.8/browser_use/agent/service.py 。旧京东运行仅为手工组装链的局部恢复证据，不证明上述准备主线已接通。

## 2026-09-27 新标签页空 URL 快照：人工恢复后的首败修复

原任务215b5b90-f588-447c-afa8-6e66e143a2f2、原job d2259771-bc7a-4879-8b2d-9768bb640ec0真实人工恢复成功；a-0006原生click成功并自动切换新标签页后，after_step采集失败。不可变来源de0b6a24-baa7-403c-8513-af669fc4f616保留。最后快照诊断的baseline/current为同tab、同文档且稳定，SDK summary URL摘要却等于空字符串；反复cached=False仍耗尽30秒。首次业务准备失败，不计编译、收藏结果或复跑通过。安全摘要见work/human-favorites-first-failure-proof.json。

Product Alignment:
- natural-language task: 用户处理登录后继续读取授权内容；点击链接进入新标签页后继续查询或填写任务。
- reusable chain boundary: 准备采集的单一浏览器会话中新标签页状态与真实文档绑定。
- runtime inputs: 原会话、当前tab和既有动作。
- dynamic task outputs: 对应真实新页面的状态与可核验观察证据。
- generic platform capability used: Browser-Use Page实时URL查询、原生DOMWatchdog及既有SourceObservationScope。
- replay model calls: 0；本次适配不引入模型调用。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从当前受控标签页取得实时URL，交由原SDK生成一致的页面快照。
- existing implementation in repository: SourceObservationScope、原生get_browser_state_summary和前后文档一致性核验。
- mature candidates and pinned versions: 已固定browser-use 0.13.8的BrowserSession.get_current_page_url、Page.get_url及DOMWatchdog。
- selected implementation: 在现有观察作用域内，通过SDK公开Page.get_url读取实时URL；复用SDK原生DOM构建。
- reused public surface: BrowserSession当前页接口、Page.get_url（Target.getTargetInfo）及既有状态接口。
- B-A-T-owned adapter and remaining gap: 原get_current_page_url依赖SessionManager缓存URL，新tab缓存空值令DOMWatchdog提前返回空DOM。适配须绑定当前原会话/标签页，只在当前实例生效并在close恢复。
- license/runtime/platform fit: 沿用固定依赖、MIT许可及Windows/Python环境，无新增依赖。
- browser/runtime/state ownership conflicts: 不创建新控制会话、不修改SDK私有缓存、不接管DOM构建；保留原前后tab/document/URL核验。
- replay model calls: 0。
- rejected candidates and evidence: 单纯重复cached=False已在本次88次空URL快照中无效；放宽URL一致性检查会把不同页面证据混在一起，不采用。
- focused validation: 实施前记录；先验证固定SDK空URL分支、实时URL适配、作用域清理和真实换页拒绝，再从工作台复验原需求。当前未记修复通过。

最小验证结果：实际browser-use 0.13.8 DOMWatchdog配合受控传输共15项通过，包含修前空URL跳过DOM复现、修后原生DOM构建、当前tab返回副本、session/tab/URL/document变化拒绝及作用域退出恢复。首个负例发现旧root存在但selector_map为空时原守卫漏检，已补“快照提供document identity即须与实时identity一致”，首败保留。无浏览器/模型调用，未新增tests文件。证据work/human-post-navigation-snapshot-proof.json；fork摘要58474b2895c501c14ad4dfba56a397e3d3b55342da0b4d7f23eb6b4800b137a3已校验。固定SDK源码位置：browser/session.py:2406、browser/watchdogs/dom_watchdog.py:243、actor/page.py:295及301。此处通过仅为缺口修复验证，实站业务重试另记。

实站首次重试8a05ed6c-8e99-4845-8820-3678f922fc30仍失败：5次准备模型调用，a2点击由集合选择守卫阻止（entered=false、eventCount=0），实际只派发navigate及两次find_elements。后续观察出现额外home.jd.com/t.jd.com标签，模型响应期间焦点变为另一about:blank文档，a5尚未派发即因observation_changed_after_capture拒绝。用户不确定期间是否操作；SDK有target detach后恢复焦点/创建空tab的既有机制，但本轮未记录相应生命周期归因，原因保持未知，不归因用户或SDK，不放宽守卫。来源24506d1a-a610-4286-8d91-7c583c6de556/digest4c245bfb40cd4ae4b8e679de18402d25cb3140137476325836811f29e5d0d2b9及work/human-favorites-retry-first-failure-proof.json保留。该终止job不能人工继续或离线编译；由原确认需求发起一次限定重试，仍属带失败上下文的重试验收。

## 2026-09-27 准备探查与执行读取、现场选择与离线注解的边界修复

第三轮job4071fd86-3994-406c-8a61-9df04bbe4aa0完成真实代表试做，当前页面返回2条收藏，两条名称均为页面显示的“此商品已删除”，有商品链接；不推断已删除商品原名。来源67b9f84c-666b-426e-89f6-245020300f4e/digest2fd5c995364734121a5476491fce8a3bbd3dc4652ae49c4339b993c201463f73不可变。16次准备模型调用、14个浏览器动作；未发布、未复跑。

纯离线检查（0模型/0浏览器）定位两处：a6的find_elements(max_results=600)完整返回568项，适配器却将600直接送入上限300的业务ReadSpec，故缺少额外业务读取证据。该查询无执行消费者，真正导航采用a7、结果读取采用a12；原生查询与同文档证据仍在。另createHybridArtifact把现场bat_validate_selection生成的selection_function一概视为离线semantic_annotation，触发hybrid_annotation_audit_missing，掩盖后续编译缺口。证据work/human-favorites-compile-first-failure-proof.json；首次诊断脚本误从已发布plan表取未发布candidatePlan，也已保留并改为只读原job。

Product Alignment:
- natural-language task: 查找任务入口并读取授权结果；也适用于找到表单入口后填写的任务。
- reusable chain boundary: 准備中的只读发现与正式可复跑读取按真实消费者区分；模型审计按实际调用用途和事实来源区分。
- runtime inputs: 原不可变来源、动作回执、文档身份、查询/绑定/选择/重复/输出引用及模型审计。
- dynamic task outputs: 实际业务读取产生的结果；无消费者的发现查询不成为业务输出。
- generic platform capability used: 原native_dom_lookup_observation、consumed_query_ids/覆盖审计、现有事实摘要与模型调用审计。
- replay model calls: 0，显式llm节点除外。
- site/task-specific code added: no

Reuse Assessment:
- capability: 对已有来源做依赖检查并分类为准备发现或执行读取；核对现场选择与离线注解的审计归属。
- existing implementation in repository: 原生DOM查询、native_dom_lookup_observation、消费引用与覆盖审计、selection_function及bat_validate_selection固定工具。
- mature candidates and pinned versions: 继续复用browser-use 0.13.8原生查询、现有编译器与Zod/Pydantic合同；不新增调度、查询或模型框架。
- selected implementation: 扩展现有分类与独立TS守卫；只接受原生只读回执、同文档前后证明完整且无任何执行消费者的发现查询。现场选择必须绑定实际bat_validate_selection及已完成Agent调用；真正离线注解仍须semantic_annotation审计。
- reused public surface: 既有query事实、固定工具回执、自然来源和模型审计schema。
- B-A-T-owned adapter and remaining gap: 修复平台独有的来源到IR分类及审计匹配；不补造a6缺失的verified_natural_read，不扩大300项读取上限，不改历史来源。
- license/runtime/platform fit: 无新增库或平台要求。
- browser/runtime/state ownership conflicts: 全部在原不可变来源上离线执行，不启动Browser、不读Profile、不追加模型调用。
- replay model calls: 0。
- rejected candidates and evidence: 重新访问网站补a6既浪费且不属于原时点；直接删除缺口、只信Python标记或放宽被消费读取的证据均不采用。
- focused validation: 待实施；原真实来源、被消费查询/身份或回执缺证拒绝、现场选择与离线注解审计区分。原首败和原sourceGaps永久保留，修复后编译结论另存。

阶段证据（尚非主线验收）：Python分类22项通过，原来源SHA acf6b7aecd6bc44ba57b5a51415957c10e30e85320168d8364092c208a46f5bd不变，新离线编译gaps为空；work/query-discovery-offline-proof.json。现场选择审计12项通过，缺工具回执、变更函数、缺Agent调用和真正离线注解仍拒绝；work/selection-provenance-audit-proof.json。嵌套原生回执复用原始JSON词法摘要，4项通过；首次探针手工拼接JSON错误发生在生产入口之前，已保留，改用原生JSON.rawJSON构建；work/nested-native-receipt-digest-proof.json。API整合与真实工作台后续门仍未通过。

独立依赖审查：natural_output.py:153-167要求verified_natural_read及保留的读取segment；natural_result_binding.py:32-68和202-228只派生已有输出/segment绑定；summary_compile.py:88-114要求verified read及先前读取segment；natural_repeat_evidence.py:42-47、109-118及natural_read_liveness.py:21-24约束循环继续读取。当前不存在从裸dom_query.total或原生文本直接进入执行结果/条件的路径，审查撤回仅因枚举字段不全而提出的疑点。审计粒度仍为原job/source的用途记账，没有新增逐模型响应到action的签名机制。

复用两份既有真实普通复跑成功来源作交叉检查：按钮55条、滚动62条各一次离线重编译，segments、controlGraph、outputAssembly、resultBinding、resultBranches、repeatMethods、coverage逐项deepEqual且gaps为空。0模型、0浏览器，不改源；work/discovery-existing-source-crosscheck.json。这不替代新的UI编译、验证、发布和普通复跑。

整合验证：独立TS来源/回执/消费/覆盖/同文档拒绝18项通过，work/query-discovery-ts-proof.json；真实createHybridArtifact通过并形成9节点，原sourceGaps保留，work/human-artifact-integration-proof.json。API包检查首败为新增内部查找返回值影响public assertFact类型，恢复void合同后重查通过。测试探针自身两处首败也写入各proof。未新增tests文件，未运行根级/全量测试；此阶段没有模型或浏览器调用。

## 2026-09-27 首次真实草稿试跑：动作结果页面与样本 URL 边界

真实UI“只重新编译已保存试做”产生job0446ec2b-672c-4903-8d3e-51b0669c73e6，离线编译模型0、形成草稿并自动开始sample。execution579615ce-4c4c-4e31-8a51-9f6f2a5bb539/run e220d9c0-2913-41c7-817a-4cb828843094在s-a-0009失败，错误ordinary_postcondition_failed_read_fields_target_scope_mismatch；模型0，清理confirmed。前序读取及选择已完成。原始首败见work/human-sample-first-failure-proof.json。

确定事实：编译后的read_fields transition scope固定了试做时包含动态query的完整后态URL；本次实际选中入口href没有query。失败时终态浏览器观察未持久化，最终URL仍未证实，不能把推断写成已观测事实。通用边界缺口是参数化点击之后的读取仍以样本URL充当本次运行约束。

Product Alignment:
- natural-language task: 打开动态选择的入口并读取内容；点击查询/提交控件后读取结果。
- reusable chain boundary: 已证明导航的动作及其紧邻消费者读取共享本次动作结果页面。
- runtime inputs: 当前运行已解析目标、派发前tab、本次唯一新增tab或原tab、实时document与URL。
- dynamic task outputs: 本次页面的合同内读取结果。
- generic platform capability used: 原native navigation归属、Browser-Use公开Page接口、既有ConsumerReadiness与StepVerifier。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 导航后消费者读取绑定动作实际结果，保留固定目的地与文档一致性约束。
- existing implementation in repository: OrdinaryCapability.execute_checked、navigation.py唯一新tab收敛、TargetResolver、read_fields及有界StepVerifier。
- mature candidates and pinned versions: 已固定browser-use 0.13.8公开Page/BrowserSession、workflow-use StepVerifier、tenacity既有边界。
- selected implementation: 在现有适配层修正来源到本次动作结果的绑定，不新增浏览器/等待/调度实现。
- reused public surface: get_current_page/get_target_info/get_url、既有document身份、on_SwitchTabEvent及现有有界核验。
- B-A-T-owned adapter and remaining gap: 明确动态导航消费者与固定URL条件的区别；同一轮读取统一tab/document/URL，跨轮身份变化清除稳定候选。
- license/runtime/platform fit: 沿用固定依赖与Windows运行环境，无新库。
- browser/runtime/state ownership conflicts: 无新tab时只能接纳原tab，有新tab时只能接纳本动作唯一新增tab；不得跟随人工切入的其他已有tab。
- replay model calls: 0。
- rejected candidates and evidence: 删除URL检查、去掉query或写站点专用规则均不能证明动作归属，不采用；重新探索来源不能修复每次运行的动态参数变化。
- focused validation: 实施前记录；需覆盖动态同tab/新tab、固定URL不放宽、已有无关tab切换拒绝、跨文档稳定候选重置与实际草稿试跑。当前仍未验收。

设计审查决定：不新增公开marker，不修改已保存IR/source。既有_runtime_read_scope已按运行时URL binding实例化样本scope；本次在单次execute_checked内部增加另一种受限实例化：仅click/send_keys、url/url_digest.changed=true、恰一条完整read_fields.transition，且没有任何URL equals/bindingArgument。消费者引用/读取配方/样本scope及导航前后URL另在TS物化入口用既有verified read、URL fact和来源边界证明独立核验。runtime仅临时绑定本动作结果page，跨轮身份变化清稳定候选；后续正式read节点仍执行原配方与本次页面守卫。B-A-T新增部分只负责来源到IR和执行结果归属适配。

实施验证：Python原12项受控生产入口通过，root复核补双transition一残缺边界后仅追加该负例通过；work/action-result-scope-python-proof.json保留首次环境路径错误及reviewFinding。TS原真实factory通过、4类篡改拒绝；按钮/滚动旧产物不适用新分支，未重编译，work/consumer-readiness-source-proof.json。API check两次类型首败修正后通过。实际浏览器重试另记，以上不算主线通过。

## 2026-09-27 用户反馈反自动化后的环境核对

用户报告此前browser-skill复用日常Chrome、慢速读取京东评论可用，而本次遇到反自动化拦截。停止本站自动重试，不据此改选择器或绕过拦截。

已核实差异：hybrid-runtime.ts:72固定使用产品data目录下browser-profile/default，并非用户日常Chrome Profile；managed_window.py:322自行启动已安装Chrome，参数包含remote-debugging-port=0。MDN Navigator.webdriver文档明确Chrome在此参数为0时暴露webdriver=true（https://developer.mozilla.org/en-US/docs/Web/API/Navigator/webdriver）。此处为代码与浏览器文档依据，未在已关闭的失败窗口补测JS，也不能据此证明京东具体风控规则。

SQLite证据：sample d52195cb于15:15:28Z启动、verification5dc18463于15:18:12Z启动、正式643dabd5于15:21:28Z启动，三次pacing.nodeDelayMs均0。正式browser.headless=false；草稿没有显式browser字段，不能未经核实便称草稿headless。草稿走owned_browser/BrowserProfile启动，正式走ManagedWindow/CDP接管；验证与正式环境不一致是确定的验证缺口。Profile、启动信号和访问节奏均为合理调查方向；具体拦截规则与各因素权重未知，不把推断写成结论。本次仅核对和记录，没有修改指纹参数、接管日常Chrome或增加站点绕过逻辑。

## 2026-09-30 checkpoint 后最小性与性能修复

Product Alignment:
- natural-language task: 同任务查看浏览器读取或表单提交的真实进度、输入和成果，再携带原结果返回需求对话。
- reusable chain boundary: 原不可变版本、单 execution/run 事实；通知只是失效序号，不是另一份执行图。
- runtime inputs: 已有 workspace sequence、运行事件、值绑定和冻结输出合同。
- dynamic task outputs: 已保存运行成果和用户原话；不编造历史或循环分母。
- generic platform capability used: 原 SQLite 序列、原生事件/HTTP 流、React 引用复用、既有脱敏记录。
- replay model calls: 0；不新增模型字段或调用。
- site/task-specific code added: no

Reuse Assessment:
- capability: 消除空闲工作区轮询并有界合并失效通知，减少重复渲染/审计数据。
- existing implementation in repository: v18 taskWorkspaceSequences 触发器、唯一持锁 ProductStore、既有 NDJSON 访谈流/增量事件游标、React Flow/Dagre、node execution 脱敏。
- mature candidates and pinned versions: better-sqlite3 12.10.0 public function、SQLite TEMP trigger、Node 原生 events.once/Readable、React 19.1.1、React Flow 12.11.6；均复用已安装能力，无新依赖。
- selected implementation: 同连接 TEMP trigger 唤醒，microtask 后读已提交权威序号；每订阅仅一个 once，慢消费者恢复直接读最新；客户端先消费工作区/完整事件/必要详情，再确认序号。
- reused public surface: https://www.sqlite.org/lang_createtrigger.html （TEMP trigger 连接作用域）；https://github.com/WiseLibs/better-sqlite3/blob/v12.10.0/docs/api.md （function）；https://nodejs.org/api/events.html#eventsonemitter-eventname-options （on 默认无界且背压需 pause/resume）。
- B-A-T-owned adapter and remaining gap: 已有持久版本到失效通知的薄适配；不保存通知队列，不增加调度/检查点/模型协议。静态 chain/batch 缓存必须由消费入口维持不可变引用。
- license/runtime/platform fit: 现有依赖和 Node 运行时，无新增库/操作系统绑定。
- browser/runtime/state ownership conflicts: 不控制浏览器、不启停用户 Chrome、不改永久数据库 schema；store 关闭先 abort 订阅。
- replay model calls: 0。
- rejected candidates and evidence: 增大 800ms 间隔仍空闲轮询；events.on 缓冲慢消费者时无界，独立 review 和红测试确认，改 native once；第二份失效持久队列或 scheduler 没有必要。
- focused validation: 已复现纯 rollback、提交后 rollback、慢消费积压和关闭后观察；once 修复后 4/4。前端接线和 HTTP 生命周期待定点验证；不以旧浏览器成功验收新代码。

设计补充（实施前）：反馈只持久化自身选择和结果摘要，task/execution/需求/版本引用从不可变父 execution 投影，兼容旧记录而不改历史；重连必须读尽原事件分页后再推进捕获的 workspace 版本。需求对话携带受控摘要，不增加 LLM 必填字段。


2026-10-01 设计/验证闭环：独立 review 拒绝事件队列、关闭后迭代、分页遗漏、晚回执清空、历史录制值洗白及最后 started 回退旧 finished；均以具体反例修正。来源检查收窄只读节点/事件依赖并导出 safeRecordedOutput，运行与历史摘要共用当前政策，不加模型或持久标记。反馈持久化严格接受自身两字段或旧完整 context，完整回执从不可变父记录派生；已有反馈恢复不重查旧 run、不改原摘要。产品 LLM 调用及模型必填字段新增均为 0；safeCallSummary 自身没有模型调用，只给既有用户发起的需求回流提供已保存安全数据。相关临时真实 HTTP、异步合并、隐私/幂等反例与所属类型检查通过；边界和首败详见 PROGRESS 最新节。
