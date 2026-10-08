"""Read-only, bounded target-map diagnostics for the local daily-Chrome fixture."""
import asyncio
import json
import os
from pathlib import Path

from workflow_use.hybrid.targets import TargetResolver

original = TargetResolver._resolve_index
records = []


def record_mapping(mapping, target_id):
    if len(records) >= 12:
        return
    try:
        records.append({'mappingSize': len(mapping),
            'matchingTarget': sum(node.target_id == target_id for node in mapping.values()),
            'mainFrameNodes': sum(node.frame_id is None for node in mapping.values()),
            'buttons': sum(node.node_name.lower() == 'button' for node in mapping.values())})
        Path(os.environ['BAT_M0_DIAGNOSTIC_PATH']).write_text(json.dumps(records), encoding='utf-8')
    except Exception:
        pass  # 诊断自身失败不得替换原始产品错误。


async def diagnosed(self, target, page, mapping, target_id):
    try:
        return await original(self, target, page, mapping, target_id)
    except Exception:
        # WHY：只记录本地夹具的结构计数，既不替选目标，也不改变失败分支。
        record_mapping(mapping, target_id)
        raise


TargetResolver._resolve_index = diagnosed
from browser_use_runner.hybrid_main import main, Runner
from failure_diagnostics import instrument
instrument(Runner)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except asyncio.CancelledError:
        pass
