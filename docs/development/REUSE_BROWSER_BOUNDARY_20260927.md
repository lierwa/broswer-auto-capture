# 浏览器动作边界复用核验（2026-09-27）

## 当前结论

- 受管实际版本：Browser-Use 0.13.8、cdp-use 1.4.5、workflow-use 0.2.11、Tenacity 9.1.2；以当前 Python 环境 metadata 和实际源码核验。
- 首次探索使用 Browser-Use Agent/Tools；普通执行复用 Tools、目标查询、workflow-use 匹配与 Tenacity。B-A-T 的来源绑定、原现场身份、动作证据和禁止普通节点调用模型属于产品职责。
- `physical_input.py` 的正常点击路径自己拼装 move/down/up，重复了公开 `Page.mouse.move/click`；旧研究只排除了按索引的合成点击，未充分检查其他公开入口。
- 原路径优先采用当前 `agent_focus_target_id`，没有拒绝它与已准备目标不同；焦点改变可把旧坐标发送到另一页。

| 本组能力 | 已复用的组件 | 应保留的产品适配 |
| --- | --- | --- |
| 首次探索循环、模型动作执行 | Browser-Use Agent/Tools | 受确认范围、同次探索来源和生命周期审计 |
| 普通动作参数与派发 | Browser-Use Tools/registry | 允许的普通动作集合、禁止隐藏模型调用、链路输入绑定 |
| CSS/元素查询、DOM索引 | Browser-Use Page/Element 与 workflow-use 匹配 | 来源目标转成当前索引、完整集合证据、歧义拒绝 |
| 有界等待 | Tenacity | 可重试的产品错误类别和链路预算 |
| 实际鼠标动作 | 本次改为 Browser-Use Page.mouse | 同页身份、命中审计和异常释放补偿 |
| 浏览器持有与交接 | Browser-Use Browser、现有 CDP | execution/Profile 所有权、用户原窗口交付、可验证清理 |

此组未发现重写 Browser-Use Agent loop 的证据；不能把所有 hybrid 文件仅按文件数量判为重复实现。目标准备与 DOM 事件捕获仍有自有浏览器脚本，本次只确认它们在保护“派发给谁/实际命中谁”的证据边界，未进行整组替代验收。

Product Alignment:
- natural-language task: 在任意已确认的浏览器任务中，对当次绑定目标完成一次可审计的普通点击。
- reusable chain boundary: 一个已准备目标的实际点击派发。
- runtime inputs: 同一 Browser、目标页面身份、已核验的视口坐标。
- dynamic task outputs: 真实点击事件与原有动作审计 metadata。
- generic platform capability used: Browser-Use Page.mouse、现有目标准备与 NativeEventCapture。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 鼠标移动和点击的 CDP 派发。
- existing implementation in repository: physical_input.py 手写正常三事件序列和异常释放补偿。
- mature candidates and pinned versions: Browser-Use 0.13.8 的 Page.mouse、ClickCoordinateEvent、Tools.act；cdp-use 1.4.5。
- selected implementation: 公开 Page.mouse.move/click 负责正常派发；产品层只绑定目标、保存审计、补偿失败。
- reused public surface: BrowserSession.get_current_page/get_or_create_cdp_session、Page.get_target_info/mouse、Mouse.move/click。
- B-A-T-owned adapter and remaining gap: 保留焦点与准备目标一致性和已有事件命中核验。Mouse.click 没有异常释放；Mouse.up 把坐标写为 0,0，因此仅异常补偿继续使用既有 CDP 释放一次，避免补偿改变落点。普通路径不再复制鼠标协议。
- license/runtime/platform fit: 沿用 Browser-Use MIT、受管 workflow-use AGPL 源码和现有 Windows/Python 3.12；不新增依赖。
- browser/runtime/state ownership conflicts: 只调用同一受管 Browser 的当前 Page，不创建第二控制会话；页面/焦点改变在移动前拒绝。
- replay model calls: 0。
- rejected candidates and evidence: 按索引 click 存在合成行为；ClickCoordinateEvent 限定整数，不能无损传递已验证 CSS 亚像素落点。Mouse 的签名注解虽为 int，0.13.8 实际实现将数值原样交给 CDP；定点行为测试覆盖小数而不舍入。不得据此声称未来版本也等价。
- focused validation: 新增所属 vendor tests 的离线测试，直接运行实际 Browser-Use Mouse，只替换 CDP 传输；验证整数/小数不改写、单次点击、焦点改变拒绝、失败释放且不重派。此组不运行浏览器或模型。

## 上游证据

主线程后续实机复验通过：同一已保存来源、同一链，`bat-g5-real-selection-fbdqn3/retry-z2EqpM`第一页completed，9个浏览器命令、0模型，独立核对选择ordinal3且真实到达对应详情URL。`retry-xRoEmZ`首次AttributeError保留。见`work/reuse-click-acceptance-20260927.json`与PROGRESS；本次不扩大到其他点击场景或新产品任务。

- [Browser-Use 0.13.8 Mouse 源码](https://github.com/browser-use/browser-use/blob/0.13.8/browser_use/actor/mouse.py)：公开 move/click 拼装正常 CDP 协议；up 固定坐标 0,0。
- [Browser-Use 0.13.8 Tools 源码](https://github.com/browser-use/browser-use/blob/0.13.8/browser_use/tools/service.py)：Tools.act 拥有参数注入与单动作超时；坐标点击走 ClickCoordinateEvent。
- 本地实际源码定点读取与上述行为一致；没有读取 node_modules、安装或修改依赖。

## 验证记录

- 首次：`python -m unittest test_physical_input_reuse -v`，3/3 通过，6 个子场景（整数/小数、焦点/页面错位、按下/释放失败）。实际 Browser-Use Mouse 负责生成发送参数，受控对象仅替代 CDP 传输；没有浏览器、页面样例或模型调用。
- `git diff --check` 针对本组三个文件通过。
- 调研时曾探测不存在的 requirements 路径，并把上游实例挂载的 click 方法误按类方法查询；这些是读取命令错误，已通过实际路径/源码核实，未启动行为验证或改依赖。
- 未测：本次改动后的真实 Chromium 事件命中/原生对话框回归；历史通过不能充当本次改动实机证明。

### 实机首次失败与接入修正

- 主线程实机记录 `bat-g5-real-selection-fbdqn3/retry-xRoEmZ`：运行失败 `hybrid_runner_failed:AttributeError`，不得被原离线通过覆盖。
- 根因是本次适配错误：Browser-Use 0.13.8 的 `Page.mouse` 是 async property，原实现未 await；原测试用同步 Mouse 替代该属性，因此没有覆盖真实 Page API。`Page.get_target_info` 实际存在。
- 最小修正：通过公开 Page 构造器绑定已经取得的受管 session，再 await mouse。无 session 的 Page.mouse 会自行 attach，因此不能让正常派发和失败释放取得两份不同的 session。
- 测试改用真正 Browser-Use Page 和其 async mouse 属性，仅 CDP 传输受控；已有 fixture 的旧通过记录保留。
- 修正后离线验证：同一文件 3/3、6 子场景通过（0.079s），这次真实 Page 与异步 mouse 属性都参与调用。受控 CDP 未提供 attach 方法，误开新 session 会直接失败；正常派发与补偿的 session 相同。定点 diff 检查通过。
- 修正后的实机结果由主线程追加；本子任务没有运行浏览器或模型。
