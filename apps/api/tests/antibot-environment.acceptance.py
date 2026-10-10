"""Fixed CrowdSec collector in its own document; reuse owned-browser lifecycle only."""
import asyncio
import importlib.util
import json
from pathlib import Path

script = Path(__file__).with_name('antibot-input.acceptance.py')
spec = importlib.util.spec_from_file_location('owned_input', script)
owned = importlib.util.module_from_spec(spec)
spec.loader.exec_module(owned)


async def exercise(browser, out):
    page = await browser.get_current_page()
    await page.goto('https://localhost:4185/measurement/fingerprint')
    result = None
    for _ in range(200):
        raw = await page.evaluate('() => globalThis.__probeResult || null')
        result = json.loads(raw) if raw else None
        if result: break
        await asyncio.sleep(.1)
    owned.save(out, 'fingerprint.json', result)
    assert result and result['validity'] != 'error', 'collector-failed'
    assert result['detections']['hasBotUserAgent']['detected'], 'headless-positive-not-detected'
    assert result['states']['signals.contexts.webWorker.platform'] == 'measured', 'worker-not-measured'
    return {'inputValueCorrect': 'not-exercised', 'inputEvents': [],
        'probe': {'verdict': result['detections'], 'validity': result['validity']}, 'modelCalls': 0}


owned.exercise = exercise
owned.PURPOSE = 'environment-probe-owned-headless'
if __name__ == '__main__': asyncio.run(owned.main())
