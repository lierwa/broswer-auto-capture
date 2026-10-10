"""Protect host-confirmed continuation across real URL changes without weakening ownership."""
import sys
import asyncio
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'python'))
from workflow_use.hybrid.human_wait import HumanRequestParams, HumanWaitParams, HumanWaitControl
from workflow_use.hybrid.human_wait_compile import compile_human_wait
from workflow_use.hybrid.evidence import EvidenceRef, digest
from browser_use_runner.author_access import AuthorAccessControl


class HumanResumeTests(unittest.IsolatedAsyncioTestCase):
    def control(self):
        self.page = SimpleNamespace(get_url=AsyncMock(return_value='https://example.test/login'))
        self.browser = SimpleNamespace(id='owned-session', agent_focus_target_id='owned-tab',
                                       get_current_page=AsyncMock(return_value=self.page))
        return HumanWaitControl(self.browser, lambda url: url.startswith('https://example.test/'), lambda _: None)

    async def test_redirect_confirmed_only_on_same_authorized_tab(self):
        control = self.control()
        await control.request(HumanRequestParams(reason='login', prompt='Complete login'))
        pending = control.pending
        self.page.get_url.return_value = 'https://example.test/list?new_nonce=value'
        self.assertEqual(await control.resume(pending['id']), {'resumed': True})
        self.assertFalse(pending['event'].is_set())
        control.release(pending['id'])
        self.assertTrue(pending['event'].is_set())

    async def test_rejected_resume_keeps_wait_available(self):
        control = self.control()
        await control.request(HumanRequestParams(reason='login', prompt='Complete login'))
        pending = control.pending
        for change in ('tab', 'url', 'session'):
            self.browser.id, self.browser.agent_focus_target_id = 'owned-session', 'owned-tab'
            self.page.get_url.return_value = 'https://example.test/list'
            if change == 'tab':
                self.browser.agent_focus_target_id = 'another-tab'
            elif change == 'session':
                self.browser.id = 'another-session'
            else:
                self.page.get_url.return_value = 'https://unauthorized.test/'
            with self.assertRaises(ValueError):
                await control.resume(pending['id'])
            self.assertIs(control.pending, pending)
            self.assertIsNone(pending['after'])
            self.assertFalse(pending['event'].is_set())

    async def test_v1_url_condition_is_preserved(self):
        control = self.control()
        await control.request(HumanWaitParams(reason='login', prompt='Complete login',
                                             resumeUrl='https://example.test/list'))
        self.page.get_url.return_value = 'https://example.test/list?nonce=changed'
        with self.assertRaisesRegex(ValueError, 'resume_state_mismatch'):
            await control.resume(control.pending['id'])

    async def test_v2_ack_followed_by_authorized_redirect_uses_actual_post_observation(self):
        control = self.control()
        params = HumanRequestParams(reason='login', prompt='Complete login')
        await control.request(params)
        pending = control.pending
        self.page.get_url.return_value = 'https://example.test/redirect'
        await control.resume(pending['id']); control.release(pending['id'])
        self.page.get_url.return_value = 'https://example.test/list?nonce=changed'
        post = SimpleNamespace(tabId='owned-tab', url='https://example.test/list?nonce=final', facts=[])
        collector = SimpleNamespace(pending={'action': {'bat_request_human': params.model_dump()}, 'actionId': 'a'},
            align_pending=lambda _: None, observations=[], value_fact=lambda kind, value: SimpleNamespace(kind=kind, value=value))
        async def capture(_agent):
            collector.observations.append(post)
        await control.finish_step(SimpleNamespace(history=[]), collector, capture)
        self.assertEqual(post.facts[0].value['after']['url'], post.url)
        self.assertIsNone(control.pending)

    async def test_v2_compiler_uses_confirmed_facts_and_rejects_foreign_tab(self):
        params = {'reason': 'login', 'prompt': 'Complete login'}
        before = {'sessionId': 's', 'tabId': 't', 'url': 'https://example.test/login'}
        after = {**before, 'url': 'https://example.test/list?nonce=changed'}
        value = {'schemaVersion': 'bat.human-resume/v2', 'actionRef': 'a', 'waitpointId': 'wait',
                 'params': params, 'argsDigest': digest(params), 'before': before, 'after': after,
                 'resumed': True, 'resultDigest': digest(None)}
        fact = SimpleNamespace(id='f', kind='verified_human_resume', value=value,
                               sourceRefs=[EvidenceRef(ref='f', digest=digest(value))])
        action = SimpleNamespace(id='a', args=params, resultRef=EvidenceRef(ref='r', digest=digest(None)))
        pre = SimpleNamespace(id='pre', url=before['url'], tabId='t', sourceRefs=[])
        post = SimpleNamespace(url=after['url'], tabId='t', sourceRefs=[], facts=[fact])
        segment, _, gaps = compile_human_wait(action, pre, post)
        self.assertEqual(gaps, [])
        self.assertEqual(segment['operation']['human']['resumeWhen'], {'operator': 'exists', 'path': ['url']})
        self.assertEqual(segment['postconditions'], [])
        value['after']['tabId'] = 'foreign'
        self.assertIsNone(compile_human_wait(action, pre, post)[0])


