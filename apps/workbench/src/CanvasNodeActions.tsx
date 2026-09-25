import { useState } from "react"
import { Button, Dialog, Flex, Select } from "@radix-ui/themes"
import type { ChainNode, TaskChain } from "@browser-capture/contracts"
import { actionPresentation } from "./chainNodePresentation.js"
import { edgePortLabel } from "./chainWorkbenchProjection.js"
import { newFunctionNode } from "./chainCanvasEditing.js"
import { nextCopyId } from "./ChainRevisionEditor.js"

export function CanvasNodeActions({ chain, node, busy, onInsert, onRemove, onRoute }: {
  chain: TaskChain; node: ChainNode; busy: boolean; onInsert(node: ChainNode): void;
  onRemove(): void; onRoute(port: string, targetId: string): void;
}) {
  const [open, setOpen] = useState(false)
  const [template, setTemplate] = useState("function")
  const routes = chain.edges.filter((edge) => edge.from === node.id)
  const candidates = chain.nodes.filter((item) => item.kind !== "terminal")
  function insert() {
    const original = candidates.find((item) => item.id === template)
    const copy = original ? { ...structuredClone(original), id: nextCopyId(original.id, chain.nodes), label: `${original.label}（副本）` }
      : newFunctionNode(nextCopyId("function", chain.nodes))
    onInsert(copy); setOpen(false)
  }
  return <section className="node-config-section node-canvas-actions"><h4>后续动作</h4>
    {routes.map((edge) => {
      const port = "port" in edge ? edge.port : edge.outcome
      return <label className="revision-field" key={port}><span>{edgePortLabel(port) || "完成后"}</span>
        <Select.Root value={edge.to} disabled={busy} onValueChange={(value) => onRoute(port, value)}>
          <Select.Trigger aria-label={`${actionPresentation(node).title}完成后的动作`} />
          <Select.Content>{chain.nodes.filter((item) => item.id !== node.id).map((item) =>
            <Select.Item key={item.id} value={item.id}>{actionPresentation(item).title}</Select.Item>)}</Select.Content>
        </Select.Root></label>
    })}
    <Flex gap="2" wrap="wrap"><Button size="1" variant="soft" disabled={busy} onClick={() => setOpen(true)}>在后面新增节点</Button>
      <Button size="1" color="red" variant="soft" disabled={busy} onClick={onRemove}>删除此节点</Button></Flex>
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Content maxWidth="440px" className="node-add-dialog">
      <Dialog.Title>新增节点</Dialog.Title><Dialog.Description>插入到“{actionPresentation(node).title}”之后，保存时自动连接前后动作。</Dialog.Description>
      <label className="revision-field"><span>节点起点</span><Select.Root value={template} onValueChange={setTemplate}>
        <Select.Trigger aria-label="新增节点类型或模板" /><Select.Content>
          <Select.Item value="function">新建 Function</Select.Item><Select.Separator />
          <Select.Group><Select.Label>复制已有动作后修改</Select.Label>{candidates.map((item) => <Select.Item value={item.id} key={item.id}>
            {actionPresentation(item).type} · {actionPresentation(item).title}</Select.Item>)}</Select.Group>
        </Select.Content></Select.Root></label>
      <Flex gap="2" justify="end"><Dialog.Close><Button variant="soft">取消</Button></Dialog.Close>
        <Button disabled={busy} onClick={insert}>添加节点</Button></Flex>
    </Dialog.Content></Dialog.Root>
  </section>
}
