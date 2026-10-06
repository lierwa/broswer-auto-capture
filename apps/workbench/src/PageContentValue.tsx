import { useMemo } from "react"
import { Button } from "@radix-ui/themes"
import { pageContentSchema } from "@browser-capture/contracts"

export function PageContentValue({ value }: { value: string }) {
  const content = useMemo(() => {
    if (!value.trimStart().startsWith("{")) return null
    try { return pageContentSchema.safeParse(JSON.parse(value)).data ?? null } catch { return null }
  }, [value])
  if (!content) return <p>{value}</p>
  const download = () => {
    const url = URL.createObjectURL(new Blob([value], { type: "application/json;charset=utf-8" }))
    const anchor = document.createElement("a")
    anchor.href = url; anchor.download = "page-content.json"; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  // WHY：原HTML只随完整产物下载；宿主DOM只呈现React转义文本与已保存图片，不访问原站。
  return <section className="saved-page-content" aria-label="已保存的页面图文">
    <p>{/^https?:\/\//i.test(content.url) ? <a href={content.url} target="_blank" rel="noopener noreferrer">来源页面</a> : "来源已保存在产物中"}
      {` · ${content.images.length} 张原图`}</p>
    <Button size="1" variant="soft" onClick={download}>下载完整图文</Button>
    {content.textPreview && <><h4>原文预览</h4><pre>{content.textPreview}</pre></>}
    <details><summary>完整原始文本（Markdown）</summary><pre>{content.markdown}</pre></details>
    <details><summary>查看保存的原图（{content.images.length}）</summary>
      {content.images.map((image, index) => <figure key={index}>
        <img src={`data:${image.mediaType};base64,${image.body}`} alt={`原图 ${index + 1}`} loading="lazy" decoding="async" />
        <figcaption>原图 {index + 1}</figcaption>
      </figure>)}
    </details>
  </section>
}
