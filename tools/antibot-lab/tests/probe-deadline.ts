// 只约束测量等待，不把超时当作阴性，也不声称取消不支持AbortSignal的原库。
export const probeTimeout = Symbol('probe-timeout')

export async function boundedProbe<T>(collect: () => Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([collect(), new Promise<typeof probeTimeout>(resolve => {
      timer = setTimeout(() => resolve(probeTimeout), 4000)
    })])
  } finally { clearTimeout(timer) }
}

export async function probeState<T>(collect: () => Promise<T>) {
  try {
    const value = await boundedProbe(collect)
    return value === probeTimeout ? { validity: 'timeout', value: undefined }
      : { validity: value ? 'measured' : 'unavailable', value }
  } catch { return { validity: 'error', value: undefined } }
}
