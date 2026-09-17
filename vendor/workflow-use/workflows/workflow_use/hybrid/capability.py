"""Single-action adapter over browser-use Tools and workflow-use target matching. No loop or model port."""
from browser_use.tools.service import Tools

from .postconditions import capture_check_baselines, declared_checks, settle_policy, verify_declared
from .registry import ActionRegistry
from .target_scroll import TargetScrollParams, register_target_scroll_tool
from .targets import TARGET_ORDINAL_ARGUMENT, TargetResolver, materialize_target
from .visible_wait import VisibleWaitParams, register_visible_wait_tool

# A capability admission set is deliberately separate from the complete public action registry.
ORDINARY_ACTIONS = frozenset({'navigate', 'go_back', 'wait', 'click', 'input', 'scroll', 'send_keys',
                              'dropdown_options', 'select_dropdown', 'bat_scroll_to', 'bat_wait_for'})
TARGET_ACTIONS = frozenset({'click', 'input', 'dropdown_options', 'select_dropdown'})


class OrdinaryCapability:
    def __init__(self, browser, tools=None):
        self.browser = browser
        self.tools = tools if tools is not None else Tools()
        if tools is None:
            register_target_scroll_tool(self.tools)
            register_visible_wait_tool(self.tools)
        self.registry = ActionRegistry.from_tools(self.tools)
        self.targets = TargetResolver(browser)

    async def execute_checked(self, action_name, args, target, postconditions):
        checks = declared_checks(postconditions, args, target)
        policy = settle_policy(postconditions)
        await capture_check_baselines(self.browser, checks)
        result = await self.execute(action_name, args, target)
        await verify_declared(self.browser, checks, policy)
        return result.model_dump(mode='json')

    async def execute(self, action_name: str, args: dict, target: dict | None = None):
        if action_name not in ORDINARY_ACTIONS:
            raise ValueError('unsupported_ordinary_capability')
        if 'index' in args:
            raise ValueError('ephemeral_target_argument')
        parameters = dict(args)
        if action_name == 'bat_scroll_to':
            return await self.execute_target_scroll(parameters, target)
        if action_name == 'bat_wait_for':
            return await self.execute_visible_wait(parameters, target)
        if action_name in TARGET_ACTIONS:
            if target is None:
                raise ValueError('stable_target_required')
            target = materialize_target(target, parameters)
            parameters['index'] = await self.resolve_target(target)
        elif target is not None:
            raise ValueError('unexpected_target')
        elif TARGET_ORDINAL_ARGUMENT in parameters:
            raise ValueError('unexpected_target_binding')
        action = self.registry.validate_action(action_name, parameters)
        # WHY: 复用 Tools.act 的浏览器动作、超时和错误语义；普通节点没有模型或文件系统句柄。
        result = await self.tools.act(action, browser_session=self.browser, page_extraction_llm=None)
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
        result = await self.tools.act(action, browser_session=self.browser, page_extraction_llm=None)
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
        result = await self.tools.act(action, browser_session=self.browser, page_extraction_llm=None)
        if result.error:
            raise RuntimeError('ordinary_action_failed')
        return result

    async def resolve_target(self, target, mapping=None):
        if mapping is not None:
            raise ValueError('external_selector_map_forbidden')
        return await self.targets.resolve_action_index(target)
