"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

const SESSION_MS = 24 * 60 * 60 * 1000;

/** WhatsApp Web / Meta Inbox — פלטת צבעים */
const C = {
  shell: "#f0f2f5",
  panel: "#ffffff",
  hairline: "#e9edef",
  hairline2: "#d1d7db",
  text: "#111b21",
  muted: "#667781",
  headerBg: "#f0f2f5",
  chatWall: "#efeae2",
  bubbleOut: "#d9fdd3",
  bubbleIn: "#ffffff",
  waGreen: "#00a884",
  waGreenHover: "#008f72",
  metaBlue: "#0084ff",
  selectedList: "#f0f2f5",
  dangerBg: "#fef2f2",
  dangerText: "#991b1b",
};

const font =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif';

type CrmLeadVm = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  stage?: string;
  status?: string;
  source?: string;
  contactCode?: string;
  assignedRep?: string;
  pipelineId?: string;
  customFields?: Record<string, unknown>;
};

function AvatarCircle({
  photoUrl,
  name,
  phone,
  size,
}: {
  photoUrl?: string;
  name?: string;
  phone: string;
  size: number;
}) {
  const [imgErr, setImgErr] = useState(false);
  const trimmed = photoUrl?.trim();
  const showImg = Boolean(trimmed) && !imgErr;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: "#dfe5e7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.max(12, Math.round(size * 0.35)),
        color: C.text,
        flexShrink: 0,
      }}
    >
      {showImg ? (
        <img
          src={trimmed}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setImgErr(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        initials(name, phone)
      )}
    </div>
  );
}

type ChatMessage = {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  from: string;
  to: string;
  createdAt: string;
};

type ChatThread = {
  id: string;
  phone: string;
  contactName?: string;
  waProfilePictureUrl?: string;
  marketingApproved: boolean;
  lastInboundAt?: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
  messages: ChatMessage[];
};

function sessionOpen(lastInboundIso?: string): boolean {
  if (!lastInboundIso?.trim()) return false;
  const t = new Date(lastInboundIso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < SESSION_MS;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDayLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "היום";
    return d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return "";
  }
}

