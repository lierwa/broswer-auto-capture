"""Fixed-metadata lifecycle observation that never changes the observed operation."""
import asyncio


def action_metadata(registry, raw_action, step_number):
    if (type(step_number) is not int or step_number < 0 or step_number > 9007199254740991
            or not isinstance(raw_action, dict) or len(raw_action) != 1):
        return {}
    name = next(iter(raw_action))
    if not isinstance(name, str) or name not in registry.names:
        return {}
    return {'actionName': name, 'stepNumber': step_number}


def emit_lifecycle(diagnostic, phase, status, metadata=None):
    if diagnostic is None:
        return
    try:
        diagnostic({'phase': phase, 'status': status, **(metadata or {})})
    except Exception:
        pass


async def observe_lifecycle(diagnostic, phase, operation, metadata=None, result_failed=None):
    emit_lifecycle(diagnostic, phase, 'started', metadata)
    try:
        result = await operation()
    except asyncio.CancelledError:
        emit_lifecycle(diagnostic, phase, 'cancelled', metadata)
        raise
    except Exception:
        emit_lifecycle(diagnostic, phase, 'failed', metadata)
        raise
    status = 'failed' if result_failed is not None and result_failed(result) else 'completed'
    emit_lifecycle(diagnostic, phase, status, metadata)
    return result
