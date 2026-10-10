"""Owned HTTPS transport comparison. No real account/platform or personal browser."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import ssl
import subprocess
import sys
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from playwright.async_api import async_playwright

ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT / 'apps/api/python'))
from browser_use_runner.account_http import ReadClient

BASE = 'https://localhost:4185'
LAB = ROOT / 'work/antibot-service'


async def exercise(page, context, old, out):
    platform = {'host': BASE, 'url': BASE + '/measurement', 'cookieUrls': [BASE + '/'], 'origins': [BASE]}
    borrowed = SimpleNamespace(page=page, cookies=context.cookies)
    user_agent = await page.evaluate('navigator.userAgent')
    results = {}
    for label, implementation in [('reference', old.ReadClient), ('candidate', ReadClient)]:
        observations = {'sources': [], 'errors': [], 'responses': []}
        client = implementation(platform, borrowed, observations)
        await client.initialize()
        values = []
        for turn in range(3):
            values.append(await client.get('/measurement/read', params={'sample': label, 'round': turn}))
        results[label] = {'count': len(values), 'cookieContinuous': all(v['hasSyntheticCookie'] for v in values),
            'clientHintsPresent': all(v['clientHints'] for v in values), 'languagePresent': all(v['language'] for v in values),
            'pageUaMatches': all(v['userAgent'] == user_agent for v in values)}
    checks = {}
    for name, url in [('outside', 'https://outside.invalid/'), ('redirect', BASE + '/measurement/redirect'),
                      ('large', BASE + '/measurement/large'), ('challenge', BASE + '/measurement/challenge')]:
        try:
            await client.request('GET', url)
            checks[name] = False
        except Exception:
            checks[name] = True
    checks['challengeStatusRetained'] = observations['responses'][-1]['status'] == 403
    checks['noNavigation'] = page.url == BASE + '/measurement'
    checks['singlePage'] = len(context.pages) == 1
    results['boundaries'] = checks
    results['modelCalls'] = 0
    (out / 'transport.json').write_text(json.dumps(results, indent=2), encoding='utf8')
    assert all(checks.values()), checks
    assert results['candidate']['cookieContinuous'] and results['candidate']['clientHintsPresent'], results
    return results


async def main():
    if os.environ.get('BAT_RUN_OWNED_NETWORK') != '1':
        raise ValueError('owned_network_gate_required')
    out = Path(tempfile.mkdtemp(prefix='network-', dir=LAB / 'reports'))
    reference = subprocess.check_output(['git', 'show', 'e92b1d2:apps/api/python/browser_use_runner/account_http.py'], cwd=ROOT)
    (out / 'reference.py').write_bytes(reference)
    spec = importlib.util.spec_from_file_location('antibot_reference_http', out / 'reference.py')
    old = importlib.util.module_from_spec(spec); spec.loader.exec_module(old)
    keys = out / 'sslkeys.log'
    tls = ssl.create_default_context(cafile=str(LAB / 'tls/cert.pem'))
    tls.keylog_filename = str(keys)
    native = httpx.AsyncClient
    def original_transport(*args, **kwargs):
        return native(*args, **{**kwargs, 'verify': tls, 'trust_env': False})
    linux_out = subprocess.check_output(['wsl', '-d', 'Ubuntu', '--exec', 'wslpath', '-a', out.as_posix()], cwd=ROOT, text=True).strip()
    capture_log = (out / 'capture.stderr.log').open('w', encoding='utf8')
    capture = subprocess.Popen(['wsl', '-d', 'Ubuntu', '-u', 'root', '--exec', 'tshark', '-i', 'any',
        '-f', 'tcp port 4185', '-a', 'duration:45', '-a', 'filesize:4096', '-w', linux_out + '/network.pcapng'],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=capture_log)
    proof = {'owner': 'account-browser-http.acceptance', 'directory': str(out), 'browserClosed': False}
    try:
        await asyncio.sleep(2)
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(channel='chrome', headless=True,
                args=['--ssl-key-log-file=' + str(keys)], env={**os.environ, 'SSLKEYLOGFILE': str(keys)})
            try:
                context = await browser.new_context(ignore_https_errors=True)
                await context.add_cookies([{'name': 'bat_synthetic', 'value': 'owned', 'url': BASE}])
                page = await context.new_page()
                await page.goto(BASE + '/measurement')
                with patch('httpx.AsyncClient', original_transport):
                    result = await exercise(page, context, old, out)
                print(json.dumps({'evidence': str(out), **result}))
            finally:
                await browser.close()
                proof['browserClosed'] = True
    finally:
        await asyncio.to_thread(capture.wait, timeout=55)
        capture_log.close()
        proof['captureExit'] = capture.returncode
        (out / 'ownership.json').write_text(json.dumps(proof), encoding='utf8')
        fields = ['tcp.stream', 'ip.src', 'tcp.srcport', 'tls.handshake.ja4', 'tls.handshake.extensions_alpn_str',
            'http2.settings.id', 'http2.headers.path', 'http.request.uri']
        command = ['wsl', '-d', 'Ubuntu', '--exec', 'tshark', '-r', linux_out + '/network.pcapng',
            '-o', 'tls.keylog_file:' + linux_out + '/sslkeys.log', '-Y', 'tls.handshake.type == 1 || http2 || http.request', '-T', 'fields']
        for field in fields: command.extend(['-e', field])
        with (out / 'protocol.tsv').open('w', encoding='utf8') as output:
            subprocess.run(command, cwd=ROOT, stdout=output, check=True)


if __name__ == '__main__':
    asyncio.run(main())
