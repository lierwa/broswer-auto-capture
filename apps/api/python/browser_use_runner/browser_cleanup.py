"""Bounded cleanup proof for browser owners used by the hybrid runner."""
import asyncio

from browser_use_runner.managed_window import _profile_process_present


async def close_stage(name, owner, failure_code, *, profile_path=None):
    if owner is None:
        return {'stage': name, 'status': 'not_required', 'code': None}
    try:
        await (owner.close() if name == 'capability_close' else owner.kill())
        if name == 'browser_close' and profile_path is not None:
            # WHY：browser-use 0.13.8 的 kill 回执不保证 watchdog 已终止 Chromium；
            # 专用 Profile 进程仍存活时必须保留 cleanup_required，不得伪造 confirmed。
            for attempt in range(20):
                if not _profile_process_present(profile_path):
                    break
                if attempt < 19:
                    await asyncio.sleep(0.1)
            else:
                raise RuntimeError(failure_code)
    except Exception:
        # WHY: 清理协议只暴露固定阶段码；依赖异常、页面正文、PID 和本机路径不得越过 fd3。
        return {'stage': name, 'status': 'unconfirmed', 'code': failure_code}
    return {'stage': name, 'status': 'confirmed', 'code': None}
