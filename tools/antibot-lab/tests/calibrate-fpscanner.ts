import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import path from 'node:path'
import { directory } from '../paths.ts'
import { fingerprintBundle } from '../fingerprint.ts'

const file = 'runtime/crowdsec-909b5157986a2b2c2163300fdaef5ed01289f7d2/pkg/appsec/challenge/js/fpscanner/fpscanner.js'
const code = await readFile(path.join(directory, file), 'utf8')
await fingerprintBundle(directory)
const context = vm.createContext({})
vm.runInContext(code, context)
const scanner = vm.runInContext('new CrowdsecFingerprintScanner()', context)
const baseline = { signals: {
  automation: { webdriver: false, webdriverWritable: false, selenium: false, cdp: false, playwright: false },
  device: { memory: 8, cpuCount: 8, platform: 'Win32', screenResolution: { width: 1920, height: 1080 } },
  browser: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36',
    features: { chrome: true }, etsl: 33, highEntropyValues: { platform: 'Windows' } },
  contexts: { iframe: { webdriver: false, platform: 'Win32', userAgent: 'Chrome' },
    webWorker: { webdriver: false, platform: 'Win32', userAgent: 'Chrome', vendor: 'Google', renderer: 'ANGLE' } },
  graphics: { webGL: { vendor: 'Google', renderer: 'ANGLE' }, webgpu: { vendor: 'intel' } },
  locale: { internationalization: { timezone: 'Asia/Shanghai' }, languages: { language: 'zh-CN', languages: ['zh-CN'] } },
} }
const vectors: Record<string, [string, unknown]> = {
  headlessChromeScreenResolution: ['device.screenResolution', { width: 800, height: 600 }],
  hasWebdriver: ['automation.webdriver', true], hasWebdriverWritable: ['automation.webdriverWritable', true],
  hasSeleniumProperty: ['automation.selenium', true], hasCDP: ['automation.cdp', true], hasPlaywright: ['automation.playwright', true],
  hasImpossibleDeviceMemory: ['device.memory', 128], hasHighCPUCount: ['device.cpuCount', 128],
  hasMissingChromeObject: ['browser.features.chrome', false], hasWebdriverIframe: ['contexts.iframe.webdriver', true],
  hasWebdriverWorker: ['contexts.webWorker.webdriver', true], hasMismatchWebGLInWorker: ['contexts.webWorker.renderer', 'other'],
  hasMismatchPlatformIframe: ['contexts.iframe.platform', 'Linux'], hasMismatchPlatformWorker: ['contexts.webWorker.platform', 'Linux'],
  hasSwiftshaderRenderer: ['graphics.webGL.renderer', 'SwiftShader'], hasUTCTimezone: ['locale.internationalization.timezone', 'UTC'],
  hasMismatchLanguages: ['locale.languages.language', 'en-US'], hasInconsistentEtsl: ['browser.etsl', 37],
  hasBotUserAgent: ['browser.userAgent', 'HeadlessChrome'], hasGPUMismatch: ['graphics.webgpu.vendor', 'apple'],
  hasPlatformMismatch: ['device.platform', 'Linux'],
}
function sample(key: string, value: unknown) {
  const result = structuredClone(baseline), parts = key.split('.')
  let target: any = result.signals
  for (const part of parts.slice(0, -1)) target = target[part]
  target[parts.at(-1)!] = value
  return result
}
const results = []
for (const rule of scanner.getDetectionRules()) {
  const vector = vectors[rule.name]; assert.ok(vector, `unknown-rule:${rule.name}`)
  assert.ok(!rule.test(baseline), `${rule.name}:normal`)
  assert.ok(rule.test(sample(...vector)), `${rule.name}:positive`)
  const invalid = []
  for (const value of ['ERROR', 'INIT', 'SKIPPED', 'NA']) {
    try { invalid.push({ value, rawDetected: Boolean(rule.test(sample(vector[0], value))), validity: 'unavailable' }) }
    catch { invalid.push({ value, rawDetected: null, validity: 'error' }) }
  }
  results.push({ name: rule.name, positive: true, normal: true, invalid })
}
assert.equal(results.length, 21)
await writeFile(path.join(directory, 'reports/fpscanner-calibration.json'), JSON.stringify({
  source: file, sha256: createHash('sha256').update(code).digest('hex'),
  kind: 'rule-vectors-not-human-samples', results,
  limitation: 'raw false/true on invalid inputs is not a valid bot verdict; 800x600/UTC/SwiftShader may be legitimate',
}, null, 2))
console.log(JSON.stringify({ passed: results.length, invalidInputsRecorded: true }))
