# 2026-09-28 依赖刷新与主流程核对

## 结论与授权范围

依赖刷新完成；主流程有真实任务重试后的闭环记录，但产品全链首次验收与通用异常恢复仍未完成。

本轮授权仅用于当前项目的依赖打包、安装、无用 vendor 清理和主流程核对。未创建分支或 worktree，未提交或推送，未启动产品服务、模型调用或真实网站任务，未改动任务数据、登录态或 Profile。相邻 opencode-dev 仅运行既有安装/构建/打包入口，源码及锁文件保持干净。

## 更新基线与产物

- B-A-T：`master / 1e9d635d7e860c1758a4e05f635b0beb1eaf9676`，本轮 `git ls-remote` 确认与 `origin/master` 相同；本轮维护变更尚未提交。
- Producer：`codex/runtime-surface-spec / 82f28e6dd6b119766498f1c220dcf49d8505f113`，本轮确认与远端同名分支相同，工作区干净。
- Producer `bun install --frozen-lockfile` 核验 1845 installs / 1954 packages，报告 no changes；没有因安装改变已构建的依赖基线。
- 从消费者运行 `npm run ai-connect:sync`，复用 producer 的 stage、隔离消费者校验及真实消费者安装/导出校验。`release.json` 现在指向上述 clean producer；三包 source build stamps 与更新前一致，tarball 使用本机重新构建结果，不把不同压缩包摘要解释为新增业务功能。

| 包 | 当前制品 |
| --- | --- |
| AI Connect 0.3.2 | `agent-platform-ai-connect-0.3.2-f0ef768f.tgz` |
| AI Connect React 0.3.2 | `agent-platform-ai-connect-react-0.3.2-cc7d94fe.tgz` |
| Pi AgentSession 0.1.0 | `agent-platform-pi-agent-session-0.1.0-7b0cd258.tgz` |

消费者三个 package manifest、package-lock 与 release 统一；三个制品 SHA256 与 release 一致。对比更新前后的 lock，第三方包版本未变。本轮是同步最新仓库的锁定版本，不是将第三方库全部升级为 registry 最新版。

Node 24.12.0 / npm 11.6.2 / Bun 1.3.12；新增项目管理的 uv 0.12.15，Python 虚拟环境改为使用项目管理的 Python 3.12。frozen uv lock 保留 browser-use 0.13.8、workflow-use 0.2.11、cdp-use 1.4.5、mcp 1.29.1、tenacity 9.1.2。

## 清理及安装首败

1. 清理后 `vendor/agent-platform` 仅保留当前三个有效 tgz。25 个无引用旧 tgz 已移到被 Git 忽略的本机 `work/vendor-cleanup-20260928-uZFO6N/vendor/agent-platform/`，可以恢复；移动前用 tracked-file 引用查询确认它们不再被 manifest、lock、release 或其他跟踪文件使用。
2. 8 个未跟踪上游残留也移到同一备份目录，原相对路径保留：`extension/src/lib/` 下四个文件、`ui/src/lib/api/` 下两个文件、`workflows/.vscode/` 下两个文件。每个文件 SHA256 均与旧提交 `4e15439` 的 UPSTREAM 清单一致，确认不是本地改写。正在使用的 workflow-use Python fork、锁文件、许可证和来源证据全部保留。
3. `npm run setup` 首次失败于 `workflow_fork_source_mismatch:workflows/workflow_use/hybrid/author_action_helpers.py`。直接调用 `verifyForkSource` 可确定复现；196 个受管文件中只有此项不匹配。本地文件与 HEAD 逐字节一致，LF 规范化前后摘要相同，排除本地改动和换行差异；最新提交新增该文件，但记录的摘要与提交内容不符。
4. 仅将 `LOCAL-CHANGES.json` 该项摘要从 `d663dc8f…` 修正为实际提交的 `4ccb912c…`，不改 Python 源码、不放宽 verifier。随后 `npm run upstream:setup` 与 `npm run setup:check` 通过。既有生产 verifier 已直接覆盖此元数据不变量，因此没有新增重复测试文件。

当前 fork source digest：`7c1063544cc83c8bbc9980fdcd07d67444fd3973979672feedddf324dd4db1dd`。旧来源与历史运行摘要不改写，本次环境通过不能冒充旧任务在新环境重跑通过。

## 本轮验证

