"""Bounded metadata from the pinned SDK; native event behavior is unchanged."""
import hashlib
import time


def identity(value):
    return hashlib.sha256(value.encode()).hexdigest() if isinstance(value, str) else None


class TargetEvents:
    def __init__(self, browser):
        self.browser, self.events = browser, []

    def record(self, manager, kind, target_id, session_id=None):
        self.events.append({'kind': kind, 'targetDigest': identity(target_id),
            'sessionDigest': identity(session_id), 'focusDigest': identity(self.browser.agent_focus_target_id),
            'knownPageCount': len(manager.get_all_page_targets()),
            'sessionCount': len(manager._sessions), 'monotonicMs': time.monotonic_ns() // 1000000})
        del self.events[:-16]

    def detached(self, manager):
        original = manager._handle_target_detached

        async def handle(event):
            target = event.get('targetId') or manager.get_target_id_from_session_id(event.get('sessionId'))
            self.record(manager, 'detach_received', target, event.get('sessionId'))
            try:
                return await original(event)
            finally:
                self.record(manager, 'detach_processed', target, event.get('sessionId'))

        return handle

    def session_lookup(self, manager):
        original = manager._get_session_for_target

        def handle(target_id):
            before = self.browser.agent_focus_target_id
            result = original(target_id)
            if before != self.browser.agent_focus_target_id:
                self.record(manager, 'session_lookup_cleared_focus', target_id)
            return result

        return handle
