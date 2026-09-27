export function failureLayer(error: unknown, stage: string) {
  const message = error instanceof Error ? error.message : "unknown"
  if (message === "hybrid_source_protocol_invalid") return "来源结果交接"
  if (/^hybrid_(annotation_audit_missing|source_model_audit_)/.test(message)) return "准备模型调用审计"
  if (message.includes("hybrid_action_registry_mismatch")) return "离线编译动作合同"
  if (/workflow_fork_/.test(message)) return "workflow-use 受管源码校验"
  if (/workflow_.*input/.test(message)) return "workflow-use 输入合同"
  if (/workflow_.*action|upstream_author/.test(message)) return "workflow-use 候选准入"
  if (/upstream_start|runner|protocol/.test(message)) return "上游进程生命周期"
  if (/model_account|ai_|provider/i.test(message)) return "AI Connect/Provider"
  if (/browser|captcha|login|verification/.test(message)) return "browser-use/人工边界"
  return stage === "compiling" ? "workflow-use definition" : "browser-use 探索"
}

export function authoringFailureMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    const primary = error.errors.find((item) => item instanceof Error
      && item.message !== "hybrid_source_and_cleanup_failed")
    if (primary) return authoringFailureMessage(primary)
  }
  const message = error instanceof Error ? error.message : "authoring_failed"
  if (message === "hybrid_source_protocol_invalid") {
    return "代表执行的结果交接未通过协议校验；本轮已停止，需要修复该问题后继续。"
  }
  if (message === "workflow_fork_source_verifier_unavailable") {
    return "受管 workflow-use 源码校验器不可用，系统已在准备模型和启动浏览器前停止；请检查上游运行环境。"
  }
  if (/^workflow_fork_/.test(message)) {
    return "受管 workflow-use 源码与已登记摘要不一致，系统已在启动浏览器前停止；请先核验并更新受管源码清单后重新准备。"
  }
  if (message.includes("hybrid_navigation_outside_authorized_scope")) {
    return "浏览器尝试离开已确认的网站范围，系统已立即停止；请检查需求中的目标来源后重新准备。"
  }
  if (message === "hybrid_completed_source_required") {
    return "代表任务没有正常结束或输出不符合已确认合同，系统没有发布不完整链路。"
  }
  if (message === "hybrid_requirement_clarification_required") {
    return "真实页面暴露了尚未确认的业务歧义，请返回需求对话确认后重新准备。"
  }
  if (message === "hybrid_compilation_gaps") {
    return "代表执行记录已保留，但链路编译仍有缺口，尚未发布；请查看技术详情中的具体缺口。"
  }
  if (message === "hybrid_annotation_audit_missing") {
    return "已保存的来源包含无法绑定现场验证工具的选择方法或离线摘要，但缺少对应的离线注解调用审计；编译已停止，原代表试做保留。"
  }
  if (message === "hybrid_source_model_audit_missing" || message === "hybrid_source_model_audit_incomplete") {
    return "已保存的代表试做缺少完整的准备模型调用审计；编译已停止，原来源保留，请查看技术详情。"
  }
  if (message === "hybrid_offline_source_unavailable" || message === "hybrid_source_artifact_digest_mismatch") {
    return "已保存的代表试做来源不完整或与当前需求、方案、输入不一致；离线编译已停止，原记录保留。"
  }
  if (message === "hybrid_offline_compiler_unavailable") {
    return "离线编译器当前不可用；已保存的代表试做来源保留，未重新打开浏览器。"
  }
  if (message.includes("hybrid_action_registry_mismatch")) {
    return "已保存的浏览器动作与当前编译器不兼容；离线恢复已停止，需先检查动作合同。"
  }
  if (message === "preexecution_entry_unresolved" || message.includes("entryUrls") || message.includes("allowedOrigins")) {
    return "系统没有从已确认需求确定预执行入口；请返回需求对话补充目标来源后重新准备。"
  }
  if (/upstream_runner_|upstream_protocol_/.test(message)) {
    return "受管浏览器运行环境未能启动，系统已在页面操作前停止；请先同步并检查固定的 upstream 环境后重新准备。"
  }
  if (message.includes("hybrid_source_and_cleanup_failed") || message.includes("cleanup")) {
    return "浏览器任务结束时没有完成安全收尾，系统已停止并且没有发布这条链路；请重新准备。"
  }
  if (/captcha|login|authentication|verification/i.test(message)) {
    return "网站要求登录或人工验证；请先在专用浏览器中处理账号状态，再重新准备。"
  }
  if (/model_account|ai_|provider/i.test(message)) return "模型服务没有完成这次准备，请检查模型账号设置后重试。"
  if (/timeout/i.test(message)) return "网站响应超时，系统已停止并且没有发布不完整链路；请稍后重新准备。"
  return "系统未能完成这次准备，且没有发布不可复跑的链路；请重试，若再次失败请查看技术详情。"
}
