"""Native authoring transport and model-free replay over the managed workflow-use fork."""
import asyncio
import json
import os
import signal
import sys
import tempfile
import re
from importlib.metadata import version
from pathlib import Path
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID
from urllib.parse import urlsplit

from browser_use import Browser
import workflow_use
from pydantic import Field, JsonValue, TypeAdapter
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.evidence import Contract, digest
from workflow_use.hybrid.read import ReadSpec, read_fields
from workflow_use.hybrid.author import AuthorInput, author_step, author_tools
from workflow_use.hybrid.__main__ import compilation_response
from workflow_use.hybrid.request import CompilationRequest, NaturalCompilationRequest
from workflow_use.hybrid.invokes import VerifiedChild
from workflow_use.hybrid.registry import ActionRegistry
from browser_use_runner.ai_connect import AIConnectModel
from browser_use_runner.output_schema import output_model_for


class StartConfig(Contract):
    headless: bool
    executablePath: str | None = None
    allowedOrigins: list[str] = Field(min_length=1, max_length=32)


class StepCommand(Contract):
    name: Literal['browser.workflow-step']
    version: Literal[2]
    actionName: str
    args: dict[str, JsonValue]
    target: dict[str, JsonValue] | None
    postconditions: list[dict[str, JsonValue]] = Field(min_length=1)


class ReadCommand(Contract):
    name: Literal['browser.read-fields']
    version: Literal[2]
    specification: ReadSpec
    scope: 'ReadScope | None' = None


class ReadScope(Contract):
    url: str = Field(min_length=1)
    urlDigest: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')


COMMAND = TypeAdapter(StepCommand | ReadCommand)


class Envelope(Contract):
    id: UUID


class StartRequest(Envelope):
    type: Literal['hybrid_start']
    config: StartConfig


class ExecuteRequest(Envelope):
    type: Literal['hybrid_execute']
    command: StepCommand | ReadCommand


class ObserveRequest(Envelope):
    type: Literal['hybrid_observe']


class CloseRequest(Envelope):
    type: Literal['close']


class AuthorModel(Contract):
    model: str
    endpoint: str
    token: str = Field(repr=False)


class AuthorRequest(Envelope):
    type: Literal['hybrid_author']
    model: AuthorModel
    source: AuthorInput


class CompileRequest(Envelope):
    type: Literal['hybrid_compile']
    request: CompilationRequest | NaturalCompilationRequest
    outputSchema: dict[str, JsonValue]
    verifiedChildren: list[VerifiedChild] = Field(default_factory=list, max_length=100)


REQUEST = TypeAdapter(Annotated[StartRequest | ExecuteRequest | ObserveRequest | CloseRequest | AuthorRequest | CompileRequest, Field(discriminator='type')])


def assert_runtime():
    expected = Path(__file__).resolve().parents[4] / 'vendor/workflow-use/workflows/workflow_use/__init__.py'
    if (Path(workflow_use.__file__).resolve() != expected or sys.version_info[:2] != (3, 12)
            or version('browser-use') != '0.13.8' or version('cdp-use') != '1.4.5'
            or version('workflow-use') != '0.2.11'
            or version('mcp') != '1.29.1' or version('tenacity') != '9.1.2'):
        raise ValueError('hybrid_runtime_version_or_source_mismatch')


def origin(url):
    value = urlsplit(url)
    if value.scheme not in ('https', 'http') or not value.hostname or value.username or value.password:
        raise ValueError('hybrid_origin_invalid')
    return value.scheme + '://' + value.netloc


