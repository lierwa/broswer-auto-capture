"""Fixed-metadata lifecycle observation that never changes the observed operation."""
import asyncio


def action_metadata(registry, raw_action, step_number):
    if (type(step_number) is not int or step_number < 0 or step_number > 9007199254740991
            or not isinstance(raw_action, dict) or len(raw_action) != 1):
        return {}
    name = next(iter(raw_action))
    if not isinstance(name, str) or name not in registry.names:
        return {}
    metadata = {'actionName': name, 'stepNumber': step_number}
    arguments = raw_action.get(name)
    selector = arguments.get('selector') if name == 'find_elements' and isinstance(arguments, dict) else None
    if isinstance(selector, str) and 0 < len(selector) <= 2000:
        metadata['selector'] = selector
    if name == 'bat_read_fields' and isinstance(arguments, dict):
        output_path, container = arguments.get('outputPath'), arguments.get('container')
        if (isinstance(output_path, list) and len(output_path) <= 32
                and all(isinstance(item, (str, int)) and not isinstance(item, bool) for item in output_path)):
            metadata['outputPath'] = output_path
        if isinstance(container, str) and 0 < len(container) <= 2000:
            metadata['container'] = container
    return metadata


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
