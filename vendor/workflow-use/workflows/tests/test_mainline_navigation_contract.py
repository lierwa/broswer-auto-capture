"""A server-added query key is a physical landing fact, not a second navigation."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from workflow_use.hybrid.navigation import navigation_destination_matches
from workflow_use.hybrid.postconditions import declared_checks, check_fact, _bind_attempt_reads
from workflow_use.hybrid.read import ReadField, read_value
from workflow_use.hybrid.rendered_field_text import FieldReadError
from workflow_use.hybrid.method_read_tool import _safe_read_error


class MainlineNavigationContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_server_query_additions_preserve_requested_query_multivalues_and_exact_equals(self):
        expected = 'https://example.test/detail/1?q=a&q=b#part'
        actual = 'https://example.test/detail/1?q=a&q=b&view=summary#part'
        self.assertTrue(navigation_destination_matches(expected, actual))
        for invalid in ['https://other.test/detail/1?q=a&q=b#part',
                        'https://example.test/detail/2?q=a&q=b#part',
                        'https://example.test/detail/1?q=a&q=c#part',
                        'https://example.test/detail/1?q=a&q=b&q=c#part',
                        'https://example.test/detail/1?q=a&q=b#other']:
            self.assertFalse(navigation_destination_matches(expected, invalid))
        browser = SimpleNamespace(get_current_page=AsyncMock(return_value=SimpleNamespace(get_url=AsyncMock(return_value=actual))))
        bound = declared_checks([{'kind': 'url', 'bindingArgument': 'url'}], {'url': expected}, None)[0]
        exact = declared_checks([{'kind': 'url', 'equals': expected}], {}, None)[0]
        self.assertTrue((await check_fact(bound.parameters, browser))[0])
        self.assertFalse((await check_fact(exact.parameters, browser))[0])

    def test_readiness_uses_landed_document_only_when_requested_url_preserved(self):
        check = SimpleNamespace(parameters={'kind': 'read_fields', 'navigationScope': True,
            'scope': {'url': 'https://example.test/detail/1'}})
        _bind_attempt_reads([check], (None, 'tab', 'https://example.test/detail/1?view=x', 1, 'session'))
        self.assertEqual(check.parameters['_runtimeReadScope']['url'], 'https://example.test/detail/1?view=x')
        check = SimpleNamespace(parameters={'kind': 'read_fields', 'navigationScope': True,
            'scope': {'url': 'https://example.test/detail/1'}})
        _bind_attempt_reads([check], (None, 'tab', 'https://example.test/detail/2', 1, 'session'))
        self.assertNotIn('_runtimeReadScope', check.parameters)

    def test_invalid_number_returns_fixed_field_reason_without_original_page_text(self):
        for kind in ['integer', 'number']:
            with self.assertRaises(FieldReadError) as caught:
                read_value('amount', 'private page text', ReadField(selector='.value', valueType=kind))
            message = _safe_read_error(caught.exception, {'amount'})
            self.assertIn('read_number_invalid', message)
            self.assertIn('amount', message)
            self.assertNotIn('private page text', message)
