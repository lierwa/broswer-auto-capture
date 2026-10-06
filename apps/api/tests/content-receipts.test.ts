import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { resolveContentReceipts } from "../src/upstream-browser/content-receipts.js"
import { persistContentArtifacts } from "../src/task-chain/content-artifacts.js"

// WHY：9MB 原始内容不能放进 8MB 编译消息；瘦凭证必须核验 owner、大小和原字节摘要。
test("大产物通过本次owner凭证回读，拒绝换owner与文件篡改", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-content-")), ownerId = randomUUID()
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep))
  const coverage = { scope: "selected_live_region", imageCount: 0, complete: true }
  const body = JSON.stringify({ format: "bat-page-content/v1", url: "https://example.test/page", coverage,
    html: "x".repeat(9_000_000), markdown: "raw fixture", images: [] })
  const digest = createHash("sha256").update(body).digest("hex")
  const folder = path.join(directory, "content-receipts", ownerId), profilePath = path.join(directory, "default")
  await mkdir(folder, { recursive: true })
  const file = path.join(folder, `${digest}.json`)
  await writeFile(file, body)
  const receipt = JSON.stringify({ format: "bat-page-content-ref/v1", url: "https://example.test/page", ownerId,
    digest, byteLength: Buffer.byteLength(body), coverage, textPreview: "raw fixture" })
  assert.ok(Buffer.byteLength(receipt) < 2000)
  const config = { specification: { fields: { content: { contentSource: "page-content" } } } }
  try {
    const resolved = await resolveContentReceipts({ content: receipt }, config, profilePath, ownerId)
    assert.deepEqual(resolved, { content: body })
    await assert.rejects(resolveContentReceipts({ content: receipt }, config, profilePath, randomUUID()), /owner_mismatch/)
    await writeFile(file, body.replace("raw fixture", "bad fixture"))
    await assert.rejects(resolveContentReceipts({ content: receipt }, config, profilePath, ownerId), /digest_mismatch/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("真实采集的摘要可以随产物保存，旧产物兼容但未知字段仍拒绝", () => {
  // WHY：保护 Python 原始产物到持久化的边界，避免通过凭证回读后又被另一份严格合同拒绝。
  const body = { format: "bat-page-content/v1", url: "https://example.test/page", html: "<p>原始内容</p>",
    markdown: "原始内容", images: [], coverage: { scope: "selected_live_region", imageCount: 0, complete: true } }
  const saved: unknown[] = [], repository = { saveArtifact: (_task: string, _run: string, _type: string, value: unknown) => {
    saved.push(value); return { artifactId: randomUUID() }
  } }
  const config = { specification: { fields: { content: { contentSource: "page-content" } } } }
  const persist = (value: object) => persistContentArtifacts(repository as never, "task", "run", config,
    { outcome: "success", output: { content: JSON.stringify(value) } } as never)
  persist({ ...body, textPreview: "原始内容" }); persist(body)
  assert.equal(saved.length, 2)
  assert.equal((saved[0] as { textPreview: string }).textPreview, "原始内容")
  assert.throws(() => persist({ ...body, unexpected: true }), /unrecognized_keys/)
  assert.throws(() => persist({ ...body, textPreview: "x".repeat(1501) }), /too_big/)
})
