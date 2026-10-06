# 单窗口连接与账号登录入口修正

2026-10-04。依据用户本轮明确要求：Chrome 扩展只负责日常 Chrome；两种浏览器共用账号目录；账号管理主要检查登录、需要时引导登录；设置弹窗采用紧凑横向布局。

## Product Alignment

- natural-language task: 查询资料、后台操作等任务复跑时只打开所需任务窗口；检查所选浏览器登录并在需要时人工登录。
- reusable chain boundary: 已有浏览器连接与每次 operation 的窗口租约分离；既有只读账号检查和登录等待链继续复用。
- runtime inputs: 已保存浏览器选择、授权、逻辑账号 revision/UID、operation owner/lease、平台版本。
- dynamic task outputs: 真实连接、登录检查、人工登录、单窗口与原 owner 清理事实。
- generic platform capability used: 原 Chrome 扩展 relay、Chrome 原生启动开关、TargetScope、AccountDirectory、TaskChain/LangGraph、Radix。
- replay model calls: 0。
- site/task-specific code added: no。

## Reuse Assessment

- capability: 无业务页面的空闲日常连接、单 operation 单窗口、共享账号目录的登录维护。
- existing implementation in repository: 微软 0.4.0 扩展适配的 WebSocket 握手/BrowserModel、AttachedWindow/ManagedTargets、账号 source/check/wait/transfer、Radix 3.3.0。
- mature candidates and pinned versions: 保持上述固定版本；Chrome 使用已安装版本提供的 no-startup-window，不新建驱动或连接调度器。
- selected implementation: 扩展完成零目标握手，由原 operation 创建目标；专属进程禁止启动页，由原 ManagedTargets 创建操作页。
- reused public surface: Chrome windows/tabs/debugger、CDP Target.createTarget、Browser-Use 0.13.8/cdp-use 1.4.5、原账号检查和登录等待、Radix RadioCards/Button/Dialog。
- B-A-T-owned adapter and remaining gap: 去掉额外引导页；保留目标所有权、Profile、UID、未知状态和清理合同；冻结本次维护浏览器。
- license/runtime/platform fit: 原 Apache-2.0 扩展、现有 TypeScript/Python/Windows，无新增依赖。
- browser/runtime/state ownership conflicts: 连接不等于任务窗口；零目标不能成为创建引导窗的理由；不操作个人原有页面；不同账号 UID 不覆盖。
- replay model calls: 0。
- rejected candidates and evidence: 任务结束再按窗口标题找空白页不具备 owner 证明；静默切到另一 Profile 违背所选浏览器；重写驱动/账号协议重复成熟能力。
- focused validation: 单窗口真实受控 Windows 样本、所属包账号源/UID/取消错误路径、设置和账号真实 UI 深浅及窄屏；不运行全量或根级测试。

Chrome 开关源码依据：https://chromium.googlesource.com/chromium/src/+/de17fb0acf97ab73e7657ca3a9221cea41966230/chrome/browser/ui/startup/startup_browser_creator.cc 。该开关禁止启动窗口，实际 Windows 行为须验证后冻结。

## 真实基线

服务设置 daily；已有 B站逻辑账号 source 为 dedicated；2026-10-04 15:47 检查和打开网站均使用 dedicated。专属进程有空白页和网站页，租约仅登记网站页。

扩展连接创建 about:blank，AttachedWindow 又创建 newWindow。专属启动命令带 about:blank，ManagedTargets 又创建 newWindow。源码与现场目标相符；历史完成和用户原页面保留。

## 账号互通边界

共用一份逻辑账号目录，不因浏览器选择复制目录。检查和人工登录按本次选择执行；只有正向同 UID 登录证明才能更新账号来源，未登录/未知不能丢失原有来源。历史绿色检查不能当成另一 Profile 当前已登录。

自定义网站复用原不可变只读检查链，维护检查显式传本次浏览器身份；后台来源核验显式传逻辑账号原身份。未添加或已失效的自定义网站可以先在所选浏览器完成登录，再点击检查登录。不改检查链源码、版本或浏览器绑定，不新增模型调用。

沿用已经核验的源到自有专属目标迁移；当前只有三平台核验范围，个人 Chrome 不因普通登录检查而被后台写 Cookie。未核验范围不伪报互通成功；选择的浏览器缺登录时进入正常人工登录。

## UI

并排浏览器选项；授权区一行展示用户、授权状态和授权/撤销操作，首次安装说明折叠；网站登录区以图标、用途和入口横向排列。账号详情主操作为检查登录或登录，移除“打开网站”主操作和重复刷新。

