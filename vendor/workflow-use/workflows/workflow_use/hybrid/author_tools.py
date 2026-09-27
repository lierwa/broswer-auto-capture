"""Keep native structured completion while requiring an explicit source outcome."""
from browser_use import Tools
from browser_use.agent.views import ActionResult
from browser_use.browser import BrowserSession
from browser_use.filesystem.file_system import FileSystem
from pydantic import BaseModel, ConfigDict, Field, StrictBool, create_model
from .method_completion import complete_from_read_refs


COMPLETION_FAILURES = {
    'completion_read_reference_invalid': 'completion_read_reference_invalid',
    'completion_read_path_conflict': (
        'completion_read_path_conflict: Select one representative readRef per output path. '
        'Multiple page samples are not a compiled repeat method; do not merge them in done.'),
    'completion_read_schema_mismatch': 'completion_read_schema_mismatch',
    'completion_derivation_source_missing': 'completion_derivation_source_missing',
    'completion_derivation_source_invalid': 'completion_derivation_source_invalid',
}


class AuthorTools(Tools):
    def __init__(self, *, output_model: type[BaseModel], exclude_actions=None,
                 display_files_in_done_text=True, output_schema=None, result_spec=None):
        self._bat_output_schema = output_schema or {'type': 'null'}
        self._bat_result_spec = result_spec
        self._bat_field_read_records = None
        super().__init__(output_model=output_model, exclude_actions=exclude_actions,
                         display_files_in_done_text=display_files_in_done_text)
        self.use_structured_output_action(output_model)

    def use_structured_output_action(self, output_model: type[BaseModel]):
        # WHY：Agent 构造会再次调用这个公开方法；每次先复用原生注册，再安装相同合同，
        # 保证探索前的 registry digest 与模型实际看到的 done schema 一致。
        super().use_structured_output_action(output_model)
        native = self.registry.registry.actions['done']
        # WHY：不能继承 StructuredOutputAction；其 schema 回调会隐藏 success，
        # 默认 true 会把 null 业务输出误记为来源成功。结束声明与业务 data 分开。
        completion_model = create_model(
            'AuthorCompletion', __config__=ConfigDict(extra='forbid'),
            success=(StrictBool, Field(description='Whether the requested task was completed successfully.')),
            reason=(str, Field(min_length=1, max_length=4000,
                               description='Observed reason for completion or inability to complete.')),
            readRefs=(list[str], Field(max_length=100, description=(
                'References returned by successful bat_read_fields calls that supply the result. '
                'Do not copy page values. For execution-only or unsuccessful preparation use an empty list.'))))

        @self.registry.action('End this preparation with an explicit success or failure and observed reason.',
                              param_model=completion_model)
        async def done(params: BaseModel, file_system: FileSystem, browser_session: BrowserSession):
            if not params.success:
                return ActionResult(is_done=True, success=False, extracted_content=params.reason,
                    metadata={'batCompletion': {'success': False, 'reason': params.reason}})
            try:
                output = complete_from_read_refs(self._bat_field_read_records, params.readRefs,
                    self._bat_output_schema, self._bat_result_spec)
                wrapped = output if self._bat_output_schema.get('type') == 'object' else {'value': output}
                data = output_model.model_validate(wrapped)
            except Exception as error:
                # WHY：保留已知合同失败的类别供原 Agent 纠正；只精确匹配固定码，
                # 不把页面值、校验异常正文或同路径的多页样本当成循环输出回传。
                code = error.args[0] if isinstance(error, ValueError) and len(error.args) == 1 else None
                message = COMPLETION_FAILURES.get(code) if isinstance(code, str) else None
                return ActionResult(error=message or 'completion_read_reference_invalid')
            native_params = native.param_model(success=params.success, data=data)
            result = await native.function(params=native_params, file_system=file_system,
                                           browser_session=browser_session)
            # WHY：原生 done 继续负责输出序列化和附件；B-A-T 只补来源声明，
            # 不添加页面语义 judge，也不向原业务输出写入控制字段。
            result.metadata = {**(result.metadata or {}), 'batCompletion': {
                'success': params.success, 'reason': params.reason}}
            return result
