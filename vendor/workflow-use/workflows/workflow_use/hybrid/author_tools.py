"""Keep native structured completion while requiring an explicit source outcome."""
from browser_use import Tools
from browser_use.browser import BrowserSession
from browser_use.filesystem.file_system import FileSystem
from pydantic import BaseModel, ConfigDict, Field, StrictBool, create_model


class AuthorTools(Tools):
    def __init__(self, *, output_model: type[BaseModel], exclude_actions=None,
                 display_files_in_done_text=True):
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
            data=(output_model, Field(description='Business output matching the unchanged requested schema.')))

        @self.registry.action('End this preparation with an explicit success or failure and observed reason.',
                              param_model=completion_model)
        async def done(params: BaseModel, file_system: FileSystem, browser_session: BrowserSession):
            native_params = native.param_model(success=params.success, data=params.data)
            result = await native.function(params=native_params, file_system=file_system,
                                           browser_session=browser_session)
            # WHY：原生 done 继续负责输出序列化和附件；B-A-T 只补来源声明，
            # 不添加页面语义 judge，也不向原业务输出写入控制字段。
            result.metadata = {**(result.metadata or {}), 'batCompletion': {
                'success': params.success, 'reason': params.reason}}
            return result
