import { spawn } from 'node:child_process'
import { root, wsl } from './paths.ts'

/** WHY：复用现有 WSL 等待客户端；Linux/systemd 不能自行保证 WSL 发行版常驻。 */
export function ensureWslPresence(base: string) {
  if (process.platform !== 'win32') return
  let active = false
  try { active = wsl(['systemctl', '--user', 'is-active', 'bat-antibot-presence.service'], true).trim() === 'active' } catch { /* inactive */ }
  if (active) {
    if (wsl(['systemctl', '--user', 'show', 'bat-antibot-presence.service', '--property=WorkingDirectory', '--value'], true).trim() !== base)
      throw Error('presence_owner_changed')
    return
  }
  const child = spawn('wsl', ['-d', 'Ubuntu', '--exec', 'systemd-run', '--user', '--wait', '--collect',
    '--unit', 'bat-antibot-presence', '--property', `WorkingDirectory=${base}`, '/usr/bin/sleep', 'infinity'],
    { cwd: root, windowsHide: true, detached: true, stdio: 'ignore' })
  child.unref()
}
