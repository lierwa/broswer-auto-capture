"""M0 test-only host adapter. No personal profiles, Agent loop or detector implementation."""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
from importlib.metadata import version

import psutil
from browser_use import Browser, BrowserProfile
from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog


def save(directory, name, value):
    (directory / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def owned_process(pid, started, profile):
    process = psutil.Process(pid)
    if process.create_time() != started:
        raise ValueError('test_browser_pid_reused')
    expected = '--user-data-dir=' + str(profile)
    if expected not in process.cmdline():
        raise ValueError('test_browser_profile_owner_changed')
    return process


def close_owned(pid, started, profile):
    try:
        process = owned_process(pid, started, profile)
    except psutil.NoSuchProcess:
        return True
    children = process.children(recursive=True)
    process.terminate()
    for child in children:
        try:
            child.terminate()
        except psutil.NoSuchProcess:
            pass
    _, alive = psutil.wait_procs([process, *children], timeout=10)
    return not alive


async def endpoint(profile, owner):
    for _ in range(100):
        if owner.poll() is not None:
            raise ValueError('test_browser_exited_before_ready')
        file = profile / 'DevToolsActivePort'
        if file.exists():
            return 'http://127.0.0.1:' + file.read_text().splitlines()[0]
        await asyncio.sleep(.1)
    raise ValueError('test_debug_port_timeout')


async def run():
    mode, raw_directory, url = sys.argv[1:]
    directory = Path(raw_directory).resolve()
    root = Path.cwd().resolve() / 'work' / 'antibot-m0'
    if not directory.is_relative_to(root) or not url.startswith('http://127.0.0.1:'):
        raise ValueError('local_owned_test_required')
    if version('browser-use') != '0.13.8' or version('cdp-use') != '1.4.5':
        raise ValueError('m0_browser_dependency_version_mismatch')
    profile = directory / 'profile'
    profile.mkdir(exist_ok=False)
    executable = LocalBrowserWatchdog._find_installed_browser_path('chrome')
    if not executable:
        raise ValueError('chrome_not_installed')
    args = [str(executable), '--user-data-dir=' + str(profile), '--no-first-run',
            '--no-default-browser-check', '--window-size=1100,850']
    if mode == 'positive':
        args.append('--enable-automation')
    if mode in ('debug-host', 'bu-connect', 'bu-observe'):
        args += ['--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1']
    if mode not in ('manual', 'positive', 'debug-host', 'bu-connect', 'bu-observe'):
        raise ValueError('unsupported_mode')
    args.append(url)
    owner = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    started = psutil.Process(owner.pid).create_time()
    receipt = {'ownerPid': owner.pid, 'ownerStarted': started, 'profile': str(profile), 'mode': mode,
               'chromeSha256': hashlib.sha256(Path(executable).read_bytes()).hexdigest(),
               'os': platform.platform(), 'headless': False, 'profilePolicy': 'fresh',
               'controlConnected': False, 'observed': False, 'closed': False}
    browser = None
    save(directory, 'owner.json', receipt)
    try:
        if mode in ('bu-connect', 'bu-observe'):
            cdp = await endpoint(profile, owner)
            browser = Browser(browser_profile=BrowserProfile(cdp_url=cdp, is_local=False, keep_alive=True,
                enable_default_extensions=False), cdp_url=cdp, is_local=False)
            await browser.start()
            receipt['controlConnected'] = True
            if mode == 'bu-observe':
                await browser.get_browser_state_summary()
                receipt['observed'] = True
        save(directory, 'ready.json', receipt)
        await asyncio.to_thread(sys.stdin.readline)
    except Exception as error:
        save(directory, 'failure.json', {'type': type(error).__name__})
        raise
    finally:
        try:
            if browser is not None:
                await browser.stop()
        finally:
            receipt['closed'] = close_owned(owner.pid, started, profile)
            save(directory, 'closed.json', receipt)
            if not receipt['closed']:
                raise ValueError('test_browser_close_unconfirmed')


if __name__ == '__main__':
    asyncio.run(run())
