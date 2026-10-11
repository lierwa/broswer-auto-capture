import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

export const root = path.dirname(fileURLToPath(import.meta.url))
// WHY：源码归独立包；本地数据显式选择，不从调用者cwd猜B-A-T目录。
export function dataDirectory(source = root, environment = process.env) {
  let configured
  try {
    const value = JSON.parse(readFileSync(path.join(source, 'local.json'), 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => key !== 'dataDirectory')
      || typeof value.dataDirectory !== 'string' || !value.dataDirectory.trim()) throw Error('lab_local_config_invalid')
    configured = value.dataDirectory
  } catch (error) { if (error?.code !== 'ENOENT') throw error }
  const selected = environment.BAT_ANTIBOT_DATA ?? configured ?? '.local'
  if (typeof selected !== 'string' || !selected.trim()) throw Error('lab_data_directory_invalid')
  return path.resolve(source, selected)
}
export const directory = dataDirectory()

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({ root, directory }))
}
