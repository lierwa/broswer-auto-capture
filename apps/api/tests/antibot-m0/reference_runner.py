"""Test-only reference: old capture and native Browser, with the same current Runner protocol.

Does not modify any checkout file or installed dependency. Never selected by product code.
"""
import asyncio
import subprocess
import types

from browser_use import Browser
from browser_use_runner import task_browser
from workflow_use.hybrid import native_event_capture

source = subprocess.check_output(['git', 'show',
    '4304981:vendor/workflow-use/workflows/workflow_use/hybrid/native_event_capture.py'],
    text=True, encoding='utf-8')
reference = types.ModuleType('workflow_use.hybrid.reference_capture')
reference.__package__ = 'workflow_use.hybrid'
exec(compile(source, '4304981_native_event_capture.py', 'exec'), reference.__dict__)
task_browser.TaskBrowser = Browser
native_event_capture.NativeEventCapture = reference.NativeEventCapture

from browser_use_runner.hybrid_main import main, Runner
from failure_diagnostics import instrument
instrument(Runner)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except asyncio.CancelledError:
        pass
