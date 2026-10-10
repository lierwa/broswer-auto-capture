import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { directory } from '../paths.ts'
import { botdBundle, measurementHealth } from '../botd.ts'

await botdBundle(directory)
const { detectors } = await import(pathToFileURL(path.join(directory, 'runtime/botd/package/dist/botd.esm.js')).href)
type Component = { state: number; value?: unknown }
const baseline: Record<string, Component> = Object.fromEntries(Object.entries({ appVersion: 'Chrome',
  documentElementKeys: ['lang'], errorTrace: 'Error', evalLength: 33, browserKind: 'chrome', browserEngineKind: 'chromium',
  functionBind: true, languages: [['zh-CN']], notificationPermissions: false, pluginsArray: true, pluginsLength: 5,
  android: false, process: {}, userAgent: 'Chrome', webDriver: false, webGL: { vendor: 'Google', renderer: 'ANGLE' },
  windowExternal: '', windowSize: { outerWidth: 1280, outerHeight: 900 }, documentFocus: true,
  mimeTypesConsistent: true, productSub: '20030107', distinctiveProps: {},
}).map(([key, value]) => [key, { state: 0, value }]))
const cases: Record<string, [string, unknown]> = {
  detectAppVersion: ['appVersion', 'HeadlessChrome'], detectDocumentAttributes: ['documentElementKeys', ['webdriver']],
  detectErrorTrace: ['errorTrace', 'PhantomJS'], detectEvalLengthInconsistency: ['evalLength', 37],
  detectFunctionBind: ['functionBind', null], detectLanguagesLengthInconsistency: ['languages', []],
  detectNotificationPermissions: ['notificationPermissions', true], detectPluginsArray: ['pluginsArray', false],
  detectPluginsLengthInconsistency: ['pluginsLength', 0], detectProcess: ['process', { type: 'renderer' }],
  detectUserAgent: ['userAgent', 'HeadlessChrome'], detectWebDriver: ['webDriver', true],
  detectWebGL: ['webGL', { vendor: 'Brian Paul', renderer: 'Mesa OffScreen' }], detectWindowExternal: ['windowExternal', 'Sequentum'],
  detectWindowSize: ['windowSize', { outerWidth: 0, outerHeight: 0 }], detectMimeTypesConsistent: ['mimeTypesConsistent', false],
  detectProductSub: ['productSub', 'changed'], detectDistinctiveProperties: ['distinctiveProps', { Selenium: true }],
}
assert.deepEqual(Object.keys(cases).sort(), Object.keys(detectors).sort())
const results = []
for (const [name, [key, value]] of Object.entries(cases)) {
  const detector = detectors[name]
  assert.ok(!detector(baseline), `${name}:normal`)
  const anomaly = structuredClone(baseline)
  anomaly[key] = name === 'detectFunctionBind' ? { state: -2 } : { state: 0, value }
  assert.ok(detector(anomaly), `${name}:positive`)
  const missing = structuredClone(baseline); missing[key] = { state: -3 }
  assert.ok(!detector(missing), `${name}:missing-raw-false`)
  results.push({ name, positive: true, normal: true, missing: 'unavailable-not-negative' })
}
const background = structuredClone(baseline)
background.windowSize!.value = { outerWidth: 0, outerHeight: 0 }; background.documentFocus!.value = false
assert.ok(!detectors.detectWindowSize(background), 'unfocused-tab-normal-counterexample')
assert.deepEqual(measurementHealth({ process: { state: -1, error: 'BotdError: window.process is undefined' } }),
  { absent: ['process'], unavailable: [] })
for (const component of [{ state: -3, error: 'Error: denied' }, { state: -1, error: 'different failure' }])
  assert.deepEqual(measurementHealth({ process: component }), { absent: [], unavailable: ['process'] })
assert.deepEqual(measurementHealth({ languages: { state: -1, error: 'BotdError: window.process is undefined' } }),
  { absent: [], unavailable: ['languages'] })
await writeFile(path.join(directory, 'reports/botd-calibration.json'), JSON.stringify({ version: '2.0.0',
  source: '66da86e9d9e7206e817a0f7fdbdfa8fe37f3cd47', kind: 'rule-vectors-not-human-samples', results,
  backgroundCounterexample: true, expectedProcessAbsenceCalibrated: true, browserMeasurement: 'separate' }, null, 2))
console.log(JSON.stringify({ passed: results.length, backgroundCounterexample: true }))
