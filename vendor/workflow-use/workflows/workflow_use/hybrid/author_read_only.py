"""Constrain native author dispatch using the existing capture callback boundary."""

READ_ACTIONS = frozenset({'navigate', 'wait', 'find_elements', 'search_page',
                         'bat_inspect_dom', 'bat_read_fields', 'done'})


def install_read_only(callbacks, entry_urls):
    before_dispatch = callbacks.before_dispatch

    def read_only_dispatch():
        # WHY：多动作批次不能由最后一个归一化动作覆盖全轮准入；核对实际派发位置。
        raw = callbacks.current_raw_action
        if len(raw) != 1:
            raise RuntimeError('author_read_only_action_denied')
        name, arguments = next(iter(raw.items()))
        # WHY：只读研究不能把同站其它写入入口当成已授权来源，也不能另开控制标签。
        if (name not in READ_ACTIONS or name == 'navigate' and (
                arguments.get('url') not in entry_urls or arguments.get('new_tab') is True)):
            raise RuntimeError('author_read_only_action_denied')
        if before_dispatch is not None:
            before_dispatch()

    callbacks.before_dispatch = read_only_dispatch
