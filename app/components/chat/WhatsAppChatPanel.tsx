"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

type WaMessage = {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  createdAt: string;
};

type Props = { phone: string };

const SESSION_MS = 24 * 60 * 60 * 1000;

function isInSession(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < SESSION_MS;
}

export default function WhatsAppChatPanel({ phone }: Props) {
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastInboundAt, setLastInboundAt] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!phone?.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/whatsapp/thread-by-phone?phone=${encodeURIComponent(phone)}`,
        { credentials: "include", cache: "no-store" }
      );
      const j = await res.json().catch(() => ({})) as {
        ok?: boolean; messages?: WaMessage[]; lastInboundAt?: string | null; error?: string;
      };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "טעינה נכשלה");
      setMessages(j.messages ?? []);
      setLastInboundAt(j.lastInboundAt ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch("/api/whatsapp/chats/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: phone, text: t }),
      });
      const j = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "שליחה נכשלה");
      setText("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSending(false);
    }
  }

  if (!phone?.trim()) {
    return <div style={{ color: "#9ca3af", padding: 16, fontSize: 13 }}>אין מספר טלפון לאיש קשר זה.</div>;
  }

  const inSession = isInSession(lastInboundAt);
  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 420, gap: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.549 4.107 1.51 5.842L.057 23.882a.5.5 0 00.614.635l6.155-1.49C8.437 23.481 10.19 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.744 0-3.395-.453-4.834-1.247l-.347-.2-3.594.869.895-3.518-.22-.36C2.916 15.88 2 14.037 2 12 2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
          <span style={{ fontWeight: 700, fontSize: 13 }}>WhatsApp (Meta)</span>
          <span style={{ fontSize: 11, color: "#6b7280" }} dir="ltr">{phone}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: inSession ? "#10b981" : "#d1d5db" }} />
          <span style={{ fontSize: 11, color: inSession ? "#065f46" : "#9ca3af" }}>
            {inSession ? "חלון שירות פעיל" : "חלון שירות סגור"}
          </span>
          <button type="button" onClick={() => void load()} disabled={loading} style={{ marginRight: 4, padding: "3px 8px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", fontSize: 11, cursor: "pointer" }}>
            {loading ? "..." : "רענן"}
          </button>
        </div>
      </div>

      {err && <div style={{ padding: "6px 10px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 12, marginBottom: 6 }}>{err}</div>}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
        {loading && messages.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: 13, padding: 8 }}>טוען...</div>
        ) : sorted.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: 13, padding: 8 }}>אין הודעות עם איש קשר זה.</div>
        ) : (
          sorted.map((m) => (
            <div key={m.id} style={{ display: "flex", flexDirection: m.direction === "outbound" ? "row-reverse" : "row", gap: 6 }}>
              <div style={{
                maxWidth: "75%",
                padding: "8px 12px",
                borderRadius: m.direction === "outbound" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: m.direction === "outbound" ? "#dcf8c6" : "#fff",
                border: "1px solid",
                borderColor: m.direction === "outbound" ? "#b7e8a0" : "#e5e7eb",
                fontSize: 13,
                lineHeight: 1.5,
              }}>
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4, textAlign: m.direction === "outbound" ? "left" : "right" }}>
                  {formatIsraelDateTime(m.createdAt)}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Send */}
      <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 8, display: "flex", gap: 8 }}>
        {!inSession && (
          <div style={{ width: "100%", fontSize: 11, color: "#92400e", background: "#fffbeb", padding: "6px 10px", borderRadius: 8, textAlign: "center" }}>
            חלון 24 שעות סגור — שלח תבנית מאושרת מהמסך «אוטומציות ווצאפ» כדי לפתוח שיחה.
          </div>
        )}
        {inSession && (
          <>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }}}
              placeholder="כתוב הודעה..."
              disabled={sending}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !text.trim()}
              style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#25d366", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              {sending ? "..." : "שלח"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
