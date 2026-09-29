"""Bounded, non-sensitive diagnostics for the managed Browser-Use runner."""

import json
import os
import re

BEFORE_ACTION_STAGES = frozenset({
    'live_current_page', 'live_target_before', 'live_document_session', 'live_document_root',
    'live_target_after', 'live_document_other', 'observation_title', 'observation_url',
})
ERROR_KINDS = frozenset({'timeout_error', 'os_error', 'runtime_error', 'value_error', 'other_error'})
AUTHOR_TRANSPORT_STATUSES = {
    'serialize_started': 'started', 'serialize_completed': 'completed', 'serialize_failed': 'failed',
    'write_started': 'started', 'write_completed': 'completed', 'write_failed': 'failed',
}
ORDINARY_ACTIONS = frozenset({'navigate', 'go_back', 'wait', 'click', 'input', 'scroll', 'send_keys',
                              'dropdown_options', 'select_dropdown', 'bat_scroll_to', 'bat_wait_for'})
POSTCONDITION_KINDS = frozenset({'url', 'url_digest', 'title', 'target_value', 'target_text', 'target_state',
                                 'target_in_view', 'target_visible', 'scroll_position', 'visible_overlays',
                                 'media_playback', 'read_fields'})
TARGET_STATE_KEYS = frozenset({'aria-expanded', 'aria-checked', 'aria-selected', 'aria-disabled',
                               'checked', 'selected', 'disabled'})
HEX_DIGEST = re.compile(r'^[a-f0-9]{64}$')
ACTION_REF = re.compile(r'^[A-Za-z0-9._:-]{1,256}$')
ERROR_CODE = re.compile(r'^ordinary_postcondition_[a-z_]{1,140}$')


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
            if event.get('phase') in ('before_action_detail', 'author_transport', 'runtime_action_failure'):
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
        if event.get('phase') == 'runtime_action_failure':
            expected = {'phase', 'status', 'actionRef', 'actionName', 'errorCode', 'dispatchCount',
                        'check', 'beforePage', 'afterPage', 'validationTarget', 'eventTarget'}
            return (keys == expected and event.get('status') == 'failed'
                    and isinstance(event.get('actionRef'), str) and ACTION_REF.fullmatch(event['actionRef']) is not None
                    and event.get('actionName') in ORDINARY_ACTIONS
                    and isinstance(event.get('errorCode'), str) and ERROR_CODE.fullmatch(event['errorCode']) is not None
                    and event.get('dispatchCount') == 1
                    and DiagnosticChannel._runtime_check(event.get('check'))
                    and DiagnosticChannel._identity(event.get('beforePage'), {'sessionDigest', 'targetDigest',
                                                                              'documentDigest', 'urlDigest'})
                    and DiagnosticChannel._identity(event.get('afterPage'), {'sessionDigest', 'targetDigest',
                                                                             'documentDigest', 'urlDigest'})
                    and DiagnosticChannel._identity(event.get('validationTarget'), {'sessionDigest', 'targetDigest',
                                                                                    'documentDigest', 'backendDigest'})
                    and DiagnosticChannel._event_target(event.get('eventTarget')))
        if event.get('phase') == 'author_transport':
            return (keys == {'phase', 'status', 'code'}
                    and AUTHOR_TRANSPORT_STATUSES.get(event.get('code')) == event.get('status'))
        if keys != {'phase', 'status', 'actionName', 'stepNumber', 'stage', 'errorKind'}:
            return False
        return (event.get('status') == 'failed' and isinstance(event.get('actionName'), str)
                and type(event.get('stepNumber')) is int and 0 <= event['stepNumber'] <= 9007199254740991
                and event.get('stage') in BEFORE_ACTION_STAGES and event.get('errorKind') in ERROR_KINDS)

    @staticmethod
    def _identity(value, keys):
        return value is None or (isinstance(value, dict) and set(value) == keys
                                 and all(isinstance(item, str) and HEX_DIGEST.fullmatch(item) is not None
                                         for item in value.values()))

    @staticmethod
    def _runtime_check(value):
        if not isinstance(value, dict) or value.get('kind') not in POSTCONDITION_KINDS:
            return False
        if type(value.get('attempts')) is not int or not 1 <= value['attempts'] <= 100:
            return False
        optional = {'expected', 'actual'} & set(value)
        if set(value) - {'kind', 'attempts', 'expected', 'actual'} or bool(optional) != (value.get('kind') == 'target_state'):
            return False
        if optional != {'expected', 'actual'}:
            return not optional
        return all(DiagnosticChannel._target_state(value[key]) for key in ('expected', 'actual'))

    @staticmethod
    def _target_state(value):
        return (isinstance(value, dict) and not set(value) - TARGET_STATE_KEYS
                and all(type(item) is bool for item in value.values()))

    @staticmethod
    def _event_target(value):
        if value is None:
            return True
        if not isinstance(value, dict) or set(value) != {
                'relation', 'trusted', 'eventCount', 'targetKind', 'targetTag', 'targetRef'}:
            return False
        tag, ref = value.get('targetTag'), value.get('targetRef')
        return (value.get('relation') in {'self', 'descendant', 'composed'}
                and type(value.get('trusted')) is bool
                and type(value.get('eventCount')) is int and 1 <= value['eventCount'] <= 1000
                and value.get('targetKind') in {'element', 'shadow_root', 'document', 'window', 'other'}
                and (tag is None or isinstance(tag, str) and re.fullmatch(r'[A-Za-z0-9-]{1,40}', tag))
                and (ref is None or isinstance(ref, str) and re.fullmatch(r'n-[0-9]{1,12}', ref)))

    def close(self):
        if self.channel is None:
            return
        try:
            self.channel.close()
        except Exception:
            pass