function initials(contactName: string | undefined, phone: string): string {
  const n = (contactName ?? "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-2) || "?";
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm9 2-4.35-4.35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function IconMic() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V20h2v-2.07A7 7 0 0 0 19 11h-2z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconAttach() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16.5 6v11.5a4.5 4.5 0 1 1-9 0V5a3 3 0 0 1 6 0v12.5a1.5 1.5 0 1 1-3 0V6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconWa() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

type MobilePanel = "list" | "chat" | "details";
type ThreadScope = "session" | "all";

export default function ChatsInboxClient() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadScope, setThreadScope] = useState<ThreadScope>("session");
  const [listQuery, setListQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [active, setActive] = useState<ChatThread | null>(null);
  const [draftText, setDraftText] = useState("");
  const [sending, setSending] = useState(false);
  const [crmContact, setCrmContact] = useState<CrmLeadVm | null>(null);
  const [marketingSaving, setMarketingSaving] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("list");
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const prevMsgLenRef = useRef(0);
  const prevLastMsgIdRef = useRef("");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /** פתיחת שיחה מקישור (למשל מהתראה צפה): ‎?thread=9725… */
  useEffect(() => {
    const raw = searchParams.get("thread")?.trim() ?? "";
    const normalized = raw.replace(/\D/g, "");
    if (!normalized) return;
    setSelectedId(normalized);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
      setMobilePanel("chat");
    }
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/whatsapp-automations/chats");
    }
  }, [searchParams]);

  useEffect(() => {
    if (isNarrow && mobilePanel === "chat" && !selectedId) setMobilePanel("list");
  }, [isNarrow, mobilePanel, selectedId]);

  const loadThreads = useCallback(async () => {
    const scopeParam = threadScope === "all" ? "all" : "recent";
    const res = await fetch(`/api/whatsapp/chats?scope=${scopeParam}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) {
      window.location.href = `/login?returnTo=${encodeURIComponent("/whatsapp-automations/chats")}`;
      return;
    }
    const j = await parseJson<{ ok?: boolean; threads?: ChatThread[]; error?: string }>(res);
    if (!res.ok || !j.ok) throw new Error(j.error || "טעינת שיחות נכשלה");
    const list = j.threads ?? [];
    setThreads(list);
    const narrow =
      typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
    setSelectedId((prev) => (narrow ? prev : prev || list[0]?.id || ""));
  }, [threadScope]);

  const loadThread = useCallback(async (id: string) => {
    if (!id) {
      setActive(null);
      setCrmContact(null);
      return;
    }
    const res = await fetch(`/api/whatsapp/chats?thread=${encodeURIComponent(id)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const j = await parseJson<{
      ok?: boolean;
      thread?: ChatThread;
      contact?: CrmLeadVm | null;
      error?: string;
    }>(res);
    if (!res.ok || !j.ok || !j.thread) throw new Error(j.error || "טעינת חלון שיחה נכשלה");
    const th = j.thread;
    setActive(th);
    setCrmContact(j.contact ?? null);
    setThreads((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) {
        return [
          {
            id: th.id,
            phone: th.phone,
            contactName: th.contactName,
            waProfilePictureUrl: th.waProfilePictureUrl,
            marketingApproved: th.marketingApproved,
            lastInboundAt: th.lastInboundAt,
            lastMessageAt: th.lastMessageAt,
            lastMessagePreview: th.lastMessagePreview,
            unreadCount: 0,
            messages: [],
          },
          ...prev,
        ];
      }
      return prev.map((t) =>
        t.id === id
          ? {
              ...t,
              unreadCount: 0,
              lastMessageAt: th.lastMessageAt,
              lastMessagePreview: th.lastMessagePreview,
              lastInboundAt: th.lastInboundAt ?? t.lastInboundAt,
              contactName: th.contactName ?? t.contactName,
              waProfilePictureUrl: th.waProfilePictureUrl ?? t.waProfilePictureUrl,
              marketingApproved: th.marketingApproved,
            }
          : t
      );
    });
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        await loadThreads();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadThreads]);

  /** פולינג: שיחה פתוחה נטענת בתדירות גבוהה; רשימת השיחות — בתדירות נמוכה יותר כדי לחסוך קריאות. */
  useEffect(() => {
    let tick = 0;
    const POLL_MS = 8000;
    const t = window.setInterval(() => {
      tick += 1;
      if (document.visibilityState === "hidden") return;
      if (selectedId) {
        void loadThread(selectedId).catch(() => {});
        if (tick % 3 === 0) void loadThreads().catch(() => {});
      } else {
        void loadThreads().catch(() => {});
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [loadThreads, loadThread, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    void loadThread(selectedId).catch((e) => setErr(e instanceof Error ? e.message : "שגיאה"));
  }, [selectedId, loadThread]);

  useEffect(() => {
    prevMsgLenRef.current = 0;
    prevLastMsgIdRef.current = "";
  }, [selectedId]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    const list = active?.messages;
    if (!el || !list?.length) return;
    const last = list[list.length - 1];
    const lastId = last?.id ?? "";
    const len = list.length;
    const grew = len > prevMsgLenRef.current || lastId !== prevLastMsgIdRef.current;
    prevMsgLenRef.current = len;
    prevLastMsgIdRef.current = lastId;
    if (grew) el.scrollTop = el.scrollHeight;
  }, [active?.messages]);

  const selectedMeta = useMemo(() => threads.find((t) => t.id === selectedId) ?? null, [threads, selectedId]);

  const filteredThreads = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    let list = threads;
    if (threadScope === "session") {
      list = list.filter((t) => sessionOpen(t.lastInboundAt));
    }
    if (!q) return list;
    return list.filter(
      (t) =>
        (t.contactName ?? "").toLowerCase().includes(q) ||
        t.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "")) ||
        (t.lastMessagePreview ?? "").toLowerCase().includes(q)
    );
  }, [threads, listQuery, threadScope]);

  const canSendFreeform = useMemo(() => {
    const inbound = active?.lastInboundAt ?? selectedMeta?.lastInboundAt;
    return sessionOpen(inbound);
  }, [active?.lastInboundAt, selectedMeta?.lastInboundAt]);

  function selectThread(id: string) {
    setSelectedId(id);
    if (isNarrow) setMobilePanel("chat");
  }

  function goBackToList() {
    setSelectedId("");
    setActive(null);
    setMobilePanel("list");
  }

  async function sendMessage() {
    if (!selectedId || !draftText.trim()) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch("/api/whatsapp/chats/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: selectedId, text: draftText.trim() }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "שליחה נכשלה");
      setDraftText("");
      await loadThread(selectedId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שליחה נכשלה");
    } finally {
      setSending(false);
    }
  }

  async function toggleMarketing() {
    if (!selectedId || marketingSaving) return;
    const currentOn =
      (active?.marketingApproved ?? selectedMeta?.marketingApproved) !== false;
    const next = !currentOn;
    if (next) {
      const ok = window.confirm(
        'הלקוח מסומן כלא מאשר דיוור שיווקי (למשל אחרי "הסר"). האם לאשר מחדש דיוור שיווקי, בהתאם לחוק ובסיס חוקי מתאים?'
      );
      if (!ok) return;
    }
    setMarketingSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/whatsapp/chats/marketing", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: selectedId, marketingApproved: next }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "עדכון נכשל");
      await loadThread(selectedId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "עדכון נכשל");
    } finally {
      setMarketingSaving(false);
    }
  }

  const messagesWithDividers = useMemo(() => {
    if (!active?.messages.length) return [];
    const out: Array<{ type: "day"; label: string } | { type: "msg"; m: ChatMessage }> = [];
    let lastDay = "";
    for (const m of active.messages) {
      const day = new Date(m.createdAt).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        out.push({ type: "day", label: formatDayLabel(m.createdAt) });
      }
      out.push({ type: "msg", m });
    }
    return out;
  }, [active?.messages]);

  if (loading) {
    return (
      <div style={{ fontFamily: font, color: C.muted, padding: 24, textAlign: "center" }}>
        טוען שיחות…
      </div>
    );
  }

  const displayName = selectedMeta?.contactName || selectedMeta?.phone || "בחרו שיחה";
  const displayPhone = selectedMeta?.phone ?? "";
  const displayPhoto = active?.waProfilePictureUrl ?? selectedMeta?.waProfilePictureUrl;
  const panelTitleName = crmContact?.name?.trim() || displayName;
  const marketingOn =
    selectedMeta != null
      ? (active?.marketingApproved ?? selectedMeta.marketingApproved) !== false
      : false;

  return (
    <div dir="rtl" style={{ fontFamily: font, color: C.text }}>
      <div
        style={{
          marginBottom: 10,
          padding: "10px 12px",
          background: C.panel,
          border: `1px solid ${C.hairline}`,
          borderRadius: 8,
          fontSize: 12,
          color: C.muted,
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: C.text }}>למה אין הודעות נכנסות?</strong> התכתבות כאן נשמרת רק כשמטא שולחת webhook לכתובת{" "}
        <code dir="ltr" style={{ fontSize: 11, background: "#f3f4f6", padding: "1px 5px", borderRadius: 4 }}>
          …/api/whatsapp/webhook
        </code>
        . ב־Meta Developers → האפליקציה שלכם → WhatsApp → Configuration: Callback URL כזו, Verify token זהה ל־
        <code dir="ltr" style={{ fontSize: 11, background: "#f3f4f6", padding: "1px 5px", borderRadius: 4 }}>
          WHATSAPP_WEBHOOK_VERIFY_TOKEN
        </code>{" "}
        (מחרוזת סודית — לא URL), וסמנו subscribe לאירוע <code style={{ fontSize: 11 }}>messages</code>. ב־Vercel חייב להיות אותו
        משתנה סביבה. תיבה מלאה:{" "}
        <a
          href="https://business.facebook.com/latest/inbox/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: C.metaBlue, fontWeight: 600 }}
        >
          Business Suite → Inbox
        </a>
        .
      </div>

      {err ? (
        <div
          style={{
            marginBottom: 10,
            padding: 12,
            borderRadius: 8,
            background: C.dangerBg,
            color: C.dangerText,
            fontSize: 14,
          }}
        >
          {err}
        </div>
      ) : null}

      {isNarrow ? (
        <div
          role="tablist"
          aria-label="תצוגת צ׳אט"
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 8,
            padding: 4,
            background: C.shell,
            borderRadius: 10,
            border: `1px solid ${C.hairline}`,
          }}
        >
          {(["list", "chat", "details"] as const).map((p) => {
            const labels: Record<MobilePanel, string> = { list: "שיחות", chat: "הודעות", details: "פרטים" };
            const on = mobilePanel === p;
            return (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setMobilePanel(p)}
                style={{
                  flex: 1,
                  padding: "10px 8px",
                  borderRadius: 8,
                  border: on ? `1px solid ${C.hairline2}` : "1px solid transparent",
                  background: on ? C.panel : "transparent",
                  fontWeight: 800,
                  fontSize: 13,
                  color: on ? C.text : C.muted,
                  cursor: "pointer",
                  fontFamily: font,
                }}
              >
                {labels[p]}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isNarrow
            ? "1fr"
            : "minmax(280px, 1fr) minmax(0, 2.2fr) minmax(220px, 1fr)",
          gridTemplateRows: "1fr",
          border: `1px solid ${C.hairline}`,
          borderRadius: 12,
          overflow: "hidden",
          minHeight: isNarrow ? 420 : 560,
          height: isNarrow ? "min(calc(100dvh - 280px), 720px)" : "min(78vh, 820px)",
          maxHeight: isNarrow ? "min(calc(100dvh - 280px), 720px)" : "min(78vh, 820px)",
          background: C.panel,
          boxShadow: "0 1px 3px rgba(11,20,26,0.08)",
        }}
      >
        {/* עמודה 1 (ב־RTL: ימין) — רשימת שיחות */}
        <aside
          style={{
            display: isNarrow && mobilePanel !== "list" ? "none" : "flex",
            flexDirection: "column",
            borderInlineEnd: isNarrow ? "none" : `1px solid ${C.hairline}`,
            background: C.panel,
            minWidth: 0,
            minHeight: 0,
            height: "100%",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: `1px solid ${C.hairline}`,
              background: C.headerBg,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 700,
                fontSize: 14,
                color: C.text,
              }}
            >
              <IconWa />
              WhatsApp
            </span>
            {!isNarrow ? (
              <span
                style={{
                  marginInlineStart: "auto",
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.muted,
                  padding: "4px 8px",
                  borderRadius: 6,
                  background: "rgba(0,0,0,0.04)",
                }}
              >
                Messenger / Instagram — בקרוב
              </span>
            ) : null}
          </div>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.hairline}`, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => setThreadScope("session")}
                style={{
                  border: "1px solid " + (threadScope === "session" ? C.hairline2 : C.hairline),
                  background: threadScope === "session" ? C.selectedList : C.panel,
                  color: C.text,
                  borderRadius: 8,
                  padding: "5px 9px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: font,
                }}
              >
                חלון פתוח
              </button>
              <button
                type="button"
                onClick={() => setThreadScope("all")}
                style={{
                  border: "1px solid " + (threadScope === "all" ? C.hairline2 : C.hairline),
                  background: threadScope === "all" ? C.selectedList : C.panel,
                  color: C.text,
                  borderRadius: 8,
                  padding: "5px 9px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: font,
                }}
              >
                כל השיחות
              </button>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: C.shell,
                borderRadius: 8,
                padding: "6px 10px",
                border: `1px solid ${C.hairline2}`,
              }}
            >
              <span style={{ color: C.muted, display: "flex" }}>
                <IconSearch />
              </span>
              <input
                type="search"
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="חיפוש בשיחות…"
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  fontSize: 14,
                  outline: "none",
                  fontFamily: font,
                  minWidth: 0,
                }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
            {filteredThreads.length === 0 ? (
              <div style={{ padding: 16, color: C.muted, fontSize: 14 }}>
                {threads.length === 0
                  ? "עדיין לא התקבלו התכתבויות."
                  : threadScope === "session"
                    ? "אין כרגע שיחות בתוך חלון השירות (24 שעות)."
                    : "אין תוצאות לחיפוש."}
              </div>
            ) : (
              filteredThreads.map((t) => {
                const rowOn = t.id === selectedId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectThread(t.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "stretch",
                      gap: 10,
                      textAlign: "right",
                      border: "none",
                      borderBottom: `1px solid ${C.hairline}`,
                      background: rowOn ? C.selectedList : C.panel,
                      padding: "10px 12px",
                      cursor: "pointer",
                      transition: "background 0.12s ease",
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        borderRadius: "50%",
                        outline: rowOn ? `2px solid ${C.waGreen}` : "none",
                        outlineOffset: 2,
                      }}
                    >
                      <AvatarCircle photoUrl={t.waProfilePictureUrl} name={t.contactName} phone={t.phone} size={48} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 16, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.contactName || t.phone}
                        </span>
                        <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }} dir="ltr">
                          {formatTime(t.lastMessageAt)}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: C.muted,
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                        dir="ltr"
                      >
                        <span style={{ flexShrink: 0, opacity: 0.85 }}>✓</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.lastMessagePreview || "—"}</span>
                      </div>
                      {t.unreadCount > 0 ? (
                        <span
                          style={{
                            display: "inline-block",
                            marginTop: 6,
                            background: C.waGreen,
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 10,
                          }}
                        >
                          {t.unreadCount} חדש
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* עמודה 2 — חלון שיחה */}
        <section
          style={{
            display: isNarrow && mobilePanel !== "chat" ? "none" : "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
            height: "100%",
            overflow: "hidden",
            background: C.chatWall,
          }}
        >
          <header
            style={{
              height: 59,
              flexShrink: 0,
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: C.headerBg,
              borderBottom: `1px solid ${C.hairline}`,
            }}
          >
            {isNarrow ? (
              <button
                type="button"
                onClick={goBackToList}
                aria-label="חזרה לרשימת שיחות"
                style={{
                  border: "none",
                  background: "rgba(0,0,0,0.06)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontWeight: 800,
                  fontSize: 13,
                  color: C.text,
                  cursor: "pointer",
                  flexShrink: 0,
                  fontFamily: font,
                }}
              >
                ←
              </button>
            ) : null}
            <AvatarCircle
              photoUrl={displayPhoto}
              name={selectedMeta?.contactName}
              phone={displayPhone || "?"}
              size={40}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>{displayName}</div>
              <div style={{ fontSize: 12, color: C.muted }} dir="ltr">
                {displayPhone || " "}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, color: C.muted }}>
              <span title="סימון" style={{ padding: 8, borderRadius: 8, cursor: "default", opacity: 0.5 }}>
                ★
              </span>
              <span title="דוא״ל" style={{ padding: 8, borderRadius: 8, cursor: "default", opacity: 0.5 }}>
                ✉
              </span>
            </div>
          </header>

          <div
            ref={messagesScrollRef}
            style={{
              flex: 1,
              overflow: "auto",
              padding: "12px 16px 8px",
              backgroundColor: C.chatWall,
              backgroundImage: `repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(0,0,0,0.02) 2px,
                rgba(0,0,0,0.02) 4px
              )`,
              minHeight: 0,
            }}
          >
            {!active || active.messages.length === 0 ? (
              <div style={{ color: C.muted, textAlign: "center", padding: 40, fontSize: 14 }}>
                אין הודעות להצגה.
              </div>
            ) : (
              messagesWithDividers.map((item, idx) =>
                item.type === "day" ? (
                  <div key={`d-${idx}`} style={{ display: "flex", justifyContent: "center", margin: "14px 0" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: C.muted,
                        background: "rgba(255,255,255,0.92)",
                        padding: "4px 12px",
                        borderRadius: 8,
                        boxShadow: "0 1px 1px rgba(0,0,0,0.06)",
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                ) : (
                  (() => {
                    const m = item.m;
                    const outbound = m.direction === "outbound";
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          justifyContent: outbound ? "flex-start" : "flex-end",
                          marginBottom: 4,
                        }}
                      >
                        <div
                          style={{
                            maxWidth: "min(75%, 520px)",
                            padding: outbound ? "6px 7px 6px 9px" : "6px 9px 6px 7px",
                            borderRadius: outbound ? "7.5px 7.5px 0 7.5px" : "7.5px 7.5px 7.5px 0",
                            background: outbound ? C.bubbleOut : C.bubbleIn,
                            boxShadow: "0 1px 0.5px rgba(11,20,26,0.13)",
                            position: "relative",
                          }}
                        >
                          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, fontSize: 14.2, color: C.text }}>
                            {m.text || "—"}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              alignItems: "center",
                              gap: 4,
                              marginTop: 2,
                              fontSize: 11,
                              color: C.muted,
                            }}
                            dir="ltr"
                          >
                            {formatTime(m.createdAt)}
                            {outbound ? <span style={{ opacity: 0.65 }}>✓✓</span> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )
              )
            )}
          </div>

          <footer
            style={{
              flexShrink: 0,
              padding: "8px 12px 10px",
              background: C.headerBg,
              borderTop: `1px solid ${C.hairline}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 8,
                background: C.panel,
                borderRadius: 24,
                border: `1px solid ${canSendFreeform ? C.hairline2 : C.hairline}`,
                padding: "6px 6px 6px 12px",
                boxShadow: "0 1px 1px rgba(0,0,0,0.04)",
              }}
            >
              <button
                type="button"
                disabled
                title="צירוף קבצים — בקרוב"
                style={{
                  border: "none",
                  background: "none",
                  color: C.muted,
                  padding: 6,
                  cursor: "not-allowed",
                  opacity: 0.45,
                  display: "flex",
                }}
              >
                <IconAttach />
              </button>
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSendFreeform && draftText.trim() && !sending && selectedId) void sendMessage();
                  }
                }}
                placeholder={canSendFreeform ? "הקלידו הודעה…" : "מחוץ לחלון שירות — לא ניתן לשלוח טקסט חופשי"}
                disabled={!canSendFreeform || sending || !selectedId}
                rows={1}
                style={{
                  flex: 1,
                  border: "none",
                  resize: "none",
                  outline: "none",
                  fontFamily: font,
                  fontSize: 15,
                  lineHeight: 1.4,
                  maxHeight: 120,
                  padding: "8px 0",
                  background: "transparent",
                  opacity: canSendFreeform ? 1 : 0.55,
                  minWidth: 0,
                }}
              />
              <button
                type="button"
                disabled={!canSendFreeform}
                title="הקלטה — בקרוב"
                style={{
                  border: "none",
                  background: "none",
                  color: C.muted,
                  padding: 6,
                  cursor: "not-allowed",
                  opacity: 0.45,
                  display: "flex",
                }}
              >
                <IconMic />
              </button>
              <button
                type="button"
                disabled={!canSendFreeform || sending || !draftText.trim() || !selectedId}
                onClick={() => void sendMessage()}
                aria-label="שליחה"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  border: "none",
                  background: canSendFreeform && draftText.trim() ? C.waGreen : "#b3b9bd",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: canSendFreeform && draftText.trim() ? "pointer" : "not-allowed",
                  flexShrink: 0,
                  transition: "background 0.15s ease",
                }}
              >
                {sending ? (
                  <span style={{ fontSize: 12, fontWeight: 800 }}>…</span>
                ) : (
                  <IconSend />
                )}
              </button>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.45, paddingInline: 4 }}>
              {canSendFreeform
                ? "חלון שירות פעיל (~24 שע׳ מהודעת הלקוח האחרונה) — Enter לשליחה, Shift+Enter לשורה חדשה."
                : "מחוץ לחלון השירות: נדרשת הודעה מהלקוח או אינטראקציה לאחרונה; אחרת שלחו תבנית מאושרת."}
            </div>
          </footer>
        </section>

        {/* עמודה 3 (ב־RTL: שמאל) — פרטי איש קשר */}
        <aside
          style={{
            borderInlineStart: isNarrow ? "none" : `1px solid ${C.hairline}`,
            background: C.panel,
            display: isNarrow && mobilePanel !== "details" ? "none" : "flex",
            flexDirection: "column",
            overflow: "auto",
            minWidth: 0,
            minHeight: 0,
            height: "100%",
          }}
        >
          <div style={{ padding: 20, textAlign: "center", borderBottom: `1px solid ${C.hairline}` }}>
            <div style={{ margin: "0 auto 12px", width: 88, height: 88 }}>
              <AvatarCircle photoUrl={displayPhoto} name={selectedMeta?.contactName} phone={displayPhone || "?"} size={88} />
            </div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{panelTitleName}</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }} dir="ltr">
              {displayPhone || "—"}
            </div>
            {crmContact?.name && displayName !== crmContact.name ? (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                שם בווצאפ: <span dir="auto">{displayName}</span>
              </div>
            ) : null}
          </div>
          <div style={{ padding: "14px 16px", fontSize: 13 }}>
            <div
              style={{
                fontWeight: 700,
                marginBottom: 10,
                color: C.muted,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              WhatsApp
            </div>
            <dl style={{ margin: 0, display: "grid", gap: 10 }}>
              <div>
                <dt style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>מזהה (מספר)</dt>
                <dd style={{ margin: 0, fontWeight: 600 }} dir="ltr">
                  {displayPhone || "—"}
                </dd>
              </div>
              <div>
                <dt style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>אישור דיוור (שיווק)</dt>
                <dd style={{ margin: 0, fontWeight: 600, color: marketingOn ? "#0d7a5c" : "#b45309" }}>
                  {selectedMeta ? (marketingOn ? "פעיל" : "לא פעיל") : "—"}
                </dd>
                {selectedMeta ? (
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.35 }}>
                      דיוור שיווקי (ניתן להפעיל מחדש גם אחרי &quot;הסר&quot;)
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={marketingOn}
                      aria-busy={marketingSaving}
                      aria-label={marketingOn ? "כבה דיוור שיווקי" : "הפעל דיוור שיווקי"}
                      disabled={marketingSaving}
                      onClick={() => void toggleMarketing()}
                      style={{
                        width: 48,
                        height: 26,
                        borderRadius: 13,
                        padding: 0,
                        border: "none",
                        cursor: marketingSaving ? "wait" : "pointer",
                        background: marketingOn ? C.waGreen : C.hairline2,
                        position: "relative",
                        flexShrink: 0,
                        opacity: marketingSaving ? 0.65 : 1,
                        transition: "background 0.2s",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          left: 3,
                          top: 3,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "#fff",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                          transform: marketingOn ? "translateX(22px)" : "translateX(0)",
                          transition: "transform 0.2s",
                        }}
                      />
                    </button>
                  </div>
                ) : null}
              </div>
              <div>
                <dt style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>הודעת לקוח אחרונה (חלון שירות)</dt>
                <dd style={{ margin: 0, fontWeight: 600, fontSize: 12 }} dir="ltr">
                  {active?.lastInboundAt || selectedMeta?.lastInboundAt
                    ? formatIsraelDateTime(active?.lastInboundAt ?? selectedMeta?.lastInboundAt ?? "")
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
          <div style={{ padding: "14px 16px", fontSize: 13, borderTop: `1px solid ${C.hairline}` }}>
            <div
              style={{
                fontWeight: 700,
                marginBottom: 10,
                color: C.muted,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              איש קשר ב־CRM
            </div>
            {crmContact ? (
              <dl style={{ margin: 0, display: "grid", gap: 10 }}>
                <div>
                  <dt style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>מזהה מסמך</dt>
                  <dd style={{ margin: 0, fontWeight: 600 }} dir="ltr">
                    {crmContact.id}
                  </dd>
                </div>
                {crmContact.email ? (
                  <div>
                    <dt style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>אימייל</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }} dir="ltr">
                      {crmContact.email}
                    </dd>
                  </div>
                ) : null}
                {crmContact.contactCode ? (
                  <div>
                    <dt style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>קוד איש קשר</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{crmContact.contactCode}</dd>
                  </div>
                ) : null}
                {crmContact.stage ? (
                  <div>
                    <dt style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>שלב</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{crmContact.stage}</dd>
                  </div>
                ) : null}
                {crmContact.status ? (
                  <div>
                    <dt style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>סטטוס מכירה</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{crmContact.status}</dd>
                  </div>
                ) : null}
                {crmContact.source ? (
                  <div>
                    <dt style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>מקור</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{crmContact.source}</dd>
                  </div>
                ) : null}
                {crmContact.assignedRep ? (
                  <div>
                    <dt style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>נציג</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{crmContact.assignedRep}</dd>
                  </div>
                ) : null}
                {crmContact.pipelineId ? (
                  <div>
                    <dt style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>Pipeline</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }} dir="ltr">
                      {crmContact.pipelineId}
                    </dd>
                  </div>
                ) : null}
                {crmContact.customFields && Object.keys(crmContact.customFields).length > 0 ? (
                  <div>
                    <dt style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>שדות מותאמים</dt>
                    <dd style={{ margin: 0 }}>
                      <div style={{ display: "grid", gap: 6, maxHeight: 200, overflow: "auto" }}>
                        {Object.entries(crmContact.customFields)
                          .slice(0, 14)
                          .map(([k, v]) => (
                            <div key={k} style={{ fontSize: 12, borderBottom: `1px solid ${C.hairline}`, paddingBottom: 4 }}>
                              <div style={{ color: C.muted, fontSize: 10 }}>{k}</div>
                              <div style={{ fontWeight: 600, wordBreak: "break-word" }}>
                                {typeof v === "object" ? JSON.stringify(v) : String(v)}
                              </div>
                            </div>
                          ))}
                      </div>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p style={{ margin: 0, color: C.muted, lineHeight: 1.5 }}>
                לא נמצא איש קשר תואם ב־CRM (לפי מזהה או טלפון). אחרי שיוך בטלפון — הפרטים יופיעו כאן.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
