# 固定来源与适配

2026-10-03 单平台交互版本：目录版本 `20261003.2`。`observe` 复用固定原函数，在原 owned page 只读观察；goto 被抑制并记回执，禁止 click/fill/focus。普通检查使用独立 owned 检查页，最终确认不导航用户输入页。Windows MC/SAU 两条观察门证明 URL、输入和焦点不变。自动复用仅三条已验证日常源→自有专属目标策略；其余平台绑定原 Profile，个人 Chrome 不自动写入。13 平台固定源码适配与私人在线正向验收分别记录，详见当前统一开发/交付文档。

UPSTREAM.json 和两个 ZIP 保留固定 commit 原文件、许可证和 SHA256。ZIP 内无修改；源码以 AST 提取原 cookie_auth/pong/必要当前用户函数执行，回执保留函数和行号。没有导入上传器、爬虫产品、数据库或启动其 Agent。

宿主 account_sources.py 的借用适配：launch/new_context/new_page 指向原 owner 的现有窗口；storage_state 文件参数不导入；close 只释放借用；set_init_script 抑制并审计；导航/加载最多15秒，networkidle 降为 DOM 加载，固定等待最多2.5秒。源日志不输出，避免认证响应和 Cookie 泄漏。所有权和真正连接使用原 ManagedWindow/AttachedWindow + Playwright1.61.0。

平台目录/策略为版本化来源数据。原 bool 是参考，正向、明确负向、未知单独投影；不能以 Cookie 存在、无登录提示或异常 true 当作已登录。仅执行源函数中的只读部分，禁止登录、上传、刷新授权和 biliup renew。

许可：MediaCrawler NON-COMMERCIAL LEARNING LICENSE1.1；social-auto-upload MIT。按用户学习用途复用，保留完整许可。新增数据与适配的真实兼容门以开发/交付文档为准。

2026-10-03 冻结：13行原callable正向/明确负向/挑战/HTTP503/timeout/结构变化兼容矩阵已通过，engineeringState=ready表示适配门，并非本人在线成功。XHS仅保留原pong的selfinfo.result.success登录信号，无UID/姓名假字段；明确guest降未知。贴吧复用原_fetch_json_by_browser/_sign_pc_params的同步查询补正向。其它非2xx不能投影成功；SAU后台正向只读控件沿原发布源码，不执行上传。Cookie迁移当前仅B站/微博/知乎的精确已知认证key策略，其余拒绝，不以网页URL匹配批准整Profile。
