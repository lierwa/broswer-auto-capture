/** WHY：只提取用户给出的 URL 语法，不判断“允许/禁止”的语义；是否授权由同版草案的访问范围确认。 */
export function providedSourceUrls(text: string, previous: string[]) {
  const full = text.match(/https?:\/\/[^\s<>"'“”‘’)`，。；]+/gu) ?? []
  const urls = full.flatMap(raw => { try { return [new URL(raw)] } catch { return [] } })
  const contexts = [...urls, ...previous.flatMap(raw => { try { return [new URL(raw)] } catch { return [] } })]
  const remaining = full.reduce((value, raw) => value.replaceAll(raw, ""), text)
  for (const match of remaining.matchAll(/\*\.[a-zA-Z0-9.-]+(?::[0-9]{1,5})?/gu)) {
    const host = match[0].replace(/\.+$/u, "")
    const port = host.match(/:([0-9]+)$/u)?.[1] ?? ""
    const schemes = new Set(contexts.filter(url => url.port === port).map(url => url.protocol))
    // 缺协议只能从用户实际提供且端口一致的唯一协议补全；歧义留在访谈，不能猜成 http/https 双授权。
    if (schemes.size === 1) urls.push(new URL(`${[...schemes][0]}//${host}/`))
  }
  return urls.filter(url => ["http:", "https:"].includes(url.protocol) && !url.username && !url.password)
}
