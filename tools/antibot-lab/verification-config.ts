import {readFile,writeFile,unlink} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import path from 'node:path'
import {directory,hubCommit,linuxPath,wsl} from './paths.ts'

const marker = '# SHIELD verification audit; original balanced rules retained\n'
export function verificationConfig(original: string) {
  if (createHash('sha256').update(original).digest('hex') !== 'fa54cfda9b864b02fe148760b30d25167ed7771859d55d4169eb67201ac8ada4')
    throw Error('balanced_upstream_changed')
  // WHY：原 terminal RejectSubmission 后追加原 LogAccepted；不增加放行、豁免、评分或概率规则。
  return marker + original.trimEnd() + '\n    - filter: req.URL.Path startsWith "/shield/verify/" && !fingerprint.Allowlisted\n'
    + '      apply:\n        - \'LogAccepted("shield-accepted:" + req.Host + req.URL.Path + ":score=" + string(RequestScore()), "minimal")\'\n'
}

export async function configureVerification(engineActive: boolean) {
  const source = path.join(directory,`runtime/hub/hub-${hubCommit}/appsec-configs/crowdsecurity/appsec-bot-challenge-scoring-balanced.yaml`)
  const target = path.join(directory,'config/appsec-configs/appsec-bot-challenge-scoring-balanced.yaml')
  const generated = verificationConfig((await readFile(source,'utf8')).replace(/\r\n/g,'\n'))
  if (wsl(['cat',linuxPath(target)],true) !== generated) {
    if (engineActive) throw Error('restart_owned_engine_to_apply_verification_audit')
    const pending = path.join(directory,'config/appsec-configs',`.verification-${randomUUID()}.tmp`)
    await writeFile(pending,generated,{flag:'wx'})
    try {
      // 沿用 GeoIP 配置适配：替换 owned 配置别名，不能跟随链接写坏固定 Hub 原件。
      wsl(['python3','-c',`import os,sys
from pathlib import Path
target,pending,source=map(Path,sys.argv[1:4])
assert target.parent.resolve()==pending.parent.resolve() and target.parent.name=='appsec-configs'
if target.is_symlink(): assert target.resolve()==source.resolve()
else: assert target.read_text()==source.read_text() or target.read_text().startswith(sys.argv[4])
os.replace(pending,target)`,linuxPath(target),linuxPath(pending),linuxPath(source),marker],true)
    } finally { await unlink(pending).catch(error => {if (error.code !== 'ENOENT') throw error}) }
  }
  const file = path.join(directory,'routes.yaml'), routes = JSON.parse(await readFile(file,'utf8'))
  const {bouncer} = JSON.parse(await readFile(path.join(directory,'secrets.json'),'utf8'))
  if (!/^[a-f0-9]{64}$/.test(bouncer)) throw Error('verification_gateway_secret_invalid')
  routes.http.routers.verification = {rule:'PathPrefix(`/shield/verify/`) || PathPrefix(`/crowdsec-internal/challenge/`)',
    priority:200,entryPoints:['observation'],tls:{},middlewares:['crowdsec','origin-auth','verification-auth'],service:'site'}
  routes.http.middlewares['origin-auth'].headers.customRequestHeaders['X-Bat-Lab-Verification'] = ''
  routes.http.middlewares['verification-auth'] = {headers:{customRequestHeaders:{'X-Bat-Lab-Verification':bouncer}}}
  const next = JSON.stringify(routes,null,2)
  if (next !== await readFile(file,'utf8')) await writeFile(file,next)
}
