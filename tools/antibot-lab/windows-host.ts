import { execFileSync } from 'node:child_process'
import { root } from './locations.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { trustLocalhost } from './trusted-tls.ts'
import { linuxPath, units, wsl } from './paths.ts'
import { privateLinuxAddress } from './linux-network.ts'
import { ensureWslPresence } from './wsl-presence.ts'

// Thin host entry for an independently installed Linux package; no global WSL shutdown.
if (process.platform !== 'win32') throw Error('windows_host_required')
const destination = process.argv[2], command = process.argv[3] ?? 'status'
if (!destination?.startsWith('/') || /[\r\n\x00]/.test(destination) || destination.split('/').includes('..'))
  throw Error('absolute_linux_install_directory_required')
if (command === 'trust-localhost') {
  const owner = JSON.parse(wsl(['cat', destination + '/install-owner.json'], true))
  if (owner.destination !== destination || !/^[a-f0-9]{64}$/.test(owner.releaseSha256)) throw Error('install_owner_changed')
  const active = wsl(['systemctl', '--user', 'show', ...units.map(unit => unit + '.service'), '--property=ActiveState', '--value'], true)
  if (active.trim().split(/\s+/).includes('active')) throw Error('stop_lab_before_trusting_localhost')
  const stage = await mkdtemp(path.join(tmpdir(), 'bat-shield-certificate-'))
  try {
    const receipt = await trustLocalhost(linuxPath(stage), privateLinuxAddress(), stage)
    const tls = destination + '/data/tls'
    wsl(['mkdir', '-p', tls], true)
    for (const file of ['cert.pem', 'key.pem', 'rootCA.pem', 'trusted.json']) wsl(['cp', linuxPath(path.join(stage, 'tls', file)), tls + '/' + file], true)
    wsl(['chmod', '600', tls + '/key.pem'], true)
    console.log(JSON.stringify(receipt))
  } finally { await rm(stage, { recursive: true, maxRetries: 5, retryDelay: 100 }) }
} else {
  if (!['start', 'status', 'stop', 'metrics', 'alerts', 'refresh-source-data', 'refresh-geodata'].includes(command)) throw Error('unsupported_host_command')
  execFileSync('wsl', ['-d', 'Ubuntu', '--exec', destination + '/shield.sh', command], { cwd: root, stdio: 'inherit' })
  if (command === 'start') ensureWslPresence(destination + '/data')
}
