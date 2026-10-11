import { readFile, writeFile, mkdir, mkdtemp, unlink, access } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { directory, root, linuxPath, units, wsl, binaries } from './paths.ts'
import { configure } from './settings.ts'

const exists = (file: string) => access(file).then(() => true, () => false)
const ownedFiles = ['prepared.json', 'environment.json', 'service-owner.json', 'traefik.yaml', 'routes.yaml',
  'haproxy.cfg', 'edge-endpoint.json', 'bouncer.key']

function configurationFiles(base: string): string[] {
  // WHY：cscli维护POSIX Hub符号链接，Windows不能复制；由WSL核内部归属，tar保留原链接。
  return z.array(z.string()).parse(JSON.parse(wsl(['/usr/bin/python3', '-I', '-c', `import os,json,sys
from pathlib import Path
base=Path(sys.argv[1]); result=[]
for section in ('config','tls'):
 root=base/section
 if root.is_symlink(): raise ValueError('relocate_configuration_link')
 for folder,dirs,files in os.walk(root,followlinks=False):
  for name in dirs+files:
   p=Path(folder)/name
   if not p.resolve().is_relative_to(base.resolve()): raise ValueError('relocate_configuration_link')
   if p.is_file() or p.is_symlink(): result.append(p.relative_to(base).as_posix())
print(json.dumps(result))`, base], true)))
}

export async function relocate(from: string, configureCurrent = configure) {
  if (!path.isAbsolute(from) || path.resolve(from) === path.resolve(root)) throw Error('relocate_source_invalid')
  const before = JSON.parse(await readFile(path.join(directory, 'prepared.json'), 'utf8'))
  const owner = z.object({ root: z.string(), base: z.string(), units: z.array(z.string()) })
    .parse(JSON.parse(await readFile(path.join(directory, 'service-owner.json'), 'utf8')))
  if (before.base !== linuxPath(directory) || before.checkout !== linuxPath(from)
    || path.resolve(owner.root) !== path.resolve(from) || owner.base !== before.base
    || JSON.stringify(owner.units) !== JSON.stringify(units)) throw Error('relocate_owner_changed')
  for (const unit of [...units, 'bat-antibot-presence', 'bat-antibot-window-test']) {
    const status = wsl(['systemctl', '--user', 'show', `${unit}.service`, '--property=ActiveState,MainPID'], true)
    if (!/ActiveState=(inactive|failed)\b/.test(status) || !/MainPID=0\b/.test(status)) throw Error('stop_lab_before_relocating')
  }
  const secrets = z.object({ bouncer: z.string().length(64), master: z.string().length(64) })
    .parse(JSON.parse(await readFile(path.join(directory, 'secrets.json'), 'utf8')))
  await mkdir(path.join(directory, 'reports'), { recursive: true })
  const out = await mkdtemp(path.join(directory, 'reports/relocate-'))
  const snapshot = linuxPath(path.join(out, 'before.tar'))
  const originals = new Set(configurationFiles(before.base))
  const present = new Set<string>()
  for (const file of ['config', 'tls', ...ownedFiles]) {
    if (!await exists(path.join(directory, file))) continue
    present.add(file)
  }
  wsl(['tar', '-C', before.base, '-cf', snapshot, ...present], true)
  try {
    // WHY：只重定位源码/配置归属；不回滚spent/配额数据库，不复制或清空业务历史。
    await configureCurrent(before.base, linuxPath(root), secrets)
    await writeFile(path.join(directory, 'prepared.json'), JSON.stringify({ ...before, checkout: linuxPath(root) }, null, 2))
    await writeFile(path.join(directory, 'service-owner.json'), JSON.stringify({ ...owner, root }, null, 2))
    wsl([binaries(before.base).crowdsec, '-c', `${before.base}/config/config.yaml`, '-t'], true)
    await writeFile(path.join(out, 'result.json'), JSON.stringify({ from, to: root, data: directory, relocated: true, historicalDatabasesPreserved: true }, null, 2))
    return { evidence: out, relocated: true, root, directory }
  } catch (error) {
    const added = configurationFiles(before.base).filter(file => !originals.has(file))
    if (added.length) wsl(['rm', '--', ...added.map(file => `${before.base}/${file}`)], true)
    wsl(['tar', '-C', before.base, '-xf', snapshot], true)
    for (const file of ownedFiles) if (!present.has(file) && await exists(path.join(directory, file))) await unlink(path.join(directory, file))
    await writeFile(path.join(out, 'restored.json'), JSON.stringify({ restored: true, originalOwner: owner.root,
      historicalDatabasesPreserved: true, reason: error instanceof Error ? error.message : 'relocate_failed' }, null, 2))
    throw error
  }
}
