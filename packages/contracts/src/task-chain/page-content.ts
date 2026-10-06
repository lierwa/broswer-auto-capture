import { z } from "zod"

/** WHY：采集落库与展示共享同一版本化产物合同，不能靠字段名猜测网页正文。 */
export const pageContentSchema = z.object({ format: z.literal("bat-page-content/v1"), url: z.url(),
  html: z.string(), markdown: z.string(), textPreview: z.string().max(1500).optional(), images: z.array(z.object({ url: z.string(), mediaType: z.string().startsWith("image/"),
    encoding: z.literal("base64"), body: z.string() }).strict()),
  backgrounds: z.array(z.object({ ordinal: z.number().int().nonnegative(),
    pseudo: z.enum(["::before", "::after"]).nullable(), image: z.string() }).strict()).optional(),
  coverage: z.object({ scope: z.literal("selected_live_region"), imageCount: z.number().int().nonnegative(),
    complete: z.literal(true) }).strict() }).strict().refine(value => value.coverage.imageCount === value.images.length,
  "content_image_coverage_invalid")
