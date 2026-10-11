# 检测盾：原生输入上下文、双语采样与最终收尾

日期：2026-10-11。实际 checkout：master@dc45be4f07fd2e9c4a425c0d257e8b1aaef8ed80。所有旧改动保留，未提交、推送或创建 worktree。用户最新要求完成后关机，只在本轮修复、验收和资源结算落盘后执行。

## 已修问题与原判据

“非原生辅助事件（compositionend）/观察线索”是网站自行增加的错误解释。Chrome 原生 IME 结束经过 scoped event queue 也可能保持 isTrusted=false，用户无 CDP 实际记录及本机原生 IME 均已复现。网站恢复按原 scripted-input 的 input/change/click/keydown/keyup 核验；组合、粘贴、焦点上下文保留原计数，不增设异常。没有把 false 改成 true；来源与复用记录见[RESEARCH](RESEARCH.md)。

检测页原采集仅保留最后一个 textarea，中文输入会抹掉有效英文样本。现在英文逐键采样仅绑定现有英文区域，中文组合仍完整采集来源与流程完成事实，两者不相互覆盖；一般业务页不存在该字段时保留原默认范围。英文自身输入法/粘贴仍按原条件不适用；真实无配对、时间倒序、丢失、无类型异常、原强阳性与失败锁存都保留。不适用是中性状态，不能改造成“已测正常”。

“真人 · 本次验证通过”仍要求本 run 的原挑战接受审计、受保护请求成功、非 allowlist、必要测量完整；交互还要求实际中英文输入、滚动与提交。没有用无异常代替验证，没有为 B-A-T 调整原规则、分数或阈值。

## 同一内容的实际结果

固定内容：英文 `Today feels like a good day.`，中文 `今天适合出去走走。`，滚动阅读区后提交。

| 验收 | 实际结果 | 原始证据与边界 |
| --- | --- | --- |
| 用户上次亲自无 CDP 输入的持久记录回归 | Human；36 clear、0 advisory、3 excluded、0 failed | [原数据回归](../../work/antibot-service/reports/shield-input-context-20261011/manual-regression.json)，run 726e210d-169a-48c8-aea0-d8bac5e984e1；6 个 compositionend false 保留。旧记录未存可重算的英文时刻，三项中性不适用保留；本轮没有再要求用户手输。 |
| Chrome 原生 IME 中英文流程 | Human；39 clear、0 advisory、0 excluded/failed | [committed.json](../../work/antibot-service/reports/verified-ime-5qiij_7_/committed.json)。原生 IME commit/cancel、结束后的释放实际验证；取消不能完成，旧 Cookie 不能验证新 run（409）。是受控原生浏览器测试，不冒称实体真人。 |
| B-A-T 原 OrdinaryCapability 相同中英文流程 | Human；39 clear、0 advisory、0 excluded/failed；模型0 | [bat-bilingual.json](../../work/antibot-service/reports/verified-ime-5qiij_7_/bat-bilingual.json)。与原生 IME 共用唯一所属可见窗口，每次新 run；原挑战 score0/threshold75、protected request 接受、allowlisted=false。 |
| 原标准无头 Chrome，相同内容、中文原生 Ctrl+V | Bot；输入来源 clear，原挑战拒绝；模型0 | [反向结果](../../work/antibot-service/reports/verified-reverse-77ud_u52/result.json)、[报告](../../work/antibot-service/reports/verified-reverse-77ud_u52/bilingual-report.json)。trusted paste 被正常处理；Windows 剪贴板序号不变，无 marker spoof/证书例外。正常输入来源不替代整体检测。 |

实际页面输入来源 clear、展示 JSON 与服务器一致，错误文案消失，见[UI结果](../../work/antibot-service/reports/verified-ime-5qiij_7_/ui-result.json)与[截图](../../work/antibot-service/reports/verified-ime-5qiij_7_/result.png)。检测、结论、全部报告与结构化 JSON 同页，未增加对照功能或访客 HTTPS 配置。

## 验证、首败与改动保护

