# 在线收尾校验修复与冻结新任务验收

日期：2026-10-11。执行环境：当前 master@5ac7f8f，保留全部既有未提交改动。用户授权通用最小修复、先验证再冻结、从新需求走完整主流程；盾不改，不提交、推送、worktree 或关机。

## 根因与修复

旧冻结任务 48c3061d-90cd-4fe1-950b-8ff9a8f7503d 的最终编译已合法排除两项无消费者 DOM 探查，compilation.gaps=[]，最终候选已经保存；AuthoringBuild.finish 却仍用 raw sourceGaps.length 拒绝。raw sourceGaps 是不可覆盖的探索历史，不是最终有效阻塞集合。此前修复只覆盖了编译器的探查退休，漏掉宿主收尾判断，这是 B-A-T 自有校验逻辑的问题。原任务失败和原始来源不改写，详见 BAT_FROZEN_FRESH_MAINFLOW_20261011.md。

生产仅修改 apps/api/src/task-chain/authoring-build.ts 的 finish 条件，改用已校验、已保存的 final compilation.gaps；仍要求 final 终态存在、canonicalRequest 完全匹配。真实未解决缺口仍在 accept 阶段拒绝。没有将原始历史 gap 清空，没有新增网站分支，没有放宽来源或动作回执。

Product Alignment: natural-language task=交互检测与资料读取等浏览器任务；reusable chain boundary=在线编译最终候选进入准备；runtime inputs=完整来源和已保存最终编译；dynamic task outputs=候选或真实缺口；generic platform capability used=原编译器覆盖/退休事实与 ACK 持久化；replay model calls=不新增；site/task-specific code added=no。

Reuse Assessment: existing implementation=现有 AuthoringBuild、真实 Python 编译器、V3 registry/method receipt 和 SQLite ACK；selected implementation=复用原最终编译事实，只修宿主条件；依赖、Agent loop、控制和调度不变；focused validation=合法退休可收尾，真实未解决缺口不可收尾，以及原来源摘要、保存和取消边界。

## 修前复现与修后验证

证据：work/bat-shield-mainflow-20261011/finish-repair-02。真实 Python 编译→callback→ACK/SQLite→候选的回归，修前在 AuthoringBuild.finish 复现 hybrid_online_final_compilation_required；同时未解决缺口反例正确拒绝。修后在线测试 5/5、探查生命周期测试 2/2。测试夹具同步当前 V3 registry/method receipt；最初旧 V2 夹具及动作序号格式失败日志保留，不算生产回归。

API 类型检查存在盾文件的 3 项既有诊断。两个本轮修改前 git-clean 的 TS 文件用 HEAD 内容在编译器读取层只读覆盖，对照与当前完全相同，详见 typecheck-comparison.json。没有文件回滚、没有修改盾，不能表述为全包类型检查通过。

服务加载：正常开发入口第一次重启失败，原 PID24244 已退出，端口已空，遗留锁超过原有失效时间后正常入口启动 PID27948。保留 reload-state.json；该启动首败内部唯一原因未证实，不以随后启动成功覆盖。

## 冻结新任务：首次准备失败，未发布、未正式复跑

1201 份代码/配置在新任务之前保存 SHA256。调查结束后内容和文件集合均不变：changed=[]、added=[]、missing=[]，见 frozen-fresh-02/code-freeze-investigation.json。冻结后没有继续编辑生产代码、测试或配置。

通过实际 Workbench 从需求对话新建 task 4bef5468-4669-46f4-90d6-9b33cbf7d1ea，确认模型生成的草案；首次准备 ead62058-0e3d-4e0b-84a0-667768b84b8a、owner 6d6e5412-2a1c-4667-812d-951ab8ba9063。需求对话首个 envelope 格式错误，原有一次内置修复成功，两次调用均保留。准备有 9 次模型调用，7 个动作；导航被记失败，随后两次输入和一次滚动成功，两个只读查询成功，最终 done success=false。没有提交检测动作，没有业务输出。编译仅保存 prefix，第一 navigate 缺少成功回执；未达到 final finish，所以不是本轮已修判断再次失败。

盾原 case 8c2da2f5-8f00-42fe-b1e8-09f72a31ba77 为 pending/waiting_interaction、四 Worker 有效，服务端收到交互但 submitted=false。前端显示连接失败并禁用提交，不能宣称通过盾。新任务发布数 0、正式执行数 0。

查实：原生 navigate 成功后的健康检查调用了 B-A-T 包装观察，正常页面过渡被转换为动作失败；清理未确认又遮挡来源终态，错误映射进一步误报“页面操作前未启动”。这两个通用问题冻结后尚未修改。原次页面连接失败、原次 close 超 5 秒的具体内部慢点仍缺唯一证据；阴性诊断不能覆盖首次失败。完整事实、调用链、责任及关闭条件见 [主流程根因调查](BAT_MAINFLOW_ROOT_CAUSE_20261011.md)。

原 task/job/source、首次截图、盾服务端报告、访问摘要和清理记录均保留。原 owner 租约 ended、owned target 经 CDP 确认已消失；辅助 Chrome PID21952 退出 0、精确 workbench-profile 永久删除，两个本轮测试 pyc 精确删除。本轮三个诊断窗口均 finally 关闭且核验不存在，三个临时目录永久删除，Python/诊断监听为 0。用户原 Chrome 与工作台服务保留。不改盾、不把诊断当主流程验收、不提交或推送。
