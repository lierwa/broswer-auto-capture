"""Discover actions from the browser-use public schema, including custom registered actions."""
from importlib.metadata import version

from jsonschema import Draft202012Validator
from pydantic import BaseModel, PrivateAttr

from .evidence import Contract, digest


class ActionRegistry(Contract):
    providerVersion: str
    schemaDigest: str
    names: list[str]
    _action_model: type[BaseModel] | None = PrivateAttr(default=None)
    _validator: object = PrivateAttr(default=None)

    @classmethod
    def from_tools(cls, tools, page_url: str | None = None):
        model = tools.registry.create_action_model(page_url=page_url)
        schema = model.model_json_schema()
        variants = schema.get('anyOf', [schema])
        names = []
        for variant in variants:
            definition = schema['$defs'][variant['$ref'].split('/')[-1]] if '$ref' in variant else variant
            names.extend(definition.get('properties', {}).keys())
        if not names or len(names) != len(set(names)):
            raise ValueError('invalid_upstream_action_schema')
        result = cls(providerVersion=version('browser-use'), schemaDigest=digest(schema), names=sorted(names))
        result._action_model = model
        result._validator = Draft202012Validator(schema)
        return result

    def validate_action(self, name: str, args: object):
        if name not in self.names:
            raise ValueError('unsupported_action')
        if self._action_model is None:
            raise ValueError('live_registry_required')
        if name == 'bat_read_fields' and isinstance(args, dict) and 'maxItems' in args:
            # WHY：新模型界面隐藏宿主预算，但既存来源的显式预算仍按原受限合同校验，不改历史动作。
            from .method_read_tool import MethodReadToolParams
            Draft202012Validator(MethodReadToolParams.model_json_schema()).validate(args)
            parameters = MethodReadToolParams.model_validate(args)
            result = self._action_model.model_validate({name: {key: value for key, value in args.items() if key != 'maxItems'}})
            return result.model_copy(update={'root': result.root.model_copy(update={name: parameters})})
        self._validator.validate({name: args})
        result = self._action_model.model_validate({name: args})
        # WHY：TS 的 JSON number 会把 4.0 序列化为 4；复用 JSON Schema 的值语义，
        # 不把合法数值规范化误判为改参，字符串/布尔和真实改值仍必须拒绝。
        if not Draft202012Validator({'const': {name: args}}).is_valid(
                result.model_dump(mode='json', exclude_unset=True)):
            raise ValueError('action_arguments_changed_by_validation')
        return result


# WHY: 这是已核验的效果保守分类，绝不是 action 注册表或允许名单。
# 未评估动作仍由公开 schema 识别并完整保留；默认按最高效果处理，不能排除。
EFFECTS = {
    'done': 'none', 'wait': 'none', 'bat_validate_selection': 'none', 'screenshot': 'read', 'find_elements': 'read',
    'search_page': 'read', 'extract': 'read', 'bat_inspect_dom': 'read', 'bat_read_fields': 'read', 'bat_wait_for': 'read',
    'bat_summarize': 'read', 'bat_request_human': 'read',
    'dropdown_options': 'read',
    'navigate': 'navigation', 'go_back': 'navigation', 'switch': 'navigation', 'close': 'navigation',
    'scroll': 'ui_state', 'bat_scroll_to': 'ui_state',
}


def action_effect(name: str) -> str:
    return EFFECTS.get(name, 'external_write')
