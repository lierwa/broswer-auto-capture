# 2026-10-10 纠偏后主线交付

范围依据：[主计划0.1](ANTIBOT_NEXT_SESSION_PLAN_20261008.md)、[30类逐项结果](ANTIBOT_COVERAGE_BACKLOG_20261008.md)。本地master沿e92b1d26累积改动交付，原改动全部保留。主线的软件修复和必要联合验收已完成；以下限制仍公开保留，不把30类目录计成30类完全识别。

## 实际修复及验收

| 范围 | 修复及必要证据（原报告在ignored work/antibot-service内） |
| --- | --- |
| 专属Profile请求准入 | 原PyrateLimiter/SQLite预算、urllib3退避，冷暖Service Worker、多页面、iframe/普通Worker和响应429归属；admission-7lf85gvw、launch-iii6q3cm及矩阵B05证据。未声明策略不猜限额，准入尝试和源站到达分别记录 |
| 控制、输入、采集 | 原B-U控制保留；预移动后重新由原点击计算目标，窗口级capture避免document委托漏记；原生range/HEX透明色及框架blur提交、取消和失败诊断；capture-_ibc4gyu、device-8aimoag3、device-xhsxxqvs。P3/非HEX仍精确保真fallback |
| 生命周期及恢复 | Chrome短owned TEMP避免深路径挂起，所有权/会话/人工接管和清理状态保留；product-d6-temp-CQbajs四变体及原真人恢复证据，不自动解验证码 |
| 已接入盾的实际缺陷 | 探针独立截止，缺失/错误/超时不报完整阴性；Worker逐次比较回执解决累计旧告警，零值跳过保留unavailable；device-xvqxowcx、device-xj1ppreh、device-stlv5a1q、device-rzg9ltxb、device-xj1ckgem |
| 公开规则与校准 | CrowdSec、固定BotD/fpscanner/CreepJS及协议组件沿原版本；窄键盘规则直接复用FCaptcha，正常/异常/不足样本独立，device-1y96mqod、device-73vyfl72。各N/E/B/S/V行的首次失败、来源与剩余范围继续有效 |
| 最终业务联合 | product-d10-click-1bglvj_w：原冻结链7/11/13成功、99正确拒绝、普通模型0、11条H2正常。后续collector/输入/Worker/键盘改动分别已有针对性联合；最终product-d10-final-0tyto_qk：现行源码/运行环境、完整HTTPS、冻结variant1业务7、普通模型0、H2一致、Profile关闭并永久删除 |

最终联合只备份原SQLite发布链到新owned目录，没有重新准备任务/调用模型。报告中的model字段是旧发布链配置，不代表本次调用模型。单变体报告的ineligible99Rejected=false表示本次未跑99，99拒绝证据取前述四变体，不能合并成当前四变体重跑。

## 交付检查

- API包`tsc --noEmit`通过；固定vendor摘要`b1f560935841db93dc7d0bbb3c1a34343c8cc82c7f9fdd774ee9d4cffe54511a`通过。受影响单测/真实校准沿PROGRESS既有证据，不运行根级/全量测试。
- 安装检查首先报`hybrid_installed_source_changed`：本地source.json沿用旧摘要；源码清单、实际版本与驱动补丁已独立核对，保留旧回执后通过原`--record-verified-source`登记，随后`--check`通过。未重装依赖、改算法或跳过校验。urllib3 2.7.0已在上游frozen uv.lock固定，无缺依赖问题。
- 开工257个源码/文档/测试改动已保存逐文件SHA。相对路径及私钥/常见令牌模式检查无命中；运行数据、Cookie、Profile、secret和原始报告都留在ignored work/data中。Git diff空白检查通过。
- 既有连接测试基线已511行、本次512行，仅增加事件注册fixture；该既存规模问题不扩大成本轮重构。新增及改动产品源码均未超过500行。
- 本次最终Profile已永久删除，六个owned服务（含presence）inactive/MainPID=0；`reports/d10-final-mainline-receipt.json`记录原始结算。保留制品、业务数据库与失败证据；不宣称全部缓存已删除。

## 保留限制及停止事项

自组RF/六特征组合/逐个换模型实验停止，FPR 1%与召回80%不再作全线门槛。一般行为分类、RTT独立判bot、Worker语言硬比较和GPU物理真实性没有交付成已实现功能；没有削弱在线规则来获得通过。

日常Chrome共享SW的逐页面请求归属仍受限，已按用户纠偏从专属Profile主线前置移除；专属Profile通过不证明能完全替代所有个人日常Chrome。历史零点击缺证根因未定，后续真实布局/采集/TEMP缺陷各自定因，不能倒推历史。真实跨天、七天、公网/多硬件/可信issuer、个人账号迁移和京东未验，继续保留原边界。

下一阶段为本地主线提交之后的盾独立化：同仓独立目录优先，拆清依赖/配置/数据/启动/测试，不扩页面、不引入检测模型、不改盾强度。没有推送或关机授权。
