# 检测盾中文 IME 修复结算

用户授权：修复输入法采集及误判，补中文场景并由 B-A-T 走一遍；保留 master 全部现有改动，不能靠改颜色或放宽检测过测。实际 master@dc45be4 未变，不提交/推送/worktree/京东/关机。

## 修复结果与原判据保护

原真人回执 34 自动项 clear、88 事件中仅 compositionend 非原生。网站此前把所有非原生计数直接作为 scripted-input；原 CrowdSec rules.ts 其实只针对 input/change/click/keydown/keyup，已排除 compositionend。本次公开投影与原规则集合对齐，未修改引擎/评分/挑战/预算或 raw observation 通道。

- 采集器对 229/Process/组合输入、快捷键和长按段显式排除，清理配对；结束后的非 composing keyup 不再制造无配对无效。失焦后释放不属于新焦点段，不能重置排除样本。已有真实倒退时间等 invalid 不被后续排除覆盖。
- 原 Kitsune/FCaptcha 函数仅接受其适用的逐键时刻；IME 的三项键盘指标标 excluded，不强制变 clear。滚动继续按原函数检测。交互缺证据时 unknown，不能强制判 Human。
- 回执新增 input.byType 匿名计数；原五类脚本事件仍为 flagged/Bot，并在同页锁存。组合等非原生辅助事件为 advisory/“观察线索”，具体类型及原计数保留，结论 unknown。旧无类型不良回执也保持 unknown，不假装知道事件来源。
- 页面采样反馈兼容 IME 的 229/Process 和结束事件；报告、DOM 和 JSON 同页。已打开的旧页面需“重新检测”创建独立新运行加载新代码；旧历史记录不改写。

## 实际验证

证据位于 ignored 的 `work/antibot-service/reports/`，汇总在 d10-shield-ime/validation.json；无私人文字、候选词、按键内容、Cookie、票据或密钥。

| 场景 | 结果与来源 |
| --- | --- |
| 修改前失败 | 新采集/投影回归 6 项中 5 失败，1 个真实无效控制通过；修改后扩展到 12 项全通过 |
| 有效性/异常边界 | IME 结束/取消/失焦、快捷键/长按、原快速时序/正常时序、倒退时钟、不完整键对、类型证据、legacy、归属/去重/锁存通过；只运行 3 个所属 test 文件 |
| 构建 | 独立盾包 TypeScript、4 个改动 JS 语法、验收 Python AST/文件限制通过；没有根级/全量测试 |
| 真实 B-A-T 普通控制 | check-ime-oaswb1yk：自动检测→原 OrdinaryCapability 输入/滚动/点击提交→同页 JSON，native-cadence.json 为同一 runId 的 39 clear/Human、untrusted=0、普通模型 0；默认 Windows ROOT TLS，没有忽略证书 |
| Chrome 中文组合输入 | check-ime-eegsf5md：原 Chrome Input.imeSetComposition/insertText 的提交、取消、失焦；三项键盘 excluded，无 failed，整体 unknown。提交结束后浏览器 keyup isComposing=false 的边界实际覆盖。实际组合结束出现非原生标志，原计数/类型保留为 advisory |
| Windows 原生中文拼音 | check-ime-9cl7gzbs：用户将唯一 owned 窗口置前台，核验 PID 后由 Windows IME + WSH 原生按键输入并提交中文；compositionstart/end 各 1、229 键事件 18、结束后非 composing keyup 2。49 个事件中仅 compositionend 的非原生计数为 1，原五类强输入均原生；35 clear、1 advisory、3 excluded、0 flagged/failed，unknown；同页 DOM JSON 完全一致，普通模型 0、默认 TLS 校验 |
| 同一 IME 页混入脚本 | check-ime-jj4bg93r：辅助 compositionend 保留 advisory；再 dispatch input 明确 Bot/evidence=input:trusted，后续原生回执不能抹掉。真实 change/click/keydown/keyup 四类单独测试也 Bot；自动 34 项未命中，证明不是被 WebDriver 阳性遮掩，DOM JSON 一致 |
| 原规则/来源未改变 | rules.ts、cadence.ts 与 HEAD 原文件一致；FCaptcha SHA256=28c90a5d442eb3a1db5d7922129c7369fe998ae66b6554a087e0ac68de002d32；Kitsune SHA256=238f681da2ce6b6a37a926a9214a269ce7215c84bdae59902165a37ec4c9ac87 |

