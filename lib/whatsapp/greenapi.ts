import type { GreenApiConfig } from "@/lib/whatsapp/repo";

export type GreenApiChatMessage = {
  id: string;
  direction: "incoming" | "outgoing";
  chatId: string;
  phone: string;
  text: string;
  timestampIso: string;
  senderName?: string;
  status?: string;
};

type GreenApiListItem = {
  idMessage?: string;
  type?: string;
  chatId?: string;
  senderData?: { senderName?: string; chatId?: string };
  textMessage?: string;
  extendedTextMessage?: { text?: string };
  timestamp?: number;
  statusMessage?: string;
};

type GreenApiSendResponse = {
  idMessage?: string;
  error?: string;
};

function normalizeBaseUrl(raw?: string): string {
  const base = raw?.trim() || "https://api.green-api.com";
  return base.replace(/\/+$/, "");
}

function normalizePhoneFromChatId(chatId: string): string {
  const m = chatId.trim().match(/^(\d+)@/);
  return (m?.[1] ?? chatId).replace(/[^\d]/g, "");
}

function toIso(ts?: number): string {
  if (typeof ts === "number" && Number.isFinite(ts) && ts > 0) {
    return new Date(ts * 1000).toISOString();
  }
  return new Date().toISOString();
}

function messageText(row: GreenApiListItem): string {
  const direct = (row.textMessage ?? "").trim();
  if (direct) return direct;
  const ext = (row.extendedTextMessage?.text ?? "").trim();
  if (ext) return ext;
  return "";
}

function mapItems(rows: unknown, direction: "incoming" | "outgoing"): GreenApiChatMessage[] {
  if (!Array.isArray(rows)) return [];
  const out: GreenApiChatMessage[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as GreenApiListItem;
    const chatId = (row.chatId ?? row.senderData?.chatId ?? "").trim();
    if (!chatId || !/@c\.us$/i.test(chatId)) continue;
    const text = messageText(row);
    if (!text) continue;
    out.push({
      id: (row.idMessage ?? `${direction}-${chatId}-${row.timestamp ?? Date.now()}`).trim(),
      direction,
      chatId,
      phone: normalizePhoneFromChatId(chatId),
      text,
      timestampIso: toIso(row.timestamp),
      senderName: row.senderData?.senderName?.trim() || undefined,
      status: row.statusMessage?.trim() || undefined,
    });
  }
  return out;
}

async function callGreenApi<T>(
  config: GreenApiConfig,
  endpoint: string,
  method: "GET" | "POST",
  body?: unknown
): Promise<T> {
  const base = normalizeBaseUrl(config.apiBaseUrl);
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const res = await fetch(`${base}/waInstance${config.instanceId}${path}/${config.apiTokenInstance}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!res.ok) {
    const err = json.error || json.message || `GreenAPI request failed (${res.status})`;
    throw new Error(err);
  }
  return json;
}

export async function listGreenApiRecentMessages(
  config: GreenApiConfig,
  limit = 50
): Promise<GreenApiChatMessage[]> {
  const safeLimit = Math.max(1, Math.min(100, limit));
  const [incomingRaw, outgoingRaw] = await Promise.all([
    callGreenApi<unknown>(config, "lastIncomingMessages", "POST", { count: safeLimit }),
    callGreenApi<unknown>(config, "lastOutgoingMessages", "POST", { count: safeLimit }),
  ]);
  const merged = [
    ...mapItems(incomingRaw, "incoming"),
    ...mapItems(outgoingRaw, "outgoing"),
  ].sort((a, b) => b.timestampIso.localeCompare(a.timestampIso));
  const seen = new Set<string>();
  const deduped: GreenApiChatMessage[] = [];
  for (const row of merged) {
    const key = `${row.id}:${row.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped.slice(0, safeLimit * 2);
}

export async function sendTextMessageViaGreenApi(
  config: GreenApiConfig,
  input: { phone: string; text: string }
): Promise<{ messageId?: string }> {
  const phone = input.phone.replace(/[^\d]/g, "");
  const text = input.text.trim();
  if (!phone) throw new Error("מספר טלפון לא תקין.");
  if (!text) throw new Error("טקסט ההודעה ריק.");
  const payload = {
    chatId: `${phone}@c.us`,
    message: text,
  };
  const res = await callGreenApi<GreenApiSendResponse>(config, "sendMessage", "POST", payload);
  if (res.error?.trim()) throw new Error(res.error.trim());
  return { messageId: res.idMessage?.trim() || undefined };
}
