# 开发路线

唯一执行顺序是 A → B → C → D → 组合验收。A、B、C 已通过，下一阶段是 D；D 和组合验收尚未开始。

| 阶段 | 交付 | 进入条件 | 退出条件 |
| --- | --- | --- | --- |
| [A 动作记录](replay-repair/A_ACTION_CONTEXT.md) | 可保存、加载并关联真实动作、命中上下文和结果 | 固定来源校验通过 | 已通过 |
| [B 定位与读取](replay-repair/B_DOM_TARGET_READ.md) | 可重新解析的唯一目标及有来源的字段值 | A 通过 | 已通过；ResultSpec/ResultBinding 内部包及真实 GitHub E1–E4 均通过 |
| [C 交互执行](replay-repair/C_INTERACTION_ORDER.md) | 定位、滚动、操作、条件等待和读取按真实后态推进 | B 通过 | 已通过；慢响应、分页、遮挡、取消与恢复无重复副作用 |
| [D 显式 b-u 节点](replay-repair/D_EXPLICIT_BU_NODE.md) | 在当前 Browser 会话执行有界局部模型任务 | 会话借用和审计边界核验 | 未进入时零模型；进入时动作、调用、结果及退出状态完整 |
| [组合验收](replay-repair/E_INTEGRATION_ACCEPTANCE.md) | 保存加载、同链换输入和干扰差异下的完整业务结果 | A–D 各自通过 | 代表任务及第二类任务均完成，普通复跑只在显式节点调用模型 |

当前动作：

1. [ResultSpec / ResultBinding 开发计划](RESULT_SPEC_BINDING_IMPLEMENTATION.md) 的 B 内部 P1–P6 已完成。
2. 2026-09-19 真实 GitHub B 已通过：E2 0 gap/1 分支，E3 `5/5/详情`、E4 `1/0/无详情`，两次普通复跑模型调用均为 0。
3. B 完成状态已由本地提交 `8aaa4a8` 固定；未推送远程。
4. [C 交互执行](replay-repair/C_INTERACTION_ORDER.md) 已通过：复用稳定目标、ConsumerReadiness、缺失目标分支和 ResultBinding，补齐动作准备、单次派发、真实后态与取消/恢复。
5. C 的定点、受控竞态与真实可见 Chrome 验收均通过；普通复跑模型调用为 0，浏览器已回收。
6. 下一阶段是 D，最后才进行组合验收；本轮未进入 D。

任何阶段失败都停在所属模块修复；不重新探索整项任务来掩盖局部合同缺口。
