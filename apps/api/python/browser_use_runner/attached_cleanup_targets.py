"""Pinned extension enumeration is control state; native CDP enumeration is target state."""
import re


async def extension_bridge(client):
    product = (await client.send.Browser.getVersion()).get('product')
    if product == 'Chrome/Extension-Bridge':
        return True
    if isinstance(product, str) and re.fullmatch(r'(?:Chrome|HeadlessChrome|Chromium)/[0-9][0-9A-Za-z.+-]*', product):
        return False
    # WHY：版本不可核验时不能猜成可信原生端点，更不能拿空枚举伪确认页面已关闭。
    raise ValueError('hybrid_attached_window_end_unconfirmed')


async def targets_to_close(window, lease, client):
    return lease.ownedTargets if await extension_bridge(client) else await window._existing(lease, client)


async def assert_closed_enumeration(lease, client, existing):
    if not existing and lease.ownedTargets and await extension_bridge(client):
        raise ValueError('hybrid_attached_window_end_unconfirmed')
