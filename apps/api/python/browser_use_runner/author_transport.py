"""Safe fd3 response boundary for one hybrid authoring request."""
import json


def write_author_result(channel, identity, response, diagnostics):
    def mark(code, status):
        diagnostics.emit({'phase': 'author_transport', 'status': status, 'code': code})

    mark('serialize_started', 'started')
    try:
        payload = json.dumps(response, ensure_ascii=False, allow_nan=False)
    except Exception:
        # WHY：来源结果无法编码时，fd3 仍须返回固定失败包；异常原文与页面值不越过 owner。
        mark('serialize_failed', 'failed')
        payload = json.dumps({'id': identity, 'ok': False, 'code': 'hybrid_runner_failed',
                              'reason': 'RuntimeError:author_result_serialization_failed'})
    else:
        mark('serialize_completed', 'completed')
    mark('write_started', 'started')
    try:
        channel.write(payload + '\n')
    except Exception:
        mark('write_failed', 'failed')
        raise
    mark('write_completed', 'completed')
