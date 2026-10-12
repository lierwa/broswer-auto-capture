# 2026-10-12 产品浏览器纠正后的最终检测报告

本报告属于本机盾交互样本的冻结后真实产品验收。Windows 日常 Chrome 使用既有授权和产品受管入口；辅助 UI 浏览器独立，不承担检测任务。1234 个代码/配置文件在全过程保持一致。

任务：`d246fdb8-6cac-4b6e-90c5-e7f609a70b8f`。需求对话确认后，prepare `24444d38-8b04-466a-8521-c6ca5cf13aae` 完成代表试做、在线编译、样本和独立复验，再由工作台发布 V1 `95b2c74b-7bbf-49d4-8bb4-7b85e4394778`。

发布摘要：`38d36719c4627952e19d11fc8f369801a133ff5dbc882b859d49d70a0b6aad97`。两次正式运行使用同一不可变版本；英文、中文的输入绑定与实际目标值后置校验均存在，第二次正式输入已改变。

| 阶段 | execution | 盾结论 | 项目 | 普通模型调用 | 首次清理 |
|---|---|---|---|---|---|
| 草稿试跑 | `1701af26-a511-4a58-8f0d-127d7ae7109c` | Human | 39/39 clear | 0 | confirmed |
| 变化输入独立复验 | `6f69c976-4d60-4a18-8cdd-afff142683a2` | Human | 39/39 clear | 0 | confirmed |
| 正式运行 | `c6e5f305-96c8-433c-8e0e-0b3eb438d14f` | Human | 39/39 clear | 0 | confirmed |
| 变化输入正式复跑 | `932ce7ed-4ac0-4e5b-8061-0c4efa18c693` | Human | 39/39 clear | 0 | confirmed |

四次任务输出中的39项名称和状态、最终结论、页面地址均与同次盾报告匹配；四个原租约全部 ended。准备阶段模型调用12次、浏览器探索1次、编译调用1次，与普通执行审计分开记录。

## 最后一次正式报告

- Case：`24dfa2f6-2532-4326-83b4-f93f1fa783c7`。
- 页面：[本次最终报告](https://24dfa2f6-2532-4326-83b4-f93f1fa783c7.shield.localhost:4185/measurement/check?mode=interactive)。
- 终态：`complete`；结论：`human`。
- WebDriver 项：未命中；本次39项均正常。

| 检测项 | 结果 |
|---|---|
| 浏览器版本中的自动化标记 | clear |
| 文档自动化属性 | clear |
| 自动化错误栈 | clear |
| 脚本引擎一致性 | clear |
| 原生函数绑定 | clear |
| 语言列表一致性 | clear |
| 通知权限一致性 | clear |
| 插件对象结构 | clear |
| 插件数量一致性 | clear |
| 运行环境进程标记 | clear |
| 浏览器标识中的机器人特征 | clear |
| WebDriver 自动化标记 | clear |
| 图形渲染器自动化特征 | clear |
| 外部自动化对象 | clear |
| 窗口尺寸特征 | clear |
| MIME 类型一致性 | clear |
| 浏览器产品标记 | clear |
| 已知自动化框架属性 | clear |
| WebGL 镜像一致性 | clear |
| Worker 操作系统 | clear |
| Worker 浏览器标识 | clear |
| Worker 处理器并发数 | clear |
| Worker 设备内存 | clear |
| User-Agent | clear |
| 浏览器品牌与版本 | clear |
| 移动设备标记 | clear |
| 操作系统 | clear |
| 处理器架构 | clear |
| 系统位数 | clear |
| 设备型号 | clear |
| 系统版本 | clear |
| 兼容运行模式 | clear |
| 完整版本列表 | clear |
| 设备形态 | clear |
| 输入事件来源 | clear |
| 按键间隔 | clear |
| 按键节奏变化 | clear |
| 滚动连续性 | clear |
| 键盘按下与释放节奏 | clear |

## 首次失败与边界

原验收脚本自行启动 Chrome 导致的 Bot/38 clear/1 WebDriver flagged 保留，原A3结论撤回。随后正常入口的 ebae6117、7cda31d1 首导航失败及修前控制页两次失败均保留；未用重跑成功覆盖。协议结构修复和取消清理归属修复见[根因与纠正记录](PRODUCT_BROWSER_ACCEPTANCE_CORRECTION_20261012.md)。新冻结任务的四次普通执行均首次完成，无为Human结果重试。需求草案生成曾由既有机制补齐缺失的试做入口章节，该对话保留。

本次只关闭所属验收资源；正常工作台、原盾实例、个人 Chrome 与历史数据保留。资源关闭及目录永久删除分开记录。Mac SSH仍在认证前被关闭，Apple Silicon/Lima实际验收、VM/宿主重启验收尚未完成。因此原双平台任务未整体交付，未提交或推送。用户最新明确要求完成后也不关机。

## 本地证据

- [逐次输出比对](../../work/bsk-removal-20261012/product-mainflow-NlDLml/output-acceptance.json)。
- [版本、参数与原租约核验](../../work/bsk-removal-20261012/product-mainflow-NlDLml/final-product-proof.json)。
- [冻结核验](../../work/bsk-removal-20261012/product-mainflow-NlDLml/freeze-verification.json)。
- [所属UI宿主收尾](../../work/bsk-removal-20261012/product-mainflow-NlDLml/host-cleanup.json)。
- 原始本次39项报告保留在同目录shield-932ce7ed-4ac0-4e5b-8061-0c4efa18c693.json；只含本地受控样本，不进入Git。
