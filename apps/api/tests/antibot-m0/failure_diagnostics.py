"""Test-only traceback locations, excluding exception text, URLs and local values."""
import json
import os
from pathlib import Path
import traceback


def instrument(runner):
    original = runner.start

    async def start(self, raw):
        try:
            return await original(self, raw)
        except Exception as error:
            chain = []
            current = error
            while current is not None and len(chain) < 5:
                chain.append({'type': type(current).__name__, 'frames': [
                    {'file': Path(frame.filename).name, 'line': frame.lineno, 'function': frame.name}
                    for frame in traceback.extract_tb(current.__traceback__)]})
                current = current.__cause__ or current.__context__
            Path(os.environ['BAT_M0_DIAGNOSTIC_PATH']).write_text(json.dumps(chain), encoding='utf-8')
            raise

    runner.start = start
