# 起止节点与子节点文字（2026-10-05）

## 修改前对齐

Product Alignment:
- natural-language task: 起止节点沿用业务节点标题区样式，去掉空白；单个子节点文字最多两行，超出省略。
- reusable chain boundary: 保留发布链路、业务主节点与常驻子节点列表。
- runtime inputs: 现有不可变 TaskChain、presentation 和指定运行事件。
- dynamic task outputs: 不改变输出和运行结论；展示完整节点身份、名称和状态。
- generic platform capability used: React Flow 节点展示、Dagre 布局后备、CSS 两行省略。
- replay model calls: 新增 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 紧凑起止节点与多行文字截断。
- existing implementation in repository: React Flow 12.11.6、Dagre 3.1.1、Radix Themes 3.3.0、统一主题 token、现有节点检查器。
- mature candidates and pinned versions: 保留以上锁定依赖；参考 Dify 官方现行源码的公共节点标题区与无内容起止节点。
- selected implementation: 调整现有节点组合与 CSS；不新增依赖。
- reused public surface: React Flow Node/Handle、Dagre 布局、原生 CSS line-clamp、现有检查器。
- B-A-T-owned adapter and remaining gap: 清除 execution-result.css 对节点尺寸的重复覆盖；统一展示尺寸与布局估算、标题区连线位置；两行省略保留完整名称和真实 nodeId。
- license/runtime/platform fit: 已验证依赖保持不变；Dify 仅参考设计，不复制源码。
- browser/runtime/state ownership conflicts: 只改只读展示；所有验证 headless、隔离浏览器，不连接个人 Chrome，不触发任务。
- replay model calls: 新增 0。
- rejected candidates and evidence: 不需要替换已有图组件或执行框架。
- focused validation: 节点几何与旧布局后备、两行截断与全文检查器、深浅主题、指定运行切换不抖动。

## 调研与修改前证据

- Dify 公共节点标题区：[node.tsx](https://github.com/langgenius/dify/blob/main/web/app/components/workflow/nodes/_base/node.tsx)。
- Dify 起止节点无变量/输出时不渲染空主体：[start/node.tsx](https://github.com/langgenius/dify/blob/main/web/app/components/workflow/nodes/start/node.tsx)、[end/node.tsx](https://github.com/langgenius/dify/blob/main/web/app/components/workflow/nodes/end/node.tsx)。
- 用户确认：限制的是每个子节点文字最多两行，不限制列表条数；保留已定稿循环/分支列表。
- 现有 4173 工作台只读 headless 实测：两个起止节点均 96px 高、标题 13px；布局模型仍为 48px。原因是 execution-result.css 后加载覆盖 chain-workbench.css。产品写入 0，截图 work/node-ui-20261005/before.png。

## 验证记录

- 起止节点为 140×54px，仅保留标题区；字体 17px/650、背景、6px 圆角、状态顶边与业务节点共用规则。删除结果面板中的 96px、220px、78px 最小按钮高度等重复覆盖。
- 冻结布局和 Dagre 后备均将起止端口放在关联业务标题区，间距 32px；多个终点保持独立真实节点。CSS absolute 原点包含顶边内侧偏移，实测端口为卡片顶部 +27px，和模型一致。
- 普通动作、循环标题、分支目标与条件文字最多两行；布局估算同步上限。完整列表、完整名称、可访问名称、原节点 ID 和检查器保留，执行语义不变。
- Workbench 类型检查通过；构建通过，仅有既有大 chunk 提示；定点 diff whitespace 检查通过。没有运行全量或根级测试。
- 原有 3 项真实 runtime/投影测试首次全部通过。新增几何测试首次失败：测试误将全部终点关联到第一主节点，实际来源含独立输出主节点；改为按真实 incoming edge 寻找各自所属主节点后，仅复验新增项，1/1 通过。覆盖冻结/缺布局后备、同侧终点间距、超长文字不增加不可见布局空白、完整列表与名称。
- Headless 几何临时探针首次为 Python 括号错误，修正后测得原设置端口分别 +30px/+28px；随后校正 CSS 含边框的偏移。新增 visual 验证首次在真实页面检查前失败于 Playwright `BrowserContext.new_page(viewport=...)` 用法；改为创建页面后 set_viewport_size。首败 JSON 和截图单独保留，修正后视觉验收全部通过。
- 视觉验收：实际生产组件加载全部最终 CSS；超长普通/循环/分支文字均两行且真实溢出省略，详情全文可读，当前 loading 保留；下一轮/完成卡片尺寸不变；完整图深浅主题一致。现有用户任务只读实测起止 54px、三种节点标题 17px/650、背景/圆角一致、端口 +27px、全部 8 个子节点保留。写请求 0，页面错误 0。
- 截图和可读 JSON：work/node-ui-20261005。视觉脚本：apps/workbench/tests/node-ui-visual.acceptance.py；极端文字只在独立展示夹具中构造，不修改原始链路或运行事件。
- 全部浏览器验证 headless、隔离 profile；没有连接个人浏览器、触发任务、新增模型调用、改写发布链路、提交或推送。UI 热更新生效；没有重启现有 4173/4175 用户服务。只读 UI 验证不代表联网业务复跑验收。
