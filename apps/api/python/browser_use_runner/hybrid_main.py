"""Native authoring transport and model-free replay over the managed workflow-use fork."""
import asyncio
import json
import os
import signal
import sys
import re
from importlib.metadata import version
from pathlib import Path
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID
from urllib.parse import urlsplit

from browser_use import Browser, BrowserProfile
import workflow_use
from pydantic import Field, JsonValue, TypeAdapter
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.evidence import Contract, digest
from workflow_use.hybrid.read import ReadSpec, read_fields
from workflow_use.hybrid.author import AuthorInput, author_step, author_tools_for_result_spec
from workflow_use.hybrid.__main__ import compilation_response
from workflow_use.hybrid.request import CompilationRequest, NaturalCompilationRequest
from workflow_use.hybrid.invokes import VerifiedChild
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.target_preparation import current_document_id
from browser_use_runner.ai_connect import AIConnectModel
from browser_use_runner.output_schema import output_model_for
from browser_use_runner.target_picker import pick_target
from browser_use_runner.hybrid_compile import compile_offline
from browser_use_runner.popup_resume import PopupResumeAdapter
from browser_use_runner.diagnostic_channel import DiagnosticChannel


from browser_use_runner.hybrid_commands import (
    AllowedSite, StartConfig, ProfileStartConfig, StepCommand, ReadCommand, TargetReadinessCommand,
    ReadScope, COMMAND, Envelope, StartRequest, ProfileStartRequest, ProfilePickTargetRequest,
    ExecuteRequest, ObserveRequest, CloseRequest, AuthorModel, AuthorRequest, CompileRequest, REQUEST,
)


SAFE_ERROR_CODE = re.compile(r'[a-z][a-z_0-9]{1,100}')


def safe_runtime_error_code(error):
    """Expose only stable identifiers raised by B-A-T's managed hybrid adapter.

    Dependency errors and page-derived text remain private even when they happen to resemble an identifier.
    """
    message = str(error)
    if SAFE_ERROR_CODE.fullmatch(message) is None:
        return ''
    managed = (Path(workflow_use.__file__).resolve().parent / 'hybrid').resolve()
    traceback = error.__traceback__
    while traceback is not None:
        source = Path(traceback.tb_frame.f_code.co_filename).resolve()
        if source == managed or managed in source.parents:
            return message
        traceback = traceback.tb_next
    return message if re.fullmatch(r'(?:hybrid_|ordinary_|capture_|read_|target_selection_)[a-z_0-9]{1,100}', message) else ''


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


def normalize_allowed_site(site):
    if isinstance(site, AllowedSite):
        site = site.model_dump()
    domain = site['domain']
    if domain != domain.strip().lower().rstrip('.') or any(mark in domain for mark in ('/', '\\', '@', '?', '#', '*')):
        raise ValueError('hybrid_allowed_site_invalid')
    bracketed = f'[{domain}]' if ':' in domain and not domain.startswith('[') else domain
    parsed = urlsplit(f"{site['scheme']}://{bracketed}")
    comparable = domain.strip('[]')
    if not parsed.hostname or parsed.hostname.lower() != comparable or parsed.username or parsed.password:
        raise ValueError('hybrid_allowed_site_invalid')
    if site['includeSubdomains'] and ':' in domain:
        raise ValueError('hybrid_allowed_site_invalid')
    return {**site, 'domain': domain}


def allowed_domain_patterns(sites):
    patterns = []
    for raw in sites:
        site = normalize_allowed_site(raw)
        host = f"[{site['domain']}]" if ':' in site['domain'] and not site['domain'].startswith('[') else site['domain']
        authority = host + (f":{site['port']}" if site['port'] is not None else '')
        patterns.append(f"{site['scheme']}://{authority}/*")
        if site['includeSubdomains']:
            patterns.append(f"{site['scheme']}://*.{authority}/*")
    return patterns


