# Terra medium 局部结构读取复验准备

> **已停止／历史记录（2026-09-17 清理决定）。本文件不再授权或指示启动任务。** 当前只按 [清理账本](../../REPLAY_CLEANUP_20260917.md) 清理。

## 当前状态

**未执行。** 已准备独立脚本 `/private/tmp/local-structure-field-read.mts`，等待主 agent 明确启动信号、源码 manifest 锁定，以及另一个局部 Browser 验收完成并释放 owner。准备阶段没有启动浏览器、没有调用模型，也没有改动产品源码、仓库测试或公共契约。

准备执行 agent 的实际 turn context 为 Codex session `rollout-2026-09-17T07-35-41-01a0ac93-7a1d-7b11-92cc-695c369e8a2e.jsonl`，`model=gpt-5.6-sol`、`effort=high`。

计划命令仅允许从当前 checkout 根目录执行一次：

```text
node --import tsx /private/tmp/local-structure-field-read.mts --run
```

## 复验边界

- 沿用原局部输出 schema、现有 AI Connect Codex 账户和 `gpt-5.6-terra / medium`，`maxSteps=20`。
- 使用实际 `withHybridAuthoring`，一个 owner、一个产品浏览器会话，并在 `finally` 中关闭 AI；完整产品脱敏结果、动作参数、模型审计和生命周期诊断写入本次独立 `/private/tmp` 目录。
- task 保留完整实际 URL，只增加“按提供值原样导航、不改写 URL”的自然语言要求；`requirementText` 与 task 完全相同，没有额外规则 JSON、selector、DOM 答案或样本数据。
- 已知输入 URL 只通过其 digest 与成功 `navigate` 后观察中的唯一 `url_digest` 比较；报告只给出相等或不等，不从脱敏 action 参数猜测 URL。

## 通过条件

退出码 0 必须同时满足以下事实，任一不满足均记录具体检查项并退出 1：

1. 至少一个真实 `bat_read_fields` action 为 `succeeded`，且生命周期存在对应 `dispatch completed`。
2. trace 中存在 `verified_natural_read`，并且恰有一份稳定事实写入 `outputPath=["issues"]`，引用成功的 `bat_read_fields` action 与同一个 `resultRef.digest`。
3. `done` 输出和该事实按 `readPath` 取得的正式读取输出均为 5 条，且逐值深比较相等。
4. 五条编号均为非空数字编号且互异；标题非空；详情链接末尾与编号对应；每条 labels 包含精确的 `bug` 文本，`Type: Bug` 不作为替代；每条 `updatedAt` 保留包含 `Updated` 的完整可见文本。
5. 编译结果包含 `browser.read-fields` 区段和正式 `outputAssembly`；成功导航后的唯一 `url_digest` 等于已知输入 URL 的 digest。

`sourceSuccess`、`sourceValidated`、Judge 成功、无异常返回或进程本身正常结束都不单独构成通过。

## 准备期校验

脚本复制自此前局部模型探针，保留原 schema 派生、模型选择、单 owner 生命周期与脱敏产物边界。只执行无浏览器、无模型的语法检查和原 plan schema 定点检查；实际一次复验及其结果将在收到主 agent 启动信号后补记。
