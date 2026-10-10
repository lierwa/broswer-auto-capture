"""Adapt pinned ghost-cursor paths to the existing per-browser CDP Input surface."""
import asyncio
from contextlib import contextmanager
from contextvars import ContextVar
import json
import logging
import math
from pathlib import Path
import shutil
import subprocess

SCRIPT = Path(__file__).with_name('trajectory.mjs')
ROOT = SCRIPT.parents[4]
logger = logging.getLogger(__name__)
_native_timing = ContextVar('bat_pointer_native_timing', default=False)


@contextmanager
def native_pointer_timing():
    # WHY：长轨迹已在取点前完成；只给本次原点击保留上游移动时序，不影响其它异步任务。
    token = _native_timing.set(True)
    try:
        yield
    finally:
        _native_timing.reset(token)


async def trajectory(start, end):
    process = await asyncio.create_subprocess_exec(
        shutil.which('node') or 'node', str(SCRIPT), json.dumps({'start': start, 'end': end}),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, cwd=ROOT,
        **({'creationflags': subprocess.CREATE_NO_WINDOW} if hasattr(subprocess, 'CREATE_NO_WINDOW') else {}))
    try:
        output, _ = await asyncio.wait_for(process.communicate(), timeout=3)
        if process.returncode or len(output) > 65_536:
            raise ValueError('trajectory_generation_failed')
        points = json.loads(output)
        if not isinstance(points, list) or len(points) > 256:
            raise ValueError('trajectory_shape_invalid')
        for point in points:
            if (set(point) != {'x', 'y', 'at'} or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in point.values())
                    or not 0 <= point['at'] <= 8000 or min(point['x'], point['y']) < 0):
                raise ValueError('trajectory_point_invalid')
        return points
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()


def adapt_pointer(client, generate=trajectory):
    channel = client.send.Input
    if getattr(channel, '_bat_pointer', False):
        return
    original = channel.dispatchMouseEvent
    positions, pressed = {}, set()
    acknowledgements = dict.fromkeys(('mouseMoved', 'mousePressed', 'mouseReleased'), 0)
    channel._bat_input_acknowledgements = acknowledgements
    outcomes = {key: dict.fromkeys(('attempted', 'cancelled', 'failed'), 0) for key in acknowledgements}
    channel._bat_input_outcomes = outcomes

    async def send(params, session_id):
        counts = outcomes.get(params.get('type'))
        if counts is not None: counts['attempted'] += 1
        try:
            result = await original(params, session_id=session_id)
        except asyncio.CancelledError:
            if counts is not None: counts['cancelled'] += 1
            raise
        except Exception:
            if counts is not None: counts['failed'] += 1
            raise
        if counts is not None: acknowledgements[params['type']] += 1
        return result

    async def dispatch(params, session_id=None):
        kind = params.get('type')
        key = session_id or ''
        end = {name: params.get(name) for name in ('x', 'y')}
        start = positions.get(key)
        movable = (not _native_timing.get() and kind == 'mouseMoved' and key not in pressed and not params.get('buttons')
                   and params.get('pointerType', 'mouse') == 'mouse' and start is not None
                   and all(isinstance(v, (int, float)) and math.isfinite(v) for v in end.values()))
        if movable and math.dist(tuple(start.values()), tuple(end.values())) >= 2:
            try:
                points = await generate(start, end)
            except Exception:
                # 库/路径不可用明确诊断；保留上游兼容动作，不能伪称该次已有拟人轨迹。
                logger.warning('input_trajectory_unavailable')
                points = []
            clock = asyncio.get_running_loop()
            began = clock.time()
            for point in points[:-1]:
                await asyncio.sleep(max(0, point['at'] / 1000 - (clock.time() - began)))
                await send({**params, 'x': point['x'], 'y': point['y']}, session_id)
                positions[key] = {name: point[name] for name in ('x', 'y')}
            if points:
                await asyncio.sleep(max(0, points[-1]['at'] / 1000 - (clock.time() - began)))
        # 不吞 CancelledError，不改鼠标按下/释放/滚轮/拖拽/pen，不伪造 timestamp。
        result = await send(params, session_id)
        if kind == 'mousePressed':
            pressed.add(key)
        elif kind == 'mouseReleased':
            pressed.discard(key)
        if kind in ('mouseMoved', 'mousePressed', 'mouseReleased'):
            if len(positions) >= 128 and key not in positions:
                oldest = next(iter(positions)); positions.pop(oldest); pressed.discard(oldest)
            positions[key] = end
        return result

    channel.dispatchMouseEvent = dispatch
    channel._bat_pointer = True
