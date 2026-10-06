const key = "bat.replay.nodeDelayMs"
const valid = (value: number) => Number.isInteger(value) && value >= 0 && value <= 5000 && value % 200 === 0

export function readReplayPacing(storage?: Pick<Storage, "getItem">) {
  try {
    const saved = (storage ?? localStorage).getItem(key)
    const value = saved === null ? 1600 : Number(saved)
    return valid(value) ? value : 1600
  } catch { return 1600 }
}
export function saveReplayPacing(value: number, storage?: Pick<Storage, "setItem">) {
  if (!valid(value)) return
  try { (storage ?? localStorage).setItem(key, String(value)) } catch { /* 本地存储不可用时仍可运行。 */ }
}
