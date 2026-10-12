# 盾多平台部署代码 Review

审查基线：`master@94fb77d9c04803ebee608814ee20b09fb545c230` 与当前未提交部署改动。保留已有dirty work；本轮没有修运行代码、启停盾、修改证书或接管浏览器。范围为宿主入口、共同Linux安装/发布、架构制品、证书、网络及相关测试。B-A-T导航修复不混入部署结论。

## 修复范围与复用依据

五项均修：R1/R2阻止首次安装或可靠归属，R3/R4影响正常失败收尾与重试，R5使公开数据到期后无法维护。仅修宿主适配、构建制品与维护入口；不改检测算法、阈值或B-A-T已验收主流程。

Product Alignment:
- natural-language task: 在Windows或Apple Silicon Mac安装并维护同一独立检测服务。
- reusable chain boundary: 宿主部署与服务维护，不新增任务链路。
- runtime inputs: 平台、固定发行归档及摘要、所属安装目录。
- dynamic task outputs: 安装、归属校验和公开数据维护结果。
- generic platform capability used: Lima CLI、systemd、mkcert及现有Linux程序。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: VM归属/安装恢复/停止、运行期GeoIP刷新。
- existing implementation in repository: mac-host.ts、lab.ts、prepare-geodata.py、tests/geoip-calibration.go。
- mature candidates and pinned versions: Lima2.2.1、Ubuntu26.04 systemd、CrowdSec1.8.1固定909b515源码与现有MMDB reader。
- selected implementation: 继续上述实现；构建期编译原GeoIP校验源码为本机架构程序。
- reused public surface: limactl create --set/list --json/start/stop；systemctl show/stop；原MMDB原生检查。
- B-A-T-owned adapter and remaining gap: 记录并核对实例目录、创建标记和配置摘要；安装stage父目录与收尾；校验缓存归档；发行校验器并转交维护命令。
- license/runtime/platform fit: Lima Apache-2.0、CrowdSec MIT；实际字段以v2.2.1源码为准，Linux二进制沿既有ELF门。
- browser/runtime/state ownership conflicts: 不接触浏览器、现有数据库和其它VM；未知归属仍拒绝。
- replay model calls: 0。
- rejected candidates and evidence: 无需替换成熟组件，无新服务管理框架。
- focused validation: 实际入口隔离测试覆盖首装、中断恢复、同名替换、未启动停止；Linux真实原生校验与无Go运行路径；Mac实际安装由Mac实机继续验证。

## 确认的问题（修前事实）

### R1 / P1：Mac首次安装缺少父目录创建

位置：`tools/antibot-lab/mac-host.ts:70–71`。

`guestDirectory()`返回`/home/<user>/.local/share/bat-shield`，安装器直接`mkdir -m 700 <同级stage>`。新guest的`.local/share`不存在时，mkdir先失败，根本到不了会创建parents的install-linux.py。Lima配置中的provision也没有创建该目录。

证据：执行实际mac-host源码的隔离CLI替身得到父目录不存在错误；另在WSL临时空目录执行同一mkdir参数，退出1，临时目录已永久删除。这里只证明此输入条件下的代码行为，不声称已跑Mac实机。

最小处理方向：在既定guest home下创建/核验安装父目录，再以排他方式创建本次stage；沿现有finally收尾。

### R2 / P1：宿主归属记录没有绑定当前Lima实例

位置：`tools/antibot-lab/mac-host.ts:38–42,53–57`。

`requireOwner()`只核对宿主记录中的实例名称、limactl路径和本地模板摘要，没有核对当前Lima目录或实际VM配置。`LIMA_HOME`变化，或者旧VM删除后被同名实例替代时，旧记录仍有效；setup会向另一个同名实例执行start，后续入口也沿该名称操作。

证据：隔离运行实际入口，提供有效旧宿主记录，同时令`limactl list --json`返回另一目录的x86_64/QEMU同名VM；setup仍调用start并成功返回，没有拒绝。未实际启动或接触任何其他VM。

