import { readFile, realpath, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"

const processIdentitySchema = z.object({ pid: z.number().int().positive(), started: z.number().positive(),
  executable: z.string().min(1) }).strict()
export const runnerOwnershipSchema = processIdentitySchema.extend({ ownerId: z.uuid(),
  temporaryDirectory: z.string().min(1), launcher: processIdentitySchema }).strict()
export type RunnerOwnership = z.infer<typeof runnerOwnershipSchema>

export async function ownedRunnerDirectory(raw: RunnerOwnership) {
  const owner = runnerOwnershipSchema.parse(raw), directory = path.resolve(owner.temporaryDirectory)
  // WHY：恢复回执不能授权任意路径删除；只接受系统临时根的本次目录，且目录内身份必须逐字段相符。
  const root = await realpath(tmpdir())
  if (!path.isAbsolute(owner.temporaryDirectory) || path.dirname(directory) !== path.resolve(tmpdir())
    || !path.basename(directory).startsWith("bat-hybrid-owner-")) throw new Error("profile_temporary_owner_invalid")
  try { await stat(directory) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
  const resolved = await realpath(directory)
  if (path.dirname(resolved) !== root || resolved !== directory) throw new Error("profile_temporary_owner_invalid")
  const recorded = runnerOwnershipSchema.parse(JSON.parse(await readFile(path.join(directory, "runner-owner.json"), "utf8")))
  if (JSON.stringify(recorded) !== JSON.stringify(owner)) throw new Error("profile_temporary_owner_invalid")
  return directory
}
