"""Test teardown: terminate only a receipt-proven process in this test's own directory."""
import sys
import json
import shutil
from pathlib import Path
from browser_use_runner.managed_window import WindowLease, _owner_process, _profile_process_present


def cleanup_antibot(directory, prefix):
    """Only permanently remove this acceptance directory after the host has closed."""
    workspace = Path.cwd().resolve()
    if directory.resolve() != directory or directory.is_symlink() or directory.is_junction():
        raise ValueError('antibot_directory_link_rejected')
    if directory.parent != workspace / 'work/antibot-service' or not directory.name.startswith('product-'):
        raise ValueError('antibot_test_scope_required')
    if prefix not in ('', 'resume-'): raise ValueError('antibot_receipt_prefix_invalid')
    manifest = json.loads((directory / f'{prefix}manifest.json').read_text(encoding='utf8'))
    closed = json.loads((directory / f'{prefix}closed.json').read_text(encoding='utf8'))
    if manifest['root'] != str(workspace) or manifest['browser'] != 'dedicated-visible' or closed.get('hostClosed') is not True:
        raise ValueError('antibot_owner_not_closed')
    profile = directory / 'browser-profile'
    if any(p.is_symlink() or p.is_junction() for p in [profile, *profile.rglob('*')]):
        raise ValueError('antibot_profile_link_rejected')
    candidates = [profile / 'default', *profile.glob('runs/*/default')]
    if any(_profile_process_present(p) for p in candidates): raise ValueError('antibot_profile_process_alive')
    count = len(list((profile / 'runs').glob('*')))
    if profile.exists(): shutil.rmtree(profile)
    (directory / f'{prefix}profile-cleanup.json').write_text(json.dumps({
        'permanentlyDeleted': not profile.exists(), 'closed': True, 'profile': str(profile),
        'profileDirectories': count, 'matchingProfileProcesses': 0}, indent=2), encoding='utf8')


def main():
    if '--antibot-product' in sys.argv:
        cleanup_antibot(Path(sys.argv[1]).absolute(), sys.argv[3])
        return
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


if __name__ == '__main__': main()
