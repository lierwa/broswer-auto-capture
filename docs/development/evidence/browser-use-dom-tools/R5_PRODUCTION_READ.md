# R5b 生产局部读取接线实施证据

日期：2026-09-16。结论：R5b 已完成 localhost 生产接线聚焦验收；这不代表原任务、复合报告或正式主线已经通过。

## 执行身份与范围

- agent task：`/root/r5_production_read`
- session id：`01a0aadc-363e-7922-bf6f-d4f5c4bf4c63`
- 主 agent 已核验实际 turn context：`gpt-5.6-sol` / `high`
- 仅修改派发允许的 `author.py`、`capture.py`、`natural_compile.py`、`coverage.py`、`registry.py`、`natural_reads.py`、`read.py`、`hybrid_main.py`，并新增纯证据绑定 helper `field_read_evidence.py`；主 agent 追加批准 `field_read_tool.py` 的内部记录类型收紧。
- 未修改 TypeScript/公共输出合同、测试、manifest、原 requirement/plan/source；未安装、提交、创建分支/worktree、调用 provider 或运行原网站。

## 实现结果

1. `author_step` 以本次已确认 `request.outputSchema` 注册 `bat_read_fields`，并把该次工具的 `FieldReadRecords` 显式交给 `EvidenceCollector`。offline `hybrid_main` 使用相同 output schema 构造 registry，未引入全局记录。
2. callback 在动作前保存记录列表的固定起始位置。动作后只接受该位置起唯一新增的一条成功记录；参数与记录都经 `FieldReadToolParams` 规范化后比较，因此允许合法默认值省略，但不同 mapping、重复记录、成功无记录和结果内容不一致仍拒绝。`VerifiedNaturalRead` 使用规范 actionRef、真实 action resultRef digest、当次 output、page identity 和 container digest。
3. `FieldReadRecord` 在 R5b 中收紧为严格 `FieldReadPageIdentity` 与 digest pattern 类型；这是主 agent 批准的内部边界修正，JSON 形状不变，不是 R5a 原有实现。
4. `bat_read_fields` 的 effect 为 `read`，成功动作进入既有 `compile_verified_read`，生成既有 `browser.read-fields` v2 区段，没有新增 runtime action、节点或执行器。
5. 仅对 registry 校验通过、effect=read、status=failed 且有 resultRef 的 `bat_read_fields` 保留 `failed_bat_field_read_probe/v1` 审计排除。`coverage.py` 独立复核同一条件；点击、输入和其他失败动作未放宽。
6. native extract 仍保留可验证的原生 extraction fact；生产 capture 不再调用 `propose_verified_read` 或 whole-main/body annotation。`propose_verified_read`/`bounded_dom_html` 仅作为无生产调用者的旧离线 helper 保留，显式 LLM 的 `bounded_schema` 规则未改变。
7. 确定性读取单独准入合法 JSON Schema 的 flat object / array-of-object，字段限定为现有 reader 可表达的 scalar 或 scalar array。字符串无需 `maxLength`，字段内数组无需 schema `maxItems`；边界来自 ReadSpec 的字段数、`maxItems`、`maxValues` 和实际字段字节预算。outputPath、子 schema 完全相等和真实结果校验仍保留。
8. 固定字段投影的文本改用 Chromium 原生 `checkVisibility` + `innerText`，属性只用 `getAttribute`。嵌套 inline 空格、换行和隐藏后代由浏览器可见文本语义处理；不可见文本/缺属性返回缺值并失败，合法空字符串保留。ReadSpec 字段与序列化摘要未变。

## 验证与真实证据

开始时按要求先运行现有最小读取验收：

```text
ANONYMIZED_TELEMETRY=false PYTHONPATH=apps/api/python:vendor/workflow-use/workflows:vendor/workflow-use/workflows/tests work/upstream-browser-hybrid/.venv/bin/python -m unittest vendor/workflow-use/workflows/tests/test_hybrid_read.py
=> FAILED (failures=2, errors=1)
```

三项均是 R5a 已记录的旧 mock 基线：mock 把 `Element.evaluate` 固定为无参数整 HTML 返回，不能接收字段投影参数。本项未修改测试，也未给生产代码增加 mock 回退。

最终静态校验：

