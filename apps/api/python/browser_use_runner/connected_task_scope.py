"""One task-owned SDK connection, sequentially borrowed by independent operation leases."""
import asyncio
import json
from pathlib import Path
from uuid import UUID

from browser_use_runner.attached_window import AttachedWindow
from browser_use_runner.browser_cleanup import close_stage


def connection_settings(config):
    return json.dumps({'headless': config.headless, 'origins': sorted(config.allowedOrigins),
        'sites': sorted([site.model_dump() for site in config.allowedSites],
                        key=lambda site: json.dumps(site, sort_keys=True))}, sort_keys=True)


def clear_runner_operation(runner):
    runner.capability, runner.browser, runner.managed_window = None, None, None
    runner.document_status, runner.allowed_sites, runner.allowed = {}, [], set()
    runner.profile_path, runner.commands = None, 0


class ConnectedTaskScope:
    def __init__(self, config):
        self.owner_id = UUID(str(config.connectionOwnerId))
        self.profile_path = Path(config.profilePath).resolve()
        self.endpoint, self.settings = config.existingBrowser.cdpUrl, connection_settings(config)
        self.browser, self.scope, self.active, self.last_window = None, None, None, None
        self.blocked, self.started, self.finalized = False, False, False
        self.release_task = None

    def require_owner(self, owner_id):
        if owner_id is None or UUID(str(owner_id)) != self.owner_id:
            raise ValueError('hybrid_attached_window_connection_owner_mismatch')

    def validate(self, config):
        self.require_owner(config.connectionOwnerId)
        if config.existingBrowser is None or config.existingBrowser.cdpUrl != self.endpoint:
            raise ValueError('hybrid_attached_window_connection_endpoint_changed')
        if Path(config.profilePath).resolve() != self.profile_path:
            raise ValueError('hybrid_attached_window_connection_profile_changed')
        if connection_settings(config) != self.settings:
            raise ValueError('hybrid_attached_window_connection_settings_changed')
        if self.active is not None or self.blocked or self.finalized:
            raise ValueError('hybrid_attached_window_connection_cleanup_required')
        if self.started:
            if self.scope is None or self.browser is None:
                raise ValueError('hybrid_attached_window_connection_lost')
            self.scope.ensure_connection()

    async def start(self, config, domains, diagnostic):
        self.validate(config)
        window = AttachedWindow(self.profile_path, config.existingBrowser.ownerId,
                                self.endpoint, diagnostic=diagnostic)
        self.active, self.last_window, self.release_task = window, window, None
        try:
            if self.started:
                await window.start_connected(self.browser, self.scope)
            else:
                self.started = True
                try:
                    await window.start(resume=False, allowed_domains=domains, retain_connection=True)
                finally:
                    self.browser, self.scope = window.last_browser, window.scope
            return window, self.browser
        except BaseException:
            # WHY：失败资源仍归本 operation；必须 release/最终 close 核验，不借给下一运行。
            self.blocked = True
            raise

    def retained_owner(self):
        if (self.blocked or self.finalized or self.browser is None or self.scope is None
                or self.scope.owned or not self.browser.is_cdp_connected or self.scope.connection_lost):
            return None
        return str(self.owner_id)

    async def release(self, runner, owner_id):
        self.require_owner(owner_id)
        if self.release_task is None:
            self.release_task = asyncio.create_task(self._release(runner))
        return await asyncio.shield(self.release_task)

    async def _release(self, runner):
        stages = [await close_stage('capability_close', runner.capability, 'cleanup_capability_close_failed')]
        window = self.active
        stages.append(await window.release(self.browser) if window is not None else
                      {'stage': 'browser_close', 'status': 'not_required', 'code': None})
        closed = all(stage['status'] != 'unconfirmed' for stage in stages)
        self.blocked = not closed
        if closed:
            self.active = None
            clear_runner_operation(runner)
        return {'closed': closed, 'stages': stages, 'retainedConnectionOwnerId': self.retained_owner()}

    async def close(self, runner):
        if self.release_task is not None:
            await asyncio.shield(self.release_task)
        report = await self._release(runner)
        try:
            if self.browser is not None and self.browser._cdp_client_root is not None:
                await self.last_window._stop(self.browser)
                if self.browser._cdp_client_root is not None:
                    raise ValueError('hybrid_attached_window_connection_close_unconfirmed')
                if report['stages'][1]['status'] != 'unconfirmed':
                    report['stages'][1] = {'stage': 'browser_close', 'status': 'confirmed', 'code': None}
        except Exception:
            report['closed'] = False
            report['stages'][1] = {'stage': 'browser_close', 'status': 'unconfirmed',
                                   'code': 'cleanup_browser_close_failed'}
        finally:
            self.finalized = True
            report.pop('retainedConnectionOwnerId', None)
        return report
