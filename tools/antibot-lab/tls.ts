import { mkdir, access } from "node:fs/promises"
import path from "node:path"
import { directory, wsl } from "./paths.ts"

export async function configureTls(base: string) {
  const folder = path.join(directory, "tls")
  await mkdir(folder, { recursive: true })
  const key = `${base}/tls/key.pem`, cert = `${base}/tls/cert.pem`
  const exists = await access(path.join(folder, "cert.pem")).then(() => true, () => false)
  if (exists) {
    // WHY：不自动轮换仍被使用的证书；过期必须明确暴露，不能以关闭校验冒充真实信任。
    wsl(["openssl", "x509", "-checkend", "86400", "-noout", "-in", cert], true)
    return { keyFile: key, certFile: cert }
  }
  wsl(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-noenc", "-days", "30",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1",
    "-keyout", key, "-out", cert], true)
  wsl(["chmod", "600", key], true)
  return { keyFile: key, certFile: cert }
}
