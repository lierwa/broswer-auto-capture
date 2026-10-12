import { z } from 'zod';

const protocolErrorSchema = z.object({
  code: z.number().int(), message: z.string(), data: z.unknown().optional(),
});

/** WHY：chrome.debugger 把 CDP 错误对象放在 Error.message 的 JSON 中；转发必须恢复协议字段。
 * 否则调用方无法识别原生取消，只能将整个会话判成故障。未知文本仍作为失败返回，不按词匹配豁免。
 */
export function cdpProtocolError(error: unknown): { code?: number; message: string; data?: unknown } {
  const message = error instanceof Error ? error.message : 'Unknown extension error';
  try {
    const parsed = protocolErrorSchema.safeParse(JSON.parse(message));
    if (parsed.success) return parsed.data;
  } catch { /* Non-CDP extension errors retain their original message. */ }
  return { message };
}
