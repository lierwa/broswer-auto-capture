"""Controlled fd3 child used only to verify RunnerProcess lifecycle boundaries."""
import json
import os
import sys
import time


def cleanup_result(mode):
    capability = {'stage': 'capability_close', 'status': 'confirmed', 'code': None}
    if mode == 'close_stage_failure':
        capability = {'stage': 'capability_close', 'status': 'unconfirmed',
                      'code': 'cleanup_capability_close_failed'}
    stages = [capability, {'stage': 'browser_close', 'status': 'confirmed', 'code': None}]
    return {'closed': all(stage['status'] != 'unconfirmed' for stage in stages), 'stages': stages}


def main():
    mode = os.environ.get('BAT_TEST_RUNNER_MODE', 'normal')
    channel = os.fdopen(3, 'w', buffering=1)
    try:
        for line in sys.stdin:
            request = json.loads(line)
            if request.get('type') == 'close':
                if mode == 'timeout':
                    time.sleep(60)
                    continue
                channel.write(json.dumps({'id': request['id'], 'ok': True,
                                          'result': cleanup_result(mode)}) + '\n')
                return 1 if mode == 'nonzero_exit' else 0
            channel.write(json.dumps({'id': request['id'], 'ok': True,
                                      'result': {'mode': 'controlled/v1', 'modelCalls': 0}}) + '\n')
    finally:
        channel.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
