import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { resolveContentReceipts, resolveNativeFileReceipts } from "../src/upstream-browser/content-receipts.js"
import { persistContentArtifacts } from "../src/task-chain/content-artifacts.js"
import { ProductStore } from "../src/database/store.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"

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

// 不变量：临时文件消失后，交付仍有完整字节；串owner、越界、symlink和改字节不能入库。
test("原生文件凭证经真实仓储保存后独立于临时文件，错误来源被拒绝", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-native-file-")), ownerId = randomUUID()
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep))
  let store: ProductStore | undefined
  try {
    store = await ProductStore.open(path.join(directory, "database"))
    const repository = new TaskContractRepository(store)
    const taskId = store.taskAction({ type: "create", requestId: randomUUID() }), runId = randomUUID()
    const bytes = Buffer.from("native PDF fixture\n"), digest = createHash("sha256").update(bytes).digest("hex")
    const relativePath = `${randomUUID()}/browseruse_agent_data/report.pdf`
    const file = path.join(directory, "native-files", ownerId, relativePath)
    await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes)
    const receipt = { format: "bat-native-file-ref/v1", ownerId, fileName: "report.pdf", mediaType: "application/pdf",
      digest, byteLength: bytes.length, relativePath }
    const profilePath = path.join(directory, "profile")
    const resolve = (change: object = {}) => resolveNativeFileReceipts({ text: "Saved", files: [{ ...receipt, ...change }] },
      profilePath, ownerId)
    await assert.rejects(resolve({ ownerId: randomUUID() }), /owner_mismatch/)
    await assert.rejects(resolve({ relativePath: "../outside.pdf" }), /path_mismatch/)
    await symlink(file, path.join(path.dirname(file), "alias.pdf"))
    await assert.rejects(resolve({ relativePath: relativePath.replace("report.pdf", "alias.pdf") }), /path_mismatch/)
    const output = await resolve()
    const result = persistContentArtifacts(repository, taskId, runId, { nativeFileOutput: true }, { outcome: "success", output })
    assert.equal(result.artifacts!.length, 1)
    const reference = result.artifacts![0]!
    await rm(file)
    const saved = repository.artifact(taskId, reference.artifactId)
    assert.equal(saved.runId, runId)
    assert.equal(saved.digest, reference.digest)
    const body = saved.body as { bytesBase64: string }
    assert.deepEqual(Buffer.from(body.bytesBase64, "base64"), bytes)
    await writeFile(file, Buffer.alloc(bytes.length, 0))
    await assert.rejects(resolve(), /digest_mismatch/)
    const changed = structuredClone(output) as { text: string; files: Array<{ bytesBase64: string }> }
    changed.files[0]!.bytesBase64 = Buffer.alloc(bytes.length, 0).toString("base64")
    assert.throws(() => persistContentArtifacts(repository, taskId, runId, { nativeFileOutput: true },
      { outcome: "success", output: changed }), /digest_mismatch/)
  } finally { await store?.close(); await rm(directory, { recursive: true }) }
})
