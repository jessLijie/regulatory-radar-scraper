import { z } from "zod";

export type Point = { x: number; y: number };
export function clampChatPosition(point: Point, panel: { width: number; height: number }, viewport: { width: number; height: number }): Point {
  const padding = 12;
  return {
    x: Math.max(padding, Math.min(point.x, viewport.width - panel.width - padding)),
    y: Math.max(padding, Math.min(point.y, viewport.height - panel.height - padding)),
  };
}
const sourceSchema = z.object({
  id: z.string().max(20), title: z.string().max(1000), kind: z.string().max(200),
  text: z.string().max(20000), page: z.number().int().positive().optional(),
  url: z.string().max(3000).refine((value) => {
    if (/^\/api\/knowledge\/documents\/demo-[a-z]+(?:\?|$)/.test(value)) return true;
    try { const url = new URL(value); return url.protocol === "https:" && ["www.bnm.gov.my", "bnm.gov.my"].includes(url.hostname) && !url.username && !url.password; } catch { return false; }
  }),
});
const messageSchema = z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(20000), sources: z.array(sourceSchema).max(10).optional(), scope: z.string().max(1000).optional(), error: z.boolean().optional() });
export const publicationSchema = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/), title: z.string().max(1000) });
const transferSchema = z.object({ version: z.literal(1), messages: z.array(messageSchema).max(500), draft: z.string().max(1500), scope: z.enum(["all", "internal", "current"]), publication: publicationSchema.nullable() });
export type Source = z.infer<typeof sourceSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Publication = z.infer<typeof publicationSchema>;
export type ChatTransfer = z.infer<typeof transferSchema>;
export function parseChatTransfer(value: unknown): ChatTransfer | null {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > 2_000_000) return null;
    const parsed = transferSchema.safeParse(value);
    if (!parsed.success || (parsed.data.scope === "current" && !parsed.data.publication)) return null;
    return parsed.data;
  } catch { return null; }
}
