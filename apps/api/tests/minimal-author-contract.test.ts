import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { naturalSourceContext } from "../src/upstream-browser/hybrid-natural-payload.js"
import { representativeSourceOutput } from "../src/upstream-browser/hybrid-method-evidence.js"
import { authoringFailureCode, authoringFailureMessage, incompleteSourceError } from "../src/task-chain/authoring-failure.js"

// 不变量：真实 Python 工具→读取回执→完成/编译→TS来源核验必须共同接受精简接口，且不放宽预算。
test("跨语言最小读取合同支持标量数组和已确认常量，拒绝伪造预算与值", () => {
  const root = path.resolve(import.meta.dirname, "../../..")
  const python = process.env.BAT_UPSTREAM_PYTHON ?? path.join(root, "work/upstream-browser-hybrid/.venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
  const child = spawnSync(python, ["-c", String.raw`
import asyncio,json
from types import SimpleNamespace
from browser_use import Tools
from test_method_scalar_sampling import Element,Browser,SCHEMA
from test_method_source_compile import method_source
from workflow_use.hybrid.method_read_tool import register_method_read_tool
from workflow_use.hybrid.method_completion import complete_from_read_refs
from workflow_use.hybrid.evidence import EvidenceRef,digest
from workflow_use.hybrid.source_response import canonical_json
from workflow_use.hybrid.author_action_helpers import normalize_author_action
async def main():
    cases=[]
    mixed={'type':'object','properties':{'site':{'type':'string','enum':['Example']},'status':SCHEMA},'required':['site','status'],'additionalProperties':False}
    for index,schema in enumerate((SCHEMA,mixed,SCHEMA,SCHEMA)):
        tools=Tools();records=register_method_read_tool(tools,output_schema=schema)
        raw={'container':'.records','fields':{'value':{'selector':'.title'}}}
        if schema is mixed:raw['outputPath']=['status']
        if index >= 2:raw['fields']['value']['parts']=[{'selector':'.name'},{'selector':'.state','attribute':'data-state'}]
        if index == 3:raw['container'],raw['fields']['value']['selector']='.title',':scope'
        action=tools.registry.registry.actions['bat_read_fields']
        parsed=action.param_model.model_validate(raw)
        normalize_author_action(SimpleNamespace(bat_read_fields=parsed),records)
        raw=parsed.model_dump(mode='json',exclude_unset=True)
        result=await action.function(params=parsed,browser_session=Browser(Element()))
        assert result.error is None,result.error
        case={'records':records,'start':0,'arguments':raw,'results':[result],'action_ref':'a-0001','result_ref':EvidenceRef(ref='result',digest=digest(result.extracted_content))}
        request,registry,_,_=method_source(case=case,schema=schema)
        cases.append({'canonicalRequest':canonical_json(request.model_dump(mode='json',by_alias=True)),
            'output':complete_from_read_refs(records,['r1'],schema,None),'schema':schema})
    print(json.dumps(cases))
asyncio.run(main())
`], { cwd: root, encoding: "utf8", timeout: 20_000, env: { ...process.env,
    ANONYMIZED_TELEMETRY: "false", PYTHONDONTWRITEBYTECODE: "1",
    PYTHONPATH: ["apps/api/python", "vendor/workflow-use/workflows", "vendor/workflow-use/workflows/tests"].join(path.delimiter) } })
  assert.equal(child.status, 0, child.stderr)
  for (const item of JSON.parse(child.stdout)) {
    const context = naturalSourceContext(item.canonicalRequest)
    const contract = { id: "output", version: 1, dialect: "bat-value-schema/v1" as const, schema: item.schema }
    const source = { request: context.request, canonicalRequest: item.canonicalRequest, output: item.output }
    assert.deepEqual(representativeSourceOutput(contract, source).output, item.output)
    if (item.schema.type === "object") {
      assert.throws(() => representativeSourceOutput(contract, { ...source, output: { ...item.output, site: "Invented" } }),
        /hybrid_method_output_origin_unverified/)
    }
    const changed = JSON.parse(item.canonicalRequest)
    const proof = changed.trace.observations.flatMap((o: any) => o.facts).find((f: any) => f.kind === "verified_natural_read")
    proof.value.specification.maxItems = 300
    // Digest validation must reject a modified source before its altered budget can be consumed.
    assert.throws(() => representativeSourceOutput(contract, { ...source, canonicalRequest: JSON.stringify(changed) }))
  }
})

test("原生done失败原因展示text，诊断代码保持固定", () => {
  const error = incompleteSourceError([{ name: "done", args: { text: "页面尚未提供完整结果", success: false } }])
  assert.equal(authoringFailureCode(error), "hybrid_source_declared_failure")
  assert.equal(authoringFailureMessage(error), "原生浏览器探索未完成：页面尚未提供完整结果")
})