- 原失败先验：新增真实 trust 位组合用例在修复前得到 advisory，预期 clear，先失败后修复。
- 本包最小检查：ime-collection.test.ts、verification.test.ts、check-model.test.ts 合计18项通过；子包 tsc --noEmit 与3个JS/3个Python语法通过。测试保护原五类脚本阳性、后续阴性不得抹除、未知类型带真实验证仍 Unknown、英文/中文隔离、英文自身粘贴与真实无效不被忽略。
- 真实 HTTP 12 项控制通过：[result.json](../../work/antibot-service/reports/verified-http-fS4WIj/result.json)，含原五类脚本阳性、伪造验证、跨会话读写、无效/丢失/组合未结束、伪造身份不能授予通过、重访新 run。
- 本轮首败：类型检查首次是测试字面量的多余 verification 属性，修正 fixture 后通过；HTTP helper 首次缺 BAT_RUN_OWNED_CHECK，在创建资源前拒绝，补当前执行环境后通过。详见[验证记录](../../work/antibot-service/reports/shield-input-context-20261011/validation.json)。上一包窗口归属/事件失败及清理首败继续保留于[上一包结算](SHIELD_VERIFIED_FLOW_CLOSEOUT_20261011.md)，未改写为首遍通过。
- [保护审计](../../work/antibot-service/reports/shield-input-context-20261011/preservation.json)对开始时1357个文件逐一比对：无旧文件缺失，无允许范围外变化，分支/HEAD不变。公共 B-A-T/runtime/vendor 未改；rules.ts 只有 WHY 解释修改，导出的 rules/parser JSON SHA256 仍为 11c8940cfb48a53e5b1c0d02d08ceecba959cf0c0f481d8efc68a935097bc6f9。
- 原 scoring 配置 SHA256 1df45760daed492ee1d05a86f37064519b09e9e45fa4cb911f255ae2342e8d8a；live balanced 配置 b2916d28434565b3ebb45c3c8f45a9a9838148197c18d0bce33031cea2fbe0ef；本包前后不变，原 >=75 拒绝条件保持。

## 服务、HTTPS、资源与关机

已按 active.json 与实际 cwd/PID 核归属，仅重载 origin 使模型生效，其余原服务未重建；[生效回执](../../work/antibot-service/reports/shield-input-context-20261011/reload.json)返回200。入口仍为 https://localhost:4185/measurement/check，新 run 跳到严格匹配的 *.shield.localhost，当前 Windows 用户根信任有效，无 certificate ignore/SPKI 例外；部署信任与新机器前提见[README](../../tools/antibot-lab/README.md)。

本包只创建一份可见 owned 窗口和一份无头控制 Profile，均 finally 关闭且永久删除；[资源审计](../../work/antibot-service/reports/shield-input-context-20261011/resources.json)确认两目录不存在、匹配进程0。上一包12份 Profile 的永久删除证据保留；报告/SQLite/secret 属于实例数据，未删除。关机前 engine/origin/gateway/edge/h2 五服务 active、PID/cwd 与实例匹配。

本轮完成回执在 `work/antibot-service/reports/shield-input-context-20261011/completion.json`。用户本次重新明确授权完成后关机，覆盖历史“不关机”；完成/资源/审计落盘后使用 Windows 原关机命令，不加强制关闭参数。命令结果另存同目录 shutdown.json，accepted 只表示系统接受，不作为已观测断电证明。关机后下次使用先运行 `npm --prefix tools/antibot-lab start`，再打开上述入口；不要重做 prepare 或重建密钥。若外部应用阻止关机，如实保留受阻，不绕过强制关闭。

本包未新复跑实体真人、BrowserScan/Pixelscan 或原冻结业务；之前实际用户双语与原 HTTP 冻结业务动态输出7/模型0证据保留，不能称本包新验收。未测其它输入法/浏览器/新机器信任、独立人群误报率、公网部署、完整TLS业务新复跑和全部网站任务；本包修复与原有产品能力不等于普遍机器人身份认证或通行保证。
