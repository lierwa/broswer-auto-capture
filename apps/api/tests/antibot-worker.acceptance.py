"""Fixed CreepJS worker rules; run in the edge test's single owned browser."""
import asyncio
import json
from pathlib import Path


async def exercise(browser, out, save):
    page = await browser.get_current_page(); results = {}
    for mode in ['baseline', 'tampered', 'shared', 'dedicated', 'blocked']:
        await page.goto('https://localhost:4183/measurement/worker/probe?mode=' + mode)
        result = None
        for _ in range(200):
            current = json.loads(await page.evaluate('() => ({query:location.search,result:globalThis.__workerResult || null})'))
            if current['query'] == '?mode=' + mode and current['result']:
                result = current['result']; break
            await asyncio.sleep(.1)
        results[mode] = result or {'validity': 'timeout', 'bot': None}
        save(out, 'worker-results.json', results)
    assert results['baseline']['validity'] == 'measured', 'baseline-worker-unavailable'
    assert results['baseline']['type'] == 'service'
    assert not results['baseline']['workerMismatchRules'], 'native-cross-context-false-positive'
    assert 'Navigator.hardwareConcurrency' in results['tampered']['workerMismatchRules'], 'worker-mismatch-not-detected'
    for mode in ['shared', 'dedicated']:
        assert results[mode]['validity'] == 'measured' and results[mode]['type'] == mode
        assert not results[mode]['workerMismatchRules'], 'worker-fallback-false-positive'
    assert results['blocked']['validity'] == 'unavailable', 'worker-csp-loss-was-reported-healthy'
    save(out, 'worker-passed.json', {'normalAndTampered': True, 'threeWorkerTypes': True, 'cspUnavailable': True,
        'ownedVisibleBAT': True, 'modelCalls': 0, 'generalHardwareAcceptance': False})
