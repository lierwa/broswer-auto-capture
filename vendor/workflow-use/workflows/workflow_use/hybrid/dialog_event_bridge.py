"""Compatibility seam for browser-use's native JavaScript-dialog watchdog.

Product Alignment:
- natural-language task: preserve browser actions that trigger alert/confirm/prompt while exploration continues.
- reusable chain boundary: one native dialog event and the next state observation in the same Browser session.
- runtime inputs: the pinned browser-use CDP client and its registered native popup handler.
- dynamic task outputs: browser-use's popup message/state plus the ordinary action/event evidence.
- generic platform capability used: browser-use PopupsWatchdog and cdp-use EventRegistry.
- replay model calls: 0.
- site/task-specific code added: no.

Reuse Assessment:
- capability: dismiss native JavaScript dialogs without deadlocking the CDP receiver.
- existing implementation in repository: browser-use PopupsWatchdog owns policy, message storage and CDP command.
- mature candidates and pinned versions: browser-use 0.13.8 with cdp-use 1.4.5.
- selected implementation: retain the registered upstream handler, defer its awaitable execution and coalesce only
  simultaneous opening events for the same target/dialog while that handler is still closing it.
- reused public surface: the live Browser session and upstream handler behavior.
- B-A-T-owned adapter and remaining gap: scheduling compatibility plus a bounded settle barrier.
- license/runtime/platform fit: same pinned Python runtime and browser owner; no second connection or loop.
- browser/runtime/state ownership conflicts: fail closed if another adapter owns the registry seam.
- replay model calls: 0.
- rejected candidates and evidence: replacing the watchdog duplicates policy; a second CDP client splits ownership.
- focused validation: actual EventRegistry re-entrancy test and one formal browser dialog continuation run.
"""
import asyncio
import inspect


DIALOG_EVENT = 'Page.javascriptDialogOpening'
_OWNER_ATTRIBUTE = '_bat_dialog_event_bridge_owner'
_WRAPPER_ATTRIBUTE = '_bat_dialog_event_bridge_wrapper'


class DialogEventBridge:
    """Let cdp-use's receiver process the response awaited by PopupsWatchdog."""

    def __init__(self, browser, *, settle_timeout=2.0):
        self.browser = browser
        self.settle_timeout = settle_timeout
        self.registry = None
        self.handlers = None
        self.original_register = None
        self.register_override = None
        self.had_instance_register = False
        self.instance_register = None
        self.tasks = set()
        self.active_dialogs = {}
        self.started = False

    def start(self):
        if self.started:
            raise ValueError('dialog_event_bridge_already_started')
        client = getattr(self.browser, 'cdp_client', None)
        registry = getattr(client, '_event_registry', None)
        handlers = getattr(registry, '_handlers', None)
        if registry is None or not isinstance(handlers, dict) or not callable(getattr(registry, 'register', None)):
            raise ValueError('dialog_event_registry_incompatible')
        if getattr(registry, _OWNER_ATTRIBUTE, None) is not None:
            raise ValueError('dialog_event_bridge_owner_conflict')

        self.registry, self.handlers = registry, handlers
        self.had_instance_register = 'register' in vars(registry)
        self.instance_register = vars(registry).get('register')
        self.original_register = registry.register

        def register(method, callback):
            adapted = self._adapt(callback) if method == DIALOG_EVENT else callback
            return self.original_register(method, adapted)

        self.register_override = register
        setattr(registry, _OWNER_ATTRIBUTE, self)
        registry.register = register
        self.started = True
        existing = handlers.get(DIALOG_EVENT)
        if existing is not None:
            registry.register(DIALOG_EVENT, existing)

    def _adapt(self, callback):
        if getattr(callback, _WRAPPER_ATTRIBUTE, None) is self:
            return callback

        def scheduled(params, session_id=None):
            key = self._dialog_key(params, session_id)
            active = self.active_dialogs.get(key)
            # WHY：同一 target 的多个 CDP session 会扇出同一个 opening；dialog 未关闭前不可能是下一次交互。
            if active is not None and not active.done():
                return None
            result = callback(params, session_id)
            if inspect.isawaitable(result):
                task = asyncio.ensure_future(result)
                self.tasks.add(task)
                self.active_dialogs[key] = task
                task.add_done_callback(lambda finished: self._release_active(key, finished))
                return None
            return result

        setattr(scheduled, _WRAPPER_ATTRIBUTE, self)
        scheduled._bat_original_dialog_handler = callback
        return scheduled

    def _dialog_key(self, params, session_id):
        target_id = None
        manager = getattr(self.browser, 'session_manager', None)
        if session_id and callable(getattr(manager, 'get_target_id_from_session_id', None)):
            try:
                target_id = manager.get_target_id_from_session_id(session_id)
            except Exception:
                target_id = None
        values = params if isinstance(params, dict) else {}
        document = ('target', str(target_id)) if target_id else ('url', str(values.get('url') or ''))
        return document, str(values.get('type') or ''), str(values.get('message') or ''), \
            str(values.get('defaultPrompt') or '')

    def _release_active(self, key, task):
        if self.active_dialogs.get(key) is task:
            self.active_dialogs.pop(key, None)

    async def settle(self):
        failures = []
        try:
            async with asyncio.timeout(self.settle_timeout):
                while self.tasks:
                    pending = tuple(self.tasks)
                    results = await asyncio.gather(*pending, return_exceptions=True)
                    self.tasks.difference_update(pending)
                    failures.extend(result for result in results if isinstance(result, BaseException))
        except TimeoutError:
            for task in self.tasks:
                task.cancel()
            if self.tasks:
                await asyncio.gather(*self.tasks, return_exceptions=True)
            self.tasks.clear()
            self.active_dialogs.clear()
            raise ValueError('native_dialog_handler_timeout') from None
        if failures:
            raise ValueError('native_dialog_handler_failed')

    async def close(self):
        failure = None
        try:
            await self.settle()
        except BaseException as error:
            failure = error
        try:
            self._restore()
        except BaseException as error:
            if failure is None:
                failure = error
        if failure is not None:
            raise failure

    def _restore(self):
        if not self.started:
            return
        conflict = False
        current_handler = self.handlers.get(DIALOG_EVENT)
        if getattr(current_handler, _WRAPPER_ATTRIBUTE, None) is self:
            self.handlers[DIALOG_EVENT] = current_handler._bat_original_dialog_handler
        current_register = getattr(self.registry, 'register', None)
        if current_register is self.register_override:
            if self.had_instance_register:
                self.registry.register = self.instance_register
            else:
                delattr(self.registry, 'register')
        else:
            conflict = True
        if getattr(self.registry, _OWNER_ATTRIBUTE, None) is self:
            delattr(self.registry, _OWNER_ATTRIBUTE)
        else:
            conflict = True
        self.started = False
        self.active_dialogs.clear()
        if conflict:
            raise ValueError('dialog_event_bridge_ownership_lost')
