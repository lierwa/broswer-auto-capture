# 公共持久预算适配

本包只维护从原 browser_use_runner/quota.py 移入的 check(database, scope, rates)；PyrateLimiter 4.5.0/filelock 3.19.1 拥有窗口、SQL 和进程锁。数据库路径、scope 和限额由调用方传入，B-A-T 与盾不共享运行数据。

维护者用 node scripts/request-budget.mjs build 通过 build 1.2.2.post1/Hatchling 1.27.0 冻结标准纯 Python wheel；来源与摘要记录在 tools/antibot-lab/shared/request-budget.json。生成 wheel 不入 Git。干净 checkout 的普通 runner setup 在受管环境准备后按已冻结摘要重建缺失制品；rebuild/--check 不会重登记来源，摘要不同明确失败。

B-A-T 受管环境安装固定 wheel（--no-deps），兼容 quota.py 仅导出该函数；盾发布包包含同一 wheel，用隔离 Python -I 校验后显式 ZIP 加载。不新建 RPC、SQL、锁或第二限流器。

tests/contract.py 保护兼容函数身份及独立数据范围；并发/持久/短窗/坏数据库沿用原验收。真实小时、日、断电和跨 OS 同库并发没有新增通过声明。
