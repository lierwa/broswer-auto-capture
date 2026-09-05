import { z } from "zod"

export const nodeKindSchema = z.enum(["browser", "wait", "branch", "loop", "extract", "count", "llm"])
export type NodeKind = z.infer<typeof nodeKindSchema>

const nodeBaseSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string().min(1).max(120),
  next: z.array(z.string()).max(4).default([]),
}).strict()

export const workflowNodeSchema = z.discriminatedUnion("kind", [
  nodeBaseSchema.extend({ kind: z.literal("browser"), action: z.enum(["navigate", "click", "scroll", "fill"]) }).strict(),
  nodeBaseSchema.extend({ kind: z.literal("wait"), condition: z.string().min(1) }).strict(),
  nodeBaseSchema.extend({ kind: z.literal("branch"), condition: z.string().min(1) }).strict(),
  nodeBaseSchema.extend({ kind: z.literal("loop"), collection: z.string().min(1) }).strict(),
  nodeBaseSchema.extend({ kind: z.literal("extract"), fields: z.array(z.string().min(1)).min(1) }).strict(),
  nodeBaseSchema.extend({ kind: z.literal("count"), source: z.string().min(1) }).strict(),
  nodeBaseSchema.extend({ kind: z.literal("llm"), purpose: z.string().min(1), model: z.string().min(1) }).strict(),
])
export type WorkflowNode = z.infer<typeof workflowNodeSchema>

export const workflowSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  stepId: z.string().uuid(),
  name: z.string().min(1),
  inputs: z.record(z.string(), z.string()).default({}),
  nodes: z.array(workflowNodeSchema).min(1),
  defaultSort: z.string().min(1),
}).strict().superRefine((workflow, context) => {
  const ids = new Set<string>()
  for (const [index, node] of workflow.nodes.entries()) {
    if (ids.has(node.id)) {
      context.addIssue({ code: "custom", path: ["nodes", index, "id"], message: `节点 ID 重复: ${node.id}` })
    }
    ids.add(node.id)
  }

  for (const [index, node] of workflow.nodes.entries()) {
    for (const [nextIndex, nextId] of node.next.entries()) {
      if (!ids.has(nextId)) {
        context.addIssue({ code: "custom", path: ["nodes", index, "next", nextIndex], message: `后继节点不存在: ${nextId}` })
      }
    }
  }
})
export type Workflow = z.infer<typeof workflowSchema>

export function requiresModel(node: WorkflowNode): boolean {
  return node.kind === "llm"
}