## 验证

### 首次失败与后续修订

1. `work/browser-connection-repair-20261004/baseline/result.json`：真实受控 Chrome 复现 daily 额外空白页（除 fixture 原始页外又有一页），dedicated 两页而 owner 只有一页。
2. 去掉引导窗口后的第一次真实重试仍失败：relay readiness 强制要求已 attach 页面，零目标握手不能完成。删除该要求，保留原授权和 initialized 握手校验；`retry-2/result.json` 两模式通过。
3. 账号三项基线失败：检查仍用旧来源；日常失败后静默用 dedicated；目标未登录时会丢失原 source。修订后三项通过。另补自定义检查的基线：所选 dedicated 而实际 daily；显式传本次身份后通过，原检查链不改。
4. 账号既有取消夹具原先依赖隐式 fallback，等待 phase 循环挂起。只停止本次测试进程；夹具显式选择 dedicated 后，取消和 admission 回归通过。
5. UI 首次设置高度 470.98px 超过本轮紧凑门。收束为授权两行、网站登录两行，桌面 416.89px、390px 屏 435.89px。下一次夹具在平台尚未载入时断言数量，补等待首个平台后通过；不放宽布局断言。
6. 连续运行首轮两次窗口计数已经正确，测试 teardown 却沿旧对象读取被下一 owner 替换的当前收据，触发 owner mismatch。夹具显式解析旧 owner 归档收据，保留原 owner 守卫；首轮遗留测试 Profile 进程按精确 Profile/PID 清理，`consecutive/cleanup.json` 剩余 0。`consecutive-retry/result.json` 完整通过。
7. 静态复核发现最后标签释放路径仍有已删除的旧断连调用，已移除。新增释放最后目标的协议门，确认连接保留、下次创建不借用旧窗口。

### 当前通过

- 11 项不同的所属 API 定点不变量通过：所选浏览器、拒绝静默 fallback、未登录保留原来源、自定义所选身份及不可变链、原自定义 tombstone、取消、UID/private-write admission、零目标 readiness、最后目标释放、两项原授权持久化/拒绝路径。只在修订相应路径后重试，没有全量或根级测试。
- `retry-2/result.json`：dedicated 冷启动恰好一页/一个 owner；daily 一个任务页，保留 fixture 原始页，无额外引导页。不是“整个个人 Chrome 只能有一页”。
- `consecutive-retry/result.json`：真实原扩展在同一连接上连续两次 AttachedWindow；每次一个新 owner/任务页，旧目标已结束，没有新引导窗口。以上使用隔离 Profile，模型调用 0。
- `ui-final/ui-validation.json`：真实构建后的产品 UI，SQLite/API 使用受控浏览器夹具；深浅主题、390px/矮屏、检查/登录/错误/重试/取消/移除/自定义方法等 15 张截图，无页面异常、内部滚动或横向溢出。截图已查看。`ui-final/custom-login-ui.json` 另证自定义未保存账号的“去登录”事件进入正确的 open，并保留检查入口。
- API TypeScript check、Workbench TypeScript/生产构建、扩展构建、原 frozen runner source check 通过。构建沿用原大 chunk 提示；浏览器日志沿用非致命 Browser.grantPermissions 未实现提示，不据此伪报权限或私人成果。
- `current-settings-ui.json` / `current-settings.png`：另用隔离 headless 浏览器只读打开正式 4173 设置，实际 daily 已选择、Chrome 已授权、管理账号入口唯一；截图已查看，没有授权夹具或设置写入，也没有控制个人 Chrome。
- 正式服务沿既有 dev 生命周期加载，PID 13708 → 10752 → 22328，4173/4175 正常。`service-load.json`：除账号事实表外全部表计数/哈希一致，包含原任务、发布、13 次 execution 和模型/浏览器设置；daily 仍 revision 14。授权文件哈希不变、paired=true、busy=false、账号 availability 两模式均空闲；原账号事实表遵循既有 restart recovery 元数据更新。个人 Chrome PID1872 保留，未通过 CDP 接管或关闭个人页。

### 未测与生效边界

扩展产物已更新 `work/daily-chrome-extension/extension`，个人 Chrome 的已运行扩展不会因产物更新自行切换源码，仍需在 chrome://extensions 对 B-A-T 点击一次重新加载。未代替用户操作个人扩展页，也未重复运行原私人业务或核验全部平台真实账号/线上 SSO。授权保留，不要求再次批准授权。

仅清理本轮隔离测试 Profile/fixture 进程；正式服务保持运行。保留现有 dirty work，不提交、不推送、不建 worktree。
