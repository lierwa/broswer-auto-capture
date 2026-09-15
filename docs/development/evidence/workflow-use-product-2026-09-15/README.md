# workflow-use 本地产品接线验收

日期：2026-09-15。

## 结论

阶段 6–7 通过本机产品入口验收。正式 `createApplication`、`author_task`、
`validate_chain` 和 `authorize_plan` 使用真实 AI Connect、browser-use Agent/Browser
以及打过两份本地补丁的 workflow-use 完成了完整闭环；旧 BrowserSkill executor
替身被设置为调用即失败，本次没有落入旧执行路径。

产品生成一条单步骤、参数化 `startUrl` 的链。样本运行返回 `Aster / 7.4`，同一
链的不同输入验证返回 `Beryl / 8.2`，授权正式复跑再次返回 `Aster / 7.4`。三次
运行均为 completed，每次 3 个浏览器命令、2 个显式模型调用；模型用途分别为
`extract` 和 `output_conversion`，审计完整。链最终为 `verified`，计划执行为
completed，应用关闭后产品 Browser 和 Python 子进程均退出。

安全摘要见 [`result.json`](result.json)。原始 workflow definition、history、模型
响应和本机 SQLite 只保留在 Git 忽略的 `work/upstream-product-*`，不进入提交。

## 可复现入口

先安装固定上游源码和本地补丁：

```text
npm run upstream:setup
```

该命令固定 workflow-use commit 和官方 `uv.lock`，核对补丁 SHA-256，执行
apply/reverse-check、两项上游回归测试及 Ruff。重复运行只核对现有安装，不重新
下载或覆盖非托管目录。

真实产品验收必须显式运行，且只访问进程内启动的 `127.0.0.1` 页面：

```text
node --import tsx apps/api/tests/real-upstream-product.ts --real
```

它读取当前 AI Connect 模型选择，不记录 connection id 原文。真实入口不属于默认
测试集，避免普通测试意外调用账号模型或启动 Chrome。

## 本轮暴露并修复的 B-A-T 接线问题

- Python UTC 时间原为 `+00:00`，不满足产品合同要求的 `Z` 格式；现已在 sidecar
  边界统一输出 `Z`。
- 模型桥开始和完成事件必须保留同一个 `callId`、用途、模型和 `intendedAt`；服务
  现在保存开始事件时间，runtime 会拒绝身份变化、重复完成、漏报和超预算。
- 已取消的产品执行可能被较晚返回的 abort 异常覆盖成 paused；执行器现在先重读
  当前状态，保留已经持久化的 cancelled。
- run artifact 现在使用稳定 mode，并分别记录 `sample_replayed`、`input_verified`
  和 `authorized_replay`，不再把随机 run id 当作 artifact mode。

这些属于 B-A-T 的适配、审计和生命周期问题，不归因于 workflow-use。上游自身的
两个缺陷仍只有 prompt 占位符转义和 `PageExtractionStep` 分派，分别由独立补丁
与独立回归测试覆盖。

## 最小代码验证

本轮按改动边界运行并通过：

- contracts、runtime、API 三个 workspace 的 TypeScript check；
- contracts 8 项通用 IR/schema 定点测试；
- runtime 5 项 delegated LLM 用途、调用数和浏览器命令审计测试；
- API 5 项产品 authoring/复跑/不兼容输入/取消竞态测试；
- Python 模型桥 2 项消息、用途、协议和取消测试；
- Python sidecar `py_compile`。

没有运行根级或全量测试。

## 未覆盖范围

- Windows 安装、子进程退出和 Chrome 路径仍需在 Windows 主机实测。
- workflow-use 为 AGPL-3.0；对外分发或提供网络服务前，仍需完成对应源码、版权
  告知和第 13 条适用性决策。
- 京东任务尚未运行。必须先由用户确认新的规格、评论字段和“不足也算成功”的
  口径；本机夹具通过不替代真实站点验收。