class AuthorAccessResumeTests(HumanResumeTests):
    """The HTTP stop adapter must retain the inherited owner/confirmation boundaries."""
    def control(self):
        super().control()
        return AuthorAccessControl(self.browser, lambda url: url.startswith('https://example.test/'),
                                   lambda _: None, lambda _: None)

    async def test_explicit_response_wait_requires_real_clearance(self):
        # 保护原Agent边界：宿主确认不等于挑战解除，也不能额外决策或伪造人工动作证据。
        for cleared in (True, False):
            control = self.control()
            challenge = RuntimeError('capture_verification_required_403')
            control.guard = Mock(side_effect=[challenge, None, None] if cleared else
                [challenge, RuntimeError('capture_verification_required_403'), None, None])
            published = asyncio.Event()
            control.publish = lambda _: published.set()
            capture = SimpleNamespace(close=AsyncMock())
            collector = SimpleNamespace(source_gaps=[], dispatch_audit=SimpleNamespace(event_capture=capture))
            agent, after = SimpleNamespace(stop=Mock()), AsyncMock(return_value='settled')
            task = asyncio.create_task(control.finish_step(agent, collector, after))
            try:
                await asyncio.wait_for(published.wait(), 1)
                self.assertFalse(task.done()); agent.stop.assert_not_called()
                self.assertEqual(control.guard.call_count, 1)
                capture.close.assert_awaited_once(); after.assert_awaited_once()
                pending = control.pending
                if not cleared:
                    with self.assertRaisesRegex(RuntimeError, 'capture_verification_required_403'):
                        await control.resume(pending['id'])
                    self.assertIs(control.pending, pending); self.assertIsNone(pending['after'])
                    self.assertFalse(task.done()); self.assertFalse(pending['event'].is_set())
                    agent.stop.assert_not_called()
                await control.resume(pending['id']); control.release(pending['id'])
                self.assertEqual(await task, 'settled')
                self.assertEqual(collector.source_gaps, []); agent.stop.assert_not_called()
                self.assertIsNone(control.pending)
                self.assertEqual(control.guard.call_count, 3 if cleared else 4)
            finally:
                if not task.done(): task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    async def test_no_host_and_plain_denial_preserve_stop(self):
        for code, host in [('capture_verification_required_403', None), ('capture_access_denied', Mock())]:
            control = self.control(); control.publish = host
            control.guard = Mock(side_effect=RuntimeError(code))
            collector, agent = SimpleNamespace(source_gaps=[]), SimpleNamespace(stop=Mock())
            with self.assertRaisesRegex(RuntimeError, code):
                await control.finish_step(agent, collector, AsyncMock())
            self.assertIsNone(control.pending); agent.stop.assert_called_once()
            self.assertEqual(collector.source_gaps[0].reason, code)
            if host is not None: host.assert_not_called()

    async def test_existing_explicit_human_action_keeps_evidence(self):
        control = self.control(); params = HumanRequestParams(reason='captcha', prompt='Complete local challenge')
        await control.request(params)
        collector = SimpleNamespace(pending={'action': {'bat_request_human': params.model_dump(mode='json')}, 'actionId': 'a'},
            align_pending=Mock(), observations=[], value_fact=lambda kind, value: (kind, value))
        async def after(_): collector.observations.append(SimpleNamespace(tabId='owned-tab', url=await self.page.get_url(), facts=[]))
        ready = asyncio.Event(); control.publish = lambda _: ready.set()
        task = asyncio.create_task(control.finish_step(SimpleNamespace(history=[]), collector, after))
        try:
            await asyncio.wait_for(ready.wait(), 1)
            await control.resume(control.pending['id']); control.release(control.pending['id'])
            await task
            kind, value = collector.observations[0].facts[0]
            self.assertEqual(kind, 'verified_human_resume'); self.assertEqual(value['actionRef'], 'a')
            self.assertEqual(value['schemaVersion'], 'bat.human-resume/v2'); self.assertTrue(value['resumed'])
        finally:
            if not task.done(): task.cancel()
            await asyncio.gather(task, return_exceptions=True)


if __name__ == '__main__':
    unittest.main()
