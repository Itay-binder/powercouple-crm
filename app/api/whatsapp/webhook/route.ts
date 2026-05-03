import { NextRequest, NextResponse } from "next/server";
import { getFirestoreForWhatsAppWebhook, getWhatsAppWebhookDatabaseId } from "@/lib/firebase/admin";
import { getTenantByDatabaseId } from "@/lib/tenant/config";
import {
  getLeadWhatsAppMarketingApprovalByPhone,
  normalizePhone,
  setLeadWhatsAppMarketingApprovalByPhone,
} from "@/lib/leads/repo";
import {
  appendWhatsAppCampaignDispatchInteraction,
  appendWhatsAppChatMessage,
  applyWhatsAppCampaignMessageStatuses,
  type WhatsAppDispatchInteraction,
} from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

type MetaWebhookMessage = {
  id?: string;
  from?: string;
  timestamp?: string | number;
  type?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  context?: { from?: string; id?: string };
};

type MetaWebhookStatus = {
  id?: string;
  status?: string;
  timestamp?: string | number;
  recipient_id?: string;
  errors?: Array<{ code?: unknown; title?: string; message?: string }>;
};

type MetaWebhookValue = {
  metadata?: { display_phone_number?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } & Record<string, unknown> }>;
  messages?: MetaWebhookMessage[];
  statuses?: MetaWebhookStatus[];
};

function extractInboundText(message: MetaWebhookMessage): string {
  const text = message.text?.body?.trim();
  if (text) return text;
  const button = message.button?.text?.trim();
  if (button) return button;
  const reply = message.interactive?.button_reply?.title?.trim();
  if (reply) return reply;
  const listReply = message.interactive?.list_reply?.title?.trim();
  if (listReply) return listReply;
  return "";
}

function extractDispatchInteraction(
  message: MetaWebhookMessage,
  tsIso: string
): { interaction: WhatsAppDispatchInteraction; contextMessageId: string } | null {
  const ctxId = message.context?.id?.trim();
  if (!ctxId) return null;
  const t = (message.type ?? "").trim().toLowerCase();
  if (t === "button") {
    const text = message.button?.text?.trim() || "";
    if (!text) return null;
    return {
      contextMessageId: ctxId,
      interaction: {
        kind: "button",
        text,
        payload: message.button?.payload?.trim() || undefined,
        at: tsIso,
      },
    };
  }
  if (t === "interactive") {
    const it = message.interactive?.type?.trim().toLowerCase();
    if (it === "button_reply") {
      const title = message.interactive?.button_reply?.title?.trim() || "";
      if (!title) return null;
      return {
        contextMessageId: ctxId,
        interaction: {
          kind: "quick_reply",
          text: title,
          payload: message.interactive?.button_reply?.id?.trim() || undefined,
          at: tsIso,
        },
      };
    }
    if (it === "list_reply") {
      const title = message.interactive?.list_reply?.title?.trim() || "";
      if (!title) return null;
      return {
        contextMessageId: ctxId,
        interaction: {
          kind: "list_reply",
          text: title,
          payload: message.interactive?.list_reply?.id?.trim() || undefined,
          at: tsIso,
        },
      };
    }
  }
  return null;
}

function messageTimestampToIso(raw: string | number | undefined): string {
  const rawTs = raw;
  const tsSec =
    typeof rawTs === "number" && Number.isFinite(rawTs)
      ? rawTs
      : typeof rawTs === "string" && /^\d+$/.test(rawTs.trim())
        ? Number.parseInt(rawTs.trim(), 10)
        : NaN;
  return Number.isFinite(tsSec) ? new Date(tsSec * 1000).toISOString() : new Date().toISOString();
}

