# Apple Silicon Mac 安装与实际验收入口

本交接供Mac拉取最新代码后继续实际安装验证。Windows/WSL证据不能替代Mac结论。当前五项部署review问题已修，Mac的arm64构建、Lima启动、mkcert交互、协议与重启尚未实测。不要把本文件中的待执行命令写成已通过。

## 拉取与核对

在Mac已有checkout中先执行`git status --short`、`git branch --show-current`、`git remote -v`，保护当地未提交改动；确认远程为`lierwa/broswer-auto-capture`、分支`master`后执行`git pull --ff-only origin master`。若当地改动或分叉阻止拉取，保留原状查清，不reset/clean、不创建worktree。用`git rev-parse HEAD`核对Windows交付消息中的提交。

先读本仓AGENTS.md、PROGRESS顶部和[多平台Review](SHIELD_MULTIPLATFORM_REVIEW_20261012.md)。Mac本地设置、Cookie/Profile、数据库、证书私钥和编译产物不进Git；不访问京东，不使用Docker，不改检测规则/阈值。以下命令从实际checkout根目录开始，不使用Windows路径。

## 创建所属VM与构建arm64包

宿主需要Node>=24、npm>=11。先实录`sw_vers`、`uname -m`、`node --version`，必须是Apple Silicon。薄入口安装固定Lima2.2.1；不要另找最新版本替代固定制品。

```sh
npm --prefix tools/antibot-lab ci --workspaces=false --ignore-scripts --no-audit --no-fund
node tools/antibot-lab/mac-host.ts setup
```

setup保存实例实际目录、配置摘要、创建标记及目录身份。若报告owner/identity不符，先核对`LIMA_HOME`、实际VM和原记录，不能删owner文件或强行接管同名VM。setup可重复执行；Lima归档已校验的缓存可用于中断恢复。

目前没有已经在Mac实测并分发的arm64二进制包。因此首次Mac验收包含一次**原生构建阶段**，不能拿Windows x64包改名。下面复用原固定源码/构建脚本；构建工具只用于这一步，安装后的启动和GeoIP刷新使用发行包二进制，不调用编译器。

在同一个宿主终端，生成独立源归档并复制到刚创建的专属VM：

```sh
shield_checkout="$PWD"
shield_revision=$(git rev-parse --short=12 HEAD)
mkdir -p "$shield_checkout/work"
shield_host_stage=$(mktemp -d "$shield_checkout/work/mac-shield-source.XXXXXX")
node tools/antibot-lab/release.ts "$shield_host_stage"
shield_lima="$HOME/Library/Application Support/BATShield/lima-2.2.1/bin/limactl"
shield_guest_home=$("$shield_lima" shell bat-shield -- printenv HOME)
shield_build="$shield_guest_home/bat-shield-build-$shield_revision"
"$shield_lima" shell bat-shield -- mkdir -m 700 "$shield_build"
"$shield_lima" copy "$shield_host_stage/browser-capture-antibot-lab-tools-1.0.0.tgz" "bat-shield:$shield_build/source.tgz"
"$shield_lima" shell bat-shield -- mkdir "$shield_build/program"
"$shield_lima" shell bat-shield -- tar -xzf "$shield_build/source.tgz" -C "$shield_build/program"
"$shield_lima" shell bat-shield -- sudo apt-get install -y --no-install-recommends build-essential golang-go patch
"$shield_lima" shell bat-shield -- env "BAT_ANTIBOT_DATA=$shield_build/data" sh "$shield_build/program/deployment/build-linux.sh"
```

build-linux.sh要求数据目录不存在，拒绝认领旧实例，记录build-owner.json；沿原prepare、CrowdSec/HAProxy补丁、Rollup探针、公开来源和release流程生成包，不启动服务。首次失败保留命令、stderr及构建目录；查根因后再决定如何恢复，不能删除失败证据后声称首次成功。全新原生构建耗时取决于下载与编译；当前还没有Mac耗时实测。

复制包和SHA到宿主，核验摘要后安装：

