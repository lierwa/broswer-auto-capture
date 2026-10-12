import { z } from "zod"

export const browserAllowedSiteSchema = z.object({
  scheme: z.enum(["http", "https"]), domain: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65_535).nullable(), includeSubdomains: z.boolean(),
}).strict()

// WHY：授权来源独立于起点和业务数据，随需求/计划版本冻结；读取历史合同不补默认值。
export const navigationScopeSchema = z.object({
  version: z.literal(1), sites: z.array(browserAllowedSiteSchema).min(1).max(32),
}).strict()
export type NavigationScope = z.infer<typeof navigationScopeSchema>
export type BrowserAllowedSite = z.infer<typeof browserAllowedSiteSchema>