class Runner:
    def __init__(self, diagnostic=None):
        self.browser = None
        self.profile = None
        self.allowed = set()
        self.commands = 0
        self.diagnostic = diagnostic or (lambda _event: None)

    async def handle(self, raw):
        request = REQUEST.validate_json(json.dumps(raw, allow_nan=False))
        if isinstance(request, StartRequest):
            return await self.start(request.config.model_dump())
        if isinstance(request, ExecuteRequest):
            return await self.execute(request.command.model_dump())
        if isinstance(request, ObserveRequest):
            return await self.observe()
        if isinstance(request, CompileRequest):
            assert_runtime()
            if self.browser is not None:
                raise ValueError('hybrid_compile_requires_offline_owner')
            if digest(request.outputSchema) != request.request.plan.outputSchemaDigest:
                raise ValueError('hybrid_output_schema_mismatch')
            model, _ = output_model_for(request.outputSchema, 'HybridAgentOutput')
            registry = ActionRegistry.from_tools(author_tools(model, request.outputSchema))
            if registry.schemaDigest != request.request.actionRegistryVersion:
                raise ValueError('hybrid_action_registry_mismatch')
            return compilation_response(request.request, registry, request.verifiedChildren,
                                        output_schema=request.outputSchema)
        if isinstance(request, AuthorRequest):
            if self.browser is None:
                raise ValueError('hybrid_session_not_started')
            endpoint = urlsplit(request.model.endpoint)
            if endpoint.scheme != 'http' or endpoint.hostname != '127.0.0.1' or endpoint.username or endpoint.password:
                raise ValueError('hybrid_model_bridge_invalid')
            models = {purpose: AIConnectModel(**request.model.model_dump(), purpose=purpose)
                      for purpose in ('agent', 'judge', 'extract', 'semantic_annotation')}
            previous = self.browser.browser_profile.keep_alive
            self.browser.browser_profile.keep_alive = True
            self.diagnostic({'phase': 'author', 'status': 'started'})
            try:
                result = await author_step(self.browser, request.source.model_dump(), models, output_model_for,
                                           diagnostic=self.diagnostic)
            except asyncio.CancelledError:
                self.diagnostic({'phase': 'author', 'status': 'cancelled'})
                raise
            except Exception:
                self.diagnostic({'phase': 'author', 'status': 'failed'})
                raise
            else:
                self.diagnostic({'phase': 'author', 'status': 'completed'})
                return result
            finally:
                self.browser.browser_profile.keep_alive = previous
        return await self.close()

    async def start(self, raw):
        if self.browser is not None:
            raise ValueError('hybrid_session_already_started')
        config = StartConfig.model_validate(raw)
        assert_runtime()
        self.allowed = {origin(value) for value in config.allowedOrigins}
        if any(value != origin(value) for value in config.allowedOrigins):
            raise ValueError('hybrid_exact_origins_required')
        self.profile = tempfile.TemporaryDirectory(prefix='bat-hybrid-profile-')
        # Origin slash prevents prefix-domain matches. Reuse upstream SecurityWatchdog for navigation.
        self.browser = Browser(headless=config.headless, use_cloud=False, keep_alive=False,
                       user_data_dir=self.profile.name, enable_default_extensions=False,
                       allowed_domains=[value + '/' for value in sorted(self.allowed)], executable_path=config.executablePath)
        await self.browser.start()
        self.capability = OrdinaryCapability(self.browser)
        return {'mode': 'hybrid/v2', 'modelCalls': 0}

    async def execute(self, raw):
        if self.browser is None:
            raise ValueError('hybrid_session_not_started')
        command = COMMAND.validate_python(raw)
        if isinstance(command, StepCommand) and command.actionName == 'navigate':
            if origin(command.args.get('url', '')) not in self.allowed:
                raise ValueError('hybrid_origin_denied')
        else:
            await self.assert_page_scope()
        self.commands += 1
        if isinstance(command, StepCommand):
            output = await self.capability.execute_checked(command.actionName, command.args, command.target, command.postconditions)
        else:
            scope = command.scope.model_dump(exclude_none=True) if command.scope is not None else None
            output = await read_fields(self.browser, command.specification, scope=scope)
        await self.assert_page_scope()
        return {'output': output, 'browser': await self.observe(), 'browserCommands': self.commands, 'modelCalls': 0}

    async def assert_page_scope(self):
        page = await self.browser.get_current_page()
        if page is None or origin(await page.get_url()) not in self.allowed:
            raise ValueError('hybrid_origin_denied')

    async def observe(self):
        if self.browser is None:
            raise ValueError('hybrid_session_not_started')
        state = await self.browser.get_browser_state_summary()
        tab_id = self.browser.agent_focus_target_id
        if not tab_id or tab_id not in {tab.target_id for tab in state.tabs}:
            raise ValueError('hybrid_tab_identity_unavailable')
        # Hash page structure in memory; never log or persist raw DOM/screenshot/profile data.
        tree = state.dom_state.llm_representation()
        snapshot = {'url': state.url, 'title': state.title, 'documentDigest': digest(tree)}
        return {'sessionId': self.browser.id, 'tabId': str(tab_id), 'url': state.url,
                'observationDigest': digest(snapshot), 'observedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}

    async def close(self):
        try:
            if self.browser is not None:
                await self.browser.kill()
        finally:
            self.browser = None
            if self.profile is not None:
                self.profile.cleanup()
                self.profile = None
        return {'closed': True}


class DiagnosticChannel:
    def __init__(self):
        self.channel = None
        if os.environ.get('BAT_SOURCE_LIFECYCLE_DIAGNOSTICS') != '1':
            return
        try:
            self.channel = os.fdopen(4, 'w', buffering=1)
        except OSError:
            self.channel = None

    def emit(self, event):
        try:
            keys = set(event)
            if self.channel is None or keys - {'phase', 'status', 'actionName', 'stepNumber'}:
                return
            if event.get('phase') not in {'author', 'before_action', 'after_step', 'dispatch'}:
                return
            if event.get('status') not in {'started', 'completed', 'failed', 'cancelled'}:
                return
            has_name, has_step = 'actionName' in event, 'stepNumber' in event
            if has_name != has_step:
                return
            if has_name and (not isinstance(event['actionName'], str) or type(event['stepNumber']) is not int
                             or event['stepNumber'] < 0 or event['stepNumber'] > 9007199254740991):
                return
            self.channel.write(json.dumps(event, ensure_ascii=False, allow_nan=False) + '\n')
        except Exception:
            pass

    def close(self):
        if self.channel is None:
            return
        try:
            self.channel.close()
        except Exception:
            pass


async def main():
    diagnostics = DiagnosticChannel()
    runner = Runner(diagnostics.emit)
    channel = os.fdopen(3, 'w', buffering=1)
    current = asyncio.current_task()
    loop = asyncio.get_running_loop()
    for name in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(name, current.cancel)
        except NotImplementedError:
            signal.signal(name, lambda *_: loop.call_soon_threadsafe(current.cancel))
    try:
        while line := await asyncio.to_thread(sys.stdin.readline):
            request = json.loads(line)
            identity = request.get('id')
            try:
                result = await runner.handle(request)
                response = {'id': identity, 'ok': True, 'result': result}
            except Exception as error:
                message = str(error)
                safe_code = message if re.fullmatch(r'(?:hybrid_|ordinary_|capture_)[a-z_0-9]{1,100}', message) else ''
                response = {'id': identity, 'ok': False, 'code': 'hybrid_runner_failed',
                            'reason': type(error).__name__ + (':' + safe_code if safe_code else '')}
            channel.write(json.dumps(response, ensure_ascii=False, allow_nan=False) + '\n')
            if request.get('type') == 'close':
                break
    finally:
        try:
            await runner.close()
        finally:
            channel.close()
            diagnostics.close()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except asyncio.CancelledError:
        pass
