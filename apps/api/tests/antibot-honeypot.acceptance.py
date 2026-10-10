"""Native DOM/accessibility negative control for the pinned Anubis inert-link pattern."""
import asyncio
import importlib.util
import json
from pathlib import Path
import httpx

spec = importlib.util.spec_from_file_location('owned_input', Path(__file__).with_name('antibot-input.acceptance.py'))
owned = importlib.util.module_from_spec(spec)
spec.loader.exec_module(owned)
owned.PURPOSE = 'honeypot-native-dom-accessibility-negative'


async def exercise(browser, out):
    async with httpx.AsyncClient(trust_env=False) as client:
        response = await client.post('http://127.0.0.1:4188/api/cases', json={'kind': 'catalog'},
            headers={'Origin': 'http://127.0.0.1:4188'})
        response.raise_for_status()
        case = response.json()
    url = f"http://localhost:4184/case/{case['id']}/honeypot"
    page = await browser.get_current_page()
    await page.goto(url)
    links = await page.get_elements_by_css_selector('a')
    assert len(links) == 2, 'inert-link-became-DOM-link'
    session = await browser.get_or_create_cdp_session()
    ax = await session.cdp_client.send.Accessibility.getFullAXTree(session_id=session.session_id)
    ax_links = [node for node in ax['nodes'] if node.get('role', {}).get('value') == 'link' and not node.get('ignored')]
    assert len(ax_links) == 2
    assert all('click me' not in node.get('name', {}).get('value', '') for node in ax_links)
    state = await browser.get_browser_state_summary()
    mapped = list(state.dom_state.selector_map.values())
    assert not any('/honeypot/trap' in str(node.attributes.get('href', '')) for node in mapped)
    await links[0].click()
    assert await page.evaluate('() => location.pathname') == f"/case/{case['id']}"
    await asyncio.sleep(.5)
    async with httpx.AsyncClient(trust_env=False) as client:
        report = (await client.get('http://127.0.0.1:4188/api/report')).json()
    paths = [row['RequestPath'] for row in report['access'] if case['id'] in row.get('RequestPath', '')]
    assert paths and not any('/honeypot/trap' in value for value in paths), 'native-browser-entered-trap'
    owned.save(out, 'honeypot.json', {'caseId': case['id'], 'DOMLinks': len(links), 'accessibilityLinks': len(ax_links),
        'selectorMapTrap': False, 'gatewayPaths': paths, 'businessNavigation': True,
        'scope': 'headless B-A-T ordinary DOM/accessibility; not all screen-reader products', 'modelCalls': 0})
    return {'inputValueCorrect': True, 'inputEvents': [], 'probe': {'verdict': 'trap-not-entered', 'validity': 'measured'}}


owned.exercise = exercise
asyncio.run(owned.main())
