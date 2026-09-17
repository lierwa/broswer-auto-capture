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

- 修复 semantic executor 的 page extraction 分派和显式 ordinal 边界；
- 扩展 StepVerifier 的声明式检查；
- 增加 `workflow_use.hybrid`，负责动作证据规范化、来源编译、字段读取、条件核验和有界显式语义区段；
- 由 B-A-T 宿主继续持有 TaskChain 物化、LangGraph 运行、持久化、恢复和模型审计。

普通复跑节点不调用模型。只有显式 LLM 区段可调用模型；首次探索、修复和运行时调用分别记账。
