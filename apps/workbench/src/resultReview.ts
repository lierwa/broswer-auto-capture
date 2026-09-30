import type { TaskExecutionReviewReceipt } from "@browser-capture/contracts"

export function requirementRevisionMessage(summary: string, feedback: string, context?: TaskExecutionReviewReceipt["context"]) {
  return [
    "我需要重新梳理这项需求。请根据下面的运行摘要和我的说明，重新确认目标、来源、范围与结果预期；不要沿用未重新确认的旧假设。",
    "", "【运行摘要】", summary.trim(),
    ...(context ? ["", "【原运行定位】", JSON.stringify(context),
      "以上引用属于原需求和原运行；与当前草案不同之处请明确保留，未重新确认前不要覆盖或执行。"] : []),
    "", "【我的说明】", feedback.trim(),
  ].join("\n")
}
