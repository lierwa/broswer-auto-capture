"""Offline owner control using the existing native lease implementations."""
from browser_use_runner.attached_window import AttachedWindow
from browser_use_runner.managed_window import ManagedWindow


async def control_window(request):
    attached = request.browserMode == 'daily' or (request.browserMode is None
        and not ManagedWindow.has_lease(request.profilePath, request.ownerId)
        and AttachedWindow.has_lease(request.profilePath, request.ownerId))
    if attached:
        window = AttachedWindow(request.profilePath, request.ownerId, request.cdpUrl,
                                legacy_endpoint_verified=request.legacyEndpointVerified)
        if request.action == 'end':
            return await window.end(request.leaseId, controller_released=request.controllerReleased)
        return await getattr(window, request.action)(request.leaseId)
    window = ManagedWindow(request.profilePath, request.ownerId)
    # WHY：正常关闭落盘登录；复用进程仅结束同 owner 的目标，不结束其它窗口。
    if request.action == 'end':
        return await window.end_gracefully(request.leaseId)
    return getattr(window, 'inspect' if request.action == 'verify_closed' else request.action)(request.leaseId)
