# 开发路线

当前执行顺序是 A → B → C → D → 产品最小闭环 P1–P6 → 组合验收。A、B、C 已通过；D 已在当前 Windows x64 产品范围内通过，macOS arm64 由用户延期到公司设备验证且不冒充已测。下一阶段是产品最小闭环，组合验收尚未开始。

| 阶段 | 交付 | 进入条件 | 退出条件 |
| --- | --- | --- | --- |
| [A 动作记录](replay-repair/A_ACTION_CONTEXT.md) | 可保存、加载并关联真实动作、命中上下文和结果 | 固定来源校验通过 | 已通过 |
| [B 定位与读取](replay-repair/B_DOM_TARGET_READ.md) | 可重新解析的唯一目标及有来源的字段值 | A 通过 | 已通过；ResultSpec/ResultBinding 内部包及真实 GitHub E1–E4 均通过 |
| [C 交互执行](replay-repair/C_INTERACTION_ORDER.md) | 定位、滚动、操作、条件等待和读取按真实后态推进 | B 通过 | 已通过；慢响应、分页、遮挡、取消与恢复无重复副作用 |
| [D 复跑干扰与显式节点](replay-repair/D_RUNTIME_RESILIENCE_AND_EXPLICIT_NODES.md) | React 干扰实验站、跨 Windows/macOS 的隔离 Function、多路 Branch、显式单值 LLM | A–C 已通过 | 干扰矩阵、Function 双平台准入、v2 节点、真实页面和不同输入均通过独立验收 |
| [产品最小闭环](MINIMUM_PRODUCT_LOOP.md) | 可运行版本、运行预设、准备编排、任务列表直接运行、结果回执、人工等待与修复 | D 的当前产品范围通过 | P1–P6 全部退出；用户不接触 JSON 或内部验证按钮即可完成创建、准备、直接运行、查看结果和修复 |
| [组合验收](replay-repair/E_INTEGRATION_ACCEPTANCE.md) | 正式产品入口、保存加载、同链换输入和干扰差异下的完整业务结果 | A–D 与产品闭环 P1–P5 通过 | 代表任务及第二类任务均完成，普通复跑只在显式节点调用模型 |

当前动作：

1. [ResultSpec / ResultBinding 开发计划](RESULT_SPEC_BINDING_IMPLEMENTATION.md) 的 B 内部 P1–P6 已完成。
2. 2026-09-19 真实 GitHub B 已通过：E2 0 gap/1 分支，E3 `5/5/详情`、E4 `1/0/无详情`，两次普通复跑模型调用均为 0。
3. B 完成状态已由本地提交 `8aaa4a8` 固定；未推送远程。
4. [C 交互执行](replay-repair/C_INTERACTION_ORDER.md) 已通过：复用稳定目标、ConsumerReadiness、缺失目标分支和 ResultBinding，补齐动作准备、单次派发、真实后态与取消/恢复。
5. C 的定点、受控竞态与真实可见 Chrome 验收均通过；普通复跑模型调用为 0，浏览器已回收。
6. D1、D3、D4、D5 以及 D2 Windows x64 已有独立结果；macOS arm64 延期，边界见 [D 验收记录](evidence/browser-replay-repair/D_ACCEPTANCE_CONFORMANCE.md)。
7. 下一阶段按 [产品最小闭环开发基准](MINIMUM_PRODUCT_LOOP.md) 的 P1 → P6 顺序执行，不先做只有外观没有生命周期事实的 UI 外壳。
8. P1–P5 完成后，P6 必须从 Workbench/API 正式入口贯通需求确认、准备、发布、重启、任务列表直接运行、结果、人工恢复和修复。
9. 组合验收继续保留 A–D 技术不变量；产品闭环通过不自动等于延期的 macOS 验证通过。

任何阶段失败都停在所属模块修复；不重新探索整项任务来掩盖局部合同缺口。
