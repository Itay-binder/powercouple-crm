"use client";

import { useState, useEffect, useRef } from "react";
import type { MoverProfile, MoverService } from "@/movers-profile/types";
import { SERVICE_LABELS } from "@/movers-profile/types";
import { normalizePhoneForAuth } from "@/movers-profile/phoneNormalize";

const ALL_SERVICES: MoverService[] = ["apartment", "small", "office", "loading"];

type Props = {
  initialProfiles: MoverProfile[];
};

type CreateForm = {
  name: string;
  phone: string;
  slug: string;
  bio: string;
  coverArea: string;
  services: MoverService[];
};

type OpportunityHit = {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  contactPhone?: string;
};

function autoSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9א-ת-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

function displayPhone(opp: OpportunityHit): string {
  return opp.contactPhone || opp.phone || "";
}

function displayName(opp: OpportunityHit): string {
  return opp.contactName || opp.name || "";
}

export default function MoverProfilesClient({ initialProfiles }: Props) {
  const [profiles, setProfiles] = useState<MoverProfile[]>(initialProfiles);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CreateForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Opportunity search state
  const [opportunities, setOpportunities] = useState<OpportunityHit[]>([]);
  const [loadingOpps, setLoadingOpps] = useState(false);
  const [oppSearch, setOppSearch] = useState("");
  const [showOppDropdown, setShowOppDropdown] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<OpportunityHit | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<CreateForm>({
    name: "",
    phone: "",
    slug: "",
    bio: "",
    coverArea: "פעיל בכל הארץ",
    services: [],
  });

  // Load opportunities when create form opens
  useEffect(() => {
    if (!showCreate || opportunities.length > 0) return;
    setLoadingOpps(true);
    fetch("/api/opportunities")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setOpportunities(data.opportunities ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingOpps(false));
  }, [showCreate, opportunities.length]);

  // Filter opportunities by search text
  const filteredOpps = oppSearch.trim()
    ? opportunities
        .filter((o) => {
          const q = oppSearch.trim().toLowerCase();
          return (
            displayName(o).toLowerCase().includes(q) ||
            displayPhone(o).includes(q) ||
            o.name.toLowerCase().includes(q)
          );
        })
        .slice(0, 8)
    : [];

  function selectOpportunity(opp: OpportunityHit) {
    const name = displayName(opp);
    const rawPhone = displayPhone(opp);
    const phone = rawPhone.trim() ? normalizePhoneForAuth(rawPhone) : "";
    setSelectedOpp(opp);
    setOppSearch(name);
    setShowOppDropdown(false);
    setForm((f) => ({
      ...f,
      name,
      phone,
      slug: f.slug || autoSlug(name),
    }));
  }

  function resetOppSelection() {
    setSelectedOpp(null);
    setOppSearch("");
    setForm({ name: "", phone: "", slug: "", bio: "", coverArea: "פעיל בכל הארץ", services: [] });
  }

  async function createProfile() {
    if (!form.name.trim() || !form.phone.trim() || !form.slug.trim()) {
      setCreateError("שם, טלפון וסלאג הם שדות חובה");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/mover-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setCreateError(data.error ?? "שגיאה ביצירה");
        return;
      }
      setProfiles((prev) => [data.profile, ...prev]);
      closeCreateForm();
    } finally {
      setCreating(false);
    }
  }

  function closeCreateForm() {
    setShowCreate(false);
    setCreateError("");
    setSelectedOpp(null);
    setOppSearch("");
    setForm({ name: "", phone: "", slug: "", bio: "", coverArea: "פעיל בכל הארץ", services: [] });
  }

  function openEdit(profile: MoverProfile) {
    setShowCreate(false);
    setEditingId(profile.id);
    setEditError("");
    setEditForm({
      name: profile.name,
      phone: profile.phone,
      slug: profile.slug,
      bio: profile.bio ?? "",
      coverArea: profile.coverArea ?? "פעיל בכל הארץ",
      services: [...(profile.services ?? [])],
    });
  }

  function closeEdit() {
    setEditingId(null);
    setEditForm(null);
    setEditError("");
  }

  async function saveEdit() {
    if (!editingId || !editForm) return;
    if (!editForm.name.trim() || !editForm.phone.trim() || !editForm.slug.trim()) {
      setEditError("שם, טלפון וסלאג הם שדות חובה");
      return;
    }
    setSavingEdit(true);
    setEditError("");
    try {
      const res = await fetch(`/api/mover-profiles/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          phone: normalizePhoneForAuth(editForm.phone),
          slug: editForm.slug.trim().toLowerCase(),
          bio: editForm.bio,
          coverArea: editForm.coverArea,
          services: editForm.services,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setEditError(data.error ?? "שגיאה בשמירה");
        return;
      }
      if (data.profile) {
        setProfiles((prev) =>
          prev.map((p) => (p.id === editingId ? { ...p, ...data.profile } : p))
        );
      }
      closeEdit();
    } finally {
      setSavingEdit(false);
    }
  }

  function toggleEditService(svc: MoverService) {
    setEditForm((f) =>
      f
        ? {
            ...f,
            services: f.services.includes(svc)
              ? f.services.filter((s) => s !== svc)
              : [...f.services, svc],
          }
        : f
    );
  }

  async function deleteProfile(profile: MoverProfile) {
    if (
      !confirm(
        `למחוק לצמיתות את הפרופיל של «${profile.name}»?\nיימחקו גם כל ההמלצות והתמונות.`
      )
    ) {
      return;
    }
    setDeletingId(profile.id);
    try {
      const res = await fetch(`/api/mover-profiles/${profile.id}`, { method: "DELETE" });
      if (res.ok) {
        setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
        if (editingId === profile.id) closeEdit();
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActive(profile: MoverProfile) {
    setTogglingId(profile.id);
    try {
      const res = await fetch(`/api/mover-profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !profile.isActive }),
      });
      if (res.ok) {
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === profile.id ? { ...p, isActive: !profile.isActive } : p
          )
        );
      }
    } finally {
      setTogglingId(null);
    }
  }

  function toggleFormService(svc: MoverService) {
    setForm((f) => ({
      ...f,
      services: f.services.includes(svc)
        ? f.services.filter((s) => s !== svc)
        : [...f.services, svc],
    }));
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 22, margin: 0 }}>פרופילי מובילים</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
            {profiles.length} מובילים רשומים
          </p>
        </div>
        <button
          onClick={() => {
            closeEdit();
            setShowCreate(true);
          }}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: "#7c3aed",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + צור פרופיל מוביל
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18 }}>
            יצירת פרופיל מוביל חדש
          </div>

          {createError && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#b91c1c",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {createError}
            </div>
          )}

          {/* Opportunity search */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>
              בחר הזדמנות מה-CRM (ימלא טלפון אוטומטית)
            </label>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  ref={searchRef}
                  type="text"
                  value={oppSearch}
                  onChange={(e) => {
                    setOppSearch(e.target.value);
                    setShowOppDropdown(true);
                    if (selectedOpp) {
                      setSelectedOpp(null);
                      setForm((f) => ({ ...f, name: e.target.value }));
                    }
                  }}
                  onFocus={() => oppSearch && setShowOppDropdown(true)}
                  placeholder={loadingOpps ? "טוען הזדמנויות…" : "חפש לפי שם מוביל…"}
                  disabled={loadingOpps}
                  style={{
                    ...formInputStyle,
                    flex: 1,
                    border: selectedOpp
                      ? "1px solid #7c3aed"
                      : "1px solid #e5e7eb",
                    background: selectedOpp ? "#f5f3ff" : "#fff",
                  }}
                />
                {selectedOpp && (
                  <button
                    onClick={resetOppSelection}
                    type="button"
                    style={{
                      padding: "0 12px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      color: "#6b7280",
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                  >
                    נקה
                  </button>
                )}
              </div>

              {/* Dropdown */}
              {showOppDropdown && filteredOpps.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    right: 0,
                    left: 0,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    zIndex: 50,
                    overflow: "hidden",
                  }}
                >
                  {filteredOpps.map((opp) => (
                    <button
                      key={opp.id}
                      type="button"
                      onClick={() => selectOpportunity(opp)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "10px 14px",
                        border: "none",
                        borderBottom: "1px solid #f3f4f6",
                        background: "#fff",
                        cursor: "pointer",
                        textAlign: "right",
                        fontFamily: "inherit",
                        gap: 12,
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLElement).style.background = "#f9fafb")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLElement).style.background = "#fff")
                      }
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>
                          {displayName(opp)}
                        </div>
                        {opp.name !== displayName(opp) && (
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>{opp.name}</div>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: "#6b7280", direction: "ltr" }}>
                        {displayPhone(opp) || "—"}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Click-outside to close dropdown */}
              {showOppDropdown && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 49,
                  }}
                  onClick={() => setShowOppDropdown(false)}
                />
              )}
            </div>

            {selectedOpp && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#7c3aed", fontWeight: 500 }}>
                ✓ נבחר: {displayName(selectedOpp)} · {displayPhone(selectedOpp)}
              </div>
            )}
          </div>

          {/* Manual fields (pre-filled from opportunity) */}
          <div
            style={{
              borderTop: "1px solid #f3f4f6",
              paddingTop: 16,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div>
              <label style={labelStyle}>שם המוביל *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value, slug: f.slug || autoSlug(e.target.value) }))
                }
                style={formInputStyle}
                placeholder="דוד לוי"
              />
            </div>
            <div>
              <label style={labelStyle}>טלפון * (נשמר כ־972… לזיהוי SMS)</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                style={{
                  ...formInputStyle,
                  direction: "ltr",
                  color: selectedOpp ? "#7c3aed" : "#111827",
                  fontWeight: selectedOpp ? 600 : 400,
                }}
                placeholder="0501234567"
              />
            </div>
            <div>
              <label style={labelStyle}>סלאג (URL) *</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                style={{ ...formInputStyle, direction: "ltr" }}
                placeholder="david-levi"
              />
              {form.slug && (
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                  /movers/{form.slug}
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>אזור פעילות</label>
              <input
                type="text"
                value={form.coverArea}
                onChange={(e) => setForm((f) => ({ ...f, coverArea: e.target.value }))}
                style={formInputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>ביו / תיאור</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              rows={2}
              style={{ ...formInputStyle, resize: "vertical" as const }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>שירותים</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ALL_SERVICES.map((svc) => (
                <button
                  key={svc}
                  type="button"
                  onClick={() => toggleFormService(svc)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${form.services.includes(svc) ? "#7c3aed" : "#e5e7eb"}`,
                    background: form.services.includes(svc) ? "#ede9fe" : "#fff",
                    color: form.services.includes(svc) ? "#5b21b6" : "#374151",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {SERVICE_LABELS[svc]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={createProfile}
              disabled={creating}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: "none",
                background: "#7c3aed",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: creating ? "not-allowed" : "pointer",
                opacity: creating ? 0.7 : 1,
                fontFamily: "inherit",
              }}
            >
              {creating ? "יוצר…" : "צור פרופיל"}
            </button>
            <button
              onClick={closeCreateForm}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#374151",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Edit profile */}
      {editingId && editForm && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #c4b5fd",
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            boxShadow: "0 4px 20px rgba(124,58,237,0.12)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18 }}>
            עריכת פרופיל מוביל
          </div>
          {editError && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#b91c1c",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {editError}
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div>
              <label style={labelStyle}>שם המוביל *</label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
                style={formInputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>טלפון * (972… לאימות SMS)</label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, phone: e.target.value } : f))
                }
                style={{ ...formInputStyle, direction: "ltr" }}
              />
            </div>
            <div>
              <label style={labelStyle}>סלאג (URL) *</label>
              <input
                type="text"
                value={editForm.slug}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, slug: e.target.value.trim().toLowerCase() } : f))
                }
                style={{ ...formInputStyle, direction: "ltr" }}
              />
              {editForm.slug && (
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                  /movers/{editForm.slug}
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>אזור פעילות</label>
              <input
                type="text"
                value={editForm.coverArea}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, coverArea: e.target.value } : f))
                }
                style={formInputStyle}
              />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>ביו / תיאור</label>
            <textarea
              value={editForm.bio}
              onChange={(e) => setEditForm((f) => (f ? { ...f, bio: e.target.value } : f))}
              rows={2}
              style={{ ...formInputStyle, resize: "vertical" as const }}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>שירותים</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ALL_SERVICES.map((svc) => (
                <button
                  key={svc}
                  type="button"
                  onClick={() => toggleEditService(svc)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${editForm.services.includes(svc) ? "#7c3aed" : "#e5e7eb"}`,
                    background: editForm.services.includes(svc) ? "#ede9fe" : "#fff",
                    color: editForm.services.includes(svc) ? "#5b21b6" : "#374151",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {SERVICE_LABELS[svc]}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={saveEdit}
              disabled={savingEdit}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: "none",
                background: "#7c3aed",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: savingEdit ? "not-allowed" : "pointer",
                opacity: savingEdit ? 0.7 : 1,
                fontFamily: "inherit",
              }}
            >
              {savingEdit ? "שומר…" : "שמור שינויים"}
            </button>
            <button
              type="button"
              onClick={closeEdit}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#374151",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Profiles list */}
      {profiles.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 40,
            textAlign: "center",
            color: "#9ca3af",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚚</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>אין מובילים עדיין</div>
          <div style={{ fontSize: 14 }}>לחץ "צור פרופיל מוביל" כדי להתחיל</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {profiles.map((profile) => (
            <div
              key={profile.id}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "#ede9fe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {profile.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.profileImageUrl}
                    alt={profile.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  "👤"
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{profile.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  <span dir="ltr">/movers/{profile.slug}</span>
                  {" · "}
                  {profile.phone}
                </div>
                {profile.reviewCount > 0 && (
                  <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 2 }}>
                    ★ {profile.rating.toFixed(1)} ({profile.reviewCount} דירוגים)
                  </div>
                )}
              </div>

              {/* Status badge */}
              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 20,
                  background: profile.isActive ? "#d1fae5" : "#fee2e2",
                  color: profile.isActive ? "#065f46" : "#991b1b",
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {profile.isActive ? "פעיל" : "לא פעיל"}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                <a
                  href={`/movers/${profile.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    color: "#374151",
                    fontSize: 12,
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  צפה
                </a>
                <a
                  href={`/movers/${profile.slug}?tab=manage`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #ddd6fe",
                    background: "#ede9fe",
                    color: "#5b21b6",
                    fontSize: 12,
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  ניהול
                </a>
                <button
                  type="button"
                  onClick={() => openEdit(profile)}
                  disabled={editingId === profile.id}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #bae6fd",
                    background: "#e0f2fe",
                    color: "#0369a1",
                    fontSize: 12,
                    cursor: editingId === profile.id ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    fontWeight: 500,
                    opacity: editingId === profile.id ? 0.6 : 1,
                  }}
                >
                  ערוך
                </button>
                <button
                  type="button"
                  onClick={() => deleteProfile(profile)}
                  disabled={deletingId === profile.id}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    fontSize: 12,
                    cursor: deletingId === profile.id ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    fontWeight: 500,
                    opacity: deletingId === profile.id ? 0.6 : 1,
                  }}
                >
                  {deletingId === profile.id ? "מוחק…" : "מחק"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(profile)}
                  disabled={togglingId === profile.id}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${profile.isActive ? "#fecaca" : "#bbf7d0"}`,
                    background: profile.isActive ? "#fef2f2" : "#f0fdf4",
                    color: profile.isActive ? "#991b1b" : "#065f46",
                    fontSize: 12,
                    cursor: togglingId === profile.id ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    fontWeight: 500,
                    opacity: togglingId === profile.id ? 0.6 : 1,
                  }}
                >
                  {profile.isActive ? "השבת" : "הפעל"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 5,
};

const formInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#111827",
  fontSize: 14,
  outline: "none",
  fontFamily: "inherit",
};
