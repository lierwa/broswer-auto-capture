"""One bounded verification attempt must read page facts from one live page."""
import unittest

from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.natural_readiness import NATURAL_SETTLE
from workflow_use.hybrid.postconditions import PostconditionNotMet, declared_checks, read_fact, verify_once


class Page:
    def __init__(self, target_id, url):
        self.target_id, self.url = target_id, url
        self.url_reads = self.media_reads = 0
        self.after_second_url = None

    async def get_target_info(self):
        return {'targetId': self.target_id}

    async def get_url(self):
        value = self.url
        self.url_reads += 1
        if self.url_reads == 2 and self.after_second_url is not None:
            self.after_second_url()
        return value

    async def evaluate(self, _script):
        self.media_reads += 1
        return 'playing'


class Browser:
    def __init__(self, page):
        self.current_page = page
        self.agent_focus_target_id = page.target_id
        self.page_reads = 0

    async def get_current_page(self):
        self.page_reads += 1
        return self.current_page


def checks():
    result = declared_checks([
        {'kind': 'url_digest', 'changed': True, 'settle': NATURAL_SETTLE},
        {'kind': 'media_playback', 'equals': 'playing', 'settle': NATURAL_SETTLE},
    ], {}, None)
    result[0].parameters.update(expected=digest('https://fixture.invalid/list'), baselineCaptured=True)
    return result


class PageIdentityTests(unittest.IsolatedAsyncioTestCase):
    async def test_url_and_media_share_page_in_successful_attempt(self):
        page = Page('tab-a', 'https://fixture.invalid/player')
        browser = Browser(page)

        await verify_once(browser, checks())

        self.assertEqual(page.media_reads, 1)
        self.assertEqual(browser.page_reads, 2)
        other = Page('tab-b', 'https://fixture.invalid/other')
        browser.current_page, browser.agent_focus_target_id = other, other.target_id
        self.assertEqual(await read_fact('url_digest', None, browser), digest(other.url))

    async def test_focus_target_or_url_drift_retries_without_mixing_page_facts(self):
        for drift in ('focus', 'target', 'url'):
            with self.subTest(drift=drift):
                page = Page('tab-a', 'https://fixture.invalid/player')
                other = Page('tab-b', 'https://fixture.invalid/other')
                browser = Browser(page)

                def change_page():
                    if drift == 'url':
                        page.url = 'https://fixture.invalid/changed'
                    else:
                        browser.current_page = other
                        if drift == 'focus':
                            browser.agent_focus_target_id = other.target_id

                page.after_second_url = change_page
                with self.assertRaises(PostconditionNotMet) as raised:
                    await verify_once(browser, checks())

                self.assertEqual(str(raised.exception), 'ordinary_postcondition_page_identity_changed')
                self.assertEqual(page.media_reads, 1)
                self.assertEqual(other.media_reads, 0)


if __name__ == '__main__':
    unittest.main()
