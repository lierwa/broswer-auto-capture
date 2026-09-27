# B-A-T fork changes

基线为 workflow-use commit `5d2d19fe8835cc86f1bf3e04302a5000d590f249`。仓库保留 AGPL-3.0
许可证、上游 archive SHA256、留存基线文件 digest 和本地变更 digest。

当前 checkout 只保留 B-A-T 运行所需的源码子集：

- `workflows/workflow_use/` 生产包及其运行提示词；
- `workflows/pyproject.toml`、`uv.lock` 和包 README；
- `verify-source.mjs`、`UPSTREAM.json`、`LOCAL-CHANGES.json`；
- 主链测试生成 fixture 所需的 `hybrid_fixture.py` 与 `test_hybrid_compiler.py`。

来源摘要以 LF 规范化后的文本字节计算，使同一固定源码在 Windows CRLF checkout 与其他平台得到一致结果。

未保留上游扩展、独立 UI、示例、CI、开发测试、样本 storage 和重复文档。它们不由 B-A-T setup、
运行时、来源编译或主链测试消费。

本地生产变更包括：

- 动作结果读取复用 `execute_checked`、导航协调、StepVerifier 与 Tenacity：仅有明确 URL
  变化、唯一完整 transition 消费者且无固定/输入绑定 URL 条件的 click/send_keys，才把该
  消费者的临时读取作用域绑定本次动作结果页面。原 tab 或唯一新增 tab 必须属于同 session；
  同轮页面事实与字段读取固定同一 Page 并核验 target/document/URL，跨轮身份变化清空稳定摘要。
  动作仍只派发一次，原链路条件、来源与站点权限不变；没有新增公开协议字段。

- 准备探查沿既有读取活性与覆盖审计分类：完整 `find_elements` 若无执行绑定、选择、重复或输出
  消费者，且原生派发/回执、查询与同文档前后事实均可独立验证，则保留为准备审计。
  不要求该无消费者探查变成正式字段读取；只在新编译结果中解除对应派生读取缺口，原来源不变。
  不扩大 `ReadSpec.maxItems <= 300`，不补造缺失的 DOM 补读证据。

- 新标签页观察通过当前 Browser 实例的公开 `Page.get_url()` 取得实时 URL，供原生
  `DOMWatchdog` 判断并构建 DOM；避免新 tab 的空缓存 URL 使 `cached=False` 仍反复返回空快照。
  仅修正已核验 focused tab 的返回副本，不修改 SDK target 缓存；session/tab/document 在采集
  前后必须一致，快照只要提供文档身份就必须匹配实时文档。离开采集作用域恢复原实例方法。

- 通用人工介入复用原生 Agent 工具及 `on_step_end`：工具只登记等待，宿主确认同 session/tab 和授权恢复 URL
  后继续原 Agent；等待前释放原事件监听器，不捕获人工密码、验证码或原始页面内容。宿主恢复事实绑定
  原动作参数、回执和前后观察，离线编译为既有 `browser.wait-for-human`，普通复跑不调用模型。
  新旧工具 registry 均以精确 schema digest 匹配，保留旧来源重编译兼容。

- 修复 semantic executor 的 page extraction 分派和显式 ordinal 边界；
- 扩展 StepVerifier 的声明式检查；
- 增加 `workflow_use.hybrid`，负责动作证据规范化、来源编译、字段读取、条件核验和有界显式语义区段；
- 选择方法注解使用有界成功/缺证结果，合法拒绝进入原有编译 gap，模型服务错误保持独立分类；
- 读取方法工具只向模型返回代表值和当前 DOM 覆盖摘要，完整样本、文档身份及摘要仍留在宿主记录并受编译校验；
- 完成引用冲突保留安全错误码，初次和续查复核理由作为有界私有事实保存；
- 重复方法注解仅引用代表读取、唯一继续地址与终止证据；自然编译验正后折叠为固定读取/导航节点及已有 loop 控制图，保留每个样本动作归属，不预抓全集或在复跑中调用模型；
- 由 B-A-T 宿主继续持有 TaskChain 物化、LangGraph 运行、持久化、恢复和模型审计。

普通复跑节点不调用模型。只有显式 LLM 区段可调用模型；首次探索、修复和运行时调用分别记账。
