import { z } from 'zod';

export const localHttp = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && !url.username && !url.password;
});
export const requestSchema = z.object({ url: localHttp.refine(value => /^\/popup\/[a-f0-9-]+$/.test(new URL(value).pathname)),
  profileName: z.string().min(1), profileDirectory: z.string().min(1), openPopup: z.boolean() });
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const configurationSchema = z.object({ mcpRelayUrl: z.string().url(), clientName: z.string(),
  protocolVersion: z.literal(2), token: tokenSchema.optional(), persistAuthorization: z.boolean() }).strict();
export const workbenchSchema = z.object({ paired: z.boolean(), connected: z.boolean(), busy: z.boolean(),
  profileName: z.string().nullable() });
export const popupSchema = z.object({
  pending: z.object({ profileName: z.string(), requestId: z.string(), requiresAuthorization: z.boolean() }).nullable(),
  connecting: z.boolean(), enabled: z.boolean(), authorized: z.boolean(), profileName: z.string().nullable(),
  error: z.string(),
  connections: z.array(z.object({ id: z.number(), connectedTabIds: z.array(z.number()) })), workbenchOrigin: localHttp,
});
export type PopupConfiguration = z.infer<typeof configurationSchema>;
export type PopupRequest = z.infer<typeof requestSchema>;