function statusErrorsText(errors: MetaWebhookStatus["errors"]): string | undefined {
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  const parts = errors
    .map((e) => {
      if (!e || typeof e !== "object") return "";
      const title = typeof e.title === "string" ? e.title.trim() : "";
      const msg = typeof e.message === "string" ? e.message.trim() : "";
      const code = e.code !== undefined ? String(e.code) : "";
      return [title, msg, code ? `#${code}` : ""].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  return parts.length ? parts.join("; ") : undefined;
}

function extractWaProfilePictureUrl(
  contacts: MetaWebhookValue["contacts"],
  fromPhone: string
): string | undefined {
  if (!contacts?.length || !fromPhone) return undefined;
  const fromNorm = normalizePhone(fromPhone);
  if (!fromNorm) return undefined;
  const match = contacts.find((c) => (normalizePhone(c.wa_id) ?? "") === fromNorm);
  const profile = match?.profile;
  if (!profile || typeof profile !== "object") return undefined;
  const p = profile as Record<string, unknown>;
  for (const k of ["picture", "picture_url", "profile_picture_url", "icon", "avatar", "image"]) {
    const v = p[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) return v.trim();
  }
  return undefined;
}

function isOptOutKeyword(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized === "הסר" || normalized === "remove" || normalized === "stop";
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || "";
  const looksLikeUrl =
    /^https?:\/\//i.test(expected) || expected.includes("/api/whatsapp/webhook");
  if (looksLikeUrl) {
    return new NextResponse(
      "Misconfigured WHATSAPP_WEBHOOK_VERIFY_TOKEN: use a random secret string (same as in Meta), not the webhook URL. Callback URL in Meta should be https://<domain>/api/whatsapp/webhook",
      { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: false, error: "Invalid webhook verify token" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  let body: {
    entry?: Array<{
      changes?: Array<{ value?: MetaWebhookValue }>;
    }>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const db = getFirestoreForWhatsAppWebhook();
    const statusRows: Array<{ messageId: string; status: string; tsIso: string; error?: string }> = [];
    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const st of statuses) {
          const messageId = (st.id ?? "").trim();
          const status = (st.status ?? "").trim();
          if (!messageId || !status) continue;
          const tsIso = messageTimestampToIso(st.timestamp);
          const err = statusErrorsText(st.errors);
          statusRows.push({ messageId, status, tsIso, error: err });
        }

        const messages = Array.isArray(value.messages) ? value.messages : [];
        const businessPhone = normalizePhone(value.metadata?.display_phone_number) ?? "";
        for (const msg of messages) {
          const from = normalizePhone(msg.from) ?? "";
          if (!from) continue;
          const tsInbound = messageTimestampToIso(msg.timestamp);
          const extracted = extractDispatchInteraction(msg, tsInbound);
          if (extracted) {
            await appendWhatsAppCampaignDispatchInteraction(db, extracted.contextMessageId, extracted.interaction);
          }

          const text = extractInboundText(msg);
          const contacts = Array.isArray(value.contacts) ? value.contacts : [];
          const byWa = contacts.find((c) => (normalizePhone(c.wa_id) ?? "") === from);
          const fallback = contacts[0];
          const contactName = byWa?.profile?.name?.trim() || fallback?.profile?.name?.trim() || undefined;
          const waProfilePictureUrl = extractWaProfilePictureUrl(contacts, from);
          const marketingState = await getLeadWhatsAppMarketingApprovalByPhone(from, db);
          const leadId = marketingState.leadIds[0];
          let marketingApproved = marketingState.approved;

          if (text && isOptOutKeyword(text)) {
            const opt = await setLeadWhatsAppMarketingApprovalByPhone(
              from,
              false,
              "opt_out_keyword_he_ser",
              db
            );
            if (opt.updatedLeadIds.length > 0) marketingApproved = false;
          }

          await appendWhatsAppChatMessage(db, {
            phone: from,
            direction: "inbound",
            text: text || `[${msg.type || "message"}]`,
            from,
            to: businessPhone || "business",
            createdAt: tsInbound,
            messageId: msg.id?.trim(),
            contactId: leadId,
            contactName,
            waProfilePictureUrl,
            marketingApproved,
          });
          const skipWaInboundWebPush =
            getTenantByDatabaseId(getWhatsAppWebhookDatabaseId())?.id === "hot-afik";
          if (!skipWaInboundWebPush) {
            void import("@/lib/push/sendTenantWebPush")
              .then(({ notifyTenantUsersWebPush }) =>
                notifyTenantUsersWebPush(db, {
                  kind: "whatsapp_inbound",
                  title: "הודעת וואטסאפ נכנסה",
                  body: `מ־${from}${contactName ? ` · ${contactName}` : ""}`.trim().slice(0, 180),
                  relativeUrl: `/whatsapp-automations/chats?thread=${encodeURIComponent(from)}`,
                  tag: `wa-${from}-${msg.id?.trim() || tsInbound}`,
                })
              )
              .catch(() => {});
          }
        }
      }
    }

    if (statusRows.length > 0) {
      await applyWhatsAppCampaignMessageStatuses(db, statusRows);
    }

    return NextResponse.json({ ok: true, received: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
