import { getDomain } from "tldts"
import type { BrowserAllowedSite } from "@browser-capture/contracts"
export type { BrowserAllowedSite } from "@browser-capture/contracts"

/** WHY：需求确认的是业务站点而不是预先枚举的技术 host；搜索域和内容域仍属于同一来源站点。 */
export function browserAllowedSites(origins: string[]): BrowserAllowedSite[] {
  const sites = new Map<string, BrowserAllowedSite>()
  for (const origin of origins) {
    const url = new URL(origin)
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) {
      throw new Error("hybrid_exact_origins_required")
    }
    const wildcard = url.hostname.startsWith("*.")
    const hostname = wildcard ? url.hostname.slice(2) : url.hostname
    const registered = getDomain(hostname, { allowPrivateDomains: true })
    if (hostname.includes("*") || wildcard && !registered) throw new Error("hybrid_navigation_scope_invalid")
    const site: BrowserAllowedSite = {
      scheme: url.protocol === "https:" ? "https" : "http",
      domain: (wildcard ? hostname : registered ?? hostname).toLowerCase(),
      port: url.port ? Number(url.port) : null,
      includeSubdomains: wildcard || registered !== null,
    }
    sites.set(`${site.scheme}:${site.domain}:${site.port ?? "default"}:${site.includeSubdomains}`, site)
  }
  return [...sites.values()]
}

export function isWithinBrowserSites(value: string, origins: string[]) {
  return isWithinAllowedSites(value, browserAllowedSites(origins))
}

export function isWithinAllowedSites(value: string, sites: readonly BrowserAllowedSite[]) {
  let url: URL
  try { url = new URL(value) } catch { return false }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false
  return sites.some((site) => {
    const hostname = url.hostname.toLowerCase(), scheme = url.protocol.slice(0, -1)
    const port = url.port ? Number(url.port) : null
    const hostMatches = hostname === site.domain
      || (site.includeSubdomains && hostname.endsWith(`.${site.domain}`))
    return scheme === site.scheme && port === site.port && hostMatches
  })
}
