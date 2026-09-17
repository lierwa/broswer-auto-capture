"""Canonical action identities derived only from native history positions."""


def action_refs_for_counts(counts):
    """Map explicit ``(stepIndex, actionIndex)`` positions to contiguous trace ids."""
    references, sequence = {}, 0
    for step_index, count in enumerate(counts):
        for action_index in range(count):
            sequence += 1
            references[(step_index, action_index)] = f'a-{sequence:04d}'
    return references


def history_action_refs(history):
    return action_refs_for_counts([
        len(item.model_output.action) if item.model_output else 0
        for item in history.history
    ])


def record_action_refs(records):
    return action_refs_for_counts([len(record.actions) for record in records])


def resolve_history_step(history, native_step):
    """Resolve a callback step only from the upstream StepMetadata identity."""
    if type(native_step) is not int or native_step < 1:
        raise ValueError('capture_step_identity_unavailable')
    numbered = []
    for index, item in enumerate(history.history):
        metadata = getattr(item, 'metadata', None)
        number = getattr(metadata, 'step_number', None)
        if type(number) is int:
            numbered.append((index, number))
    matches = [index for index, number in numbered if number == native_step]
    if len(matches) != 1:
        raise ValueError('captured_history_step_unavailable')
    return matches[0]


def provisional_action_ref(native_step, action_index=0):
    """Valid temporary ref; callers must rebase it before publishing a trace."""
    if type(native_step) is not int or native_step < 1 or type(action_index) is not int or action_index < 0:
        raise ValueError('capture_step_identity_unavailable')
    return f'a-{native_step:08d}{action_index:04d}'
