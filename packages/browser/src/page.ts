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
// WHY：语义观察没有 href；只用固定只读表达式获取可见链接与当前地址，不接收模型代码或读取存储。
export const PAGE_LINKS_EXPRESSION = `({url:location.href,title:document.title.slice(0,300),links:Array.from(document.querySelectorAll('a[href]')).filter(a=>a.getClientRects().length&&(a.innerText||'').trim()).slice(0,150).map(a=>({url:a.href,title:(a.innerText||'').trim().slice(0,300)})),headings:Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(e=>e.getClientRects().length&&(e.innerText||'').trim()).slice(0,100).map(e=>({level:Number(e.tagName.slice(1)),text:(e.innerText||'').trim().slice(0,1000)})),paragraphs:Array.from(document.querySelectorAll('p')).filter(e=>e.getClientRects().length&&(e.innerText||'').trim()).slice(0,300).map(e=>(e.innerText||'').trim().slice(0,5000))})`
export const evaluatedPageSchema = z.object({ ok: z.literal(true), tab_id: z.number().int(), value: z.object({
  url: z.string(), title: z.string().max(300), links: z.array(z.object({ url: z.string(), title: z.string().max(300) })).max(150),
  headings: z.array(z.object({ level: z.number().int().min(1).max(6), text: z.string().max(1000) })).max(100),
  paragraphs: z.array(z.string().max(5000)).max(300),
}) })
