# BrowserSkill 分页与协助诊断（2026-09-06）

本轮只诊断海尔隔离测试的阻塞，没有恢复产品采集、创建计划或消费探索模型预算。环境为 bsk/daemon/extension 0.2.0、协议1.1、Chrome152；doctor通过。测试调用均拥有独立BrowserSkill会话，结束后已关闭。用户data与正式运行记录不参与诊断。

## 分页当前能工作，上次失败根因未定位

分别验证默认标签页、显式tab-id（对应产品适配器）、先截图再显式tab-id点击，均从目录第1页变为第2页，实际产品详情链接集合变化。仅做一页切换诊断，不计入正式抓取结果。页面timeline在本轮正常推进，因此当前证据不支持“截图必然冻结页面”的说法。

BrowserSkill覆盖层在动作前后存在，具有全屏control-overlay-blocker和pointer-events:auto；但原生点击仍成功。官方click实现会在点击时临时允许自动化输入，随后恢复覆盖层。因而动作前后的elementsFromPoint命中覆盖层，不能单独证明该次点击被它拦截。

上次v6记录为分页动作后多次相同页面摘要、模型判断无变化、graph=null、manual_required；没有保存失败瞬间的DOM命中、输入事件与覆盖层切换记录。当前成功不能反推出当时原因。保留浏览器/扩展瞬时状态问题作为待验证方向，不把它写成已确认根因。

诊断证据均在忽略目录：work/diagnose-pagination.log、diagnose-click-hit.log、diagnose-explicit-tab.log、diagnose-screenshot-tab.log。比较商品链接集合和当前页码，不用整页首个链接判断翻页；页面公共导航也包含产品链接，可能跨页保持不变。

## 协助RPC超时的原因已定位

15秒诊断请求通过预先安装的只读MutationObserver记录确认：BSK_DIAGNOSTIC_15S提示文字、Cancel request与Done, return control按钮实际进入页面，按钮有正常布局与不透明度。CLI仍返回code=timeout、tool RPC timed out after 15s，而非业务结果outcome=timed_out。

官方源码快照47ac947f188bc554b66c09f5873b8045d6be57b2中，扩展按timeout_ms启动人工等待计时器；daemon也将同一timeout_ms作为扩展RPC期限，只有upload/download增加响应余量，request_help没有。RPC计时在请求抵达扩展之前开始，因此外层可能先截断合法的timed_out回包。CLI到daemon层虽另有15秒余量，不能弥补daemon到扩展这一层的相同截止时间。

修复位置应在BrowserSkill的request_help传输期限：在业务等待期限外留出响应余量，并覆盖正常timed_out返回测试。本轮只读分析上游源码，没有修改或替换已安装的扩展/CLI。

来源：[daemon期限](https://github.com/Tencent/BrowserSkill/blob/47ac947f188bc554b66c09f5873b8045d6be57b2/crates/bsk-cli/src/daemon/ipc.rs#L704)、[扩展人工等待](https://github.com/Tencent/BrowserSkill/blob/47ac947f188bc554b66c09f5873b8045d6be57b2/apps/extension/src/tools/human-loop.ts#L690)、[原生点击](https://github.com/Tencent/BrowserSkill/blob/47ac947f188bc554b66c09f5873b8045d6be57b2/apps/extension/src/tools/interaction.ts#L300)。本机复现证据work/diagnose-help-observed.log。

这次提示进入DOM不证明用户实际看见，也不证明上次300秒请求曾送达。上次只保留RPC超时错误，不能描述为“用户未处理”。协助等待期间同session的其他命令会被session_busy拒绝；本轮并行读取尝试失败后改为预置只读观察记录，没有绕过会话互斥。所有所属会话最终已回收。
