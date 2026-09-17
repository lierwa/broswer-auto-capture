import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const UV_VERSION = "0.12.15"
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const work = path.join(root, "work")
const uvDirectory = path.join(work, "tools", "uv")
const uv = path.join(uvDirectory, process.platform === "win32" ? "uv.exe" : "uv")
const check = process.argv.includes("--check")
const npmCli = process.env.npm_execpath
if (!npmCli || !existsSync(npmCli)) throw new Error("npm_cli_missing:run_with_npm_run_setup")

verifyVersion("Node.js", process.versions.node, 24)
verifyVersion("npm", capture(process.execPath, [npmCli, "--version"]), 11)

if (check) {
  capture(process.execPath, [npmCli, "ls", "--workspaces", "--depth=0"])
} else {
  run(process.execPath, [npmCli, "ci"])
}

await ensureUv()
const environment = managedEnvironment()
run(process.execPath, [
  path.join(root, "scripts", "setup-upstream-browser-runner.mjs"),
  ...(check ? ["--check"] : []),
], environment)
console.log(check ? "B-A-T environment is ready." : "B-A-T dependencies installed. Run: npm run dev")

async function ensureUv() {
  if (existsSync(uv)) return verifyUv()
  if (check) throw new Error("managed_uv_missing:run_npm_setup")
  const installerDirectory = path.join(work, "setup")
  const extension = process.platform === "win32" ? "zip" : "sh"
  const installer = path.join(installerDirectory, `uv-install.${extension}`)
  const release = process.platform === "win32" ? windowsRelease() : undefined
  const url = release?.url ?? `https://astral.sh/uv/${UV_VERSION}/install.sh`
  await mkdir(installerDirectory, { recursive: true })
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`uv_installer_download_failed:${response.status}`)
    await writeFile(installer, Buffer.from(await response.arrayBuffer()))
    if (process.platform === "win32") {
      const digest = createHash("sha256").update(await readFile(installer)).digest("hex")
      if (digest !== release.sha256) throw new Error(`uv_archive_digest_mismatch:${digest}`)
      await rm(uvDirectory, { recursive: true, force: true })
      await mkdir(uvDirectory, { recursive: true })
      run("tar.exe", ["-xf", installer, "-C", uvDirectory])
    } else {
      run("sh", [installer], { ...process.env, UV_UNMANAGED_INSTALL: uvDirectory })
    }
  } finally {
    await rm(installerDirectory, { recursive: true, force: true })
  }
  if (!existsSync(uv)) throw new Error("managed_uv_install_missing")
  verifyUv()
}

function windowsRelease() {
  const releases = {
    x64: {
      file: "uv-x86_64-pc-windows-msvc.zip",
      sha256: "477bd99a84e34891f2bd4c9152ddeb74e971accccbc59c0f0301f11f08a32d46",
    },
    arm64: {
      file: "uv-aarch64-pc-windows-msvc.zip",
      sha256: "a37c8e96cb1260488c8510b64c848533a3a82a2fdf9e905de7c2700ceebf6437",
    },
  }
  const release = releases[process.arch]
  if (!release) throw new Error(`managed_uv_platform_unsupported:win32-${process.arch}`)
  return {
    ...release,
    url: `https://releases.astral.sh/github/uv/releases/download/${UV_VERSION}/${release.file}`,
  }
}

function managedEnvironment() {
  return {
    ...process.env,
    PATH: `${uvDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
    UV_CACHE_DIR: path.join(work, "cache", "uv"),
    UV_PYTHON_INSTALL_DIR: path.join(work, "tools", "uv-python"),
  }
}

function verifyUv() {
  const version = capture(uv, ["--version"])
  if (version !== `uv ${UV_VERSION}` && !version.startsWith(`uv ${UV_VERSION} `)) {
    throw new Error(`managed_uv_version_mismatch:${version}`)
  }
}

function verifyVersion(name, value, minimumMajor) {
  const major = Number(value.replace(/^v/, "").split(".")[0])
  if (!Number.isInteger(major) || major < minimumMajor) {
    throw new Error(`${name}_version_unsupported:${value}:requires_${minimumMajor}`)
  }
}

function capture(program, args) {
  const result = spawnSync(program, args, { cwd: root, encoding: "utf8" })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim()
    throw new Error(`setup_command_failed:${program}:${result.status}:${details}`)
  }
  return result.stdout.trim()
}

function run(program, args, environment = process.env) {
  const result = spawnSync(program, args, { cwd: root, env: environment, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`setup_command_failed:${program}:${result.status}`)
}
