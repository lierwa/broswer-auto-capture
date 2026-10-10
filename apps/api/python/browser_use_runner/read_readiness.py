"""Adapt existing bounded postcondition checks for required read inputs."""
from workflow_use.hybrid.postconditions import declared_checks, verify_declared, settle_policy


async def wait_required_paths(browser, command, scope):
    if not command.requiredPaths:
        return
    # WHY：消费者必需的值不能来自过渡页的空集合；只重读事实，不重派浏览器动作或模型。
    conditions = [{'kind': 'read_fields', 'ready': True, 'consumerRef': 'current-read',
        'read': command.specification.model_dump(mode='json'), 'scope': scope,
        'requiredPaths': command.requiredPaths, 'inherited': command.inherited,
        'settle': {'maxMs': 30000, 'maxAttempts': 100, 'intervalMs': 300}}]
    await verify_declared(browser, declared_checks(conditions, {}, None), settle_policy(conditions))
