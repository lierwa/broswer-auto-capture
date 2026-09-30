import { Button, Dialog } from "@radix-ui/themes"
import { ExecutionResultView, TaskOutputView } from "./ExecutionPresentation.js"
import type { LiveChainModel } from "./useLiveChain.js"
import type { TaskDataContract, TaskExecutionResult } from "@browser-capture/contracts"

export function SavedExecutionResultDialog({ result, outputContract }: {
  result: TaskExecutionResult; outputContract: TaskDataContract | null
}) {
  return <Dialog.Root><Dialog.Trigger><Button size="1" variant="soft">查看本次任务成果</Button></Dialog.Trigger>
    <Dialog.Content className="saved-result-dialog" maxWidth="1100px"><Dialog.Title>本次任务成果</Dialog.Title>
      <Dialog.Description>展示该运行已保存的结果；翻页浏览不会继续抓取网页。</Dialog.Description>
      <div className="saved-result-body"><ExecutionResultView result={result} outputContract={outputContract} /></div>
      <Dialog.Close><Button variant="soft">关闭</Button></Dialog.Close>
    </Dialog.Content></Dialog.Root>
}

export function SavedResultDialog({ model, scope = "execution" }: { model: LiveChainModel; scope?: "execution" | "call" }) {
  const call = model.selectedCall
  const result = model.detail?.execution.cleanupResume?.result ?? model.detail?.execution.result ?? model.selectedExecution?.result
  return <Dialog.Root><Dialog.Trigger><Button size="1" variant="soft">
    {scope === "call" ? "查看所选调用成果" : "查看本次任务成果"}</Button></Dialog.Trigger>
    <Dialog.Content className="saved-result-dialog" maxWidth="1100px">
      <Dialog.Title>{scope === "call" ? "所选步骤调用成果" : "本次任务成果"}</Dialog.Title>
      <Dialog.Description>{scope === "call" ? "仅展示所选调用已保存的结果，不代表整次计划输出。"
        : "展示本次运行已保存的结果；翻页浏览不会继续抓取网页。"}</Dialog.Description>
      <div className="saved-result-body">{scope === "call" ? call ? Object.entries(call.run.outputs).map(([name, output]) =>
        <section key={name}><h4>{name}</h4><TaskOutputView output={output} outputContract={model.chain?.outputContract ?? null} /></section>)
        : <p>本次调用尚未保存结果。</p> : result ? <ExecutionResultView result={result}
          outputContract={model.detail?.content?.plan.outputContract ?? model.plan?.outputContract ?? null} /> : <p>本次任务尚未形成最终成果。</p>}
        {scope === "call" && call && !Object.keys(call.run.outputs).length && <p>本次调用没有保存返回值。</p>}</div>
      <Dialog.Close><Button variant="soft">关闭</Button></Dialog.Close>
    </Dialog.Content>
  </Dialog.Root>
}
