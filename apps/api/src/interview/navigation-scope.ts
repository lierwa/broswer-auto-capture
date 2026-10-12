import { navigationScopeSchema, type NavigationScope } from "@browser-capture/contracts"
import { draftError } from "./draft-validation.js"
import type { InterviewState } from "@browser-capture/contracts/interview"
import { preparationEntryFacts, selectedSourceFacts, sourceSupportsEntry } from "./source-resolution.js"
import { browserAllowedSites, isWithinAllowedSites } from "../upstream-browser/site-scope.js"

export function confirmedNavigationScope(state: InterviewState, markdown: string, requireExplicit = false): NavigationScope {
  const entries = preparationEntryFacts(state, markdown)
  const headings = [...markdown.matchAll(/^##\s+访问范围\s*$/gmu)]
  if (requireExplicit && !headings.length) throw draftError("interview_navigation_scope_required", "访问范围", "来源列表", "章节缺失", "## 访问范围\n- [获准站点][实际 ref 值]", "只引用对话已经确认可访问的来源，包含入口；不要把参考资料或业务输入的 URL 当成权限。")
  if (headings.length > 1) throw new Error("interview_navigation_scope_invalid")
  // WHY：旧草案只有入口事实，沿用原站点权限；正文、运行输入和搜索证据不能隐式扩大授权。
  const body = headings.length ? markdown.slice(headings[0]!.index! + headings[0]![0].length).split(/^#{1,6}\s+/mu, 1)[0]! : null
  const urls = body === null ? entries.map(entry => entry.url) : scopeUrls(body)
  const sources = selectedSourceFacts(state)
  if (!urls.length || urls.some(url => !sources.some(source => sourceSupportsEntry(source.url, url)))) {
    throw new Error("interview_navigation_scope_unconfirmed")
  }
  const sites = browserAllowedSites([...new Set(urls.map(url => new URL(url).origin))])
  if (entries.some(entry => !isWithinAllowedSites(entry.url, sites))) throw new Error("interview_navigation_entry_outside_scope")
  return navigationScopeSchema.parse({ version: 1, sites })
}

function scopeUrls(body: string) {
  return body.split(/\r?\n/u).map(line => line.trim()).filter(Boolean).map(line => {
    const match = line.match(/^-\s+(?:<(https?:\/\/[^<>\s]+)>|(https?:\/\/\S+))$/u)
    if (!match) throw new Error("interview_navigation_scope_invalid")
    return new URL((match[1] ?? match[2])!).href
  })
}
