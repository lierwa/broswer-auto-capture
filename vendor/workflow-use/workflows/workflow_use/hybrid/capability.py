"""Single-action adapter over browser-use Tools and workflow-use target matching. No loop or model port."""
import asyncio

from browser_use.tools.service import Tools
from tenacity import AsyncRetrying, retry_if_exception, stop_after_attempt, stop_before_delay, wait_fixed

from .dialog_event_bridge import DialogEventBridge
from .postconditions import (PostconditionNotMet, SettlePolicy, capture_check_baselines, declared_checks,
                             settle_policy, verify_declared)
from .native_event_capture import NativeEventCapture
from .navigation import NAVIGATION_ACTIONS, navigation_tab_ids, reconcile_new_navigation_tab
from .physical_input import dispatch_physical_click
from .registry import ActionRegistry
from .scroll_observation import inspect_page_scroll, scroll_dispatch_metadata, scroll_failure_code
from .target_preparation import current_document_id, verify_event_target
from .target_scroll import TargetScrollParams, register_target_scroll_tool
from .targets import TARGET_ORDINAL_ARGUMENT, TargetResolver, materialize_target
from .visible_wait import VisibleWaitParams, register_visible_wait_tool

# A capability admission set is deliberately separate from the complete public action registry.
ORDINARY_ACTIONS = frozenset({'navigate', 'go_back', 'wait', 'click', 'input', 'scroll', 'send_keys',
                              'dropdown_options', 'select_dropdown', 'bat_scroll_to', 'bat_wait_for'})
TARGET_ACTIONS = frozenset({'click', 'input', 'dropdown_options', 'select_dropdown'})
EVENT_HIT_ACTIONS = frozenset({'click', 'input', 'select_dropdown'})
EVENT_FOCUS_ACTIONS = frozenset({'send_keys'})
TARGET_READY_POLICY = SettlePolicy(maxMs=30000, maxAttempts=100, intervalMs=300)
RETRYABLE_TARGET_ERRORS = frozenset({
    'missing_history_target', 'missing_item_target', 'missing_stable_target', 'missing_structure_container',
    'page_document_unavailable', 'page_unavailable', 'target_position_unavailable', 'target_scope_mismatch',
    'target_detached', 'target_disabled', 'target_document_changed',
    'target_not_in_view', 'target_not_visible', 'target_preparation_invalid',
    'target_preparation_unavailable', 'target_read_only',
})
MISSING_TARGET_ERRORS = frozenset({
    'missing_history_target', 'missing_item_target', 'missing_stable_target', 'missing_structure_container',
})
READINESS_BLOCKED_ERRORS = frozenset({
    'target_detached', 'target_disabled', 'target_hit_blocked', 'target_not_in_view',
    'target_not_visible', 'target_read_only',
})