```sh
"$shield_lima" copy "bat-shield:$shield_build/data/releases/bat-shield-linux-arm64.tgz" "$shield_host_stage/bat-shield-linux-arm64.tgz"
"$shield_lima" copy "bat-shield:$shield_build/data/releases/bat-shield-linux-arm64.tgz.sha256" "$shield_host_stage/bat-shield-linux-arm64.tgz.sha256"
shield_sha=$(awk '{print $1}' "$shield_host_stage/bat-shield-linux-arm64.tgz.sha256")
test "$(shasum -a 256 "$shield_host_stage/bat-shield-linux-arm64.tgz" | awk '{print $1}')" = "$shield_sha"
node tools/antibot-lab/mac-host.ts install "$shield_host_stage/bat-shield-linux-arm64.tgz" "$shield_sha"
node tools/antibot-lab/mac-host.ts trust-localhost
node tools/antibot-lab/mac-host.ts start
node tools/antibot-lab/mac-host.ts status
```

mkcert使用Mac自己的CA；需要macOS钥匙串授权时在Mac正常完成。宿主CA私钥不复制到VM。安装器生成该实例自己的秘密与数据库。完成包核验并保存非敏感构建/首败证据后，按build-owner.json和精确绝对目录收尾构建目录及宿主stage；不要把包含临时secret的整个构建目录当交付归档。Lima本身和正式安装目录保留。

## 日常运行和公开数据维护

检测页：`https://localhost:4185/measurement/check`。Mac入口支持`start/status/stop/logs/metrics/alerts`。`stop`只停所属盾服务；`stop-vm`停止该所属VM，未安装、从未启动和重复停止也有明确分支。运行期清理失败或活动服务归属不明仍拒绝停VM。

停止服务后分别刷新Tor来源和GeoIP来源，再启动：

```sh
node tools/antibot-lab/mac-host.ts stop
node tools/antibot-lab/mac-host.ts refresh-source-data
node tools/antibot-lab/mac-host.ts refresh-geodata
node tools/antibot-lab/mac-host.ts start
```

GeoIP仍按原MMDB元数据、35天期限和原生CrowdSec样本检查。过期、损坏或缺少校验器必须失败，不得绕过。Windows对应入口是`node tools/antibot-lab/windows-host.ts <Linux安装绝对目录> <命令>`。

## 必须取得的Mac证据

1. 记录Mac/macOS、Lima/Ubuntu/systemd和`aarch64`，七个原生可执行制品的ELF架构及归档SHA；确认五服务进程在VM，数据在Linux盘，宿主没有代跑Windows服务。
2. 验证新安装、同包重复安装、重复start、stop/start、未启动时stop-vm，以及归属不符拒绝；所有服务/VM操作只作用于本实例。
3. 宿主可信HTTPS、HTTP/TLS/H2真实字段，H3经shieldvz私网直达且无额外TLS代理；RTT、四Worker采集、Nonce跨引擎重启和配额跨origin重启都要沿已有用例取得实际证据。
4. 真实日常浏览器完成自动检查及中英文输入/滚动/提交，同页JSON/API取得完整39项和最终结论。保持首次失败；ready、HTTP200或命令替身均不能当39项报告通过。不得用自启带WebDriver浏览器替代产品选择的日常浏览器。
5. 验证原有阳性/过期来源/缺制品/外来资源拒绝，不放宽检测。GeoIP维护确认调用发行程序，在缺少Go的运行环境依旧可用。
6. 在Mac当地安排VM和宿主重启，记录SQLite内容与完整报告保留、恢复命令及实际恢复结果。只停启服务不算宿主重启验收。
7. 清理本次所属临时浏览器/Profile、构建/安装stage；运行资源关闭与临时目录永久删除分别核验。保留个人浏览器、正式数据、首次失败和无关改动。

每项记录通过、首次失败、修复复验、阻塞、未测；最后更新实际验收记录，不能把此待办清单抄成通过结论。B-A-T的新冻结需求→准备→发布→两次正式复跑已有[最终报告](PRODUCT_BROWSER_FINAL_REPORT_20261012.md)，本轮部署改动未改该产品主流程，不无变化重跑。
