import { Button, Dialog } from "@radix-ui/themes"
import { ExecutionResultView, TaskOutputView } from "./ExecutionPresentation.js"
import type { TaskChain, TaskDataContract, TaskExecutionResult, TaskOutput } from "@browser-capture/contracts"

type Props = { scope?: "execution"; result: TaskExecutionResult | null; outputContract: TaskDataContract | null } |
  { scope: "call"; result: Record<string, TaskOutput>; outputContract: TaskDataContract | TaskDataContract[] | null }

export function callOutputContracts(chain?: Pick<TaskChain, "nodes" | "outputContract"> | null) {
  return chain ? [chain.outputContract, ...chain.nodes.flatMap(node => node.kind === "emit" ? [node.contract]
    : node.kind === "terminal" && "result" in node && node.result ? [node.result.contract] : [])] : []
}

/** 成果内容由调用方精确选定；弹窗不订阅工作台或寻找“最新”执行。 */
export function SavedResultDialog(props: Props) {
  const call = props.scope === "call"
  const title = call ? "所选步骤调用成果" : "本次任务成果"
  const contracts = Array.isArray(props.outputContract) ? props.outputContract : props.outputContract ? [props.outputContract] : []
  const byContract = new Map(contracts.map(contract => [`${contract.id}:${contract.version}`, contract]))
  return <Dialog.Root><Dialog.Trigger><Button size="1" variant="soft">
    {call ? "查看所选调用成果" : "查看本次任务成果"}</Button></Dialog.Trigger>
    <Dialog.Content className="saved-result-dialog" maxWidth="1100px"><Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{call ? "仅展示所选调用已保存的结果，不代表整次计划输出。"
        : "展示该运行已保存的结果；翻页浏览不会继续抓取网页。"}</Dialog.Description>
      <div className="saved-result-body">{props.scope === "call" ? Object.keys(props.result).length
        ? Object.entries(props.result).map(([name, output]) => <section key={name}><h4>{name}</h4>
          <TaskOutputView output={output} outputContract={byContract.get(`${output.contract.id}:${output.contract.version}`) ?? null} /></section>)
        : <p>本次调用没有保存返回值。</p> : props.result
          ? <ExecutionResultView result={props.result} outputContract={props.outputContract} />
          : <p>本次任务尚未形成最终成果。</p>}</div>
      <Dialog.Close><Button variant="soft">关闭</Button></Dialog.Close>
    </Dialog.Content></Dialog.Root>
}
