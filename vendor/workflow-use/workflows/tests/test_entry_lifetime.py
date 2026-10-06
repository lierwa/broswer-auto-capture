"""Document-bound inputs must not compile a destructive source-page transition."""
import unittest
from types import SimpleNamespace

from workflow_use.hybrid.element_entry import ENTRY_SCHEMA
from workflow_use.hybrid.evidence import digest
from workflow_use.hybrid.natural_target_compile import natural_target
from test_element_entry import ENTRY


def observation(tab, url, document, extra=()):
    value = {'targetId': tab, 'documentDigest': document}
    fact = SimpleNamespace(kind='document_identity', value=value,
        sourceRefs=[SimpleNamespace(digest=digest(value))])
    return SimpleNamespace(tabId=tab, url=url, facts=[fact, *extra])


class EntryLifetimeTests(unittest.TestCase):
    def test_entry_click_rejects_replaced_document_before_publication(self):
        value = {'actionRef': 'a-1', 'binding': {'source': 'input', 'path': ['entry']},
                 'entry': ENTRY, 'backendNodeId': 7, 'targetId': 'target-ABCD'}
        fact = SimpleNamespace(kind='input_entry_target', value=value,
            sourceRefs=[SimpleNamespace(digest=digest({'kind': 'input_entry_target', 'value': value}))])
        pre = observation('target-ABCD', ENTRY['url'], 'a' * 64, [fact])
        schema = {'type': 'object', 'properties': {'entry': ENTRY_SCHEMA}, 'required': ['entry']}
        for tab, url, document, rejected in (
            ('target-ABCD', ENTRY['url'], 'a' * 64, False),
            ('popup-1234', 'https://example.test/detail', 'b' * 64, True),
            ('target-ABCD', 'https://example.test/detail', 'b' * 64, True),
            ('target-ABCD', ENTRY['url'], 'b' * 64, True),
        ):
            with self.subTest(tab=tab, url=url, replaced=document != 'a' * 64):
                target, _, gaps = natural_target(SimpleNamespace(name='click', id='a-1'), pre,
                    input_schema=schema, post=observation(tab, url, document))
                if rejected:
                    self.assertIsNone(target)
                    self.assertEqual([gap.reason for gap in gaps], ['input_entry_document_lifetime_unsupported'])
                else:
                    self.assertEqual(target['strategy'], 'entry')
                    self.assertEqual(gaps, [])

        for source_document in ('a' * 64, 'b' * 64):
            source = SimpleNamespace(kind='entry_source_document', value={
                'targetId': pre.tabId, 'documentDigest': source_document, 'urlDigest': digest(pre.url)})
            post = observation('popup-1234', 'https://example.test/detail', 'b' * 64, [source])
            target, _, gaps = natural_target(SimpleNamespace(name='click', id='a-1'), pre,
                input_schema=schema, post=post)
            self.assertEqual(bool(gaps), source_document != 'a' * 64)
            self.assertEqual(target is not None, source_document == 'a' * 64)


if __name__ == '__main__':
    unittest.main()
