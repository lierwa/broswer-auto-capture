import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// WHY：原库吞掉枚举异常后返回[]；只导出该次catch事实，不能用空数组假报完整测量。
export function fontDiagnostics(typescript) {
  return { name: 'owned-creep-font-diagnostics', load(id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/fonts/index.ts')) return null
    const source = readFileSync(id, 'utf8')
    if (createHash('sha256').update(source).digest('hex') !== 'ce2bcefd13e41cef79bfdf63634ad17ca7f641ee2e88c0ef720c2d38938dbf11') {
      throw Error('creep_fonts_source_changed')
    }
    const code = source.replace('export default async function getFonts() {',
      'export default async function getFonts() {\n\tlet fontEnumerationError = false, fontEmojiError = false, fontEnumerationTimeout = false')
      .replace('console.error(error)\n\t\t\treturn {\n\t\t\t\temojiSet: [],',
        'fontEmojiError = true\n\t\t\tconsole.error(error)\n\t\t\treturn {\n\t\t\t\temojiSet: [],')
      .replace('const getFontFaceLoadFonts = async (fontList: string[]) => {',
        'const getFontFaceLoadFonts = async (fontList: string[]) => {\n\t\tlet fontTimer')
      // WHY：采集截止不是bot判据；原allSettled保留，超时只撤销本次完整测量声明。
      .replace('const responseCollection = await Promise\n\t\t\t\t.allSettled(fontFaceList.map((font) => font.load()))',
        `const responseCollection = await Promise.race([
          Promise.allSettled(fontFaceList.map((font) => font.load())),
          new Promise<undefined>(resolve => { fontTimer = setTimeout(() => resolve(undefined), 3000) }),
        ])
        if (!responseCollection) { fontEnumerationTimeout = true; return [] }`)
      .replace('console.error(error)\n\t\t\treturn []', 'fontEnumerationError = true\n\t\t\tconsole.error(error)\n\t\t\treturn []')
      .replace('return []\n\t\t}\n\t}', 'return []\n\t\t} finally { clearTimeout(fontTimer) }\n\t}')
      .replace('\n\t\t\tfontFaceLoadFonts,', '\n\t\t\tfontFaceLoadFonts,\n\t\t\tfontEnumerationError, fontEmojiError, fontEnumerationTimeout,')
    return { code: typescript.transpileModule(code, { compilerOptions: {
      target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext,
    } }).outputText, map: null }
  } }
}
