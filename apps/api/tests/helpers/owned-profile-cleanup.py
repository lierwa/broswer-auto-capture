"""Test teardown: terminate only a receipt-proven process in this test's own directory."""
import sys
from pathlib import Path
from browser_use_runner.managed_window import WindowLease, _owner_process

directory = Path(sys.argv[1]).resolve()
workspace = Path.cwd().resolve() / 'work' / 'run-control-20261004'
if directory.parent != workspace or not directory.name.startswith('native-dedicated-visible-'):
    raise ValueError('test_scope_required')
receipt = directory / 'browser-profile' / 'managed-window-lease.json'
if receipt.exists():
    lease = WindowLease.model_validate_json(receipt.read_text(encoding='utf8'))
    if Path(lease.profilePath).resolve() != directory / 'browser-profile' / 'default':
        raise ValueError('test_profile_changed')
    process = _owner_process(lease)
    if process:
        process.terminate()
        process.wait(timeout=15)
