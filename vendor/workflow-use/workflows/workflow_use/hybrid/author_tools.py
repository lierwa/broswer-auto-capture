"""Keep native structured completion while requiring an explicit source outcome."""
from browser_use import Tools
from browser_use.agent.views import ActionResult
from browser_use.browser import BrowserSession
from browser_use.filesystem.file_system import FileSystem
from pydantic import BaseModel, ConfigDict, Field, StrictBool, create_model
from pydantic.json_schema import SkipJsonSchema
from .method_completion import complete_from_read_refs, content_read_refs
from .page_content import content_result
from .method_receipt import MethodOutcome


COMPLETION_FAILURES = {
    'completion_content_scope_ambiguous': (
        'completion_content_scope_ambiguous: Different regions or pages were captured. '
        'Capture one combined region for this step, or explicitly select the readRef that supplies the confirmed result.'),
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
                 display_files_in_done_text=True, output_schema=None, result_spec=None, legacy_model_fields=False,
                 source_protocol='bat-hybrid/2'):
        self._bat_legacy_model_fields = legacy_model_fields
        self._bat_output_schema = output_schema or {'type': 'null'}
        self._bat_result_spec = result_spec
        self._bat_field_read_records = None
        self._bat_source_protocol = source_protocol
        self._bat_method_feedback_sent = False
        self._bat_method_can_continue = lambda: False
        self._bat_method_collector = None
        self._bat_method_requirement = None
        super().__init__(output_model=output_model, exclude_actions=exclude_actions,
                         display_files_in_done_text=display_files_in_done_text)
        self.use_structured_output_action(output_model)

    def get_output_model(self):
        # WHY：B-U 用此公开接口向模型声明它要填写的业务结果；本适配只要求 readRefs。
        # 业务模型仍由下方原生 done 序列化，最终通过显式模型参数读取，不能再注入 Agent task。
        return None

    def use_structured_output_action(self, output_model: type[BaseModel]):
        # WHY：Agent 构造会再次调用这个公开方法；每次先复用原生注册，再安装相同合同，
        # 保证探索前的 registry digest 与模型实际看到的 done schema 一致。
        super().use_structured_output_action(output_model)
        native = self.registry.registry.actions['done']
        # WHY：不能继承 StructuredOutputAction；其 schema 回调会隐藏 success，
        # 默认 true 会把 null 业务输出误记为来源成功。结束声明与业务 data 分开。
        method_fields = {'methodOutcome': (MethodOutcome, Field(description=
            'recorded: method retained by successful native actions or inspection; '
            'state_only: only the current state satisfies the task; '
            'unsupported: no supported replay method. This is separate from current business success.'))} \
            if self._bat_source_protocol == 'bat-hybrid/3' else {}
        completion_model = create_model(
            'AuthorCompletion', __config__=ConfigDict(extra='forbid'),
            **method_fields,
            success=(StrictBool, Field(description='Whether the requested task was completed successfully.')),
            reason=(str, Field(min_length=1, max_length=4000,
                               description='Observed reason for completion or inability to complete.')),
            # WHY：执行型 null 合同没有数据来源选择，空引用由宿主填写，不交给模型抄固定值。
            readRefs=(SkipJsonSchema[list[str]] if self._host_owned_read_refs() else list[str],
                Field(default=[] if content_result(self._bat_result_spec) or self._host_owned_read_refs() else ...,
                exclude=self._host_owned_read_refs(),
                max_length=100, description=(
                'References returned by successful bat_read_fields calls that supply the result. '
                'Do not copy page values. For execution-only or unsuccessful preparation use an empty list.'))))

        @self.registry.action('End this preparation with an explicit success or failure and observed reason.',
                              param_model=completion_model)
        async def done(params: BaseModel, file_system: FileSystem, browser_session: BrowserSession):
            if not params.success:
                return ActionResult(is_done=True, success=False, extracted_content=params.reason,
                    metadata={'batCompletion': {'success': False, 'reason': params.reason}})
            if (getattr(params, 'methodOutcome', None) == 'state_only' and not self._bat_method_feedback_sent
                    and self._bat_method_can_continue()):
                # WHY：只提醒本次原生 Agent 一次；重复注册 done 不重置计数，不重放浏览器动作。
                self._bat_method_feedback_sent = True
                return ActionResult(error='preparation_method_required: current state alone is not a replay method. '
                    'Read the current candidates and use bat_inspect_action for a real navigation target if supported. '
                    'Do not repeat external writes. Otherwise finish with state_only or unsupported.')
            try:
                references = params.readRefs
                if content_result(self._bat_result_spec) and not references:
                    # WHY：范围采集只交付宿主已保存的产物，不要求模型补齐最终业务参数。
                    references = content_read_refs(self._bat_field_read_records)
                output = complete_from_read_refs(self._bat_field_read_records, references,
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

    def _host_owned_read_refs(self):
        return self._bat_output_schema.get('type') == 'null' and not self._bat_legacy_model_fields
