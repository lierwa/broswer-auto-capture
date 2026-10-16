# Mac VM 管理修复与两个外站原生任务测试

用户授权：修复当前 VM 管理问题，然后使用 B-A-T 原生功能完成 BrowserScan 和 Pixelscan 相应测试并报告结果。沿当前 master，不创建分支/worktree，不重启 Mac，不重建 VM，不修改归属记录或检测器，不访问京东。

## VM 修复

只读复现：mac-host status 返回 lima_instance_owner_changed。VM Running，实例标记、目录、架构、VZ类型、已安装配置及目录身份全部匹配；唯一失败是当前源码模板 b03569b0 与创建记录65a1566b不一致。安装时补过参数声明及实际消费，后来撤回源码导致模板恢复而安装状态未变。

Reuse Assessment：继续使用已安装官方 Lima 2.2.1、原 mac-host requireOwner 和原 systemd。仅恢复模板中 internal_batShieldOwner 的声明、消费检查和中文注释，共3行；内存还原已经证明恢复后SHA与创建记录完全相同。不新增管理器，不改owner摘要，不停止任何服务。验证使用原 status、固定CLI validate及已有mac-host定点测试。

## 两个外站测试

入口为 BrowserScan 的 https://www.browserscan.net/bot-detection 和 Pixelscan 的 https://pixelscan.net/main/。通过正常工作台分别建立需求、准备、验证、发布和正式运行；浏览器沿用用户已授权的日常 Chrome，各任务只控制自己的窗口。每次仅一个产品浏览器会话。

测试目标是报告网站当前给出的检测结论、各项状态及页面URL，不预设必须通过。页面正常测试按钮可由任务操作；不登录、不提供真实账号、不开通付费、不绕过验证码或访问限制。当前授权不包含改动检测实现、控制引擎或站点规则以改变结果。

过程记录（已由下方最终结果结算）：模板恢复后与创建记录SHA完全相同；原status exit0，五服务active、health.ready=true，固定Lima validate通过、原mac-host六项测试通过。未重启或改owner记录。BrowserScan原生任务 e7bb10d2-e175-48e7-98d2-7ba2f1c8f619 已确认草案v1，准备job 9c8eacce-8335-40ba-8452-53d161990fd6 正在日常Chrome探索，已成功导航检测页。Pixelscan原生任务 1638f5ab-51ba-4b89-a064-b5f965945fad 首轮需求生成失败，工作台原生“重试本轮”成功，草案v1已确认，等待前一浏览器会话释放后开始准备。BrowserScan探索初期模型请求失败后原生重试恢复，保留全部失败历史，不据此判断网站结果。证据保存于ignored work/public-native-test-20261012，冻结当前1233份产品代码/配置。

### BrowserScan 首次探索中的读取错误

原生trace中 a-0018/a-0020/a-0022 都给对象型输出传入 take=1；method_read_tool.py:320-322 对非数组schema拒绝take，产生 natural_read_schema_mismatch。纠正反馈只列合同字段和类型，未指出take，因此模型先改了selector仍失败。之后原生模型自行移除take，进入DOM读取；a-0024 返回 read_field_not_text，字段网站名称的选择器为 header a[aria-label="logo"] strong。尚未据此改产品代码，原任务继续探索；历史尝试保留在数据库和本轮sanitized读取诊断。

BrowserScan首次尝试在22:47主动经工作台“取消生成”结束重复读取错误，最终状态interrupted，不是原生成功。总29动作、6次字段读取失败、6次模型调用失败；无结果节点、无发布、无正式运行。取消时原生runtime_outcome报告cleanup_browser_close_failed，租约虽ended仍未据此宣称清理完成。随后通过原RunnerProcess.managedWindowAction(verify_closed)核验同owner：active=false、ended_verified，核验子进程child_exit/temporary_directory均confirmed；后续确认与原清理失败分开保存。Pixelscan准备job cff46692-a1b9-47a3-8186-33793c753987、owner98560a1a-62a0-4f45-8b85-bf7cf995de42 在前者核验结束后启动。

