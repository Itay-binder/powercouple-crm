"use client";

import { useMemo, useState } from "react";

export type LabelOption = { id: string; name: string; color: string };

const PRESETS = [
  "#2563eb",
  "#0d9488",
  "#eab308",
  "#dc2626",
  "#7c3aed",
  "#9ca3af",
  "#92400e",
  "#ea580c",
  "#4b5563",
  "#ec4899",
];

type Props = {
  labels: LabelOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onCreate?: (name: string, color: string) => Promise<void>;
  maxHeight?: number;
};

export function LabelPicker({ labels, selectedIds, onToggle, onCreate, maxHeight = 280 }: Props) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESETS[1]);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return labels;
    return labels.filter((l) => l.name.toLowerCase().includes(s));
  }, [labels, q]);

  async function submitCreate() {
    if (!onCreate) return;
    const n = newName.trim();
    if (!n) return;
    setSaving(true);
    try {
      await onCreate(n, newColor);
      setNewName("");
      setCreating(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10, direction: "rtl", textAlign: "right" }}>
      <div style={{ position: "relative" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש תגיות…"
          style={{
            width: "100%",
            padding: "8px 10px 8px 32px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            fontSize: 13,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#9ca3af",
            fontSize: 14,
            pointerEvents: "none",
          }}
        >
          🔍
        </span>
      </div>
      <div
        style={{
          maxHeight,
          overflowY: "auto",
          border: "1px solid #f3f4f6",
          borderRadius: 12,
          padding: 4,
        }}
      >
        {filtered.map((l) => {
          const sel = selectedIds.includes(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onToggle(l.id)}
              style={{
                display: "flex",
                width: "100%",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                border: "none",
                borderRadius: 10,
                background: sel ? "#eff6ff" : "transparent",
                cursor: "pointer",
                textAlign: "right",
              }}
            >
              <span
                style={{
                  marginInlineStart: "auto",
                  fontSize: 14,
                  color: sel ? "#2563eb" : "transparent",
                  fontWeight: 900,
                }}
              >
                ✓
              </span>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: l.color,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
                }}
              >
                {l.name}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 12, color: "#6b7280", fontSize: 13 }}>אין תוצאות</div>
        )}
      </div>
      {onCreate && (
        <>
          {!creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              style={{
                border: "none",
                background: "transparent",
                color: "#2563eb",
                fontWeight: 800,
                cursor: "pointer",
                padding: "6px 0",
                fontSize: 14,
                textAlign: "right",
              }}
            >
              + הוסף תגית
            </button>
          ) : (
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 12,
                display: "grid",
                gap: 8,
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13 }}>תגית חדשה</div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="שם התגית"
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>צבע</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    title={c}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: c,
                      border: newColor === c ? "3px solid #111" : "2px solid #fff",
                      boxShadow: "0 0 0 1px #e5e7eb",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  disabled={saving || !newName.trim()}
                  onClick={() => void submitCreate()}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#16a34a",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: saving ? "wait" : "pointer",
                  }}
                >
                  {saving ? "שומר…" : "שמור"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function LabelPills({
  labels,
}: {
  labels: Array<{ id: string; name: string; color: string }>;
}) {
  if (!labels.length) return <span style={{ color: "#9ca3af" }}>—</span>;
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
      {labels.map((l) => (
        <span
          key={l.id}
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            background: l.color,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            maxWidth: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {l.name}
        </span>
      ))}
    </span>
  );
}
