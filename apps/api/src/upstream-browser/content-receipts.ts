import { createHash } from "node:crypto"
import { readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { JsonValue } from "@browser-capture/contracts"

const receiptSchema = z.object({ format: z.literal("bat-page-content-ref/v1"), url: z.url(), ownerId: z.uuid(),
  digest: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive().max(64 * 1024 * 1024),
  coverage: z.object({ scope: z.literal("selected_live_region"), imageCount: z.number().int().nonnegative(),
    complete: z.literal(true) }).strict(), textPreview: z.string().max(1500) }).strict()

const nativeFileReceiptSchema = z.object({ format: z.literal("bat-native-file-ref/v1"), ownerId: z.uuid(),
  fileName: z.string().min(1).max(255), mediaType: z.string().min(1).max(200),
  digest: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive().max(64 * 1024 * 1024),
  relativePath: z.string().min(1).max(1000) }).strict()

/** WHY：原生临时路径只在本owner存活时读取；保存字节后才可由既有finally关闭资源。 */
export async function resolveNativeFileReceipts(output: JsonValue, profilePath: string,
  ownerId: string): Promise<JsonValue> {
  const value = z.object({ text: z.string(), files: z.array(nativeFileReceiptSchema).max(100) }).strict().parse(output)
  const root = path.resolve(await realpath(path.dirname(profilePath)), "native-files", ownerId)
  const files = []
  for (const receipt of value.files) {
    if (receipt.ownerId !== ownerId || path.basename(receipt.fileName) !== receipt.fileName
      || /[\\/]/.test(receipt.fileName) || receipt.fileName === "." || receipt.fileName === "..") {
      throw new Error("native_file_receipt_owner_mismatch")
    }
    const file = path.resolve(root, receipt.relativePath)
    if (path.isAbsolute(receipt.relativePath) || file === root || !file.startsWith(root + path.sep)
      || /\\/.test(receipt.relativePath)) throw new Error("native_file_receipt_path_mismatch")
    const resolved = await realpath(file)
    if (process.platform === "win32" ? resolved.toLowerCase() !== file.toLowerCase() : resolved !== file) {
      throw new Error("native_file_receipt_path_mismatch")
    }
    const metadata = await stat(file)
    if (!metadata.isFile() || metadata.size !== receipt.byteLength) throw new Error("native_file_receipt_size_mismatch")
    const bytes = await readFile(file)
    if (bytes.length !== receipt.byteLength || createHash("sha256").update(bytes).digest("hex") !== receipt.digest) {
      throw new Error("native_file_receipt_digest_mismatch")
    }
    files.push({ format: "bat-native-file/v1", fileName: receipt.fileName, mediaType: receipt.mediaType,
      digest: receipt.digest, byteLength: receipt.byteLength, bytesBase64: bytes.toString("base64") })
  }
  return { text: value.text, files }
}

/** WHY：原图不穿过编译消息；只读取本次 owner 的有界、摘要匹配的产物传输文件。 */
export async function resolveContentReceipts(output: JsonValue, config: Record<string, unknown>,
  profilePath: string, ownerId: string): Promise<JsonValue> {
  const specification = config.specification as { fields?: Record<string, { contentSource?: string }> } | undefined
  const names = Object.entries(specification?.fields ?? {}).filter(([, field]) => field.contentSource === "page-content")
    .map(([name]) => name)
  if (!names.length) return output
  const records = Array.isArray(output) ? output : [output]
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw Error("content_receipt_output_invalid")
    for (const name of names) {
      if (typeof record[name] !== "string") throw Error("content_receipt_output_invalid")
      const parsed = JSON.parse(record[name])
      if (parsed.format !== "bat-page-content-ref/v1") continue
      const receipt = receiptSchema.parse(parsed)
      if (receipt.ownerId !== ownerId) throw Error("content_receipt_owner_mismatch")
      const file = path.resolve(await realpath(path.dirname(profilePath)), "content-receipts", ownerId, `${receipt.digest}.json`)
      const resolved = await realpath(file)
      if (process.platform === "win32" ? resolved.toLowerCase() !== file.toLowerCase() : resolved !== file) {
        throw Error("content_receipt_path_mismatch")
      }
      if ((await stat(file)).size !== receipt.byteLength) throw Error("content_receipt_size_mismatch")
      const bytes = await readFile(file)
      if (bytes.length !== receipt.byteLength || createHash("sha256").update(bytes).digest("hex") !== receipt.digest) {
        throw Error("content_receipt_digest_mismatch")
      }
      const body = JSON.parse(bytes.toString("utf8"))
      if (body.format !== "bat-page-content/v1" || body.url !== receipt.url
        || JSON.stringify(body.coverage) !== JSON.stringify(receipt.coverage)) throw Error("content_receipt_identity_mismatch")
      record[name] = bytes.toString("utf8")
    }
  }
  return output
}