| 验证 | 结果与边界 |
| --- | --- |
| `npm run ai-connect:sync` | 通过；包含现有 producer 打包校验与消费者公共入口/CSS 实际加载。 |
| `bun install --frozen-lockfile`（producer） | 通过，no changes；producer Git 工作区仍干净。 |
| `npm run setup:check` | 通过；npm 安装树、受管 uv/Python、fork 摘要和锁定运行版本匹配。 |
| `npm run check --workspace @browser-capture/api` | 通过。 |
| `npm run build --workspace @browser-capture/workbench` | 通过；Vite 仍提示部分 chunk 超过 500 kB，未开展性能改造。 |
| 同步、草案交接、人工等待、清理恢复、任务删除五个文件 | 21/21 通过；使用现有测试，临时 SQLite/受控 runner，不是网站验收。 |
| `apps/api/tests/hybrid-natural-repeat.test.ts` | 10/10 通过；含生产 Python normalizer/compiler → TS 边界 → TaskChain/LangGraph，受控输入不冒充自然网站探索。 |
| 制品/manifest 一致性、fork source 核验、`git diff --check` | 通过。 |

21 项的完整命令：

```sh
node --import tsx --test tests/scripts/ai-connect-sync.test.mjs apps/api/tests/preparation-draft-handoff.test.ts apps/api/tests/human-wait-closure.test.ts apps/api/tests/execution-cleanup-recovery.test.ts apps/api/tests/task-deletion.test.ts
```

没有运行根级或全量测试。

安装审计报告 4 个受影响 package 条目（1 high、3 moderate）：根来源为 AI Connect 固定依赖的 `hono@4.12.12`，其余三项为本地发布包的传递影响，npm 报告 `fixAvailable=false`。这不是 4 个独立根漏洞，也尚未证明 B-A-T 的实际路径可触发；本轮不执行 audit fix、不修改相邻仓库的版本选择。应由 producer 单独核对使用面并升级验证。

## 主流程：已接通到哪里

当前正式链路为：需求对话与必要搜索/来源题板 → 用户确认同版草案 → Browser-Use 代表试做与不可变来源保存 → 离线混合编译为 TaskChain → 样本试跑与独立复验 → 工作台手动发布 → 普通执行、动态结果、模型审计 → 原窗口交付/清理与持久化。

最新仓库 PROGRESS 记录：收藏任务的同一发布版本在用户常用 Chrome 中正式完成，9 节点/9 浏览器命令/模型 0，返回当时实际 2 项；UI/API/SQLite、原窗口交付和 API 重启持久化通过。另有分页 77 项、按钮加载 55 项、滚动加载 62 项和不同输入选择的限定成功记录。不能再用较早“循环/正式复跑尚未接通”的段落覆盖这些后续记录。

上述真实验收是仓库记录，不是本轮重新执行。本机没有 `work/human-existing-chrome-formal-retry-proof.json`、`work/existing-chrome-restart-proof.json`、`work/existing-chrome-cleanup-recovery-proof.json` 等原私有证据；本轮独立确认的是源码、依赖、构建与受控定点测试。

## 剩余缺口及优先级

| 类别 | 尚缺什么 | 当前证据 |
| --- | --- | --- |
| 必须补的异常恢复 | 正式复跑遇到未登录、验证码或风控时，可靠保留原 owner 的现场、请求人工处理并安全继续；不能把未知副作用动作盲目重派。 | `hybridExternalFailure` 仅识别明确 authentication/access/rate-limit 错误，只有 authentication 映射人工等待；一般 `ordinary_target_missing` 不会自动形成可恢复人工等待。准备阶段已有真实人工恢复，但不能覆盖所有正式运行异常。 |
| 必须补的产品验收 | 一个全新自然需求，在支持范围内完成首次准备、首编译、验证、手动发布、正式输出、持久化与收尾，无需开发补丁。 | 已记录的 G6 首败仍是失败；同源修复和重试闭环不能改记为全链首次通过。本轮未启动新的业务验收。 |
| 场景验证缺口 | 真实验证码、更多网站/任务类别，以及最新收藏任务的删除收尾。 | 最新收藏任务未做删除；此前分页任务已有 UI 删除记录，本轮删除定点 5 项通过。因此不是“删除功能没实现”，而是本样本/各场景覆盖不足。 |
| 待决能力范围 D6 | 将自然需求自动拆为多个可组合业务步骤，以及外层 each/多套重复方法的自动创作。 | `projectPreparationPlan` 仍只生成 `main` 一个 `once` 步骤；链内动态循环已存在且有测试/真实记录，不应混同。D6 仍待用户决定范围，不自行扩成当前单链维护任务。 |

智能修复、手工改图、人工拾取和旧格式读取是最新迭代明确退役的功能，不是本轮应悄悄补回的待完成项；当前画布确实为只读（不可拖动/连线/删除），保留查看、试跑、发布和正式运行。

建议后续顺序：先补正式运行的通用人工等待与安全续接，再按用户选定的新真实需求做首次完整验收；D6 多步骤扩展另行确认。此次仅记录建议，不实施新功能或开启网站任务。
