import { z } from "zod"
import { keySchema, textSchema } from "./common.js"
import { capabilityReferenceSchema } from "./node.js"

export const capabilityDescriptorFieldSchema = z.object({
  path: z.string().regex(/^(config|input)(\.[A-Za-z][A-Za-z0-9_-]*)+$/),
  label: textSchema,
  control: z.enum(["text", "number", "boolean", "select", "binding", "browser_target"]),
  required: z.boolean(),
  options: z.array(z.object({ value: z.string().min(1).max(200), label: textSchema }).strict()).max(100).optional(),
}).strict()

export const capabilityDescriptorSchema = z.object({
  capability: capabilityReferenceSchema, descriptorVersion: z.number().int().positive(),
  family: keySchema, displayName: textSchema, summary: textSchema,
  editableFields: z.array(capabilityDescriptorFieldSchema).max(100),
  targetMode: z.enum(["none", "saved_browser_target", "live_browser_picker"]),
  ports: z.array(z.object({ name: keySchema, role: z.enum(["primary", "decision", "exception"]),
    label: textSchema }).strict()).max(100),
  replacements: z.array(z.object({ ...capabilityReferenceSchema.shape, label: textSchema }).strict()).max(50),
  validationScope: z.enum(["structural", "node", "node_and_downstream", "whole_chain"]),
}).strict().superRefine((descriptor, context) => {
  const paths = descriptor.editableFields.map((field) => field.path)
  if (new Set(paths).size !== paths.length) context.addIssue({ code: "custom", message: "descriptor_field_duplicate" })
  const ports = descriptor.ports.map((port) => port.name)
  if (new Set(ports).size !== ports.length) context.addIssue({ code: "custom", message: "descriptor_port_duplicate" })
})

export type CapabilityDescriptor = z.infer<typeof capabilityDescriptorSchema>