最小处理方向：沿Lima公开实例信息绑定并校验实际实例目录/配置及目标架构；不能仅凭旁路文件和名字取得操作权限。无需新管理框架。

### R3 / P2：未完成安装或从未启动时，stop-vm无法收尾

位置：`tools/antibot-lab/mac-host.ts:115–117`。

`stop-vm`先同步执行guest的`shield.sh stop`，只有成功才调用`limactl stop`。setup成功、尚未安装时shield.sh不存在；安装完成但未启动时，原lab.stop读取尚未创建的service-owner.json失败。两个正常生命周期分支都会跳过VM停止。

证据：实际入口的两项隔离CLI替身均在上述错误后退出，调用记录中没有Lima stop。lab.ts只在start写service-owner.json、stop无条件读取它，安装器不创建该文件。

最小处理方向：先依据已经校验的VM/安装状态区分“服务尚不存在”与真实清理失败；不存在服务的所属VM可以由Lima直接停止。不能吞掉外来owner错误后强行停止。

### R4 / P2：Lima下载完成后中断，重试setup固定失败

位置：`tools/antibot-lab/mac-host.ts:26–34`。

下载成功写入固定archive路径后，若解包前中断或解包失败，下一次发现limactl不存在，会再次下载并以`flag:'wx'`写相同archive，必然EEXIST，无法恢复安装。

证据：隔离运行实际setup，在已下载archive、无limactl的状态下复现EEXIST；未调用tar。该夹具模拟已通过摘要的下载结果，仅验证恢复控制流，不代替真实制品校验。

最小处理方向：核验并复用现有完整归档；损坏/未完成文件用所属临时文件和原子替换处理，不要求用户手动删缓存。

### R5 / P2：只含运行依赖的实例缺少可执行的GeoIP刷新路径

位置：`tools/antibot-lab/deployment/lima.yaml:47`、`tools/antibot-lab/runtime-release.ts:39–43`，调用到`prepare-geodata.py:60–61`。

共同包带有有限有效期的GeoIP数据；lab.start遇到stale会拒绝启动。Lima仅安装Python/OpenSSL等运行依赖，发布的六个原生程序没有GeoIP校验器；现有唯一刷新程序仍调用Go源码校验。宿主提供的refresh-source-data只刷新Tor来源。因此在无Go的干净运行实例上，GeoIP到期后无法通过已交付维护路径恢复，违反“日常运行不要求编译工具链”的部署边界。

证据：读取当前数据，在不改变系统时间或文件的情况下传入未来36天，geoSourceStatus返回stale。执行真实prepare-geodata.main，替身只模拟已停服务和缺失Go，在候选摘要校验后确实走到go run并失败，没有无编译器后备。临时目录已永久删除。

最小处理方向：构建期产出既有校验器的对应架构可执行制品，供共同Linux维护入口复用；保留数据真实性和过期拒绝，不加白名单、不放宽有效期、不复制算法。

## 验证与排除

