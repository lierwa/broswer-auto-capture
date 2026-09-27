"""Recorded media playback must survive navigation and observation timing."""
import unittest
from types import SimpleNamespace

from workflow_use.hybrid.evidence import EvidenceRef, ObservationFact, digest
from workflow_use.hybrid.natural_compile import natural_postconditions
from workflow_use.hybrid.natural_media_compile import bind_recorded_playback
from workflow_use.hybrid.postconditions import declared_checks, settle_policy

REF = EvidenceRef(ref='fixture:media', digest='1' * 64)
WAIT_REF = EvidenceRef(ref='fixture:wait', digest='2' * 64)


def observation(number, url, media, clock):
    identity = f'o-{number:04d}'
    return SimpleNamespace(id=identity, sequence=number - 1, tabId='tab-1', url=url,
        facts=[ObservationFact(id=identity + '-url', kind='url_digest', value=digest(url), sourceRefs=[REF]),
               ObservationFact(id=identity + '-clock', kind='monotonic_ms', value=clock, sourceRefs=[REF]),
               ObservationFact(id=identity + '-media', kind='media_playback', value=media, sourceRefs=[REF])],
        sourceRefs=[REF])


def click_and_wait(observations):
    click = SimpleNamespace(id='a-0001', name='click', args={}, effect='external_write',
        status='succeeded', resultRef=REF, preObservationRef='o-0001', postObservationRef='o-0002')
    wait = SimpleNamespace(id='a-0002', name='wait', args={'seconds': 3}, effect='none',
        status='succeeded', resultRef=WAIT_REF, preObservationRef='o-0003', postObservationRef='o-0004')
    conditions, refs, issues = natural_postconditions(click, observations[0], observations[1], None, [])
    assert not issues
    segment = {'id': 's-a-0001', 'operation': {'name': 'browser.workflow-step'},
               'target': None, 'postconditions': conditions,
               'proofRefs': [ref.model_dump(mode='json') for ref in refs]}
    return SimpleNamespace(actions=[click, wait], observations=observations), segment


