"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

type GreenSettingsVm = {
  instanceId: string;
  apiBaseUrl: string;
  hasToken: boolean;
  tokenPreview: string;
  updatedAt: string;
  canManage: boolean;
};

type GreenMessageVm = {
  id: string;
  direction: "incoming" | "outgoing";
  chatId: string;
  phone: string;
  text: string;
  timestampIso: string;
  senderName?: string;
  status?: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export default function GreenApiClient() {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  const [settings, setSettings] = useState<GreenSettingsVm | null>(null);
  const [instanceId, setInstanceId] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.green-api.com");
  const [apiTokenInstance, setApiTokenInstance] = useState("");

  const [messages, setMessages] = useState<GreenMessageVm[]>([]);
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, messagesRes] = await Promise.all([
        fetch("/api/greenapi/settings", { credentials: "include", cache: "no-store" }),
        fetch("/api/greenapi/messages?limit=80", { credentials: "include", cache: "no-store" }),
      ]);

      const settingsJson = await parseJson<{
        ok?: boolean;
        config?: GreenSettingsVm;
        error?: string;
      }>(settingsRes);
      if (!settingsRes.ok || !settingsJson.ok || !settingsJson.config) {
        throw new Error(settingsJson.error || "טעינת הגדרות GreenAPI נכשלה");
      }
      setSettings(settingsJson.config);
      setInstanceId(settingsJson.config.instanceId || "");
      setApiBaseUrl(settingsJson.config.apiBaseUrl || "https://api.green-api.com");

      const messagesJson = await parseJson<{
        ok?: boolean;
        messages?: GreenMessageVm[];
        error?: string;
      }>(messagesRes);
      if (messagesRes.ok && messagesJson.ok) {
        setMessages(messagesJson.messages ?? []);
      } else if (messagesRes.status !== 400) {
        throw new Error(messagesJson.error || "טעינת הודעות נכשלה");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch("/api/greenapi/messages?limit=80", {
            credentials: "include",
            cache: "no-store",
          });
          const j = await parseJson<{ ok?: boolean; messages?: GreenMessageVm[] }>(res);
          if (res.ok && j.ok) setMessages(j.messages ?? []);
        } catch {
          // ignore background refresh errors
        }
      })();
    }, 15000);
    return () => window.clearInterval(t);
  }, []);

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) =>
        m.phone.includes(q.replace(/[^\d]/g, "")) ||
        m.chatId.toLowerCase().includes(q) ||
        m.text.toLowerCase().includes(q) ||
        (m.senderName ?? "").toLowerCase().includes(q)
    );
  }, [messages, search]);

  async function saveSettings() {
    if (!settings?.canManage) return;
    setSavingSettings(true);
    setError(null);
    setOkMessage(null);
    try {
      const res = await fetch("/api/greenapi/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId,
          apiBaseUrl,
          apiTokenInstance: apiTokenInstance.trim() || undefined,
        }),
      });
      const j = await parseJson<{ ok?: boolean; config?: GreenSettingsVm; error?: string }>(res);
      if (!res.ok || !j.ok || !j.config) throw new Error(j.error || "שמירת הגדרות נכשלה");
      setSettings(j.config);
      setApiTokenInstance("");
      setOkMessage("ההגדרות נשמרו.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "שמירת הגדרות נכשלה");
    } finally {
      setSavingSettings(false);
    }
  }

  async function sendMessage() {
    setSending(true);
    setError(null);
    setOkMessage(null);
    try {
      const res = await fetch("/api/greenapi/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, text }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "שליחה נכשלה");
      setText("");
      setOkMessage("ההודעה נשלחה דרך GREENAPI.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שליחה נכשלה");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {error ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>
          {error}
        </div>
      ) : null}
      {okMessage ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>
          {okMessage}
        </div>
      ) : null}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>חיבור GREENAPI</div>
        <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
          חיבור זה מאפשר לראות הודעות נכנסות/יוצאות ולשלוח WhatsApp ישירות מה-CRM.
        </div>
        <input
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
          placeholder="Instance ID (למשל 1101...)"
          dir="ltr"
          disabled={loading || !settings?.canManage}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <input
          value={apiBaseUrl}
          onChange={(e) => setApiBaseUrl(e.target.value)}
          placeholder="API Base URL (ברירת מחדל: https://api.green-api.com)"
          dir="ltr"
          disabled={loading || !settings?.canManage}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <input
          value={apiTokenInstance}
          onChange={(e) => setApiTokenInstance(e.target.value)}
          placeholder="ApiTokenInstance (השאר ריק אם לא מחליפים טוקן)"
          dir="ltr"
          disabled={loading || !settings?.canManage}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          טוקן שמור: {settings?.hasToken ? settings.tokenPreview : "לא הוגדר"}
          {settings?.updatedAt ? ` · עודכן ${formatIsraelDateTime(settings.updatedAt)}` : ""}
        </div>
        {settings?.canManage ? (
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={savingSettings}
            style={{
              justifySelf: "start",
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: "#166534",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {savingSettings ? "שומר..." : "שמור חיבור"}
          </button>
        ) : (
          <div style={{ fontSize: 12, color: "#92400e" }}>רק מנהל יכול לעדכן פרטי חיבור.</div>
        )}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>שליחת הודעה (אוטומציה/ידני)</div>
        <div style={{ display: "grid", gap: 8 }}>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="טלפון יעד (9725...)"
            dir="ltr"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="תוכן ההודעה"
            rows={3}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", resize: "vertical" }}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending || !phone.trim() || !text.trim()}
            style={{
              justifySelf: "start",
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: "#111827",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {sending ? "שולח..." : "שלח ב-GREENAPI"}
          </button>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>הודעות נכנסות/יוצאות</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי טלפון/טקסט"
            style={{ width: 260, maxWidth: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 10 }}
          />
        </div>
        {loading ? (
          <div style={{ color: "#6b7280" }}>טוען...</div>
        ) : filteredMessages.length === 0 ? (
          <div style={{ color: "#6b7280" }}>אין הודעות להצגה כרגע.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, maxHeight: 580, overflow: "auto" }}>
            {filteredMessages.map((m) => (
              <div
                key={`${m.direction}-${m.id}`}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 10,
                  background: m.direction === "incoming" ? "#f0fdf4" : "#eff6ff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                  <strong>{m.direction === "incoming" ? "נכנס" : "יוצא"}</strong>
                  <span>{formatIsraelDateTime(m.timestampIso)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#4b5563", marginTop: 2 }} dir="ltr">
                  {m.phone} · {m.chatId}
                </div>
                {m.senderName ? <div style={{ fontSize: 12, color: "#4b5563" }}>שם: {m.senderName}</div> : null}
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{m.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
