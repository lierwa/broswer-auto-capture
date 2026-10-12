import { navigationScopeSchema, type TaskPlan } from "@browser-capture/contracts"
import { browserAllowedSites, isWithinAllowedSites } from "../upstream-browser/site-scope.js"
export { confirmedNavigationScope } from "../interview/navigation-scope.js"

export function planNavigationPolicy(plan: Pick<TaskPlan, "entryUrls" | "navigationScope">) {
  const sites = plan.navigationScope ? navigationScopeSchema.parse(plan.navigationScope).sites
    : browserAllowedSites([...new Set((plan.entryUrls ?? []).map(url => new URL(url).origin))])
  if (!sites.length) throw new Error("navigation_scope_unconfirmed")
  if ((plan.entryUrls ?? []).some(url => !isWithinAllowedSites(url, sites))) throw new Error("navigation_entry_outside_scope")
  return { allowedSites: sites, allowedOrigins: sites.map(site =>
    `${site.scheme}://${site.domain}${site.port === null ? "" : `:${site.port}`}`) }
}
