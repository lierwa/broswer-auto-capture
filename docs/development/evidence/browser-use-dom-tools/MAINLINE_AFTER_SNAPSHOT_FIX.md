# 原任务快照修复后的正式验收（2026-09-17）

未通过。run `da124af1-ef86-4905-bf54-3e3f00431445`，job `236ec9db-7071-4f9c-8e14-dcf2c081dd42`；固定源码 `4445920edd2f6ffa96db5a0a0ccaf9bc0482ef442e17aeffe666a8d002ccd82e`。探索正常走到done，sourceSuccess=true，但sourceValidated=false；不等于业务成功。source closed/applicationClosed/sourceContractsUnchanged均true，进程退出1，candidate/sample/verification均0。真实调用 agent完成30/失败3、extract完成2、judge完成1；29浏览器命令。

来源：`work/natural-task-validation/da124af1-ef86-4905-bf54-3e3f00431445/source-result.json`，不得修改。快照竞态未复发。

当前确定的问题：
- 三次bat_read_fields调用中，两次使用不存在的outputPath page1Rows；另一次正确pages/0/issues但只提供title/detailUrl，缺少合同必需字段。工具只返回抽象错误码，模型无法从工具自身知道有效输出路径、必需字段及标量value包装规则，最后转用extract。
- a23/a27 native extract不能提供确定性字段映射；最终报告未调用bat_summarize，故没有可复跑输出装配。
- search_page为原生只读探索动作但natural编译尚未覆盖；a25原生pages=2滚动没有目标完成事实。
- a2/a9 click未捕获可编译完成条件；a5仅overlay变化。需要按这三条实际事实判定其动作语义，不能把缺口直接归为新通用能力。
- judge=false的具体理由未保留；当前author把业务结构化输出也丢弃为null，因此不能根据掩码done参数猜测业务失败原因。

后续执行顺序：先用已保存的三个真实字段工具参数复现接口失败，补准确说明及可操作错误反馈（不增加LLM参数字段）；同时诊断三个click的事实边界和search_page原生只读属性。保留原source，不放宽judge，不重跑全流程碰运气。修复方案由主agent逐项决定。

主agent另核对到一条确定的需求顺序违例：a29为go_back，随后a30直接done，中间没有任何返回后的新读取。第一页/第二页数据不能用返回前的extract缓存冒充“返回后再读取第二页其余条目”。这来自实际动作顺序，不是对未保存judge理由的猜测。
