// 只复用成熟库的公开路径函数；不创建/连接浏览器，也不运行其 Puppeteer 控制器。
import { path } from 'ghost-cursor'
import { z } from 'zod'

const point = z.object({ x: z.number().finite().min(0).max(16_384), y: z.number().finite().min(0).max(16_384) }).strict()
const input = z.object({ start: point, end: point }).strict().parse(JSON.parse(process.argv[2] ?? '{}'))
const distance = Math.hypot(input.end.x - input.start.x, input.end.y - input.start.y)
if (distance < 2) process.stdout.write('[]')
else {
  // 原默认时间策略；指定 moveSpeed 的短路径出现整段零时间，故不冻结该候选参数。
  const points = path(input.start, input.end, { useTimestamps: true })
  const result = points.map(({ x, y, timestamp }) => ({ x, y, at: timestamp - points[0].timestamp }))
  const route = z.array(point.extend({ at: z.number().finite().min(0).max(8000) }).strict()).min(2).max(256).parse(result)
  if (route.some((p, i) => i && p.at < route[i - 1].at)) throw Error('trajectory_clock_invalid')
  const last = route.at(-1)
  if (Math.hypot(last.x - input.end.x, last.y - input.end.y) > 0.01) throw Error('trajectory_endpoint_invalid')
  let previous = -Infinity
  const frames = route.filter((p, i) => {
    if (i === route.length - 1 || p.at - previous >= 16) { previous = p.at; return true }
    return false
  })
  process.stdout.write(JSON.stringify(frames))
}
