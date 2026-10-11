// 固定研究探针的导出模块；不引入其主站上传/预测入口。输出只有状态，不持久化指纹。
import { boundedProbe, probeTimeout } from './probe-deadline'
import canvas from '@creep/canvas/index'
import webgl from '@creep/webgl/index'
import audio from '@creep/audio/index'
import fonts from '@creep/fonts/index'
import media from '@creep/media/index'
import { getLies, prototypeLies } from '@creep/lies/index'
import { getCapturedErrors } from '@creep/errors/index'
import { getTrash } from '@creep/trash/index'

function webglVerdict(value: Record<string, unknown> | undefined, start: number) {
  if (!Array.isArray(value?.pixels) || !Array.isArray(value?.pixels2)) return { validity: 'unavailable', mismatch: null }
  return { validity: 'measured', mismatch: getTrash().trashBin.slice(start)
    .some((item: { name: string }) => item.name === 'webgl/webgl2 mirrored params mismatch') }
}

// WHY：在线只运行已校准原判据；不因未测试的其它能力哈希异常扩大在线处置范围。
export async function webglIntegrity() {
  const version = '10aa6724cd33a1015db1574211890518cd04f0cc'
  const start = getTrash().trashBin.length
  try { return { version, ...webglVerdict(await webgl() as unknown as Record<string, unknown> | undefined, start) } }
  catch { return { version, validity: 'error', mismatch: null } }
}

function fontEnumerationValidity(): 'measured' | 'unavailable' | 'error' {
  // WHY：原库内部把能力缺失也折叠为[]；空清单本身仍可能是有效的隐私环境测量。
  try {
    return typeof globalThis.FontFace === 'function' && typeof globalThis.FontFace.prototype.load === 'function'
      && typeof document.fonts?.check === 'function' ? 'measured' : 'unavailable'
  } catch { return 'error' }
}

export async function probe() {
  const observations: Record<string, unknown> = {}
  const advisoryStart = getTrash().trashBin.length
  let webglComparison: { validity: string; mismatch: boolean | null } = { validity: 'unavailable', mismatch: null }
  for (const [name, collect] of Object.entries({ canvas, webgl, audio, fonts, media })) {
    try {
      let fontValidity: string = name === 'fonts' ? fontEnumerationValidity() : 'measured'
      // WHY：某个原生API永不完成时只使本项无效，不能让后续独立探针一起消失。
      // 超时不是bot判据；原库不支持取消，页面生命周期负责释放底层上下文。
      const collected = await boundedProbe(collect)
      if (collected === probeTimeout) {
        observations[name] = { validity: 'timeout', fields: {}, lied: null }
        continue
      }
      const value = collected as Record<string, unknown> | undefined
      if (name === 'fonts' && fontValidity === 'measured' && value?.fontEnumerationError === true) fontValidity = 'error'
      if (name === 'fonts' && value?.fontEnumerationTimeout === true) fontValidity = 'timeout'
      const emojiError = name === 'fonts' && value?.fontEmojiError === true
      // WHY：原跨API矛盾进入trash而非lied；没有两种上下文的测量不能输出正常阴性。
      if (name === 'webgl') webglComparison = webglVerdict(value, advisoryStart)
      const fields = value ? Object.fromEntries(Object.entries(value).filter(([key]) => !['fontEnumerationError', 'fontEmojiError', 'fontEnumerationTimeout'].includes(key)).map(([key, field]) =>
        [key, field == null ? 'unavailable' : 'measured'])) : {}
      if (name === 'fonts' && fontValidity !== 'measured') {
        for (const key of ['fontFaceLoadFonts', 'platformVersion', 'apps', 'lied']) fields[key] = fontValidity
      }
      if (emojiError) {
        for (const key of ['emojiSet', 'pixelSizeSystemSum', 'lied']) fields[key] = 'error'
      }
      observations[name] = { validity: !value || name === 'media' && !Array.isArray(value.mimeTypes) ? 'unavailable'
        : fontValidity !== 'measured' || emojiError ? 'partial' : 'measured', fields,
        lied: fontValidity === 'measured' && !emojiError && (typeof value?.lied === 'boolean' || typeof value?.lied === 'number') ? value.lied : null }
    } catch { observations[name] = { validity: 'error', lied: null } }
  }
  return { version: '10aa6724cd33a1015db1574211890518cd04f0cc', observations, prototypeLies,
    webglComparison, advisoryRules: [...new Set(getTrash().trashBin.slice(advisoryStart).map((item: { name: string }) => item.name))],
    lies: getLies(), errorNames: getCapturedErrors().data.map((e: { trustedName?: string }) => e.trustedName ?? 'unknown'),
    rawFingerprintPersisted: false, humanIdentityProven: false }
}