```text
ANONYMIZED_TELEMETRY=false work/upstream-browser-hybrid/.venv/bin/python -m py_compile vendor/workflow-use/workflows/workflow_use/hybrid/read.py vendor/workflow-use/workflows/workflow_use/hybrid/author.py vendor/workflow-use/workflows/workflow_use/hybrid/capture.py vendor/workflow-use/workflows/workflow_use/hybrid/natural_compile.py vendor/workflow-use/workflows/workflow_use/hybrid/coverage.py vendor/workflow-use/workflows/workflow_use/hybrid/registry.py vendor/workflow-use/workflows/workflow_use/hybrid/natural_reads.py vendor/workflow-use/workflows/workflow_use/hybrid/field_read_evidence.py apps/api/python/browser_use_runner/hybrid_main.py /private/tmp/r5b_production_read_probe.py
=> exit 0

ANONYMIZED_TELEMETRY=false work/upstream-browser-hybrid/.venv/bin/ruff check vendor/workflow-use/workflows/workflow_use/hybrid/read.py vendor/workflow-use/workflows/workflow_use/hybrid/author.py vendor/workflow-use/workflows/workflow_use/hybrid/capture.py vendor/workflow-use/workflows/workflow_use/hybrid/natural_compile.py vendor/workflow-use/workflows/workflow_use/hybrid/coverage.py vendor/workflow-use/workflows/workflow_use/hybrid/registry.py vendor/workflow-use/workflows/workflow_use/hybrid/natural_reads.py vendor/workflow-use/workflows/workflow_use/hybrid/field_read_evidence.py apps/api/python/browser_use_runner/hybrid_main.py /private/tmp/r5b_production_read_probe.py
=> All checks passed!
```

真实 probe 保留在 `/private/tmp/r5b_production_read_probe.py`，最终脱敏摘要保留在 `/private/tmp/r5b_production_read_probe.log`。命令：

```text
ANONYMIZED_TELEMETRY=false BROWSER_USE_CLOUD_SYNC=false BROWSER_USE_SETUP_LOGGING=false PYTHONPATH=apps/api/python:vendor/workflow-use/workflows work/upstream-browser-hybrid/.venv/bin/python /private/tmp/r5b_production_read_probe.py
=> exit 0
```

probe 只绑定 `127.0.0.1`。先用独立临时 Profile 的真实 Chromium、原生 Agent、生产 Tools.act 和 callback/history/normalize/natural_compile，执行：navigate → 失败字段探查 → 成功字段读取 → done。随后关闭该 Browser，再由普通 Runner 的新临时 Profile 串行读取同结构变化值；两次都在 finally 关闭。Agent/judge 是固定脚本模型，不是 provider。

最终摘要证明：source success/validated=true；失败读取保留 resultRef 并由 `failed_bat_field_read_probe/v1` 排除；成功读取只有 1 个 verified fact 和 1 个 `browser.read-fields` 区段；output assembly 存在，compilation gaps 为空；在线/离线 registry digest 一致。普通 runtime 读到变化值，browserCommands=2、modelCalls=0。原合同形态的字符串无 `maxLength`、labels 无 `maxItems`；嵌套 inline 空格、换行、隐藏后代、自身不可见失败和合法空文本均由真实 Chromium 覆盖。固定位置诊断另证明失败动作未借用前次记录、默认值省略可规范化匹配、成功无记录明确得到 `natural_field_read_record_missing`。

旧原来源保持：

```text
work/natural-task-validation/51ca80c2-9d7c-470e-935f-300dd2b0f8a4/source-result.json
SHA256 8c96822da18516dc367b91600869a0ba3ece1b56010964dd1a2b934707ed9aaa
```

首轮沙箱运行在 localhost bind 得到 `PermissionError: [Errno 1] Operation not permitted`，随后按派发升级同一命令。第一次升级运行暴露脚本模型缺少 `model_name`，动作前终止；修正临时模型接口。下一轮动作/编译已贯通，但根数组 probe 暴露既有 Python output adapter 会把数组元素留作 Pydantic 对象，最终 JSON Schema 校验失败；该适配器不属于 R5b，probe 改为贴近原 plan 的根对象 `issues`，局部读取仍是 array-of-object。最终运行通过，所有失败轮次也都由 finally 关闭 Browser/Profile。

## 仍未完成

- 原任务复合报告、其余完成条件和原 plan v6 全量输出装配尚未重新探索或复跑。
- 未运行真实 provider、原网站、正式主线、样本复跑或同链改变业务输入；本证据是 localhost 真实浏览器与脚本模型接线验收。
- 根数组 Python output adapter 问题只在临时反例中确认，本项未扩大范围修复；原 plan 是根对象，不影响本次 R5b 接线结论。
- manifest/source digest 由主 agent 按文件所有权统一重算，本项未修改。
