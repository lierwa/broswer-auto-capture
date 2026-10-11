# 后台连接与冻结主流程验收

当前结论：后台连接修复已验证；结果读取纠错修复后，冻结代码的新任务已从需求对话完整走到发布及首次正式复跑。报告数据完整取得，盾正式判定 Human。历史首次失败保留；另有 Chrome 扩展配置副作用未关闭，见下文。

本轮在master@5ac7f8f现有dirty checkout完成连接适配，未改盾、未提交/推送/worktree/关机。

## 连接修复

直接复用BrowserSkill 3f10983c的WSTransport、heartbeat、keepalive（MIT，来源及产物SHA已固定）；后台原授权token验证后，同一socket交原Playwright relay。无第二套CDP协议、无自建重连循环。首次授权、暂停、撤销沿原PopupBridge。Chrome官方background权限使无窗口进程可存活；扩展版本0.4.1。旧已安装worker字节不同于构建产物，经Chrome官方重载完成一次升级。

18项聚焦通过、扩展构建通过；API类型检查仍有原盾3项基线错误。隔离真实Chrome通过首次授权、暂停跨浏览器重启、断线重连及宿主重启，0新增tab，42秒无Inspector空闲连接保持。实际Default产品入口冷启动578.7ms，0窗口，原授权保留。首轮dispose迟到wake错误、冷启/安装态失败和验收工具错误分别保留，不覆盖。

## 配置恢复事件

诊断Chrome启动记录本地token解密错误，Secure Preferences安装条目从16变1。停用该诊断进程，用本轮初始受保护快照恢复16项，加密键未变；正常桌面Chrome重新加载，0.4.1监听与权限持久保存。后续实际产品冷启通过。三项其它商店扩展仍被Chrome标记1024（文件损坏），原路径存在，未擅自绕过或重装；唯一底层成因未关闭。敏感恢复临时副本已在所有恢复写入结束后永久删除，原始私密数据不得进Git。

## 第一次后台连接冻结任务：失败保留

1222 份代码/配置在 task ce595f4a-2cc1-4254-9c41-f1edecb7ea8b 全程不变。首轮需求 c3d80629 成功并确认 v1；首次准备 9d491128-a7bc-4fd5-8cf8-4fd58583a696 在第 7 个 bat_read_fields 失败，最终 done(false)、0 发布/0 正式复跑。唯一提交的盾 case 557e2bb2 为 Human，39 clear、四 Worker 有效；这只是代表交互结果，不是主流程通过。清理 confirmed，activeResources=false；辅助 Chrome 26424 已退出，Workbench 临时 Profile 和敏感恢复副本永久删除。

原失败调用把共同容器设为 table.signal-table，再在内部找位于表格外的 #main，正确得到零匹配。模型随后查询 6 次、未再调用结构化读取工具，并因找不到另一个报告超链接而结束失败。原工具已有 page-url 能力。旧反馈要求“only its projection”，没有说明容器本身也可能选错，更没有说明零匹配不是整页无结果。

**需求归因纠正**：获取最终报告本身是任务必需环节，不得把失败解释为用户多要数据，也不得删除报告输出求通过。先前“多要求报告链接导致失败”的说法撤回。报告取得方法应由准备阶段根据真实页面确定；当前结果页面地址与页面内另一个超链接必须区分。

## 通用读取纠错修复及第二次冻结

只改既有 method_read_tool 和 method_read_diagnostics 的工具说明、容器范围诊断：明确字段相对容器解析；零匹配不证明页面无结果；允许修改共同容器及字段投影；修正后在原页面只读重试；当前文档地址沿既有 page-url，目标链接仍须真实观察。必填合同和精确匹配校验不放宽，无网站特判，无额外模型循环。

25 项聚焦通过。新增 2 项先在旧实现失败，修后通过；首次引用测试路径缺 apps/api/python，已记录并只重跑该 5 项。真实 Chrome 通用页复现同类范围错误，同一产品模型一次纠正为 main 与 page-url，实际 bat_read_fields 成功；普通执行器在第二页读取不同标题、3 项列表和新地址，模型 0。测试监听/浏览器已关闭，日志证明的临时目录 browser-use-user-data-dir-1fk4pfdo 已核验归属后永久删除。

1222 代码配置重新冻结，受管 fork 3ae097cd。新任务全程代码字节和文件集合不变，tools/antibot-lab 相对连接修复入场快照未改变。

| 阶段 | 首次记录 | 结果 | 普通执行模型调用 |
| --- | --- | --- | --- |
| 全新任务 | c52e7dc3-3f1a-45aa-9ce9-7b0cff6e50a1 | 从需求对话新建 | — |
| 需求对话 | b2f1d401-4125-480f-8733-ea2b966ca106 | succeeded，确认 v1 | 需求模型用途独立 |
| 准备 | f30381b5-b1a3-47d0-8214-3aa43072e3db | completed，代表探索与读取成功 | 探索用途独立 |
| 草稿试跑 | 3ba4cbd2-623c-4eff-8662-8f43fe99fd4e | completed | 0 |
| 独立复验 | ec938ab1-b90c-4fbd-8fc1-e73aace439ee | completed | 0 |
| 工作台发布 | 8288a372-2b10-4e4b-8b4a-ee7c63252251 V1 | 不可变版本已发布 | 0 |
| 正式复跑 | 43e68dd4-4449-4496-8652-4c49e7b0f256 | completed | 0 |

实际生成方法以共同 main 容器读取最终结论、完整检测表格及既有 page-url；没有人工补写任务参数。三次普通执行的模型审计均完整且调用为 0，清理均在首次 confirmed。它们是产品主流程必要样本、独立复验和正式运行各一次，没有失败后无变化重跑。

## 盾的原始结果与实际数据交付

| 阶段 | 盾 case | 原判定 | 检测项 |
| --- | --- | --- | --- |
| 代表探索 | 47b04b53-d07c-4b73-af2c-5f9b79495502 | Human | 39 clear |
| 草稿试跑 | 366d0e3f-f39f-4bc7-90ab-0b3d4d632426 | Human | 39 clear |
| 独立复验 | 9f1c5139-ac9e-4d82-b0a5-1649aeaf44dc | Human | 39 clear |
| 正式复跑 | 4d1efa75-c9f1-441e-9495-5ebf1f7fe416 | Human | 39 clear |

四份报告均通过未改动的 serverReport 在原 SQLite 上只读取得；四 Worker 有效，flagged/failed/unavailable 均 0。实际 B-A-T 输出含最终结论、39 项名称/结果/依据和本次结果页面地址，逐项与对应原报告对照，缺项为 0。数据位于 frozen-read-scope-07/report-output.txt；完整回执 acceptance-summary.json，工作台截图 formal-completed-workbench.png。

## 收尾

owner acb1f278 的代表探索、三次执行均确认资源清理；Python 运行器已退出，日常 Chrome 无任务窗口，connected=true/busy=false。辅助 Workbench Chrome 13044 退出码 0，所属 Profile 永久删除；诊断临时 browser-use-user-data-dir-1fk4pfdo、旧辅助 Profile 和敏感恢复副本永久删除。用户日常 Chrome 23112 与正常开发服务 15640 保留，证据 read-scope-07/final-cleanup.json。

另保留验收工具自身错误：首次测试模块路径遗漏、UI 文案等待错误、汇总脚本 REPL 变量作用域错误；均未触发额外业务运行或改写首败。不存在新任务执行中改生产代码。

证据：work/bat-shield-mainflow-20261011/connection-background-06、frozen-background-06；work/bat-shield-mainflow-20261012/read-scope-07、frozen-read-scope-07。
