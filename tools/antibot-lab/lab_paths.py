"""Build/maintenance paths from the same independent Node configuration."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
_value = json.loads(subprocess.check_output(['node', str(ROOT / 'locations.mjs')], cwd=ROOT, text=True))
BASE = Path(_value['directory'])
