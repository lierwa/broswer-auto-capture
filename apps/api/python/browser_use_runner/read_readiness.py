"""Adapt existing bounded postcondition checks for required read inputs."""
from workflow_use.hybrid.postconditions import declared_checks, verify_declared, settle_policy


async def wait_required_paths(browser, command, scope):
    schema = command.specification.outputSchema
    requires_record = schema.get('type') == 'object' or schema.get('minItems', 0) > 0
    if not command.requiredPaths and not requires_record:
        return
    # WHY：单条/非空结果本身即要求记录存在，不能因没有下游路径而跳过已声明CSS条件。
    # 可选空集合仍立即返回；只复用既有有界等待重读事实，不重派动作或调用模型。
    conditions = [{'kind': 'read_fields', 'ready': True, 'consumerRef': 'current-read',
        'read': command.specification.model_dump(mode='json'), 'scope': scope,
        'requiredPaths': command.requiredPaths, 'inherited': command.inherited,
        'settle': {'maxMs': 30000, 'maxAttempts': 100, 'intervalMs': 300}}]
    await verify_declared(browser, declared_checks(conditions, {}, None), settle_policy(conditions))
