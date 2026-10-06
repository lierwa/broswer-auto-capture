"""Protect host-confirmed continuation across real URL changes without weakening ownership."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'python'))
from workflow_use.hybrid.human_wait import HumanRequestParams, HumanWaitParams, HumanWaitControl
from workflow_use.hybrid.human_wait_compile import compile_human_wait
from workflow_use.hybrid.evidence import EvidenceRef, digest


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


if __name__ == '__main__':
    unittest.main()
