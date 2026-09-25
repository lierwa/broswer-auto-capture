"""Bounded, non-sensitive diagnostics for the managed Browser-Use runner."""

import json
import os


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

    def close(self):
        if self.channel is None:
            return
        try:
            self.channel.close()
        except Exception:
            pass
