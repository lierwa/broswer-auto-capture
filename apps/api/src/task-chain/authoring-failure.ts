import { RuntimeCleanupRequiredError } from "../upstream-browser/cleanup.js"

export class RequirementClarificationRequired extends Error {
  constructor(readonly issues: Array<{ code: string; clauseRefs: string[] }>) {
    super("hybrid_requirement_clarification_required")
  }
}

export function incompleteSourceError(actions: ReadonlyArray<Record<string, unknown>>) {
  const last = actions.at(-1)
  // WHY：已纠正的早期错误不是终止原因；只消费最终动作，原失败仍保留在不可变来源。
  if (last?.name === "done" && last.args && typeof last.args === "object"
    && "success" in last.args && last.args.success === false) {
    return Object.assign(new Error("hybrid_source_declared_failure"), {
      nativeText: "text" in last.args && typeof last.args.text === "string" ? last.args.text.slice(0, 4000) : "" })
  }
  const action = last?.status === "failed" && typeof last.name === "string" && /^[a-z][a-z0-9_]*$/u.test(last.name)
    ? `:${last.name}:${actions.length}` : ""
  return new Error(`hybrid_completed_source_required${action}`)
}

/** WHY：只保存固定代码/异常类，不保存原异常正文、URL、页面内容或凭据。 */
export function authoringFailureCode(error: unknown): string {
  if (error instanceof RuntimeCleanupRequiredError && error.primary.status === "failed") {
    return authoringFailureCode(error.primary.error)
  }
  if (error instanceof RuntimeCleanupRequiredError) return "upstream_runner_cleanup_unconfirmed"
  const coded = error && typeof error === "object" && "code" in error ? error.code : undefined
  const reason = error && typeof error === "object" && "reason" in error ? error.reason : undefined
  const message = typeof coded === "string" ? `${coded}:${typeof reason === "string" ? reason : ""}`
    : error instanceof Error ? error.message : "unknown"
  const safe = /^(?:(?:hybrid_|preparation_|inspected_|upstream_|workflow_|daily_chrome_|account_|content_|ordinary_|read_|target_)[a-z0-9_]{1,100}|[A-Za-z]{1,60}Error)$/
  const parts = message.split(":").slice(0, 3).filter(part => safe.test(part))
  return parts.length ? parts.join(":") : "authoring_failure_unclassified"
}

