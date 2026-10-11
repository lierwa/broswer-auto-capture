import { access, cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash, X509Certificate } from 'node:crypto'
import {checkServerIdentity} from 'node:tls'
import path from 'node:path'
import { directory, root, linuxPath, wsl } from './paths.ts'

const version = '1.4.4'
const digest = 'd2660b50a9ed59eada480750561c96abc2ed4c9a38c6a24d93e30e0977631398'
const url = `https://github.com/FiloSottile/mkcert/releases/download/v${version}/mkcert-v${version}-windows-amd64.exe`
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const exists = (file: string) => access(file).then(() => true, () => false)

// WHY：证书生成与系统信任复用 mkcert；只拥有部署适配，不自建 CA/签发器或关闭校验。
export async function trustLocalhost(base: string) {
  if (process.platform !== 'win32' || process.arch !== 'x64' || !process.env.LOCALAPPDATA) throw Error('local_trust_requires_windows_x64')
  const tool = path.join(directory, 'runtime/mkcert/mkcert.exe'),folder = path.join(directory, 'tls')
  await mkdir(path.dirname(tool), { recursive: true });await mkdir(folder, { recursive: true })
  if (!(await exists(tool))) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw Error(`mkcert_download_failed:${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (sha256(bytes) !== digest) throw Error('mkcert_binary_digest_mismatch')
    await writeFile(tool, bytes, { flag: 'wx' })
  }
  if (sha256(await readFile(tool)) !== digest) throw Error('mkcert_binary_digest_mismatch')
  // WHY：CA 私钥仅留本机用户目录，不放源码、报告、发布包或可搬迁的服务数据。
  const caRoot = path.join(process.env.LOCALAPPDATA, 'BATShield/mkcert-ca')
  const env = { ...process.env, CAROOT: caRoot, TRUST_STORES: 'system' }
  const run = (args: string[]) => execFileSync(tool,args,{cwd:root,env,windowsHide:true,encoding:'utf8',stdio:'pipe'})
  run(['-install'])
  const nextCert = path.join(folder,'localhost-next.pem'),nextKey = path.join(folder,'localhost-next-key.pem')
  const names=['localhost','shield.localhost','*.shield.localhost','127.0.0.1','::1']
  run(['-cert-file',nextCert,'-key-file',nextKey,...names])
  const publicRoot = await readFile(path.join(caRoot,'rootCA.pem')),leaf = new X509Certificate(await readFile(nextCert))
  const ca = new X509Certificate(publicRoot)
  // WHY：*.localhost 的顶级通配符不能通过严格主机名验证；真实会话使用 *.shield.localhost。
  if (!leaf.verify(ca.publicKey) || checkServerIdentity('localhost',leaf.toLegacyObject())
    || checkServerIdentity('owned.shield.localhost',leaf.toLegacyObject())
    || !leaf.checkIP('127.0.0.1') || !leaf.checkIP('::1')) throw Error('local_certificate_verification_failed')
  const previous = path.join(folder,'previous-'+Date.now())
  await mkdir(previous)
  for (const name of ['cert.pem','key.pem','edge.pem','rootCA.pem','trusted.json']) {
    if (await exists(path.join(folder,name))) await cp(path.join(folder,name),path.join(previous,name),{errorOnExist:true,force:false})
  }
  await rename(nextCert,path.join(folder,'cert.pem'));await rename(nextKey,path.join(folder,'key.pem'))
  await writeFile(path.join(folder,'rootCA.pem'),publicRoot)
  wsl(['chmod','600',`${base}/tls/key.pem`],true)
  // 不向 WSL 系统信任库复制 CA；各检测进程使用自己的显式公开 CA 链。
  const receipt = {owner:'bat-antibot-lab',provider:'mkcert',version,binarySha256:digest,
    certificateSha256:sha256(await readFile(path.join(folder,'cert.pem'))),rootSha256:sha256(publicRoot),
    validTo:leaf.validTo,trustStore:'Windows current user ROOT',names,
    caPrivateKeyInServiceData:false,caRoot:linuxPath(caRoot),createdAt:new Date().toISOString()}
  await writeFile(path.join(folder,'trusted.json'),JSON.stringify(receipt,null,2)+'\n')
  return {provider:receipt.provider,version,certificateSha256:receipt.certificateSha256,trustStore:receipt.trustStore,validTo:receipt.validTo}
}
