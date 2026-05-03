"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Hit = { kind: string; id: string; title: string; subtitle: string };

export default function CrmGlobalSearch() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const h = window.setTimeout(async () => {
      if (q.trim().length < 2) {
        setHits([]);
        return;
      }
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; hits?: Hit[] };
      if (!cancelled && j.ok && Array.isArray(j.hits)) setHits(j.hits);
    }, 240);
    return () => {
      cancelled = true;
      window.clearTimeout(h);
    };
  }, [q]);

  function kindLabel(kind: string) {
    if (kind === "contact") return "איש קשר";
    if (kind === "opportunity") return "לקוח";
    if (kind === "deal") return "עסקה";
    return kind;
  }

  function goHit(hit: Hit) {
    setOpen(false);
    setQ("");
    if (hit.kind === "contact") {
      router.push(`/contacts?openContactId=${encodeURIComponent(hit.id)}`);
      return;
    }
    if (hit.kind === "opportunity") {
      router.push(`/pipeline?openOpportunityId=${encodeURIComponent(hit.id)}`);
      return;
    }
    if (hit.kind === "deal") {
      router.push(`/deals/${encodeURIComponent(hit.id)}`);
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }}>
      <input
        aria-label="חיפוש גלובלי"
        placeholder="חיפוש — אנשי קשר, לקוחות, עסקאות…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          fontSize: 13,
          boxSizing: "border-box",
        }}
      />
      {open && hits.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 6,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            zIndex: 80,
            maxHeight: 320,
            overflow: "auto",
            boxShadow: "0 10px 40px rgba(0,0,0,.08)",
          }}
        >
          {hits.map((h) => (
            <button
              key={`${h.kind}-${h.id}`}
              type="button"
              onClick={() => goHit(h)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "right",
                padding: "10px 12px",
                border: "none",
                borderBottom: "1px solid #f3f4f6",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13 }}>{h.title}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                {kindLabel(h.kind)} · {h.subtitle}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
