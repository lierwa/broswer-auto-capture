"""Minimize the public generation failure before history inspection or model use.

Run with the unchanged upstream workflow-use lock environment. This is an upstream
failure probe, not a B-A-T candidate admission path. No Browser is constructed.
"""
import asyncio
import json
import os
from pathlib import Path

os.environ["ANONYMIZED_TELEMETRY"] = "false"
os.environ["BROWSER_USE_CLOUD_SYNC"] = "false"
os.environ["BROWSER_USE_SETUP_LOGGING"] = "false"
os.environ.setdefault("BROWSER_USE_CONFIG_DIR", str(Path.cwd() / "work/upstream-repro-config"))

from browser_use.agent.views import AgentHistoryList
from workflow_use.healing.service import HealingService


class NoModelCalls:
    async def ainvoke(self, *args, **kwargs):
        raise AssertionError("The model must not be invoked by this reproducer")


async def main():
    service = HealingService(llm=NoModelCalls(), enable_variable_extraction=False,
                             use_deterministic_conversion=False)
    try:
        await service.create_workflow_definition("Read a local fixture", AgentHistoryList(history=[]),
                                                 extract_variables=False)
    except Exception as error:
        print(json.dumps({"status": "blocked", "type": type(error).__name__, "message": str(error)}))
        raise SystemExit(1)
    print(json.dumps({"status": "public_entry_returned"}))


asyncio.run(main())
