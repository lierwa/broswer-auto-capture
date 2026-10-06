"""Constrain native author dispatch using the existing capture callback boundary."""

READ_ACTIONS = frozenset({'navigate', 'wait', 'find_elements', 'search_page',
                         'bat_inspect_dom', 'bat_read_fields', 'done'})


def install_read_only(callbacks, entry_urls):
    normalize, before_dispatch = callbacks.normalize_action, callbacks.before_dispatch
    denied = False

    def normalize_read_only(action):
        nonlocal denied
        normalize(action)
        raw = action.model_dump(exclude_unset=True)
        if len(raw) != 1:
            denied = True
            return
        name, arguments = next(iter(raw.items()))
        # WHY：只读研究不能把同站其它写入入口当成已授权来源，也不能另开控制标签。
        denied = (name not in READ_ACTIONS or name == 'navigate' and (
            arguments.get('url') not in entry_urls or arguments.get('new_tab') is True))

    def read_only_dispatch():
        if denied or callbacks.current_action.get('actionName') not in READ_ACTIONS:
            raise RuntimeError('author_read_only_action_denied')
        if before_dispatch is not None:
            before_dispatch()

    callbacks.normalize_action = normalize_read_only
    callbacks.before_dispatch = read_only_dispatch
