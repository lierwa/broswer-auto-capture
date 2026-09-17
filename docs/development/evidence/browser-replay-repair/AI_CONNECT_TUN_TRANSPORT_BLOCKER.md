# AI Connect / TUN 传输阻塞记录

日期：2026-09-17

## 结论

当前失败不是 Codex auth 过期。正式服务能读取既有 AI Connect connection、`modelId` 与 reasoning effort；
AgentSession 也已进入供应商调用阶段。失败发生在首 token 之前，统一表现为 `fetch failed`，最终 token 用量为 0。

现有证据只支持“当前进程到 provider 的网络传输没有成功”，不能把原因写成账号失效。用户当天把代理改为 TUN
模式是相关环境变化，但 B-A-T、AI Connect 和 Pi AgentSession 不应识别 VPN 产品或模式；TUN 应由操作系统网络层透明承载。

## 证据

- 正式需求对话任务 `0835bca0-318d-42b9-9e75-1304fcfb636b` 的原 turn
  `da3b8f7f-8e0c-4432-8afb-a587ddeb9961`：四次 provider 尝试均 `fetch failed`，0 token。
- 只对同一失败轮次执行一次正式 `/api/interview` retry；新 turn
  `b909202c-96f2-4a21-8ab1-0c4382181e90` 再次四次 `fetch failed`，0 token，最终 failed。
- 本机 `/api/health` 正常，模型选择可由同源正式 API 读取；没有修改 auth、connection、模型路由或 reasoning effort。
- 当前 shell 仍有 `http_proxy/https_proxy=http://127.0.0.1:7890`，会让普通 `curl` 把本机请求错误送往已不存在的
  显式代理端口；以 `--noproxy '*'` 排除后本机 API 正常。该现象只说明诊断 shell 有残留环境，不能解释为产品 auth 失败。
- 对 B-A-T 当前差异以及相邻 AI Connect / Pi AgentSession 源码的只读核查未发现 VPN 模式分支、代理环境过滤或改写；
  AgentSession 复用宿主进程网络栈。
- 原实际 GitHub 任务来源运行 `14280431-803c-45c7-82e5-7d57b6bc2058` 同样在首个浏览器动作前结束：
  `browserCommands=0`，`sourceSuccess=false`，`sourceValidated=false`。它不能证明或推翻 A 的动作采集。

## 不得采用的补丁

- 不在 B-A-T 中增加 TUN、系统代理、VPN 品牌或端口特判。
- 不把 `fetch failed` 映射成 auth 过期，不要求重连账号，不改产品模型路由。
- 不通过给 Node/Python 私塞代理或重复启动浏览器绕过正式运行环境。
- 传输未恢复前不重复实际任务浏览器运行；否则只能制造新的 0-action 失败来源。

## 下一台电脑的恢复门

1. 在现有分支和正式本机服务上，对既有失败需求执行一次无浏览器模型连通检查；不得连续重试。
2. 只有出现有效模型正文或非零 token 且没有 `fetch failed`，才认为 provider 传输恢复。
3. 传输恢复后，从原 GitHub requirement v2 / plan v6 的正式 `generate_chain` 入口执行实际任务页 A 验收。
4. 核对真实动作、事件、页面数据、业务副作用、source 保存加载和 Browser `finally` 关闭；通过后才进入 B。

该恢复门只判断外部传输是否可用，不是产品新增能力，也不构成对 TUN 模式的兼容代码。
