"""Structured site boundaries for the hybrid browser owner."""
from urllib.parse import urlsplit

from browser_use_runner.hybrid_commands import AllowedSite


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
        # WHY：browser-use 的 glob 不会把裸 origin 视作 `/*`，两种 URL 均已由宿主授权。
        patterns.extend((f"{site['scheme']}://{authority}", f"{site['scheme']}://{authority}/*"))
        if site['includeSubdomains']:
            patterns.extend((f"{site['scheme']}://*.{authority}", f"{site['scheme']}://*.{authority}/*"))
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
