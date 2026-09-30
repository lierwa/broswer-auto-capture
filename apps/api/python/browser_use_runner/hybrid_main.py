"""Native authoring transport and model-free replay over the managed workflow-use fork."""
import asyncio
import json
import os
import signal
import sys
from importlib.metadata import version
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlsplit

from browser_use import Browser, BrowserProfile
import workflow_use
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.postconditions import PostconditionNotMet
from workflow_use.hybrid.read import read_fields
from workflow_use.hybrid.rendered_field_text import FieldReadError
from workflow_use.hybrid.author import author_step
from workflow_use.hybrid.target_preparation import current_document_id
from workflow_use.hybrid.human_wait import HumanWaitControl
from browser_use_runner.ai_connect import AIConnectModel
from browser_use_runner.output_schema import output_model_for
from browser_use_runner.hybrid_compile import compile_offline
from browser_use_runner.popup_resume import PopupResumeAdapter
from browser_use_runner.diagnostic_channel import DiagnosticChannel
from browser_use_runner.author_request_loop import AuthorRequestLoop
from browser_use_runner.compilation_control import CompilationAck, CompilationControl
from browser_use_runner.site_scope import origin, normalize_allowed_site, allowed_domain_patterns, allowed_url
from browser_use_runner.managed_window import ManagedWindow
from browser_use_runner.browser_cleanup import close_stage
from browser_use_runner.read_error_codes import (
    READ_STAGE_NOTES, SAFE_READ_FAILURE_CODES, read_stage_code, safe_runtime_error_code,
)
from browser_use_runner.attached_window import AttachedWindow
from browser_use_runner.connected_task_scope import ConnectedTaskScope
from browser_use_runner.profile_owner import current_profile_owner, recover_profile_owner
from browser_use_runner.hybrid_commands import (
    AllowedSite, StartConfig, ProfileStartConfig, StepCommand, ReadCommand, TargetReadinessCommand,
    ReadScope, COMMAND, Envelope, StartRequest, ProfileStartRequest, ProfileOwnerRequest, ProfileRecoverRequest,
    ExecuteRequest, ObserveRequest, HandoffRequest, ManagedWindowRequest, CloseRequest, ReleaseRequest,
    AuthorModel, AuthorRequest, AuthorResumeRequest, CompileRequest, REQUEST,
)


def assert_runtime():
    expected = Path(__file__).resolve().parents[4] / 'vendor/workflow-use/workflows/workflow_use/__init__.py'
    if (Path(workflow_use.__file__).resolve() != expected or sys.version_info[:2] != (3, 12)
            or version('browser-use') != '0.13.8' or version('cdp-use') != '1.4.5'
            or version('workflow-use') != '0.2.11'
            or version('mcp') != '1.29.1' or version('tenacity') != '9.1.2'):
        raise ValueError('hybrid_runtime_version_or_source_mismatch')


def owned_browser(profile_path, *, headless, allowed_domains=None):
    # WHY: browser-use 0.13.8 只有显式 BrowserProfile 才把 user_data_dir 作为会话事实；
    # 直接把配置展开给 Browser 会创建临时 profile，既丢登录态，也破坏恢复时的所有权校验。
    profile = BrowserProfile(headless=headless, use_cloud=False, keep_alive=False,
                             user_data_dir=str(profile_path), enable_default_extensions=False,
                             allowed_domains=allowed_domains)
    browser = Browser(browser_profile=profile)
    if Path(browser.browser_profile.user_data_dir).resolve() != profile_path:
        raise ValueError('hybrid_persistent_profile_not_owned')
    return browser


async def reset_automation_tabs(browser):
    tabs = await browser.get_tabs()
    focus = browser.agent_focus_target_id
    if not focus or focus not in {tab.target_id for tab in tabs}:
        raise ValueError('hybrid_session_tab_unavailable')
    current = await browser.get_current_page()
    if current is None:
        raise ValueError('hybrid_session_tab_unavailable')
    # WHY：持久 Profile 只复用账号与站点存储；旧导航页不属于新 execution，不能暴露给探索 Agent。
    for tab in tabs:
        if tab.target_id != focus:
            await browser.close_page(tab.target_id)
    await current.goto('about:blank')