这些是受控浏览器、普通执行器与本机系统拼音证据，不能冒充真人群体误报率、所有输入法、完整盾放行或外站反封锁成功。

## 系统中文输入法补验完成与首次阻塞

本机已有 0x8040804 中文布局。原生键盘夹具复用原 ManagedWindow 归属核验、WSH 激活/发送与 Windows 原 IMM；输入前必须实际前台 PID=本轮 owner，IME 模式记录初值并 finally 恢复。

先前补验的实际前台一直是另一 Chrome。原焦点函数被 Windows 拒绝；WSH 按 PID 返回成功也未改变实际前台，按本轮唯一标题返回 false。check-ime-_b49__93 给出唯一临时标题并等待 90 秒，仍未取得所属前台。该次没有按键发送、没有到达 IME 模式设置，不操作个人窗口，不把 AppActivate 回执当实际焦点。此首次阻塞保留，不改写成通过。

用户随后回复“可以，现在切换临时窗口”，仅补 `tools/antibot-lab/tests/ime.acceptance.py --os-only --manual-focus`。check-ime-larf_u_p 已实际提交系统中文，三项 excluded/unknown、无 failed，但夹具误断言所有事件必定原生而失败；实际 compositionend 的非原生标志与浏览器组合场景相同。修正夹具为核验原五类强输入均原生、辅助事件按真实类型保留 advisory，不修改检测器。check-ime-wqkpbwg9 取得所属前台后输入框未聚焦，受控停止；再补取得前台后通过原 OrdinaryCapability 聚焦输入框，并在提交空格前再次核验所属窗口。最终 check-ime-9cl7gzbs 完整通过，同页 JSON 一致，IME open/conversion 恢复为记录初值 1/1。三次临时资源全部关闭及永久删除。已经通过的 B-A-T 正常/浏览器组合/脚本控制没有重跑。

## 首败、资源与交付

- check-ime-oaswb1yk 的 B-A-T 正常已通过，后续布尔返回值被夹具当 JSON 解码而失败；改为对象投影，未重跑正常流程。
- check-ime-htn_rna_ 的组合场景因夹具假定所有组合事件原生而失败；真实 compositionend 非原生，修正为核验来源分类/强输入仍原生，保留真实计数，未改检测器或阈值。
- check-ime-eegsf5md 的浏览器三场景/脚本阳性已经通过，后续系统前台失败；n1w5o5dl、_jf6urx6、blu8th2g、zveigwsu 和 _b49__93 分别保存原焦点、WSH PID、即时焦点、唯一标题及人工协调的实际失败。没有静默吞掉或标为通过。
- 本包共 12 个 owned 浏览器/Profile 全部 finally 关闭、确认无所属进程并永久删除；profile-deleted.json 和汇总逐一保存。后补三次系统 IME 模式均恢复记录初值，验收 Profile 无遗留，个人浏览器保留。
- 只重载确认 WorkingDirectory 的原 origin，以加载回执/schema 适配；最初重载后的即时健康查询尚未 ready，后续实际网站与最终 ready 已验证。原五个生产服务/presence 保留，供用户访问 https://localhost:4185/measurement/check。
- baseline/before、最终既有字节保护、服务及发布摘要保存在 d10-shield-ime；首次归档 releases/shield-ime-fix-20261011 保留，系统补验后的最终归档另存 releases/shield-ime-windows-20261011，不覆盖旧独立化/V3 发布。

未重跑独立安装、搬迁、全套业务变体、长期运行/其它 OS/公网；复用已有独立化和 V3 未受影响证据。新增行为适配仅影响 IME 测量有效性，普通节点/模型/会话生命周期源码未改。
