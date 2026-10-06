"""Test-only catalog location; original request loop, checks, auth and native CDP stay intact."""
import asyncio, json, os
from browser_use_runner import account_session
from browser_use_runner.hybrid_main import main
from browser_use_runner.managed_window import ManagedWindow

original = account_session.catalog
platform = json.loads(os.environ['BAT_OWNED_ACCOUNT_PLATFORM'])

def catalog():
    data, source = original()
    return {**data, 'platforms': [platform]}, source

account_session.catalog = catalog
# 仅隐藏测试 Chrome：保留原可见模式的交接契约、owner 校验与 CDP 行为。
# 不能把产品 mode 改成 dedicated-headless，产品禁止把该模式交给人工登录。
launch = ManagedWindow._launch

async def hidden_launch(self, lease):
    previous = self.headless
    self.headless = True
    try:
        return await launch(self, lease)
    finally:
        self.headless = previous

ManagedWindow._launch = hidden_launch
if __name__ == '__main__':
    try:
        asyncio.run(main())
    except asyncio.CancelledError:
        pass
