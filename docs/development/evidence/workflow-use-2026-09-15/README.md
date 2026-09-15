# 上游公开生成入口阻塞：2026-09-15

> 历史故障证据：用户随后明确授权维护本地上游补丁。两份补丁已经消除本页故障及
> 后续 `extract_page_content` 分派故障，阶段 4/5 已通过。当前结论见
> [本地补丁与兼容门证据](../workflow-use-local-patches-2026-09-15/README.md)。

## 结论

**阶段 4 不通过；停止该路径。** `HealingService.create_workflow_definition` 在 `healing/service.py:296` 执行模板 `.format(goal=task, actions=...)`，模板第 26、29 行保留未转义的 `{variable}`，因此抛出 `KeyError: 'variable'`。失败发生在读取 history 和调用模型之前。

实测输入为阶段 3 保存的同一个 history，`is_successful() is True` 且 `is_validated() is True`；重新加载时逐项核对 action 数据未丢失。没有生成 workflow definition/candidate，没有运行 executor，没有样本或不同输入通过，也没有 `verified`。本阶段模型调用数为 0。

## 固定版本

- workflow-use：0.2.11，源码 commit `5d2d19fe8835cc86f1bf3e04302a5000d590f249`。
- 使用该提交 `workflows/pyproject.toml` 和 `workflows/uv.lock` 原样配置；锁定 browser-use 0.13.8、MCP 1.29.1。
- Python 3.12.13，macOS 26.5.1 arm64，uv 0.10.9。
- 元数据摘要、import、Agent/judge 和关闭证据见 [result.json](result.json)。官方锁对应的 browser-use 制品按 lock 的 wheel hash 固定；不声称它与交接中 browser-use 0.13.10 的源码相同。
- PyPI workflow-use 0.2.11 的依赖声明与该源码提交不同，没有把它替换进本次验证。

## 最小复现

从当前 checkout 根目录执行；先将官方原样 lock 环境的 Python 设置为 BAT_UPSTREAM_PYTHON：

```sh
BAT_UPSTREAM_PYTHON="$PWD/work/upstream-replacement-2026-09-15/official-lock-probe/.venv/bin/python"
"$BAT_UPSTREAM_PYTHON" docs/development/evidence/workflow-use-2026-09-15/reproduce.py
```

实际返回 exit 1：

```json
{"status":"blocked","type":"KeyError","message":"'variable'"}
```

最小脚本用空的合法 AgentHistoryList 证明失败发生在 history 消费之前；它是上游故障定位脚本，不是 B-A-T workflow 候选准入路径。正式阶段 4 使用的是已通过 success/judge 的完整真实 history。两者同样命中上游 service.py:296，无浏览器策略补丁。

## 已通过与边界

- 官方 lock 隔离安装、Agent/Browser/history schema/Workflow import 通过。
- 真实 AI Connect 一次多消息和图像请求返回正确的先前 token 与图像颜色；结构输出、usage 返回通过。
- 两个真实 browser-use Agent 共用同一 Browser session，均读出本地隐藏详情的 Aster/7.4，并各自通过 judge。调用数为 Agent 4、judge 2、extract 0；外层关闭后 CDP 端口不可连接。
- 薄桥六用途调用形状及模型取消、重复 request id、正文日志隔离有定点测试；Windows 和完整产品进程恢复尚未验证。
- 没有进入非采集、产品接线、正式批量或真实京东门。旧数据与旧 source dirty 保留，旧路径不是替代方案。

## 上游修复评估

本会话实时获取的 workflow-use main 仍为上述 commit；PyPI 最新版本仍为 0.2.11。对模板提交历史的进一步查询被 GitHub API rate limit（403）拒绝，因此没有声称已排查所有未合入修复。需要上游修复版本通过相同公开入口、样本/换输入及非采集门后，才能继续阶段 6。

未修改上游 prompt、converter 或 executor；没有在 B-A-T 中添加替代实现。ADR 保持 proposed。

来源：[出错模板](https://github.com/browser-use/workflow-use/blob/5d2d19fe8835cc86f1bf3e04302a5000d590f249/workflows/workflow_use/healing/prompts/workflow_creation_prompt.md#L26)、[公开入口](https://github.com/browser-use/workflow-use/blob/5d2d19fe8835cc86f1bf3e04302a5000d590f249/workflows/workflow_use/healing/service.py#L289)、[官方 lock](https://github.com/browser-use/workflow-use/blob/5d2d19fe8835cc86f1bf3e04302a5000d590f249/workflows/uv.lock)。

## 最终本地验证

```sh
BAT_UPSTREAM_PYTHON="$PWD/work/upstream-replacement-2026-09-15/official-lock-probe/.venv/bin/python" node --import tsx --test apps/api/tests/upstream-model-bridge.test.ts
npm run check --workspace @browser-capture/api
git diff --check
```

结果：2 tests passed、0 failed、0 skipped；API 类型检查和 diff 检查通过。未运行全量测试。最终按独立 Profile 路径查询，Chrome 进程残留为 0。原始 20 个代码/测试 dirty 文件（不含新增顶部证据的 PROGRESS）逐字节保持不变，上游源码和 uv.lock 也逐字节保持不变；未提交或推送。
