"""Release a verified delivery receipt, preserving process and target ownership."""
import os
from browser_use_runner.window_lease_archive import archive_lease
from browser_use_runner.managed_temp import cleanup_browser_temp


def prepare_replay(window):
    from browser_use_runner.managed_window import WindowLease, _owner_process, _profile_process_present, _same_path
    if not window.path.exists():
        return {}
    if window.path != window.base_path:
        raise ValueError('hybrid_managed_window_busy')
    previous = WindowLease.model_validate_json(window.path.read_text(encoding='utf-8'))
    if (previous.status not in ('handoff', 'ended') or previous.leaseId != previous.ownerId
            or not _same_path(previous.profilePath, window.profile_path)):
        raise ValueError('hybrid_managed_window_busy')
    if previous.status == 'handoff' and previous.ownerId not in window.released_owners:
        raise ValueError('hybrid_managed_window_busy')
    live = _owner_process(previous) is not None
    if live:
        if not window._verify(previous, require_target=False)[0]:
            raise ValueError('hybrid_managed_window_cdp_changed')
        if window.headless != previous.headless:
            raise ValueError('hybrid_managed_window_visibility_conflict')
    elif _profile_process_present(window.profile_path):
        raise ValueError('hybrid_managed_window_owner_unknown')
    else:
        cleanup_browser_temp(previous)
        previous.status = 'ended'
    if previous.targetCreationPending:
        raise ValueError('hybrid_attached_window_create_unconfirmed')
    if previous.targetId and previous.targetId not in previous.ownedTargets:
        previous.ownedTargets.append(previous.targetId)
    previous.retainedProcess = live
    window._save(previous)
    archive_lease(window.base_path, previous, release_current=False)
    if not live:
        return {'_replaceReceipt': True}
    return {'_replaceReceipt': True, **{key: getattr(previous, key) for key in ('browserPid', 'browserStarted', 'browserExe',
        'cdpPort', 'browserId', 'retainedProcess', 'browserTempPath')}}