class OrdinaryCapability:
    def __init__(self, browser, tools=None, *, target_settle=None):
        self.browser = browser
        self.tools = tools if tools is not None else Tools()
        if tools is None:
            register_target_scroll_tool(self.tools)
            register_visible_wait_tool(self.tools)
        self.registry = ActionRegistry.from_tools(self.tools)
        self.targets = TargetResolver(browser)
        self.event_capture = NativeEventCapture(browser)
        self.last_dialog_events = []
        self.target_settle = SettlePolicy.model_validate(target_settle or TARGET_READY_POLICY)

    async def execute_checked(self, action_name, args, target, postconditions, *, native_dialog_policy=None):
        checks = declared_checks(postconditions, args, target)
        policy = settle_policy(postconditions)
        await capture_check_baselines(self.browser, checks)
        prior_tabs = await navigation_tab_ids(self.browser) \
            if action_name in NAVIGATION_ACTIONS and expects_url_change(postconditions) else None
        prepared = await self.resolve_target(target, action_name=action_name) \
            if action_name in TARGET_ACTIONS and target is not None else None
        result = await self.execute(action_name, args, target, native_dialog_policy=native_dialog_policy,
                                    _prepared=prepared)
        if prior_tabs is not None:
            started = asyncio.get_running_loop().time()
            options = {} if policy is None else {'attempts': policy.maxAttempts,
                'interval': policy.intervalMs / 1000, 'max_ms': policy.maxMs}
            await reconcile_new_navigation_tab(self.browser, prior_tabs, **options)
            if policy is not None:
                remaining = policy.maxMs - int((asyncio.get_running_loop().time() - started) * 1000)
                if remaining <= 0:
                    raise PostconditionNotMet('ordinary_postcondition_timeout')
                policy = policy.model_copy(update={'maxMs': remaining})
        if prepared is not None:
            for check in checks:
                if check.parameters.get('kind', '').startswith('target_'):
                    check.parameters['_retainedElement'] = prepared.element
        try:
            await verify_declared(self.browser, checks, policy)
        except PostconditionNotMet as error:
            expects_movement = action_name == 'scroll' and any(
                item.get('kind') == 'scroll_position' and item.get('changed') is True
                for item in postconditions if isinstance(item, dict))
            failure_code = scroll_failure_code(result) if expects_movement else None
            if failure_code is not None:
                raise RuntimeError(failure_code) from error
            raise
        finally:
            for check in checks:
                check.parameters.pop('_retainedElement', None)
        return result.model_dump(mode='json')

    async def execute(self, action_name: str, args: dict, target: dict | None = None, *, native_dialog_policy=None,
                      _prepared=None):
        if action_name not in ORDINARY_ACTIONS:
            raise ValueError('unsupported_ordinary_capability')
        if 'index' in args:
            raise ValueError('ephemeral_target_argument')
        parameters = dict(args)
        prepared = None
        if action_name == 'bat_scroll_to':
            return await self.execute_target_scroll(parameters, target)
        if action_name == 'bat_wait_for':
            return await self.execute_visible_wait(parameters, target)
        if action_name in TARGET_ACTIONS:
            if target is None:
                raise ValueError('stable_target_required')
            target = materialize_target(target, parameters)
            prepared = _prepared or await self.resolve_target(target, action_name=action_name)
            parameters['index'] = prepared.index
        elif target is not None:
            raise ValueError('unexpected_target')
        elif TARGET_ORDINAL_ARGUMENT in parameters:
            raise ValueError('unexpected_target_binding')
        action = self.registry.validate_action(action_name, parameters)
        # WHY: 复用 Tools.act 的浏览器动作、超时和错误语义；普通节点没有模型或文件系统句柄。
        if prepared is not None and action_name in EVENT_HIT_ACTIONS:
            intended = {'targetId': prepared.target_id, 'frameId': prepared.frame_id,
                        'sessionId': prepared.session_id}
            dispatch = (lambda: self._physical_click(prepared, native_dialog_policy)) \
                if action_name == 'click' else (lambda: self._act(action, native_dialog_policy))
            result, capture = await self._dispatch_captured(
                action_name, dispatch, intended, prepared.element)
            if result.error:
                raise RuntimeError('ordinary_action_failed')
            event_count = verify_event_target(capture, require_trusted=action_name == 'click')
            metadata = result.metadata if isinstance(result.metadata, dict) else {}
            result.metadata = {**metadata, 'batActionPreparation': {
                'targetId': prepared.target_id, 'scrolled': prepared.scrolled,
                'hitRelation': prepared.hit_relation, 'eventCount': event_count}}
        elif action_name in EVENT_FOCUS_ACTIONS:
            result, capture = await self._dispatch_captured(
                action_name, lambda: self._act(action, native_dialog_policy))
            events = capture.get('events') if isinstance(capture, dict) else []
            focused = [event for event in events if isinstance(event, dict)
                       and event.get('graph', {}).get('target', {}).get('kind') == 'element']
            metadata = result.metadata if isinstance(result.metadata, dict) else {}
            result.metadata = {**metadata, 'batFocusDispatch': {
                'captured': bool(focused), 'eventCount': len(focused)}}
        elif action_name == 'scroll':
            before = await inspect_page_scroll(self.browser)
            result, capture = await self._dispatch_captured(
                action_name, lambda: self._act(action, native_dialog_policy))
            after = await inspect_page_scroll(self.browser)
            metadata = result.metadata if isinstance(result.metadata, dict) else {}
            result.metadata = {**metadata, 'batScrollDispatch': scroll_dispatch_metadata(
                before, after, capture, bool(parameters.get('down', True)))}
        else:
            result = await self._act(action, native_dialog_policy)
        if result.error:
            raise RuntimeError('ordinary_action_failed')
        return result

    async def execute_target_scroll(self, parameters, target):
        params = TargetScrollParams.model_validate(parameters)
        resolved = materialize_target(target, dict(parameters))
        if resolved.get('strategy') != 'css' or resolved.get('value') != params.selector:
            raise ValueError('target_scroll_target_mismatch')
        await self.targets.assert_scope(resolved.get('scope'))
        action = self.registry.validate_action('bat_scroll_to', parameters)
        result = await self._act(action)
        if result.error:
            raise RuntimeError('ordinary_action_failed')
        return result

    async def execute_visible_wait(self, parameters, target):
        params = VisibleWaitParams.model_validate(parameters)
        resolved = materialize_target(target, dict(parameters))
        if resolved.get('strategy') != 'css' or resolved.get('value') != params.selector:
            raise ValueError('visible_wait_target_mismatch')
        await self.targets.assert_scope(resolved.get('scope'))
        action = self.registry.validate_action('bat_wait_for', parameters)
        result = await self._act(action)
        if result.error:
            raise RuntimeError('ordinary_action_failed')
        return result

    async def resolve_target(self, target, mapping=None, action_name=None):
        if mapping is not None:
            raise ValueError('external_selector_map_forbidden')
        policy = self.target_settle
        last_error = None
        async def resolve_once():
            nonlocal last_error
            try:
                return await (self.targets.resolve_action_index(target) if action_name is None
                              else self.targets.prepare_action_target(target, action_name))
            except Exception as error:
                last_error = error
                raise
        try:
            async with asyncio.timeout(policy.maxMs / 1000):
                # Leave one interval before the hard timeout so the final concrete resolver error survives.
                retry_window = max((policy.maxMs - policy.intervalMs) / 1000, 0.001)
                return await AsyncRetrying(
                    stop=stop_after_attempt(policy.maxAttempts) | stop_before_delay(retry_window),
                    wait=wait_fixed(policy.intervalMs / 1000), retry=retry_if_exception(retryable_target_error),
                    reraise=True)(resolve_once)
        except TimeoutError:
            if isinstance(last_error, ValueError) and str(last_error) in MISSING_TARGET_ERRORS:
                raise RuntimeError('ordinary_target_missing') from last_error
            raise

        except ValueError as error:
            if str(error) in MISSING_TARGET_ERRORS:
                raise RuntimeError('ordinary_target_missing') from error
            raise

    async def target_readiness(self, action_name, target):
        if action_name not in TARGET_ACTIONS or target is None:
            raise ValueError('hybrid_target_readiness_command_invalid')
        try:
            document_id = await current_document_id(self.browser)
        except Exception as error:
            raise ValueError('hybrid_target_readiness_document_unavailable') from error
        try:
            prepared = await self.targets.prepare_action_target(target, action_name)
        except ValueError as error:
            code = str(error)
            if code in MISSING_TARGET_ERRORS:
                return {'status': 'missing', 'documentId': document_id}
            if code in READINESS_BLOCKED_ERRORS:
                return {'status': 'blocked', 'documentId': document_id}
            if code.startswith('ambiguous_') or code == 'ambiguous_or_inconsistent_stable_target':
                return {'status': 'ambiguous', 'documentId': document_id}
            raise ValueError('hybrid_target_readiness_resolution_invalid') from error
        if prepared.document_id != document_id:
            raise ValueError('target_document_changed')
        return {'status': 'ready', 'documentId': document_id}

    async def _dispatch_captured(self, action_name, dispatch, target=None, element=None):
        await self.event_capture.arm(action_name, target, element)
        failure = None
        result = None
        capture = None
        try:
            result = await dispatch()
        except BaseException as error:
            failure = error
        try:
            capture = await self.event_capture.complete()
        except BaseException as error:
            if failure is None:
                failure = error
        if failure is not None:
            raise failure
        return result, capture

    async def _physical_click(self, prepared, dialog_policy):
        return await self._with_dialog_bridge(
            lambda: dispatch_physical_click(self.browser, prepared), dialog_policy)

    async def _act(self, action, dialog_policy=None):
        return await self._with_dialog_bridge(
            lambda: self.tools.act(action, browser_session=self.browser, page_extraction_llm=None),
            dialog_policy)

    async def _with_dialog_bridge(self, dispatch, dialog_policy):
        # Authoring owns a run-scoped bridge. Replay wraps only the native dispatch so the two owners never overlap.
        dialog_bridge = DialogEventBridge(self.browser, policy=dialog_policy)
        dialog_bridge.start()
        failure = None
        result = None
        try:
            result = await dispatch()
        except BaseException as error:
            failure = error
        try:
            await dialog_bridge.close()
        except BaseException as error:
            if failure is None:
                failure = error
        self.last_dialog_events = list(dialog_bridge.events)
        if result is not None:
            metadata = result.metadata if isinstance(result.metadata, dict) else {}
            result.metadata = {**metadata, 'batNativeDialogs': list(dialog_bridge.events)}
        if failure is not None:
            raise failure
        return result

    async def close(self):
        await self.event_capture.close()


def retryable_target_error(error):
    return isinstance(error, ValueError) and str(error) in RETRYABLE_TARGET_ERRORS


def expects_url_change(postconditions):
    return any(isinstance(item, dict) and item.get('kind') in ('url', 'url_digest')
               and item.get('changed') is True for item in postconditions)
