import { readFile, writeFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { z } from 'zod'

const row = z.array(z.number().finite()).max(8)
const channel = z.array(row).max(15_000)
const interactions = z.object({
  m: channel, c: channel, k: channel, s: channel, tc: channel, ac: channel, gy: channel, or: channel,
  ev: channel, bc: z.array(row).max(100), bl: z.array(z.string().max(40)).max(20),
  ttfi: z.number().nonnegative(), dur: z.number().min(0).max(600_000),
  meta: z.object({ hasTouchScreen: z.boolean().optional(), hasMotionSensors: z.boolean().optional(),
    sensorPermissionRequired: z.boolean().optional() }).strict(),
}).strict()
export const humanSample = z.object({
  phase: z.number().int().min(0).max(2), data: interactions,
  audit: z.array(z.object({ type: z.enum(['input', 'beforeinput', 'paste', 'compositionstart', 'compositionend',
    'keydown', 'keyup', 'focus', 'blur']), trusted: z.boolean(), at: z.number().nonnegative(),
    inputType: z.string().max(60), composing: z.boolean(), length: z.number().int().min(0).max(2000) }).strict()).max(5000),
  hidden: z.boolean(), counts: z.record(z.string().max(30), z.number().nonnegative()),
}).strict()

export async function humanAsset(base: string, name: string) {
  if (name === 'collector.js') {
    const data = await readFile(`${base}/runtime/motion/package/src/collector.js`)
    if (createHash('sha256').update(data).digest('hex') !== '50dd6c2b935fe8a338275c32b4868d190b65519119c340bb1755fee2342f2bc6') throw Error('collector_changed')
    return data
  }
  return readFile(new URL('./tests/human-page.html', import.meta.url))
}

export async function saveHuman(base: string, id: string, raw: unknown) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw Error('invalid_human_session')
  const directory = `${base}/reports/human-${id}`
  const owner = JSON.parse(await readFile(`${directory}/owner.json`, 'utf8'))
  if (owner.purpose !== 'consented-human-baseline' || owner.controlConnected !== false) throw Error('human_owner_changed')
  if (await access(`${directory}/closed.json`).then(() => true, () => false)) throw Error('human_session_closed')
  const sample = humanSample.parse(raw)
  // WHY：不接收按键内容、输入值或剪贴板文本；原始时序只留在忽略的本地实验目录。
  await writeFile(`${directory}/phase-${sample.phase}.json`, JSON.stringify({ ...sample, receivedAt: new Date().toISOString() }), { flag: 'wx' })
  return { saved: true, phase: sample.phase }
}
