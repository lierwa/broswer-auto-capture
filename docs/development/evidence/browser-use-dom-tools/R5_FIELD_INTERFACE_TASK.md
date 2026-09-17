# R5d 字段读取的最小 LLM 接口（待 R5c 交付后独立派发）

> **历史派发记录，已关闭。** 本文件不再授权或指示启动任务。当前只按 [清理账本](../../REPLAY_CLEANUP_20260917.md) 工作。

目标：bat_read_fields 不再要求模型重复生成已知 outputSchema、valueType、multiple、maxItems、maxValues、maxInputBytes 或 readPath。输入仅保留 outputPath、container、fields；fields 每项只有 selector 和可选 attribute。输出仍为本次实际读到的值。沿既有 ReadSpec/FieldReadMapping 适配；只将 maxInputBytes 改为可选的调用方预算，保留旧显式预算语义。

Product Alignment:
- natural-language task: 从列表或表单容器读取约定输出字段。
- reusable chain boundary: 目标输出路径对应的局部确定性读取。
- runtime inputs: 输出路径、容器与字段 CSS；schema 从任务合同取得。
- dynamic task outputs: 本次 DOM 值。
- generic platform capability used: 已有 ReadSpec 与 FieldReadMapping。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 减少模型输入字段，不新增能力。
- existing implementation in repository: validate_proposal/schema_at_path、ReadSpec、read_fields_with_proof、FieldReadMapping。
- mature candidates and pinned versions: 现有 browser-use Tools.action/Pydantic/JSON Schema，无新库。
- selected implementation: 只增加纯参数到既有内部 mapping 的适配函数。
- reused public surface: schema_at_path、FieldReadMapping、read_fields_with_proof。
- B-A-T-owned adapter and remaining gap: 从输出合同推导类型、包装与基数；没有额外模型交互。
- license/runtime/platform fit: 依赖不变，Windows 未验。
- browser/runtime/state ownership conflicts: 不变。
- replay model calls: 0。
- rejected candidates and evidence: 让 LLM 原样重复 schema/预算/派生类型会造成字段冲突及额外理解成本。
- focused validation: 原始字符串、对象、对象数组、字符串数组四种既有读法的相同内部 mapping 和真实读取；registry 仅显示三字段。

具体边界：
1. outputPath 和字段名必须来自原输出合同，不接受另一个 schema。对象/对象数组读取沿现有语义；标量/标量数组由程序内部包装 value 并设置 readPath=['value']，模型 fields 中使用 value 这一固定键。不新增读法。
2. valueType、multiple 从目标字段 schema 推导；单对象 maxItems=1，数组用合同 maxItems 与现有 ReadSpec 上限，不让模型填写。多值字段同理复用现有 300 基数上限。超过既有能力范围明确报错，不静默截断。
3. 不用另一个任意常量替换 128 KB。ReadSpec.maxInputBytes 改为可选；旧调用方明确传入时仍按所选字段字节数执行预算，未指定则不额外拒绝。新工具不让模型填写，也不暗中增加固定页面或字段字节上限。仅投影指定字段、保留既有基数与运行预算，绝不截断内容。Python/TS schema 和序列化同步；原显式预算来源的 canonical bytes 必须保持。
4. FieldReadRecord 保存实际最小调用参数与展开后的内部 mapping。collector 固定位置绑定原始参数/record/result；编译重用展开后的 ReadSpec。不能因此放松参数与证据一致性。
5. redactor/is_native_parameter 更新到新最小字段；不误伤 CSS，不放开普通敏感字符串。在线/offline registry 一致；历史 source 使用旧 registry 应被版本门拒绝，不擅自倒填兼容。
6. 只改 field_read_tool.py、field_read_evidence.py、author.py 里直接相关脱敏/工具说明、natural_facts.py 必要分支、natural_reads.py 必要的参数一致性核验、read.py 的可选预算、宿主 hybrid-schema.ts 对应可选字段；新增小型 field_read_params.py 可复用既有 helper 避免循环导入。不动 tests、报告/滚动/等待工具或原 schema/plan。root 统一 manifest。
7. 原已成功 R5b 行为无需全量重复；临时 probe 核验新 registry/最小参数到真实 Chromium 一次 object+scalar/array，及错误路径；然后正式原任务使用这套最小接口。源码有实际反例才扩大验证。

主 agent 联合验收修订：和 R5c 共用最终三字段工具的真实来源与 TaskChainRuntime 探针，避免重复旧接口 Browser 验收。编译时对新 bat_read_fields 从原 action.args 按合同展开并比对 specification/outputPath/readPath；通用 validate_proposal 保留旧 extract 与显式预算语义，不拿新缺省预算反向拒绝旧映射。
