import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import {
  resolveProducerRoot,
  validateReleaseManifest,
  verifyConsumerRelease,
} from "../../scripts/ai-connect-sync.mjs"

const hash = (value) => createHash("sha256").update(value).digest("hex")
const sourceHash = "a".repeat(64)

function release(core, react) {
  return {
    schemaVersion: 1,
    producer: { head: "1".repeat(40), dirty: true },
    build: [
      { name: "@agent-platform/ai-connect", sourceHash },
      { name: "@agent-platform/ai-connect-react", sourceHash },
    ],
    packages: {
      core: { name: "@agent-platform/ai-connect", version: "0.3.0", file: "core.tgz",
        sha256: hash(core), exports: ["./browser"], styles: [] },
      react: { name: "@agent-platform/ai-connect-react", version: "0.3.0", file: "react.tgz",
        sha256: hash(react), exports: [".", "./chat", "./styles.css"], styles: ["./styles.css"] },
    },
    core: "core.tgz",
    react: "react.tgz",
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bct-ai-connect-"))
  const producer = join(root, "opencode")
  const consumer = join(root, "browser-capture-tool")
  const artifacts = join(producer, "packages", "ai-connect", "artifacts")
  const scripts = join(producer, "packages", "ai-connect", "scripts")
  const vendor = join(consumer, "vendor", "agent-platform")
  await Promise.all([mkdir(artifacts, { recursive: true }), mkdir(scripts, { recursive: true }),
    mkdir(vendor, { recursive: true }), mkdir(join(consumer, "apps", "web"), { recursive: true })])
  const core = "core artifact"
  const react = "react artifact"
  const manifest = release(core, react)
  await Promise.all([
    writeFile(join(scripts, "sync-local.mjs"), "export const syncLocalAIConnect = () => undefined\n"),
    writeFile(join(artifacts, "release.json"), JSON.stringify(manifest)),
    writeFile(join(vendor, "core.tgz"), core),
    writeFile(join(vendor, "react.tgz"), react),
    writeFile(join(consumer, "package.json"), JSON.stringify({ aiConnect: {
      vendorDirectory: "vendor/agent-platform",
      manifests: {
        "@agent-platform/ai-connect": ["apps/web/package.json"],
        "@agent-platform/ai-connect-react": ["apps/web/package.json"],
      },
    } })),
    writeFile(join(consumer, "apps", "web", "package.json"), JSON.stringify({ dependencies: {
      "@agent-platform/ai-connect": "file:../../vendor/agent-platform/core.tgz",
      "@agent-platform/ai-connect-react": "file:../../vendor/agent-platform/react.tgz",
    } })),
    writeFile(join(consumer, "package-lock.json"), JSON.stringify({ core: "core.tgz", react: "react.tgz" })),
  ])
  return { root, producer, consumer, manifest, vendor }
}

test("默认发现 sibling checkout，环境变量和本机配置使用绝对路径覆盖", async () => {
  const item = await fixture()
  try {
    assert.equal(await resolveProducerRoot({ consumerRoot: item.consumer, env: {} }), resolve(item.producer))
    assert.equal(await resolveProducerRoot({ consumerRoot: item.consumer,
      env: { AI_CONNECT_PRODUCER_ROOT: item.producer } }), resolve(item.producer))
    await writeFile(join(item.consumer, ".ai-connect.local.json"), JSON.stringify({ opencodeRoot: item.producer }))
    assert.equal(await resolveProducerRoot({ consumerRoot: item.consumer, env: {} }), resolve(item.producer))
    await assert.rejects(() => resolveProducerRoot({ consumerRoot: item.consumer,
      env: { AI_CONNECT_PRODUCER_ROOT: "relative" } }), /must be an absolute path/)
  } finally {
    assert.ok(resolve(item.root).startsWith(resolve(tmpdir())))
    await rm(item.root, { recursive: true, force: true })
  }
})

test("同一 release manifest 复验版本、公开入口、CSS、vendor hash、依赖与 lockfile", async () => {
  const item = await fixture()
  try {
    const input = { consumerRoot: item.consumer, producerRoot: item.producer }
    assert.equal((await verifyConsumerRelease(input)).packages.react.sha256, item.manifest.packages.react.sha256)
    const invalid = structuredClone(item.manifest)
    invalid.packages.react.styles = []
    assert.throws(() => validateReleaseManifest(invalid), /react_surface/)
    await writeFile(join(item.vendor, "react.tgz"), "different artifact")
    await assert.rejects(() => verifyConsumerRelease(input), /hash_mismatch:react/)
  } finally {
    assert.ok(resolve(item.root).startsWith(resolve(tmpdir())))
    await rm(item.root, { recursive: true, force: true })
  }
})
