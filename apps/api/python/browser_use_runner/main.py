"""Canonical v2 protocol entry. The original v1 runner is preserved as H0/H6 evidence."""
import asyncio

from browser_use_runner.hybrid_main import main


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except asyncio.CancelledError:
        pass