export function failureLayer(error: unknown, stage: string): string {
  if (error instanceof RuntimeCleanupRequiredError && error.primary.status === "failed") {
    return failureLayer(error.primary.error, stage)
  }
  if (error instanceof RuntimeCleanupRequiredError) return "运行资源清理"
  const message = error instanceof Error ? error.message : "unknown"
  if (authoringFailureCode(error).startsWith("account_")) return "账号准备检查"
  if (/^hybrid_existing_browser_/.test(message)) return "日常 Chrome 连接"
  if (message === "hybrid_source_protocol_invalid") return "来源结果交接"
  if (/^(preparation_method_|preparation_reusable_|inspected_navigation_)/.test(message)) return "准备方法来源核验"
  if (/hybrid_compilation_(ack|save)/.test(message)) return "在线节点保存"
  if (/^hybrid_(compilation_|prefix_|online_final_)/.test(message)) return "在线节点编译"
  if (/^hybrid_(semantic_annotation_failed|native_compilation_failed)$/.test(message)) return "在线节点编译"
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
  // WHY：清理是独立结果，不能覆盖导致准备停止的主错误；只投影既有安全消息，不暴露原异常正文。
  if (error instanceof RuntimeCleanupRequiredError && error.primary.status === "failed") {
    return `${authoringFailureMessage(error.primary.error)} 浏览器资源清理尚未确认。`
  }
  if (error instanceof AggregateError) {
    const primary = error.errors.find((item) => item instanceof Error
      && item.message !== "hybrid_source_and_cleanup_failed")
    if (primary) return authoringFailureMessage(primary)
  }
  const message = error instanceof Error ? error.message : "authoring_failed"
  if (message === "preparation_method_prefix_not_completed")
    return "建立前置页面的运行没有正常完成；原运行和已取得来源保留，本次局部修订未继续。"
  if (message === "preparation_method_same_session_capabilities_required")
    return "当前准备会话无法安全建立前置页面；本次局部修订已停止，没有另开浏览器或重放任务。"
  if (message === "preparation_method_fresh_source_required")
    return "本次方法修订未取得新的独立来源；原方法和历史版本保留，未合并候选。"
  if (/^(preparation_method_|preparation_reusable_|inspected_navigation_)/.test(message)) {
    return "代表试做的可复跑方法来源未通过核验；已有来源保留，尚未发布。请查看技术详情中的具体原因。"
  }
  if (authoringFailureCode(error) === "account_check_incomplete") {
    return "账号检查过程发生错误，浏览器试做尚未开始，登录状态未能核验。已保存的账号保留。"
  }
  if (message === "hybrid_existing_browser_endpoint_required") {
    return "未找到日常 Chrome 的原生连接；请保持 Chrome 打开，并在 chrome://inspect/#remote-debugging 开启远程调试。本轮未启动其他浏览器。"
  }
  if (message === "hybrid_existing_browser_endpoint_invalid") {
    return "日常 Chrome 的原生连接信息无效；本轮已在启动前停止，没有切换浏览器。"
  }
  if (message === "hybrid_existing_browser_headless_unsupported") {
    return "当前隐藏窗口配置与日常 Chrome 连接冲突；本轮已停止，没有切换浏览器。"
  }
  if (message === "hybrid_existing_browser_owner_required") {
    return "本次任务缺少日常 Chrome 窗口身份，这是系统接线问题；本轮已停止，未操作用户标签页。"
  }
  if (message === "hybrid_source_protocol_invalid") {
    return "代表执行的结果交接未通过协议校验；本轮已停止，需要修复该问题后继续。"
  }
  if (/^hybrid_(compilation_(?!gaps$)|prefix_|online_final_|semantic_annotation_failed|native_compilation_failed)/.test(message)) {
    return "在线节点生成或保存未通过；已有来源和节点保留，未重新执行动作。"
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
  if (message.startsWith("hybrid_completed_source_required:")) {
    const [, action, index] = message.split(":")
    return `代表试做未完成，第 ${index} 个动作 ${action} 未通过。首次失败、读取合同和模型调用已保留在技术详情中。`
  }
  if (message === "hybrid_source_declared_failure") {
    const text = error && typeof error === "object" && "nativeText" in error && typeof error.nativeText === "string"
      ? error.nativeText : ""
    return text ? `原生浏览器探索未完成：${text}`
      : "原生浏览器探索明确以未完成结束；结束说明和完整动作记录已保留在技术详情中。"
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
  if (message.includes("hybrid_source_and_cleanup_failed") || message.includes("cleanup")) {
    return "浏览器任务的资源清理尚未确认；已保存的来源和执行结果保留，请核验本次任务所属资源。"
  }
  if (/upstream_runner_|upstream_protocol_/.test(message)) {
    return "受管浏览器进程或通信中断；请查看本次运行的阶段和首次错误。已有执行记录保留。"
  }
  if (/captcha|login|authentication|verification/i.test(message)) {
    return "网站要求登录或人工验证；请在当前选择的浏览器任务窗口中处理账号状态，再继续当前任务。无头环境需先使用同一专属 Profile 的可见窗口完成登录。"
  }
  if (/model_account|ai_|provider/i.test(message)) return "模型服务没有完成这次准备，请检查模型账号设置后重试。"
  if (/timeout/i.test(message)) return "网站响应超时，系统已停止并且没有发布不完整链路；请稍后重新准备。"
  return "系统未能完成这次准备，且没有发布不可复跑的链路；请重试，若再次失败请查看技术详情。"
}
