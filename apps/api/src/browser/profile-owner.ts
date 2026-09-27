import { readFile, rename, rm, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { runnerOwnershipSchema } from "../upstream-browser/runner-ownership.js"
import { runnerCleanupReportSchema } from "../upstream-browser/cleanup.js"

export const profileOwnerSchema = z.object({
  schemaVersion: z.literal("bat-profile-owner/v1"), ownerId: z.uuid(), profilePath: z.string().min(1),
  createdAt: z.string().datetime(), runner: runnerOwnershipSchema.nullable(), cleanup: runnerCleanupReportSchema.nullable(),
}).strict().refine((owner) => !owner.runner || owner.runner.ownerId === owner.ownerId, "profile owner mismatch")
export type ProfileOwner = z.infer<typeof profileOwnerSchema>

export async function readProfileOwner(file: string): Promise<ProfileOwner> {
  const body = await readFile(file, "utf8")
  if (!body.trim()) throw new Error("browser_profile_legacy_owner_unknown")
  return profileOwnerSchema.parse(JSON.parse(body))
}

export async function saveProfileOwner(file: string, owner: ProfileOwner, create = false) {
  const body = JSON.stringify(profileOwnerSchema.parse(owner))
  if (create) { await writeFile(file, body, { flag: "wx" }); return }
  const temporary = `${file}.${randomUUID()}.tmp`
  try { await writeFile(temporary, body, { flag: "wx" }); await rename(temporary, file) }
  finally { await rm(temporary, { force: true }) }
}
