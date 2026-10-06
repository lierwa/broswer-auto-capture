# 登录双向复用与稳定设置界面

2026-10-04。本轮用户明确确认：账号互通包含专属浏览器 ↔ 日常 Chrome 的登录信息复用；日常 Chrome 已登录另一账号时保留它。此前“只共享目录、只向自有专属目标写认证”的约束被本轮明确授权替代。用户同时要求去除权限折叠及粗焦点框，切换设置时不抖动，并解释启动检查。

## Product Alignment

- natural-language task: 在所选浏览器检查/复用网站登录；运行相关网站任务时确认可用账号，不每次要求重新登录。
- reusable chain boundary: 原账号检查、认证迁移/加密回滚与浏览器所有权；不改变任务链源码或普通节点模型规则。
- runtime inputs: 当前选择、已保存逻辑账号 UID/revision、两端 Profile 绑定、版本化认证范围、owner/lease。
- dynamic task outputs: 两端真实登录检查、同 UID 复用或保留不同账号、回滚及界面稳定性。
- generic platform capability used: 原 AccountTransfers/AccountReuse/TaskChain、CDP/Playwright、Windows DPAPI、Radix。
- replay model calls: 0。
- site/task-specific code added: no。

## Reuse Assessment

- capability: 双向复用已经核验的登录范围；持久化每 Profile 的最近检查；一致的设置区域和键盘焦点。
- existing implementation in repository: 原双端 AccountTransfers 支持任一 BrowserIdentity kind；native auth bridge 按 owner/kind 校验并保存 DPAPI 回滚，限制来自 AccountReuse 的单向 admission，而非驱动。
- mature candidates and pinned versions: 保留 Browser-Use 0.13.8、cdp-use 1.4.5、Playwright 1.61.0、Radix 3.3.0 和已固定认证检查源码。
- selected implementation: 复用原迁移公开 prepare/confirm/restore；只放行当前目标明确未登录、源稳定 UID 已证明且认证范围已核验的双向路径。
- reused public surface: 原 TaskChain 检查/等待、AccountTransfers、Playwright scoped cookies、CDP owned window、Windows DPAPI、Radix RadioCards/Switch/Dialog。
- B-A-T-owned adapter and remaining gap: 手动检查/登录接入原自动复用；启动先检查目标，已登录同 UID 不检查另一浏览器；原每 Profile 检查记录用于缓存显示，不用“15 分钟”改判登录丢失。
- license/runtime/platform fit: 原依赖/许可/Windows，无新增库。
- browser/runtime/state ownership conflicts: 不替换目标的其它账号，不把未知当未登录，不把历史缓存当本次执行的认证证据；双向恢复仍验证原 owner 和写后摘要。
- replay model calls: 0。
- rejected candidates and evidence: 删除登录检查或仅凭 Cookie 存在不能证明用户身份；重新写 Cookie vault/迁移器/状态机重复原能力；反复增加 UI 折叠不是权限模型。
- focused validation: 先保存反向复用/手动检查/缓存/UI 坐标基线失败，再做所属最小回归、原扩展的真实双端 Profile 样本与深浅/键盘/延迟状态 UI；不运行全量测试。

## 已核实基线

SQLite：本日 09:04Z 同一 B站在 daily 检查 unauthenticated、dedicated 检查 authenticated，来源 dedicated 且稳定 UID 已保存。不是单纯颜色或切换误读。AccountReuse 明确拒绝写 daily，目录 check 没有接入 reuse；每次新任务原先先查来源再查目标，resume 跳过。服务启动只读事实；UI 却用 15 分钟和最近检查所属浏览器把保存的 ready 投影成 unconfirmed。

扩展权限 summary 单独定义 2px amber focus-visible 外框。设置 daily 授权和 dedicated 显示开关处于不同层级，尺寸和加载时序不同；daily 授权切换时重新挂载并读取，导致内容与居中位置变化。

## 本轮设计

扩展保留一个连接开关、浏览器身份与状态；权限直接一条“仅操作任务窗口”，暂停说明直接展示，不增加折叠。键盘焦点限于控件本身的中性色反馈。

设置保持双列浏览器选择；桌面与窄屏均为图标+标题同行、说明下一行，取消窄屏专用拆行与重复选择圆点。授权、窗口显示和账号入口使用同一设置列表：图标/标题/说明/右侧操作，80px 行高；授权在两模式之间切换时保持挂载。账号入口固定位置。授权摘要显示状态与实际 Chrome 名称，避免窄屏用长句截断有效身份。

账号展示当前 Profile 的最近一次已保存检查和时间；启动服务不主动打开账号窗口，新任务只检查所用网站及目标浏览器，缺登录再核验来源和复用，恢复原运行不额外准备。

## 验证与交付