class MediaCompilationTests(unittest.TestCase):
    def setUp(self):
        self.registry = SimpleNamespace(validate_action=lambda _name, _args: None)

    def test_wait_pre_playing_on_new_page_checks_playback_after_click(self):
        old, new = 'https://example.test/list', 'https://example.test/player'
        trace, segment = click_and_wait([
            observation(1, old, 'playing', 0),
            observation(2, new, 'not_playing', 2000),
            observation(3, new, 'playing', 15000),
            observation(4, new, 'not_playing', 18000),
        ])

        issues = bind_recorded_playback(trace, self.registry, [segment])

        self.assertEqual(issues, [])
        self.assertEqual([item['kind'] for item in segment['postconditions']],
                         ['url_digest', 'media_playback'])
        self.assertTrue(segment['postconditions'][0]['changed'])
        self.assertEqual(segment['postconditions'][1]['equals'], 'playing')
        self.assertEqual(segment['postconditions'][1]['clauseRef'], 'o-0003-media')
        self.assertEqual(segment['postconditions'][1]['settle']['maxMs'], 30000)
        checks = declared_checks(segment['postconditions'], {}, None, allow_unresolved_target=True)
        self.assertEqual([check.name for check in checks], ['url_digest', 'media_playback'])
        self.assertEqual(settle_policy(segment['postconditions']).maxMs, 30000)
        self.assertIn(WAIT_REF.model_dump(mode='json'), segment['proofRefs'])

    def test_other_page_or_unbounded_wait_cannot_own_playback(self):
        old, new = 'https://example.test/list', 'https://example.test/player'
        for later_url, later_clock in [('https://example.test/other', 15000), (new, 35000)]:
            with self.subTest(later_url=later_url, later_clock=later_clock):
                trace, segment = click_and_wait([
                    observation(1, old, 'playing', 0),
                    observation(2, new, 'not_playing', 2000),
                    observation(3, later_url, 'playing', later_clock),
                    observation(4, later_url, 'not_playing', later_clock + 3000),
                ])

                issues = bind_recorded_playback(trace, self.registry, [segment])

                self.assertIn('media_playback_owner_unproven', [issue.reason for issue in issues])
                self.assertEqual([item['kind'] for item in segment['postconditions']], ['url_digest'])

    def test_navigation_post_playing_keeps_url_and_adds_media(self):
        old, new = 'https://example.test/list', 'https://example.test/player'
        before = observation(1, old, 'playing', 0)
        after = observation(2, new, 'playing', 2000)
        click = SimpleNamespace(id='a-0001', name='click', args={}, effect='external_write',
            status='succeeded', resultRef=REF, preObservationRef=before.id, postObservationRef=after.id)
        conditions, refs, issues = natural_postconditions(click, before, after, None, [])
        self.assertEqual(issues, [])
        segment = {'id': 's-a-0001', 'operation': {'name': 'browser.workflow-step'},
                   'target': None, 'postconditions': conditions,
                   'proofRefs': [ref.model_dump(mode='json') for ref in refs]}

        issues = bind_recorded_playback(SimpleNamespace(actions=[click], observations=[before, after]),
                                        self.registry, [segment])

        self.assertEqual(issues, [])
        self.assertEqual([item['kind'] for item in segment['postconditions']],
                         ['url_digest', 'media_playback'])
        self.assertEqual(segment['postconditions'][1]['clauseRef'], 'o-0002-media')

    def test_same_page_playing_before_and_after_click_is_not_new_playback(self):
        url = 'https://example.test/player'
        before = observation(1, url, 'playing', 0)
        after = observation(2, url, 'playing', 2000)
        click = SimpleNamespace(id='a-0001', name='click', args={}, effect='external_write',
            status='succeeded', resultRef=REF, preObservationRef=before.id, postObservationRef=after.id)
        segment = {'id': 's-a-0001', 'operation': {'name': 'browser.workflow-step'},
                   'target': None, 'postconditions': [{'kind': 'url_digest', 'unchanged': True}],
                   'proofRefs': []}

        issues = bind_recorded_playback(SimpleNamespace(actions=[click], observations=[before, after]),
                                        self.registry, [segment])

        self.assertEqual(issues, [])
        self.assertEqual([item['kind'] for item in segment['postconditions']], ['url_digest'])

    def test_media_does_not_join_an_incompatible_settle_policy(self):
        url = 'https://example.test/player'
        before = observation(1, url, 'not_playing', 0)
        after = observation(2, url, 'playing', 2000)
        click = SimpleNamespace(id='a-0001', name='click', args={}, effect='external_write',
            status='succeeded', resultRef=REF, preObservationRef=before.id, postObservationRef=after.id)
        segment = {'id': 's-a-0001', 'operation': {'name': 'browser.workflow-step'},
                   'target': None, 'postconditions': [{'kind': 'url_digest', 'unchanged': True}],
                   'proofRefs': []}

        issues = bind_recorded_playback(SimpleNamespace(actions=[click], observations=[before, after]),
                                        self.registry, [segment])

        self.assertEqual([item.reason for item in issues], ['media_playback_postcondition_not_admitted'])
        self.assertEqual([item['kind'] for item in segment['postconditions']], ['url_digest'])

    def test_existing_wait_post_playing_remains_checked(self):
        before = observation(1, 'https://example.test/player', 'not_playing', 0)
        after = observation(2, before.url, 'playing', 3000)
        wait = SimpleNamespace(id='a-0001', name='wait', args={'seconds': 3}, effect='none',
            status='succeeded', resultRef=WAIT_REF, preObservationRef=before.id, postObservationRef=after.id)
        conditions, refs, issues = natural_postconditions(wait, before, after, None, [])
        self.assertEqual(issues, [])
        segment = {'id': 's-a-0001', 'operation': {'name': 'browser.workflow-step'},
                   'target': None, 'postconditions': conditions,
                   'proofRefs': [ref.model_dump(mode='json') for ref in refs]}

        issues = bind_recorded_playback(SimpleNamespace(actions=[wait], observations=[before, after]),
                                        self.registry, [segment])

        self.assertEqual(issues, [])
        self.assertEqual(segment['postconditions'], conditions)
        self.assertEqual(conditions[0]['kind'], 'media_playback')


if __name__ == '__main__':
    unittest.main()
