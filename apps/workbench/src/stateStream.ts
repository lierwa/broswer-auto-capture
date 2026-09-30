/** WHY：访谈与工作台共享原生流读取；取消释放 reader，不复制另一套连接解析器。 */
export async function* jsonLines(response: Response, signal: AbortSignal) {
  if (!response.ok || !response.body) throw new Error("无法连接状态流")
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener("abort", cancel, { once: true })
  let buffer = ""
  try {
    while (!signal.aborted) {
      const chunk = await reader.read()
      buffer += chunk.value ?? ""
      const lines = buffer.split("\n"); buffer = lines.pop() ?? ""
      for (const line of lines) if (line.trim() && !signal.aborted) yield JSON.parse(line) as unknown
      if (chunk.done) break
    }
    if (!signal.aborted && buffer.trim()) throw new Error("状态流未完整接收")
  } finally {
    signal.removeEventListener("abort", cancel)
    await reader.cancel().catch(() => {}); reader.releaseLock()
  }
}

export function reconnect(signal: AbortSignal, failures: number) {
  if (signal.aborted) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve() }
    const timer = setTimeout(done, Math.min(30_000, 1200 * 2 ** Math.min(failures, 5)))
    signal.addEventListener("abort", done, { once: true })
  })
}