def allowed_url(url, sites):
    try:
        value = urlsplit(url)
        port = value.port
    except (TypeError, ValueError):
        return False
    if value.scheme not in ('https', 'http') or not value.hostname or value.username or value.password:
        return False
    host = value.hostname.lower()
    for raw in sites:
        site = normalize_allowed_site(raw)
        host_matches = host == site['domain'] or (site['includeSubdomains'] and host.endswith('.' + site['domain']))
        if value.scheme == site['scheme'] and port == site['port'] and host_matches:
            return True
    return False


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

    async def handle(self, raw):
        request = REQUEST.validate_json(json.dumps(raw, allow_nan=False))
        if isinstance(request, StartRequest):
            return await self.start(request.config.model_dump())
        if isinstance(request, ProfileStartRequest):
            return await self.start_profile(request.config.model_dump())
        if isinstance(request, ProfilePickTargetRequest):
            if self.browser is None:
                raise ValueError('hybrid_session_not_started')
            return await pick_target(self.browser, request.timeoutMs)
        if isinstance(request, ExecuteRequest):
            return await self.execute(request.command.model_dump())
        if isinstance(request, ObserveRequest):
            return await self.observe()
        if isinstance(request, CompileRequest):
            assert_runtime()
            if self.browser is not None:
                raise ValueError(request.type + '_requires_offline_owner')
            return await compile_offline(request)
        if isinstance(request, AuthorRequest):
            if self.browser is None:
                raise ValueError('hybrid_session_not_started')
            endpoint = urlsplit(request.model.endpoint)
            if endpoint.scheme != 'http' or endpoint.hostname != '127.0.0.1' or endpoint.username or endpoint.password:
                raise ValueError('hybrid_model_bridge_invalid')
            models = {purpose: AIConnectModel(**request.model.model_dump(), purpose=purpose)
                      for purpose in ('agent', 'extract', 'semantic_annotation')}
            previous = self.browser.browser_profile.keep_alive
            self.browser.browser_profile.keep_alive = True
            self.diagnostic({'phase': 'author', 'status': 'started'})
            try:
                result = await author_step(self.browser, request.source.model_dump(mode='json', by_alias=True), models, output_model_for,
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
        self.allowed_sites = [normalize_allowed_site(site) for site in config.allowedSites]
        profile_path = Path(config.profilePath)
        if not profile_path.is_absolute():
            raise ValueError('hybrid_profile_path_absolute_required')
        profile_path.mkdir(parents=True, exist_ok=True)
        self.profile_path = profile_path.resolve()
        # WHY：browser-use 复用公开 URL glob 在派发前拦截；本运行器仍在动作前后独立核验结构化站点边界。
        self.browser = owned_browser(self.profile_path, headless=config.headless,
                                     allowed_domains=allowed_domain_patterns(self.allowed_sites))
        await self.browser.start()
        self.popup_resume = PopupResumeAdapter(self.browser)
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
        if config.startUrl is not None:
            origin(config.startUrl)
        self.browser = owned_browser(self.profile_path, headless=config.headless)
        await self.browser.start()
        self.popup_resume = PopupResumeAdapter(self.browser)
        if config.startUrl is not None:
            page = await self.browser.get_current_page()
            await page.goto(config.startUrl)
        return {'mode': 'profile/v1', 'modelCalls': 0}

    def record_document_response(self, event, _session_id):
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

    async def execute(self, raw):
        if self.browser is None:
            raise ValueError('hybrid_session_not_started')
        command = COMMAND.validate_python(raw)
        if isinstance(command, StepCommand) and command.actionName == 'navigate':
            if not allowed_url(command.args.get('url', ''), self.allowed_sites):
                raise ValueError('hybrid_origin_denied')
        else:
            await self.assert_page_scope()
        self.commands += 1
        if isinstance(command, StepCommand):
            output = await self.capability.execute_checked(command.actionName, command.args, command.target, command.postconditions)
        elif isinstance(command, ReadCommand):
            scope = command.scope.model_dump(exclude_none=True) if command.scope is not None else None
            try:
                output = await read_fields(self.browser, command.specification, scope=scope)
            except Exception as error:
                # WHY：原生查询可能携带选择器、页面文本或依赖异常；跨 fd3 只传固定阶段码。
                raise RuntimeError('hybrid_read_collection_failed') from error
        else:
            output = await self.capability.target_readiness(command.actionName, command.target)
        await self.assert_page_scope()
        try:
            browser = await self.observe()
        except Exception as error:
            if not isinstance(command, ReadCommand):
                raise
            # WHY：读取已完成时，后续 DOM 观察失败不能被误判为字段查询失败或重发读取。
            raise RuntimeError('hybrid_read_observation_failed') from error
        self.assert_document_access(browser['url'])
        return {'output': output, 'browser': browser, 'browserCommands': self.commands, 'modelCalls': 0}

    async def assert_page_scope(self):
        page = await self.browser.get_current_page()
        if page is None or not allowed_url(await page.get_url(), self.allowed_sites):
            raise ValueError('hybrid_origin_denied')

    async def observe(self):
        if self.browser is None:
            raise ValueError('hybrid_session_not_started')
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

    async def ensure_closed(self):
        return await self.close()

    async def _close(self):
        stages = []
        capability, browser = self.capability, self.browser
        try:
            stages.append(await close_stage('capability_close', capability, 'cleanup_capability_close_failed'))
            stages.append(await close_stage('browser_close', browser, 'cleanup_browser_close_failed'))
        finally:
            if self.popup_resume is not None:
                self.popup_resume.close()
                self.popup_resume = None
            self.capability = None
            self.browser = None
            self.document_status = {}
            self.profile_path = None
            self.allowed_sites = []
        return {'closed': all(stage['status'] != 'unconfirmed' for stage in stages), 'stages': stages}


async def close_stage(name, owner, failure_code):
    if owner is None:
        return {'stage': name, 'status': 'not_required', 'code': None}
    try:
        await (owner.close() if name == 'capability_close' else owner.kill())
    except Exception:
        # WHY: 清理协议只暴露固定阶段码；依赖异常、页面正文、PID 和本机路径不得越过 fd3。
        return {'stage': name, 'status': 'unconfirmed', 'code': failure_code}
    return {'stage': name, 'status': 'confirmed', 'code': None}


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
                # WHY: read_* 是不含页面内容的有限诊断码；保留它才能区分 selector/数量/schema 失败，
                # workflow_use.hybrid 自有的 snake_case 错误同样是稳定合同；通过异常栈限定来源，
                # 同时继续拒绝把任意依赖异常、页面正文或敏感值送回产品日志。
                safe_code = safe_runtime_error_code(error)
                response_code = (safe_code if request.get('type') == 'profile_pick_target'
                                 and safe_code.startswith('target_selection_') else 'hybrid_runner_failed')
                response = {'id': identity, 'ok': False, 'code': response_code,
                            'reason': type(error).__name__ + (':' + safe_code if safe_code else '')}
            channel.write(json.dumps(response, ensure_ascii=False, allow_nan=False) + '\n')
            if request.get('type') == 'close':
                break
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
