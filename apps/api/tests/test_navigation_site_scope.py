"""Confirmed site policies preserve redirect boundaries across the TS/Python bridge."""
import unittest
from browser_use_runner.site_scope import allowed_url, allowed_domain_patterns


class NavigationSiteScopeTests(unittest.TestCase):
    def test_confirmed_redirect_scope_does_not_grant_other_origins(self):
        sites = [dict(scheme='https', domain='localhost', port=4185, includeSubdomains=False),
                 dict(scheme='https', domain='shield.localhost', port=4185, includeSubdomains=True)]
        for url in ('https://localhost:4185/', 'https://case-123.shield.localhost:4185/result'):
            self.assertTrue(allowed_url(url, sites), url)
        for url in ('https://other.localhost:4185/', 'http://case-123.shield.localhost:4185/',
                    'https://case-123.shield.localhost:4186/', 'https://shield.localhost.evil.test:4185/',
                    'https://user:pass@case-123.shield.localhost:4185/'):
            self.assertFalse(allowed_url(url, sites), url)
        self.assertIn('https://*.shield.localhost:4185/*', allowed_domain_patterns(sites))

    def test_explicit_default_port_is_equivalent_but_other_ports_are_not(self):
        for scheme, port in (('https', 443), ('http', 80)):
            sites = [dict(scheme=scheme, domain='example.org', port=None, includeSubdomains=True)]
            self.assertTrue(allowed_url(f'{scheme}://login.example.org:{port}/', sites))
            self.assertFalse(allowed_url(f'{scheme}://login.example.org:4185/', sites))
