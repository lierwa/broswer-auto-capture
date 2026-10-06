"""Simulate manual closure of one known test target in the isolated headless Chrome."""
import asyncio, json, sys
from playwright.async_api import async_playwright

async def main(value):
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(f"http://127.0.0.1:{value['port']}")
        session = await browser.new_browser_cdp_session()
        try:
            result = await session.send('Target.closeTarget', {'targetId': value['targetId']})
            assert result['success']
            print(json.dumps({'closed': True}))
        finally:
            await session.detach()

asyncio.run(main(json.loads(sys.stdin.read())))
