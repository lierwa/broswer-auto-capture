import { load } from "cheerio"
import { z } from "zod"
import { BrowserError, readTargetSchema } from "./contracts.js"
export { readTargetSchema } from "./contracts.js"
import { publicUrl } from "./page.js"

export const htmlResultSchema = z.object({ html: z.string().max(4_000_000), truncated: z.boolean(), tab_id: z.number().int() })
export const targetReadResultSchema = z.object({ url: z.string().url(), observedAt: z.string().datetime(),
  matches: z.array(z.object({ text: z.string().max(15000), tag: z.string(),
    attributes: z.record(z.string(), z.string()) }).strict()).max(300), truncated: z.boolean() }).strict()

/** WHY：使用成熟 DOM 解析器读取官方 HTML 快照；不接受页面脚本、不保留原始 HTML。 */
export function extractTarget(html: string, url: string, raw: unknown, observedAt: string, sourceTruncated = false) {
  const target = readTargetSchema.parse(raw), safeUrl = publicUrl(url)
  if (!safeUrl) throw new BrowserError("permission_denied")
  const $ = load(html)
  $("script,style,noscript,iframe,input,textarea,[hidden],[aria-hidden=true]").remove()
  const elements = $(target.selector)
  const matches = elements.slice(0, target.maxItems).toArray().map((element) => {
    const item = $(element), attributes: Record<string, string> = {}
    for (const name of ["id", "class", "name", "data-testid", "title", "aria-label", "role", "aria-checked", "aria-expanded"]) {
      const value = item.attr(name)
      if (value) attributes[name] = value.slice(0, 1000)
    }
    const href = item.attr("href")
    if (href) { const link = publicUrl(new URL(href, safeUrl).href); if (link) attributes.href = link }
    return { text: item.text().trim().slice(0, 15000), tag: "tagName" in element ? element.tagName : "", attributes }
  })
  // WHY：大型页面的 get-html 快照即使截断也可能包含目标；返回可用匹配并显式保留不完整事实，不能把它改写成传输失败。
  return targetReadResultSchema.parse({ url: safeUrl, observedAt, matches,
    truncated: sourceTruncated || elements.length > target.maxItems })
}
