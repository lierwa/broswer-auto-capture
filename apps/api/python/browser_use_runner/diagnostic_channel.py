"""Bounded, non-sensitive diagnostics for the managed Browser-Use runner."""

import json
import os

BEFORE_ACTION_STAGES = frozenset({
    'live_current_page', 'live_target_before', 'live_document_session', 'live_document_root',
    'live_target_after', 'live_document_other', 'observation_title', 'observation_url',
})
ERROR_KINDS = frozenset({'timeout_error', 'os_error', 'runtime_error', 'value_error', 'other_error'})
AUTHOR_TRANSPORT_STATUSES = {
    'serialize_started': 'started', 'serialize_completed': 'completed', 'serialize_failed': 'failed',
    'write_started': 'started', 'write_completed': 'completed', 'write_failed': 'failed',
}


class DiagnosticChannel:
    def __init__(self):
        self.channel = None
        if os.environ.get('BAT_SOURCE_LIFECYCLE_DIAGNOSTICS') != '1':
            return
        try:
            self.channel = os.fdopen(4, 'w', buffering=1)
        except OSError:
            self.channel = None

    def emit(self, event):
        try:
            keys = set(event)
            if event.get('phase') in ('before_action_detail', 'author_transport'):
                if self.channel is not None and self._fixed_event(event, keys):
                    self.channel.write(json.dumps(event, ensure_ascii=False, allow_nan=False) + '\n')
                return
            if self.channel is None or keys - {'phase', 'status', 'actionName', 'stepNumber', 'selector',
                                               'queryOutcome', 'matchCount', 'contextOutcome', 'contextCount',
                                               'outputPath', 'container',
                                               'readOutcome', 'readError'}:
                return
            if event.get('phase') not in {'author', 'before_action', 'after_step', 'dispatch'}:
                return
            if event.get('status') not in {'started', 'completed', 'failed', 'cancelled'}:
                return
            has_name, has_step = 'actionName' in event, 'stepNumber' in event
            if has_name != has_step:
                return
            if has_name and (not isinstance(event['actionName'], str) or type(event['stepNumber']) is not int
                             or event['stepNumber'] < 0 or event['stepNumber'] > 9007199254740991):
                return
            query_keys = {'selector', 'queryOutcome', 'matchCount', 'contextOutcome', 'contextCount'} & keys
            if query_keys and event.get('actionName') != 'find_elements':
                return
            if 'selector' in event and (not isinstance(event['selector'], str)
                                        or not 0 < len(event['selector']) <= 2000):
                return
            if 'queryOutcome' in event and event['queryOutcome'] not in {
                    'matched', 'no_match', 'invalid_selector', 'error', 'unavailable'}:
                return
            if 'matchCount' in event and (type(event['matchCount']) is not int or event['matchCount'] < 0
                                          or event['matchCount'] > 9007199254740991):
                return
            if 'contextOutcome' in event and event['contextOutcome'] not in {'enriched', 'failed'}:
                return
            if ('contextCount' in event and (event.get('contextOutcome') != 'enriched'
                    or type(event['contextCount']) is not int or not 0 <= event['contextCount'] <= 20)):
                return
            read_keys = {'outputPath', 'container', 'readOutcome', 'readError'} & keys
            if read_keys and event.get('actionName') != 'bat_read_fields':
                return
            if 'outputPath' in event:
                output_path = event['outputPath']
                if (not isinstance(output_path, list) or len(output_path) > 32
                        or any(not isinstance(item, (str, int)) or isinstance(item, bool) for item in output_path)):
                    return
            if 'container' in event and (not isinstance(event['container'], str)
                                         or not 0 < len(event['container']) <= 2000):
                return
            if 'readOutcome' in event and event['readOutcome'] not in {'succeeded', 'failed', 'unavailable'}:
                return
            if 'readError' in event and (event.get('readOutcome') != 'failed'
                                         or not isinstance(event['readError'], str)
                                         or not 0 < len(event['readError']) <= 2000):
                return
            self.channel.write(json.dumps(event, ensure_ascii=False, allow_nan=False) + '\n')
        except Exception:
            pass

    @staticmethod
    def _fixed_event(event, keys):
        if event.get('phase') == 'author_transport':
            return (keys == {'phase', 'status', 'code'}
                    and AUTHOR_TRANSPORT_STATUSES.get(event.get('code')) == event.get('status'))
        if keys != {'phase', 'status', 'actionName', 'stepNumber', 'stage', 'errorKind'}:
            return False
        return (event.get('status') == 'failed' and isinstance(event.get('actionName'), str)
                and type(event.get('stepNumber')) is int and 0 <= event['stepNumber'] <= 9007199254740991
                and event.get('stage') in BEFORE_ACTION_STAGES and event.get('errorKind') in ERROR_KINDS)

    def close(self):
        if self.channel is None:
            return
        try:
            self.channel.close()
        except Exception:
            pass
