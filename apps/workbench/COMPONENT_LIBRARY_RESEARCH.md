# 阶段 0 成品组件库候选

调研日期：2026-09-05。范围仅是 UI 可审阅原型，不是最终选型。

## 候选结论

本阶段采用 **Radix Themes 3.3.0**。它提供已完成视觉与可访问性处理的 Button、Text Field、Text Area、Dialog、Tabs、Badge、Callout、Tooltip 和布局组件；通过 `Theme` 外观和 CSS 变量支持 light/dark。当前原型已经使用 Radix Dialog primitive，迁移到同一体系较短，也无需为了基础展示引入额外 PostCSS 配置。

Mantine 9.6.0 仍保留为更重型工作台候选。它的表单、hooks、Modal、Tabs、通知等覆盖更广，也提供 light/dark CSS variables resolver；但官方 Vite 完整配置推荐额外 PostCSS 包，本阶段会扩大安装与样式整合面。若下一阶段出现复杂表单、日期、通知或集中 modal 管理需求，再按实际界面做对照验证。

Radix Themes 的主要代价是组件相对封闭；官方建议优先通过 props 和 token 调整，重度覆盖时应回到 Primitives 或重新评估库。因此本原型将基础控件保持为库组件，业务布局只使用统一语义 token，不覆写库内部结构。

## 官方证据

- Radix Themes Getting started（预制样式、CSS 导入、Theme 配置）：https://www.radix-ui.com/themes/docs/overview/getting-started
- Radix Themes Components（Button、Dialog、Tabs、Text Field 等覆盖）：https://www.radix-ui.com/themes/docs/components
- Radix Themes Theme overview（外观、variants、tokens）：https://www.radix-ui.com/themes/docs/theme/overview
- Radix Themes Styling（vanilla CSS、CSS variables、覆盖边界）：https://www.radix-ui.com/themes/docs/overview/styling
- Mantine Vite guide（core/hooks 与推荐 PostCSS 配置）：https://mantine.dev/guides/vite/
- Mantine CSS variables（light/dark resolver 与组件 variants）：https://mantine.dev/styles/css-variables/
- Mantine Modal accessibility：https://mantine.dev/core/modal/
- Mantine Tabs accessibility：https://mantine.dev/core/tabs/

版本通过 npm registry 的只读 `npm view @radix-ui/themes version` 与 `npm view @mantine/core version` 核对。Radix Themes 3.3.0 已安装并进入根锁文件；Vite 7.3.6 构建、主题 Token 测试与真实浏览器交互检查已通过。Mantine 未安装，负责人视觉反馈仍待返回，当前采用状态仅限阶段 0 样例。
