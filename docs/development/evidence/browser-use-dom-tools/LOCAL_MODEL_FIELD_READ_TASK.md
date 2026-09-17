# 真实模型局部字段读取验收派发

> **已停止／历史记录（2026-09-17 清理决定）。本文件不再授权或指示启动任务。** 当前只按 [清理账本](../../REPLAY_CLEANUP_20260917.md) 清理。

目的：在已复现的真实GitHub列表上，验证Terra medium能借助修正后的通用字段工具反馈，自行发现selectors并完成5条读取。此项仅验证模型与工具配合，不是原任务source/sample/verification。

执行条件：字段反馈修复主审通过、集中更新fork manifest并setup --check通过、无其他浏览器所有者。只执行一次，maxSteps=20；必须真实现有Codex订阅经Pi/AI Connect模型桥，不替换模型，不给脚本答案。

使用实际 `withHybridAuthoring` 公开产品入口，复用 `createAI(localStore(data/ai-connect))` / shared subject和只读原aiSettings选择。单次新owner UUID与 `/private/tmp` 或work下独立诊断目录，finally关闭模型桥、Runner、AI。禁止改原任务/需求/计划/账号/设置/正式探针。模型字段取数工具保持outputPath/container/fields三个输入，无网站专用能力。

局部任务：从 `https://github.com/langchain-ai/langgraph/issues?q=state%3Aclosed%20label%3Abug%20sort%3Aupdated-desc` 开始，只读取当前第一页前5条issue的number/title/labels/updatedAt/detailUrl；保留页面可见Updated完整含义（禁止把创建日期当更新时间），labels只取真实标签文本，不含类型或作者；不能手工编造/拼装页内数据。只读，不分页，不摘要，不登录。

局部输出schema只用原 `/private/tmp/bat-current-plan-v6.json` 中pages.items.properties.issues的完整schema作为issues属性，根为 `{issues: ...}` 且required/issues/additionalProperties=false。使用局部派生任务身份和新版本摘要，不能伪装原正式任务身份。不得把已知有效selectors/数据/特殊dom结构告诉模型，程序源码亦不允许出现这些站点实例。

最多20次Agent步骤（不是20次工具成功保证），不自动重跑。保存脱敏result/动作参数/模型审计/生命周期诊断；不保存原始history/截图/凭证或prompts。报告源success/judged与字段调用成功次数；人工独立核对5条非空标题、唯一编号、对应detail链接、bug标签及更新时间文本。来源编译是否成功可单列，不能据此声称原任务通过。

失败时给出最后真实动作和具体范围内已知原因，不扩成额外实现、不续跑正式source。清理后向root交付结果供其决定下一步。
