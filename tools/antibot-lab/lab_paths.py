"""Build/maintenance paths from the same independent Node configuration."""
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
_value = json.loads(subprocess.check_output(['node', str(ROOT / 'locations.mjs')], cwd=ROOT, text=True))
BASE = Path(_value['directory'])


def linux_command(*args):
    """Thin OS command boundary only; systemd owns every service lifecycle."""
    if sys.platform == 'linux':
        return list(map(str, args))
    if sys.platform == 'win32':
        return ['wsl', '-d', 'Ubuntu', '--exec', *map(str, args)]
    raise RuntimeError('run_shield_inside_linux_guest')


def linux_path(value):
    if sys.platform == 'linux':
        return str(Path(value).resolve())
    return subprocess.check_output(linux_command('wslpath', '-a', str(value)), cwd=ROOT, text=True).strip()


def linux_architecture():
    value = subprocess.check_output(linux_command('uname', '-m'), cwd=ROOT, text=True).strip()
    if value not in ('x86_64', 'aarch64'):
        raise RuntimeError('unsupported_linux_architecture')
    return 'arm64' if value == 'aarch64' else 'amd64'


def artifacts():
    rows = json.loads((ROOT / 'artifacts.json').read_text())
    if linux_architecture() == 'arm64':
        overrides = {row['name']: row for row in json.loads((ROOT / 'artifacts-arm64.json').read_text())}
        rows = [overrides.get(row['name'], row) for row in rows]
    return rows
