"""Reuse the attached-browser policy for every selected browser environment."""


def disconnected_handler(on_lost):
    async def reject_reconnect(*_args, **_kwargs):
        # WHY：掉线属于既有失败/恢复合同；SDK 不得另开连接或自动重放。
        on_lost()
    return reject_reconnect
