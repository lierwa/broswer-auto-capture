import { z } from "zod"

export const modelPurposeSchema = z.enum(["interview", "source_research", "plan_creation", "exploration", "explicit_llm", "repair"])
export type ModelPurpose = z.infer<typeof modelPurposeSchema>
export const modelRoutes = {
  interview: { model: "gpt-5.6-terra", effort: "medium" },
  source_research: { model: "gpt-5.6-terra", effort: "medium" },
  plan_creation: { model: "gpt-5.6-terra", effort: "medium" },
  exploration: { model: "gpt-5.6-sol", effort: "high" },
  explicit_llm: { model: "gpt-5.6-luna", effort: "medium" },
  repair: { model: "gpt-5.6-sol", effort: "high" },
} as const
export type ModelRoute = (typeof modelRoutes)[ModelPurpose]
export function routeFor(purpose: ModelPurpose = "interview"): ModelRoute { return modelRoutes[modelPurposeSchema.parse(purpose)] }
