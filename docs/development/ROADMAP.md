# 开发路线

## 阶段 0：产品基线与组件验证

- 固化需求、术语、授权门和验收范围。
- 调研成熟的编排、持久化、浏览器调用和模型接入组件，记录官方资料、维护与许可证、TypeScript 支持、本地能力、部署依赖、安全、测试和退出成本。
- 通过最小原型验证生成链路、异步节点、循环、进度保存、显式模型调用和 Windows 安装约束；验证后形成架构基线。

### 本阶段执行任务

| ID | 依赖 | 文件范围 | 产物 | 开发模型 | 验证门 |
| --- | --- | --- | --- | --- | --- |
| S0-01 | 无 | 根目录、`.codex/`、`AGENTS.md` | workspace、工程规则、角色配置 | Astra high（主控） | `git status`、配置静态核对 |
| S0-02 | S0-01 | `packages/contracts` | 受控链路、节点、运行审计 Zod 契约 | Sol high（开发子 agent） | 契约单测与 `tsc --noEmit` |
| S0-03 | S0-02 | `packages/runtime` | LangGraph 普通节点循环、取消和恢复原型 | Sol high（开发子 agent） | 零模型审计、恢复和取消测试 |
| S0-04 | S0-01 | `apps/workbench` | Token、Radix/React Flow 工作台流程样例 | Sol high（开发子 agent） | Vite 构建、浏览器可操作性检查 |
| S0-05 | S0-03、S0-04 | `docs/development/*` | 选型结论、架构基线、阶段证据 | Sol high | 组件原型与 Windows 启动核验 |
| S0-06 | S0-01 | `README.md`、`AGENTS.md`、`docs/development/{ROADMAP,RESEARCH,PROGRESS}.md`、`.codex/config.toml`、`.codex/agents/*.toml` | 开发期 Astra/Sol 模型规则与角色配置同步 | Sol high（开发子 agent） | 静态一致性检查；实际 `turn_context` 核验 model/effort |

主 agent 固定使用 Astra high，所有开发子 agent 固定使用 Sol high，且同时最多两个；产品运行时模型路由不变。模型配置文件表达项目默认值与角色意图；每个实际子任务仍须以 `turn_context` 核验 model/effort，配置文件本身不是生效证据。

### 阶段 0 补充验收任务

| ID | 依赖 | 文件范围 | 产物与复用组件 | 开发模型 | 验证门 |
| --- | --- | --- | --- | --- | --- |
| S0-07 | S0-01、R-003现行实现核验 | `packages/model-runtime/**` | 官方Codex App Server + execa/ndjson薄adapter；产品聊天结构结果与流 | Sol high；Astra high集成 | `npm test --workspace @browser-capture/model-runtime`、check、真实聊天probe、中断后进程退出 |
| S0-08 | S0-02、S0-03 | `packages/runtime/**`、`packages/contracts/**` | LangGraph检查点/XState对照、真实调用边界审计；受控图校验 | Sol high；Astra high评审 | 25步以上循环、外部AbortSignal、独立运行/恢复隔离、调用审计拒绝伪零、跨进程恢复 |
| S0-09 | S0-07、S0-04 | `apps/api/**`、`apps/workbench/**` | Fastify流式聊天与assistant-ui投影；用户会话事实源 | Sol high；Astra high集成 | 浏览器发送真实需求、收到流与已校验结果、取消不提交、重载保留会话 |
| S0-10 | S0-08、S0-09 | `packages/browser/**`、原型测试 | BrowserSkill受控命令边界、会话回收与权限 | Sol high；Astra high评审 | 限定session、语义定位刷新、登录/验证码暂停、零模型命令审计 |

当前引擎已验证固定函数图、SQLite跨进程检查点和受控网关事件审计；尚未实现产品DSL编译与真实浏览器恢复。UI已通过本机浏览器交互检查，负责人视觉反馈待返回。S0-07真实需求聊天和中断probe均已通过，工作台真实聊天仍属于S0-09。阶段0关键门均有证据后，由Astra/high作选型评审；当前先建立明确限定的子阶段检查点，不将受控普通循环的0次网关事件称为真实站点零模型复跑。

## 阶段 1：完整本地用户流程

- 接通需求对话、计划确认、探索、链路生成与验证、复跑和结果查看。
- 提供链路查看、自然语言修改、版本记录、受影响链路暂停及用户发起修复。

## 阶段 2：真实来源验收

- 完整处理一个京东旗舰店的冰箱商品与每个页面前 100 条评论。
- 在新的输入上冻结链路复跑，核对数据、终止原因、耗时和模型调用记录。
- 通过第二个不同结构的公开站点任务验证适用范围。

## 阶段 3：交付与接入评估

- 验证 Windows 安装与运行说明、数据导出和必要的运行恢复。
- 根据真实证据决定后续规模与平台支持，以及 `domain-analysis` 的集成边界。