## 最终结果（2026-10-12 23:00，Mac 日常 Chrome）

VM管理修复通过；两个外站均由正常工作台启动原生准备、由B-A-T自己的浏览器会话访问。外站页面检测已经执行，但两个任务均未达到可发布/可复跑的准备完成条件，本轮端到端验收不通过。未通过修改需求避开失败、注入结果或修改控制引擎过测。

| 网站 | 原生动作保留的页面结论 | B-A-T链路结果 |
| --- | --- | --- |
| BrowserScan | `Test Results: Normal`；原生a-0017读取到strong文本Normal；地址仍为https://www.browserscan.net/bot-detection。Webdriver/User-Agent/CDP/Navigator名称和同类图标被观察到，但本轮没有生成完整逐项结构化结果。 | 29动作，6次读取失败（5次对象take=1合同错误、1次网站名称非文本），6次模型调用失败；持续重复后由工作台主动中断。无发布、无正式复跑。 |
| Pixelscan | 总体`Your Browser Fingerprint is inconsistent`；Browser=`Chrome 154.0.0.0 on Mac OS`；Location=`Timezone spoofed`；Proxy=`Proxy detected`；Fingerprint=`Masking detected`；Bot check=`No automated behavior detected`。最终https://pixelscan.net/fingerprint-check。 | 11动作、12次模型调用、4个已生成节点。原生Agent以done(success=false, methodOutcome=state_only)结束，未能构造满足网站名称等四字段对象合同的读取方法。无发布、无正式复跑。 |

上表页面结论来自原生 `find_elements` 的 `native_action_result.extracted_content`，不是只引用模型最终总结：BrowserScan a-0002/a-0017，Pixelscan a-0003/a-0005。没有通过另一浏览器重测来替代原任务。Pixelscan结论不能解释为所有反爬项通过；本轮没有定位三个异常分类背后的具体系统配置原因。

### 本轮暴露的未修问题

1. 对象输出误用take的错误反馈缺少具体参数原因，导致BrowserScan多次改selector仍重复失败；对象结果应该去掉数组取样参数，但宿主不能为过测悄悄修改模型参数或结果合同。
2. 两站的“网站名称”在logo等位置，和检测结果不在方便读取的同一容器中。Pixelscan原生Agent因此主动放弃结果方法；这证明当前任务准备失败，不能据此断言所有跨区域读取都不受支持。需要单独核对已有授权常量/输入绑定、跨区域结果组装与工具指导能力，不靠删掉业务字段掩盖。
3. 取消BrowserScan时底层清理报告unconfirmed，但authoring.ts:307按aborted仅投影“生成已中断”，未显示清理问题。后续原生同owner verify_closed已确认窗口结束，该后续证据不覆盖首次清理失败。

### 收尾与证据

- BrowserScan原owner `57ee6423-c304-4cad-877b-53884ed8fe26`：初次cleanup_browser_close_failed；后续原生verify_closed返回ended_verified/active=false，核验进程child_exit和临时目录清理confirmed。
- Pixelscan原owner `98560a1a-62a0-4f45-8b85-bf7cf995de42`：首次runtime_outcome cleanup=confirmed、activeResources=false，租约ended。
- 两个任务均无发布版本和正式execution；不得把未运行写成模型零调用复跑通过。
- 测试前冻结的1233份产品代码/配置全部未变；本轮产品修改只有已在测试前完成的Lima模板3行恢复。未重启Mac/VM，工作台服务保留，个人窗口未操作。
- ignored证据目录 `work/public-native-test-20261012/`：vm-repair-proof.json、browserscan-site-evidence.json、browserscan-read-failure.json、browserscan-owner-verification.json、pixelscan-site-evidence.json、pixelscan-final-proof.json、两张native-blocked.jpg及产品冻结/比对文件。
- 本轮未新提交或推送；上轮远端发布2b00a63保持，当前改动留在现有master。
