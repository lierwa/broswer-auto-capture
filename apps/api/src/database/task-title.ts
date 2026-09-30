export function automaticTaskTitle(value: string | undefined, fallback: string) {
  const normalized = value?.replace(/\s+/gu, " ").trim()
  if (!normalized) return fallback
  // WHY：标题只是导航预览，不改写需求原文，也不增加一次模型摘要；用户命名不经过此投影。
  const characters = Array.from(normalized)
  return characters.length > 32 ? `${characters.slice(0, 32).join("")}…` : normalized
}