- 现有`node --test tools/antibot-lab/tests/deployment.test.ts`：2/2通过；覆盖清单/ELF/摘要边界，没有覆盖上述宿主生命周期和数据刷新分支。
- 实际mac-host源码由Node VM加载，文件系统与CLI均替身隔离；5个场景覆盖R1、R2、R3的两种状态及R4。Mac实际机型、Lima启动、证书交互、网络和重启仍未测。
- plain模式保留`static:true`端口转发，当前配置不能据“plain禁用自动转发”判成错误。依据[Lima 2.2.1 defaults.go](https://github.com/lima-vm/lima/blob/v2.2.1/pkg/limayaml/defaults.go#L871)。
- arm64清单沿用部分amd64文件键名，但实际URL和摘要替换为arm64；预构建安装只从CrowdSec amd64发行包提取config，执行文件由原生构建提供，ELF架构门存在。这些命名本身不是执行错架构的证据。
- 检测规则/阈值未发现被部署改动改变。cadence.ts修正前后经TypeScript擦除并忽略格式后完全一致；check-model.d.ts不产生运行代码。
- 本轮不扩大成全量测试，不把Windows旧成功或命令替身等同Mac实测，也不因代码可疑就添加未经复现的问题。

本地证据：`work/shield-deployment-20261012/review-mac-host-results.json`、`review-geo-results.json`、`review-runtime-evidence.json`。资源仅内存替身及已删除的隔离临时目录；正常服务和历史数据未修改。

## 修复与验证结果

- R1：先校验guest目录链没有符号链接，创建缺失父级，以独占UUID目录安装；复制/安装失败沿finally清理，保留首失败。安装receipt在创建stage前落盘。
- R2：以Lima2.2.1官方`info`/`list --json`核验真实目录、aarch64/VZ及创建标记，并绑定实际lima.yaml摘要和目录身份。创建和启动分开；旧旁路owner不足以认领VM，同名替换/LIMA_HOME变化/配置变化均拒绝。
- R3：已有service-owner仍走原stop且错误不吞；没有owner时只有五单元均inactive/failed才允许停止所属VM；已Stopped直接返回。
- R4：复用已校验下载缓存，损坏缓存用唯一pending文件写入并原子替换。解包完成才写摘要标记，部分解包可以重试。
- R5：构建期直接编译原tests/geoip-calibration.go，发行清单增加第七个本机架构ELF与摘要；Linux和两个宿主均提供refresh-geodata。运行入口把随包Node加入PATH，Python配置读取不依赖系统另装Node；Lima运行依赖显式包含既有下载器curl。
- 补齐原生构建命令组合与Mac交接，没有另写编译器/VM或服务管理器。构建配方只调用现有prepare、原补丁、Rollup和release，不启动服务。该配方尚未在Mac完整运行。
- 发现本checkout的core.autocrlf=true且新部署shell没有eol约束；添加定点`.gitattributes`，保证以后Windows检出再打包仍保持Linux脚本LF，不修改其它文件的换行策略。

验证：8项TS聚焦测试通过（2项发行协议、6项宿主生命周期，含多个子场景），4项Python GeoIP摘要/调用边界通过，盾包TypeScript检查通过。原生x64校验器在空PATH下打开真实MMDB，IPv4/IPv6国家及ASN、同国/异国线索、私网/无效地址均通过，仍按原35天期限；当前数据expires=2026-11-05T01:36:12Z。源码/算法未改。

x64验证包`c22dbdb28e8d9a6f66098bbb63d49d2a663ddf4adef18b9313d1b8ad99e5e137`已独立检查59项SHA、7项ELF/x64及无额外文件，不含实例数据或CA。该包用于R5制品边界验证，不声称重新完成服务全套验收；其后新增的Mac构建脚本/交接文档以Git源码为准。首次校验夹具因WSL UTF-16警告被Python text=True误解码而失败，改为保留原始字节后通过，未改产品来掩盖错误。原记录保留在`review-fixes/first-validation-failure.json`。

官方固定依据：[Lima实例字段](https://github.com/lima-vm/lima/blob/v2.2.1/pkg/limatype/lima_instance.go)、[create --set及独立create/start](https://github.com/lima-vm/lima/blob/v2.2.1/cmd/limactl/start.go)、[info JSON输出](https://github.com/lima-vm/lima/blob/v2.2.1/cmd/limactl/info.go)。Mac实际安装/证书/网络/重启仍交由[当地验收](MAC_INSTALL_VALIDATION_20261012.md)，不以替身或WSL通过代替。

修复自审另查到首次Lima home尚不存在时直接realpath的错误：官方dirnames.LimaDir允许返回不存在路径。先补homeMissing夹具得到ENOENT，再改为创建标准Lima home后取得实际路径；6项宿主回归和类型检查复验通过，首败保存于review-fixes/first-lima-home-regression.log。这是本轮修复过程中发现的缺口，不能算Mac实际失败。两个shell脚本按LF固定，构建脚本sh -n通过。

本轮构建stage linux-package-YRJtbx已按owner/绝对路径核验后永久删除；公共tgz、SHA及无敏感数据的校验/首败回执保留在忽略的work目录。未创建或接管浏览器、未启停原五服务；新GeoIP校验器作为构建制品保留。
