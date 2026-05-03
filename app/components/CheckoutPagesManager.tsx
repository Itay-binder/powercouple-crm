"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CheckoutPage = {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export default function CheckoutPagesManager({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pages, setPages] = useState<CheckoutPage[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [isPhoneViewport, setIsPhoneViewport] = useState(false);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const [previewContainerWidth, setPreviewContainerWidth] = useState(0);

  const selected = useMemo(
    () => pages.find((p) => p.id === selectedId) ?? null,
    [pages, selectedId]
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/checkout-pages", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/billing")}`;
        return;
      }
      if (res.status === 403) {
        window.location.href = `/pending?returnTo=${encodeURIComponent("/billing")}`;
        return;
      }
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        pages?: CheckoutPage[];
      };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "טעינת דפי סליקה נכשלה");
      const rows = j.pages ?? [];
      setPages(rows);
      setSelectedId((prev) => prev || rows[0]?.id || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "טעינת דפי סליקה נכשלה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const el = previewFrameRef.current;
    if (!el) return;
    const update = () => setPreviewContainerWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [selectedId, compact]);

  useEffect(() => {
    const update = () => {
      setIsPhoneViewport(window.innerWidth <= 900);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  async function addPage() {
    setErr(null);
    try {
      const res = await fetch("/api/checkout-pages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        page?: CheckoutPage;
      };
      if (!res.ok || !j.ok || !j.page) {
        throw new Error(j.error ?? "הוספת דף סליקה נכשלה");
      }
      setName("");
      setUrl("");
      await load();
      setSelectedId(j.page.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "הוספת דף סליקה נכשלה");
    }
  }

  async function removePage(id: string) {
    const ok = window.confirm("למחוק את דף הסליקה?");
    if (!ok) return;
    const res = await fetch(`/api/checkout-pages/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErr(j.error ?? "מחיקה נכשלה");
      return;
    }
    if (selectedId === id) setSelectedId("");
    await load();
  }

  return (
    <div
      style={{
        marginTop: compact ? 14 : 0,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900, fontSize: compact ? 16 : 20 }}>דפי סליקה</div>
        <span
          style={{
            background: "#e0f2fe",
            color: "#0c4a6e",
            borderRadius: 999,
            padding: "4px 10px",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {pages.length}
        </span>
        <div style={{ flex: 1 }} />
      </div>

      {err && (
        <div
          style={{
            marginTop: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            padding: 10,
            borderRadius: 10,
          }}
        >
          {err}
        </div>
      )}

      <div
        style={{
          marginTop: 10,
          display: "grid",
          gap: 8,
          gridTemplateColumns: compact ? "1fr 1fr auto" : "1fr 1.2fr auto",
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם דף סליקה (אופציונלי)"
          style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <button
          type="button"
          onClick={() => void addPage()}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          הוסף דף
        </button>
      </div>

      <div style={{ marginTop: 12, overflowX: "auto", maxWidth: "100%" }}>
        <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Actions", "עודכן", "לינק", "שם דף"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "right",
                    padding: "10px 12px",
                    borderBottom: "2px solid #e5e7eb",
                    background: "#f8fafc",
                    fontSize: 12,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id}>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  <button
                    type="button"
                    onClick={() => void removePage(p.id)}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: "6px 8px",
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    מחק
                  </button>
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  {p.updatedAt ? String(p.updatedAt).slice(0, 10) : "—"}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  <a href={p.url} target="_blank" rel="noreferrer" style={{ color: "#4c1d95" }}>
                    {p.url}
                  </a>
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIframeError(null);
                      setSelectedId(p.id);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "#111827",
                      fontWeight: 800,
                      padding: 0,
                    }}
                  >
                    {p.name || p.url}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && pages.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 16, color: "#6b7280", fontWeight: 700 }}>
                  אין דפי סליקה עדיין.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!compact && selected && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontWeight: 900 }}>תצוגת iframe: {selected.name}</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
              {isPhoneViewport ? "תצוגת פון אוטומטית" : "תצוגת Desktop אוטומטית"}
            </div>
          </div>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <div
              ref={previewFrameRef}
              style={{
                width: "100%",
                height: isPhoneViewport
                  ? 860
                  : Math.max(
                      520,
                      Math.round(
                        860 *
                          Math.min(
                            1,
                            (Math.max(previewContainerWidth - 12, 1) || 1) / 1536
                          )
                      )
                    ),
                overflowX: "hidden",
                overflowY: "auto",
                display: "flex",
                justifyContent: isPhoneViewport ? "center" : "flex-end",
                alignItems: "flex-start",
                padding: isPhoneViewport ? "0" : "6px 0",
              }}
            >
              <iframe
                key={selected.id}
                src={selected.url}
                title={selected.name}
                style={{
                  width: isPhoneViewport
                    ? 390
                    : Math.max(previewContainerWidth - 12, 1),
                  height: isPhoneViewport
                    ? 860
                    : Math.round(
                        860 *
                          (Math.max(previewContainerWidth - 12, 1) / 1536)
                      ),
                  border: "none",
                  display: "block",
                }}
                onError={() =>
                  setIframeError(
                    "הדף חסם הטמעה ב-iframe. אפשר לפתוח אותו בלינק חדש."
                  )
                }
              />
            </div>
          </div>
          {iframeError && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "#b91c1c",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 10,
                padding: 8,
              }}
            >
              {iframeError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

