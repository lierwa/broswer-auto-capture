"""Resume new page sessions in the Browser-Use owner's existing attach callback."""

import asyncio
from collections import Counter
from typing import Any

from browser_use import Browser


class PopupResumeAdapter:
    def __init__(self, browser: Browser, *, timeout_seconds: float = 2.0) -> None:
        manager = browser.session_manager
        if manager is None or browser._cdp_client_root is None:
            raise RuntimeError('browser-use session must be started before popup resume is installed')
        self.manager = manager
        self.original = manager._handle_target_attached
        self.timeout_seconds = timeout_seconds
        self.attempts = 0
        self.resumed = 0
        self.errors: Counter[str] = Counter()

        async def handle_attached(event: dict[str, Any]) -> None:
            target_type = event.get('targetInfo', {}).get('type')
            session_id = event.get('sessionId')
            if target_type == 'page' and session_id:
                client = browser._cdp_client_root
                if client is not None:
                    self.attempts += 1
                    try:
                        # WHY: Chrome can pause a new page even when waitingForDebugger is false.
                        # Resume before B-U processes the attach; the opener may be waiting for input ACK.
                        await asyncio.wait_for(
                            client.send.Runtime.runIfWaitingForDebugger(session_id=session_id),
                            timeout=self.timeout_seconds,
                        )
                        self.resumed += 1
                    except Exception as exc:
                        # A short-lived page must not stop B-U from registering its target.
                        self.errors[type(exc).__name__] += 1
            await self.original(event)

        self.wrapper = handle_attached
        manager._handle_target_attached = handle_attached

    def snapshot(self) -> dict[str, Any]:
        return {'attempts': self.attempts, 'resumed': self.resumed, 'errors': dict(self.errors)}

    def close(self) -> None:
        if self.manager._handle_target_attached is self.wrapper:
            self.manager._handle_target_attached = self.original
