import { z } from "zod"

export function publicUrl(value: string): string | null {
  try {
    let url = new URL(value)
    // WHY：Bing 的跳转目标来自真实 href 的编码参数；解码不构造站点 URL。
    const target = url.searchParams.get("u")
    if (/(^|\.)bing\.com$/.test(url.hostname) && url.pathname === "/ck/a" && target?.startsWith("a1")) url = new URL(Buffer.from(target.slice(2), "base64url").toString("utf8"))
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null
    if ([...url.searchParams.keys()].some((key) => /token|password|secret|session|auth|cookie|code/i.test(key))) return null
    if (/(?:^|\/)(?:login|signin|account|checkout)(?:\/|$)/i.test(url.pathname)) return null
    url.hash = ""
    return url.href.length <= 4000 ? url.href : null
  } catch { return null }
}
export const pageSchema = z.object({ url: z.string().url(), title: z.string().max(300), text: z.string().max(150000), truncated: z.boolean(),
  links: z.array(z.object({ url: z.string().url(), title: z.string().max(300) }).strict()).max(150),
  headings: z.array(z.object({ level: z.number().int().min(1).max(6), text: z.string().max(1000) }).strict()).max(100),
  paragraphs: z.array(z.string().max(5000)).max(300),
}).strict()
export type BrowserPage = z.infer<typeof pageSchema>