class Runner:
    def __init__(self, diagnostic=None):
        self.browser = None
        self.profile_path = None
        self.allowed = set()
        self.allowed_sites = []
        self.commands = 0
        self.capability = None
        self.document_status = {}
        self.diagnostic = diagnostic or (lambda _event: None)
        self.close_task = None
        self.popup_resume = None
        self.managed_window = None
        self.human_wait = None
        self.author_request_id = None
        self.publish_human_wait = None
        self.publish_compilation, self.compilation = None, None
        self.connection = None

    def validate_release(self, raw):
        request = REQUEST.validate_json(json.dumps(raw, allow_nan=False))
        if not isinstance(request, ReleaseRequest) or self.connection is None:
            raise ValueError('hybrid_attached_window_connection_not_started')
        self.connection.require_owner(request.connectionOwnerId)

    async def handle(self, raw):
        request = REQUEST.validate_json(json.dumps(raw, allow_nan=False))
        if isinstance(request, StartRequest):
            return await self.start(request.config.model_dump())
        if isinstance(request, ReleaseRequest):
            if self.connection is None:
                raise ValueError('hybrid_attached_window_connection_not_started')
            return await self.connection.release(self, request.connectionOwnerId)
        if isinstance(request, ProfileStartRequest):
            return await self.start_profile(request.config.model_dump())
        if isinstance(request, (ProfileOwnerRequest, ProfileRecoverRequest)):
            if self.browser is not None:
                raise ValueError('hybrid_profile_owner_requires_offline_runner')
            return (current_profile_owner(request.ownerId, request.launcherPid) if isinstance(request, ProfileOwnerRequest)
                    else recover_profile_owner(request.profilePath, request.ownerId, request.leaseId, request.runner))
        if isinstance(request, ExecuteRequest):
            return await self.execute(request.command.model_dump(), action_ref=request.actionRef)
        if isinstance(request, ObserveRequest):
            return await self.observe()
        if isinstance(request, HandoffRequest):
            return await self.handoff()
        if isinstance(request, ManagedWindowRequest):
            if self.browser is not None:
                raise ValueError('hybrid_managed_window_controlled')
            if AttachedWindow.has_lease(request.profilePath, request.ownerId):
                window = AttachedWindow(request.profilePath, request.ownerId)
                return await getattr(window, request.action)(request.leaseId)
            window = ManagedWindow(request.profilePath, request.ownerId)
            action = 'inspect' if request.action == 'verify_closed' else request.action
            return getattr(window, action)(request.leaseId)
        if isinstance(request, AuthorResumeRequest):
            if self.human_wait is None or request.authorRequestId != self.author_request_id:
                raise ValueError('hybrid_human_author_request_mismatch')
            return await self.human_wait.resume(request.waitpointId)
        if isinstance(request, CompileRequest):
            assert_runtime()
            if self.browser is not None:
                raise ValueError(request.type + '_requires_offline_owner')
            return await compile_offline(request)
        if isinstance(request, CompilationAck):
            if self.compilation is None:
                raise ValueError('hybrid_compilation_not_active')
            return self.compilation.acknowledge(request)
        if isinstance(request, AuthorRequest):
            if self.browser is None:
                raise ValueError('hybrid_session_not_started')
            endpoint = urlsplit(request.model.endpoint)
            if endpoint.scheme != 'http' or endpoint.hostname != '127.0.0.1' or endpoint.username or endpoint.password:
                raise ValueError('hybrid_model_bridge_invalid')
            models = {purpose: AIConnectModel(**request.model.model_dump(), purpose=purpose)
                      for purpose in ('agent', 'judge', 'extract', 'semantic_annotation')}
            previous = self.browser.browser_profile.keep_alive
            if request.onlineCompilation and self.publish_compilation is None:
                raise ValueError('hybrid_compilation_channel_required')
            self.browser.browser_profile.keep_alive = True
            self.author_request_id = request.id
            self.compilation = CompilationControl(request.id, self.publish_compilation) if request.onlineCompilation else None
            self.human_wait = HumanWaitControl(self.browser, lambda url: allowed_url(url, self.allowed_sites),
                lambda wait: self.publish_human_wait(str(request.id), wait)) if self.publish_human_wait else None
            self.diagnostic({'phase': 'author', 'status': 'started'})
            try:
                result = await author_step(self.browser, request.source.model_dump(mode='json', by_alias=True), models, output_model_for,
                                            diagnostic=self.diagnostic, human_wait=self.human_wait,
                                            **({'compilation_exchange': self.compilation.exchange} if self.compilation else {}))
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
                if self.compilation is not None:
                    self.compilation.cancel()
                    self.compilation = None
                if self.human_wait is not None:
                    self.human_wait.cancel()
                self.human_wait, self.author_request_id = None, None
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
        self.allowed_sites = [normalize_allowed_site(site) for site in config.allowedSites]
        profile_path = Path(config.profilePath)
        if not profile_path.is_absolute():
            raise ValueError('hybrid_profile_path_absolute_required')
        profile_path.mkdir(parents=True, exist_ok=True)
        self.profile_path = profile_path.resolve()
        # WHY：browser-use 复用公开 URL glob 在派发前拦截；本运行器仍在动作前后独立核验结构化站点边界。
        domains = allowed_domain_patterns(self.allowed_sites)
        window_config = config.existingBrowser or config.managedWindow
        if config.connectionOwnerId is not None or self.connection is not None:
            if config.connectionOwnerId is None:
                raise ValueError('hybrid_attached_window_connection_owner_required')
            if self.connection is None:
                self.connection = ConnectedTaskScope(config)
            self.managed_window, self.browser = await self.connection.start(config, domains, self.diagnostic)
        elif window_config is not None:
            if config.headless:
                raise ValueError('hybrid_managed_window_requires_visible')
            attached = config.existingBrowser is not None or (window_config.resume
                       and AttachedWindow.has_lease(self.profile_path, window_config.ownerId))
            self.managed_window = (AttachedWindow(self.profile_path, window_config.ownerId,
                                   config.existingBrowser.cdpUrl if config.existingBrowser else None,
                                   diagnostic=self.diagnostic)
                                   if attached else ManagedWindow(self.profile_path, window_config.ownerId))
            self.browser = await self.managed_window.start(resume=window_config.resume, allowed_domains=domains)
        else:
            self.browser = owned_browser(self.profile_path, headless=config.headless, allowed_domains=domains)
            await self.browser.start()
        if not isinstance(self.managed_window, AttachedWindow):
            self.popup_resume = PopupResumeAdapter(self.browser)
        if not isinstance(self.managed_window, AttachedWindow) and (window_config is None or not window_config.resume):
            await reset_automation_tabs(self.browser)
        session = await self.browser.get_or_create_cdp_session()
        session.cdp_client.register.Network.responseReceived(self.record_document_response)
        await session.cdp_client.send.Network.enable(session_id=session.session_id)
        self.capability = OrdinaryCapability(self.browser)
        return {'mode': 'hybrid/v2', 'modelCalls': 0}

    async def start_profile(self, raw):
        if self.browser is not None:
            raise ValueError('hybrid_session_already_started')
        config = ProfileStartConfig.model_validate(raw)
        assert_runtime()
        profile_path = Path(config.profilePath)
        if not profile_path.is_absolute():
            raise ValueError('hybrid_profile_path_absolute_required')
        profile_path.mkdir(parents=True, exist_ok=True)
        self.profile_path = profile_path.resolve()
        # WHY: 这是用户直接管理专用账号状态的浏览器，不执行自动化命令，因此不设置站点白名单；
        # 任务准备和复跑仍各自使用已确认需求推导的第一方站点边界。
        if config.headless:
            raise ValueError('hybrid_managed_window_requires_visible')
        self.managed_window = ManagedWindow(self.profile_path, config.ownerId)
        self.browser = await self.managed_window.start(resume=False, allowed_domains=None)
        self.popup_resume = PopupResumeAdapter(self.browser)
        return {'mode': 'profile/v1', 'modelCalls': 0}

    def record_document_response(self, event, _session_id):
        if self.connection is not None and (self.browser is None or self.managed_window is None):
            return
        if isinstance(self.managed_window, AttachedWindow):
            manager, scope = self.browser.session_manager, self.managed_window.scope
            if manager is None or scope is None or manager.get_target_id_from_session_id(_session_id) not in scope.owned:
                return
        response = event.get('response') if event.get('type') == 'Document' else None
        if not isinstance(response, dict) or not isinstance(response.get('url'), str):
            return
        try:
            if not allowed_url(response['url'], self.allowed_sites):
                return
        except ValueError:
            return
        status = response.get('status')
        if isinstance(status, (int, float)) and not isinstance(status, bool):
            self.document_status[document_key(response['url'])] = int(status)

    def assert_document_access(self, url):
        code = external_document_error(self.document_status.get(document_key(url)))
        if code is not None:
            raise RuntimeError(code)

    async def execute(self, raw, *, action_ref=None):
        if self.browser is None:
            raise ValueError('hybrid_session_not_started')
        if self.connection is not None:
            self.connection.scope.ensure_connection()
        command = COMMAND.validate_python(raw)
        if isinstance(command, StepCommand) and command.actionName == 'navigate':
            if not allowed_url(command.args.get('url', ''), self.allowed_sites):
                raise ValueError('hybrid_origin_denied')
            # WHY：前次同 URL 的拒绝不能冒充本次响应；仅本次派发记录可归因。
            self.document_status.pop(document_key(command.args['url']), None)
        else:
            try:
                await self.assert_page_scope()
            except Exception as error:
                if (not isinstance(command, ReadCommand)
                        or isinstance(error, ValueError) and str(error) == 'hybrid_origin_denied'):
                    raise
                raise RuntimeError(read_stage_code('pre_scope', error)) from error
        self.commands += 1
        if isinstance(command, StepCommand):
            try:
                output = await self.capability.execute_checked(command.actionName, command.args, command.target, command.postconditions)
            except RuntimeError as error:
                if isinstance(error, PostconditionNotMet) and isinstance(action_ref, str):
                    self._emit_action_failure(action_ref, command.actionName, error)
                # WHY：HTTP 拒绝也可能令原生导航先失败；保留同次主文档证据，不重发动作。
                if command.actionName == 'navigate' and str(error) == 'ordinary_action_failed':
                    self.assert_document_access(command.args['url'])
                raise
        elif isinstance(command, ReadCommand):
            scope = command.scope.model_dump(exclude_none=True) if command.scope is not None else None
            try:
                output = await read_fields(self.browser, command.specification, scope=scope,
                                           required_paths=command.requiredPaths)
            except Exception as error:
                # WHY：仅读取层固定错误码可穿过 fd3；字段名、页面正文和依赖消息留在 owner 内。
                if isinstance(error, (FieldReadError, ValueError)) and str(error) in SAFE_READ_FAILURE_CODES:
                    code = str(error)
                else:
                    stage = next((name for note, name in READ_STAGE_NOTES.items()
                                  if note in getattr(error, '__notes__', ())), 'fields')
                    code = read_stage_code(stage, error)
                raise RuntimeError(code) from error
        else:
            output = await self.capability.target_readiness(command.actionName, command.target)
        try:
            await self.assert_page_scope()
        except Exception as error:
            if (not isinstance(command, ReadCommand)
                    or isinstance(error, ValueError) and str(error) == 'hybrid_origin_denied'):
                raise
            raise RuntimeError(read_stage_code('post_scope', error)) from error
        try:
            browser = await self.observe()
        except Exception as error:
            if not isinstance(command, ReadCommand):
                raise
            # WHY：读取已完成时，后续 DOM 观察失败不能被误判为字段查询失败或重发读取。
            raise RuntimeError(read_stage_code('observation', error)) from error
        try:
            self.assert_document_access(browser['url'])
        except Exception as error:
            if not isinstance(command, ReadCommand) or str(error) in (
                    'capture_authentication_required', 'capture_access_denied', 'capture_rate_limited'):
                raise
            raise RuntimeError(read_stage_code('document_access', error)) from error
        return {'output': output, 'browser': browser, 'browserCommands': self.commands, 'modelCalls': 0}

    def _emit_action_failure(self, action_ref, action_name, error):
        try:
            detail = error.diagnostic if isinstance(getattr(error, 'diagnostic', None), dict) else {}
            check = {'kind': detail.get('kind'), 'attempts': detail.get('attempts')}
            if isinstance(detail.get('expected'), dict) and isinstance(detail.get('actual'), dict):
                check.update({'expected': detail['expected'], 'actual': detail['actual']})
            self.diagnostic({'phase': 'runtime_action_failure', 'status': 'failed',
                'actionRef': action_ref, 'actionName': action_name, 'errorCode': str(error),
                'dispatchCount': detail.get('dispatchCount'), 'check': check,
                'beforePage': detail.get('beforePage'), 'afterPage': detail.get('afterPage'),
                'validationTarget': detail.get('validationTarget'),
                'eventTarget': detail.get('eventTarget')})
        except Exception:
            pass

    async def assert_page_scope(self):
        page = await self.browser.get_current_page()
        if page is None or not allowed_url(await page.get_url(), self.allowed_sites):
            raise ValueError('hybrid_origin_denied')

    async def observe(self):
        if self.browser is None:
            raise ValueError('hybrid_session_not_started')
        if self.connection is not None:
            self.connection.scope.ensure_connection()
        for attempt in range(4):
            try:
                return await self._observe_once()
            except ValueError as error:
                if str(error) not in ('target_document_identity_unavailable', 'hybrid_observation_url_unstable') or attempt == 3:
                    raise
                # WHY：导航后 URL 可先于 DOM 就绪；只重取整份观察，不重发已完成的浏览器动作。
                await asyncio.sleep(0.25)

    async def _observe_once(self):
        page_before = await self.browser.get_current_page()
        url_before = await page_before.get_url() if page_before is not None else None
        # WHY：普通运行的恢复摘要只消费实时 DOM 与页面身份，截图不参与合同或 digest。
        state = await self.browser.get_browser_state_summary(include_screenshot=False)
        tab_id = self.browser.agent_focus_target_id
        if not tab_id or tab_id not in {tab.target_id for tab in state.tabs}:
            raise ValueError('hybrid_tab_identity_unavailable')
        # Hash page structure in memory; never log or persist raw DOM/screenshot/profile data.
        tree = state.dom_state.llm_representation()
        page = await self.browser.get_current_page()
        live_url = await page.get_url() if page is not None else None
        document_id = await current_document_id(self.browser)
        page_after = await self.browser.get_current_page()
        url_after = await page_after.get_url() if page_after is not None else None
        if self.browser.agent_focus_target_id != tab_id:
            raise ValueError('hybrid_observation_identity_changed')
        if not live_url or live_url != url_before or url_after != live_url:
            raise ValueError('hybrid_observation_url_unstable')
        snapshot = {'url': live_url, 'title': state.title, 'documentDigest': digest(tree)}
        return {'sessionId': self.browser.id, 'tabId': str(tab_id), 'url': live_url, 'documentId': document_id,
                'observationDigest': digest(snapshot), 'observedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}

    async def close(self):
        if self.close_task is None:
            self.close_task = asyncio.create_task(self._close())
        return await asyncio.shield(self.close_task)

    async def handoff(self):
        if self.browser is None or self.managed_window is None:
            raise ValueError('hybrid_managed_window_not_started')
        if self.capability is not None:
            await self.capability.close()
        self.capability = None
        if self.popup_resume is not None:
            self.popup_resume.close()
            self.popup_resume = None
        result = await self.managed_window.handoff(self.browser)
        self.browser = None
        return result

    async def ensure_closed(self):
        return await self.close()

    async def _close(self):
        if self.connection is not None:
            return await self.connection.close(self)
        stages = []
        capability, browser = self.capability, self.browser
        try:
            stages.append(await close_stage('capability_close', capability, 'cleanup_capability_close_failed'))
            if self.managed_window is not None:
                stages.append(await self.managed_window.close(browser))
            else:
                stages.append(await close_stage('browser_close', browser, 'cleanup_browser_close_failed',
                                                profile_path=self.profile_path))
        finally:
            if self.popup_resume is not None:
                self.popup_resume.close()
                self.popup_resume = None
            self.capability = None
            self.browser = None
            self.document_status = {}
            self.profile_path = None
            self.allowed_sites = []
            self.managed_window = None
        return {'closed': all(stage['status'] != 'unconfirmed' for stage in stages), 'stages': stages}


def document_key(url):
    value = urlsplit(url)
    return value._replace(fragment='').geturl()


def external_document_error(status):
    if status == 401:
        return 'capture_authentication_required'
    if status == 403:
        return 'capture_access_denied'
    if status == 429:
        return 'capture_rate_limited'
    return None


async def main():
    diagnostics = DiagnosticChannel()
    runner = Runner(diagnostics.emit)
    channel = os.fdopen(3, 'w', buffering=1)
    runner.publish_compilation = lambda event: channel.write(json.dumps(event, ensure_ascii=False, allow_nan=False) + '\n')
    runner.publish_human_wait = lambda identity, wait: channel.write(json.dumps(
        {'id': identity, 'event': 'human_wait', 'wait': wait}, ensure_ascii=False, allow_nan=False) + '\n')
    current = asyncio.current_task()
    loop = asyncio.get_running_loop()
    for name in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(name, current.cancel)
        except NotImplementedError:
            signal.signal(name, lambda *_: loop.call_soon_threadsafe(current.cancel))
    try:
        await AuthorRequestLoop(runner, channel, diagnostics, safe_runtime_error_code).run()
    finally:
        try:
            await runner.ensure_closed()
        finally:
            channel.close()
            diagnostics.close()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except asyncio.CancelledError:
        pass
