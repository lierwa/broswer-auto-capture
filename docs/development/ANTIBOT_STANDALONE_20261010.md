# 盾独立化交付

> 当前结果已推进到[盾独立化纠正与交付结算](SHIELD_INDEPENDENCE_CLOSEOUT_20261010.md)：消重、固定公共制品、空实例构建及搬迁/恢复已补验。以下第一次实现及随后只读review保留为历史，不代替最新回执。

> **后续只读 review 纠正：本文保留第一次工程实现与验收事实，不代表独立化全部收尾。** 已发现盾 budget.py 重复原 quota 适配、网页漏展示 typing-cadence；全新安装及搬迁交付仍有缺口。后续按[完整独立化方案](SHIELD_INDEPENDENCE_PLAN_20261010.md)共享既有代码单一来源，并将公共依赖纳入发布物。本文“可单独复制”的证据只适用于当时副本；新公共包结构需重新验证完整发布包。本轮仅文档，尚未修这些问题。

主线先完成并本地提交`dc45be4f07fd2e9c4a425c0d257e8b1aaef8ed80`，随后才实施本阶段。本阶段改动保留在同一个master工作区，未追加第二次提交，没有推送或关机。

## 独立边界

- 源码继续位于`tools/antibot-lab`，可单独复制；运行不导入B-A-T的API/Python runner、contracts或根依赖。根npm命令只是转发，start.cmd直接使用本包。
- 独立package/lock包含真实运行及构建依赖，版本复用现有已锁定版本；检查、构建夹具和测试有本包入口。原CrowdSec Go存储测试按字节迁入盾tests，B-A-T业务联合验收留在API包。
- 源码路径从模块自身解析，数据由本包`local.json`或`BAT_ANTIBOT_DATA`选择，默认`.local`，相对值相对盾目录。当前机器通过ignored配置引用原数据，数据库、secret、证书及失败报告均保留，没有重建或移动。
- Node/原Rollup/TypeScript、WSL systemd、CrowdSec/Traefik/HAProxy及原固定制品继续承担原职责。WSL服务显式收到同一数据目录的Linux路径。盾预算薄适配直接调用原PyrateLimiter SQLiteBucket，移除对B-A-T模块的反向导入，未重写SQL/滑窗/进程锁。
- 原探针构建只将固定上游模块地址改为构建期别名，规则、原异常探针和哈希校验保留。原网站代码未扩展。历史候选脚本保留，不自动运行被停止的模型研究。

## 验证

1. 独立包安装和类型检查通过；API类型检查首次发现新mjs导出缺类型声明，补独立声明后通过，没有改变API编译配置。
2. 原四个Creep制品及React输入夹具通过本包独立构建；原上游源和检测算法不变。
3. 将107个盾文件复制到仓库之外的owned临时目录，不复制B-A-T源码、根node_modules、local.json、密钥或运行数据；在副本中独立npm ci及类型检查通过。6项部署/公开输出/同源创建/探针健康/GeoIP配置与有效性检查全部通过。
4. WSL系统Python以`-I`执行副本预算验收，只加载哈希固定wheels：两个独立进程先允许、后按SQLite历史拒绝，retry-after和坏scope边界正确，临时数据库删除。第一次收集器被WSL stderr编码打断，未启动服务；仅修验收日志解码后保存结果，不归因产品失败。
5. 原owned服务从仓库外副本启动，systemd实际ExecStart和Environment已取证。`product-d10-standalone-e2vgdyra`复用原冻结链variant1，完整HTTPS、业务7、普通模型0、3条H2一致。未新建模型任务或重跑无关四变体/模型研究。
6. Profile关闭并永久删除，六服务inactive/MainPID=0。服务停止后，将prepared/environment/service-owner的源码归属显式恢复到同仓盾目录；原base、数据和secret保留。核对临时目录绝对路径、owner后原生PowerShell永久删除副本。未删除制品缓存或历史证据。

原始证据位于ignored `work/antibot-service/reports/d10-standalone-*`，`d10-standalone-receipt.json`为最终结算。没有从零重下载/重编译所有上游二进制；本次证明独立源码、依赖、构建及既有固定运行数据的部署。修改构建脚本路径不会改写历史二进制的recipe摘要；重新构建才生成新的来源回执。

## 使用

当前checkout根目录：`npm run antibot:lab -- start`；或直接`npm --prefix tools/antibot-lab start`。状态/停止分别为本包`run status`/`stop`。独立复制后的配置和新安装顺序见[盾README](../../tools/antibot-lab/README.md)。当前服务已停止，启动命令保持来源过期、制品完整性、owner和长窗保护检查。

仅交付现有Windows+WSL部署能力和包独立性，不新增公网生产部署、云、跨天或网站产品化验收。原覆盖矩阵的研究未覆盖、日常共享SW归属和真实平台限制全部沿用[主线交付](ANTIBOT_CLOSEOUT_20261010.md)。
