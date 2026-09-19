# 浏览器干扰与滚动可观测性验收

状态：2026-09-19 已通过受控真实 Chromium 验收。本项只建立确定性事实与错误分类，不实现任意 DOM 弹窗识别或自动关闭，也不调用模型。

## 实际结论

- 原生 `confirm()` 由 CDP `Page.javascriptDialogOpening` 与 browser-use watchdog 处理。修复前，同一个 dialog 在复跑侧被多个 session 扇出为 4 条相同关闭记录；复用现有 `DialogEventBridge` 并把所有权收窄到单次普通动作后，页面继续执行且只保存 1 条记录。
- 普通 DOM 蒙层不会产生原生 dialog 记录。目标完全覆盖时，browser-use selector map 中没有该目标，结果是 `missing_stable_target`；目标仍部分可见但中心点被盖住时，`elementFromPoint` 只能证明 `hitRelation=outside`，不能证明遮挡物语义上是弹窗。
- 固定 browser-use 0.13.8 的 `Tools.act(click)` 在该真实页面上产生 `isTrusted=false`、坐标 `(0,0)` 的合成 DOM click，`event.target` 仍是原目标；同一元素中心坐标的真实 CDP 鼠标点击产生 `isTrusted=true`，实际命中蒙层。两者不能混为同一种点击机制。
- browser-use 的 scroll ActionResult 在页面实际移动、页面无滚动范围、已经到达底部、CSS `overflow:hidden` 和 wheel 被页面取消时都可能返回成功。运行时现在保存前后坐标、滚动范围、wheel/scroll 事件，并分类为 `moved`、`no_scroll_range`、`at_boundary`、`css_overflow_locked`、`event_cancelled` 或 `no_effect`。
- 只有链路声明 `scroll_position changed` 且后置条件最终失败时，才把上述无位移原因提升为稳定 `ordinary_scroll_*` 错误；动作仍只派发一次。

## 真实场景

测试文件：`vendor/workflow-use/workflows/tests/test_interference_browser.py`。

一次本地 HTTP 服务、一个真实 Browser 会话依次运行：原生 confirm、完全覆盖、中心点覆盖、browser-use 合成点击、CDP 鼠标点击、正常滚动、短页面、底部边界、CSS 锁定和 wheel 取消。页面自身计数器与 `NativeEventCapture` 独立核对实际事件、可信标记、命中目标和滚动位置。

## 验证结果

- 真实 Chromium：1/1 通过，约 15 秒。
- C 相关 Python 回归：15/15 通过。
- authoring 回归：20/20 通过，证明复跑动作级 dialog bridge 没有抢占 authoring 的 run-scoped owner。
- 受管 fork 环境刷新通过；source digest：`ef2d83cd84b947ebb5957f8c2f69808cfc7ddccc5777e5ca3c0c3baaa0c19989`。

## 边界

运行时可以确定“原生 JS dialog”“目标未进入 selector map”“中心命中点被其他 DOM 元素覆盖”“实际滚动是否发生及无位移原因”。运行时不能仅凭 `role=dialog`、蒙层样式或遮挡事实断言业务语义，更不能据此自动点击关闭按钮。