用户在原生验收后新增约束：测试全部 headless，不能弹窗口打断游戏。原生首轮专属分支确实可见，已结束并确认无该测试 Profile 的 Chrome 残留。随后 UI/正式加载读取全部 headless；原生夹具也在适配层强制 dedicated-headless，产品的人工登录可见性不因此被修改。没有再次运行可见测试。

### 首败和修订

- 原双向/手动检查与缓存回归 2 项均失败：daily 写入明确被拒绝，切回已有成功检查的 Profile 仍显示 unconfirmed。修订后均通过。
- UI 首败：daily 416.89px、dedicated 391.69px，相差约25px；600ms延迟授权读取也改变居中位置。首轮修订坐标通过，但用户明确拒绝桌面/窄屏两套排版，因此继续统一结构，不能将第一次坐标通过写成用户认可设计。
- 系统 Python 缺 Playwright；改用仓库既有 managed `.venv/Scripts/python.exe`，不新增依赖。
- API 首次 check 被旧 relay 回归的静态扩展源码 import 污染，要求服务端解析 chrome.* 页面类型。该测试改运行时导入，并保持同一真实 relay 断言；API check 与相关回归通过。
- 新账号 UI 门首败为 radio 可访问名称/精确匹配，随后两 UI 测试并行写同一 fixture 偏好产生干扰。补齐 radio aria-label、改新 fixture 顺序运行；`accounts-ui-retry2/result.json` 通过，保留前两次失败，不能当成产品登录失效。
- 正式重载首次 shutdown 请求因 Origin 与4175的Host不一致返回403，未停止服务；原 dev launcher 核验同 root/PID 后通过其既有关闭入口重载。首次“所有表字节相同”核对失败：原 recover 将一个原维护窗口标为 cleanup_required。保留该事实与首败，未强制关用户窗口；单独核对账号/检查事实和所有业务表。

### 通过

- 14 项不同的最小 API/边界不变量通过：双向启动/手动复用；不同/未知目标零写入；源UID变化取消未写入确认且不残留锁；目标同UID不接触不可用源；反向失败回滚、daily待恢复后重试；重启读取两端缓存；超过旧15分钟仍可读；Profile或检查版本失配不伪造已登录；所选浏览器/连接失败/自定义链与扩展释放边界。
- `native-first/result.json`：隔离真实 Chrome + 原扩展 + 原 Browser-Use/Playwright/DPAPI + 本地 HttpOnly 登录站点；dedicated→daily 启动及手动检查各一次、daily→dedicated一次。每次重新检查同UID并释放原 owned 窗口，成功后删除回滚引用；下一次同UID仅检查目标。重启读两端成功检查，不开窗口。全部模型调用为0。此样本发生在新增 headless 约束之前，不能标为全程 headless，也不冒充个人B站在线迁移。
- `ui-unified/result.json`：1280/390 宽、深/浅主题、daily→dedicated→daily 每帧几何通过；弹窗和账号行切换位置不变，标题单行、无溢出。最终同尺寸截图为 `settings-final/daily.png`、`dedicated.png`。
- `accounts-ui-retry2/result.json`：两端各一次检查保存；切换/查看/主题/390×844和390×480保持登录和检查时间、无滚动溢出，检查数始终2。
- `work/popup-public-controls-1791106324899/result.json`：真实 headless Chrome 原生扩展 popup 的深浅主题；无 details/summary，Tab只到开关与工作台按钮，无旧大黄框且保留中性色焦点。
- API check、Workbench build、扩展 build、原 runner source check 通过。Vite 仍提示既有大 bundle；不扩大为依赖替换或根级测试。
- 正式服务已加载 PID26988。重载前后当前 dedicated-visible/revision43 与 daily授权文件摘要一致；所有业务表摘要一致，逻辑账号与最近6条真实B站检查同基线，账号事实数不变；唯一新恢复元数据是原维护窗口的 cleanup_required。`service-load-reconciled.json` 单列其变化，未声明账号 facts 全表字节相同。
- `loaded-ui/result.json`：正式服务的全新 headless 页面只读打开设置/账号面板，显示保存的“已登录”及检查时间；账号命令0、偏好写入0、新检查0。服务启动/打开面板不要求重新登录。

### 仍然单列

个人B站尚未在本轮重新迁移或线上正向验收；个人扩展需在 chrome://extensions 重新加载 B-A-T 一次以加载新 popup。自动复用仅限目录已核验的稳定UID及认证范围（当前B站/微博/知乎），其它范围或无稳定UID沿原来源/人工登录，不能承诺任意网站SSO。目标另一账号或未知状态保留，不强制同步；自定义网站尚无可证明的跨Profile认证范围。

保留当前 master 和全部原 dirty work，不建立 worktree，不提交或推送。证据目录 `work/browser-account-ui-sharing-20261004/`。
