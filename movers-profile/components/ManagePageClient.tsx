"use client";

import { useState, useEffect, useRef } from "react";
import StarRating from "./StarRating";
import type { PublicMoverData, MoverReview, MoverPhoto, MoverService } from "../types";
import { SERVICE_LABELS, SERVICE_ICONS } from "../types";
import type { MoverDisplayTheme } from "../viewTheme";

const ALL_SERVICES: MoverService[] = ["apartment", "small", "office", "loading"];

type AdminProfileRef = { id: string; slug: string; name: string; profileImageUrl: string };

type Props = {
  data: PublicMoverData;
  isAdmin?: boolean;
  allProfiles?: AdminProfileRef[] | null;
  /** בתוך דף מאוחד עם לשונית «ניהול» */
  embedded?: boolean;
};

type Tab = "profile" | "reviews" | "photos";

// ─── Circular crop modal ───────────────────────────────────────────────────

const PREVIEW_SIZE = 260; // px — the preview circle diameter
const OUTPUT_SIZE = 400;  // px — canvas export size

function ProfileImageCropModal({
  file,
  onConfirm,
  onCancel,
}: {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const [imgSrc, setImgSrc] = useState("");
  const [naturalW, setNaturalW] = useState(0);
  const [naturalH, setNaturalH] = useState(0);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ px: 0, py: 0, ox: 0, oy: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    const img = new window.Image();
    img.onload = () => {
      imgRef.current = img;
      setNaturalW(img.naturalWidth);
      setNaturalH(img.naturalHeight);
      setOffsetX(0);
      setOffsetY(0);
      setScale(1);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Base scale: cover the circle with the image at scale=1
  const baseScale =
    naturalW > 0 && naturalH > 0
      ? Math.max(PREVIEW_SIZE / naturalW, PREVIEW_SIZE / naturalH)
      : 1;
  const totalScale = baseScale * scale;
  const displayW = naturalW * totalScale;
  const displayH = naturalH * totalScale;
  const imgLeft = (PREVIEW_SIZE - displayW) / 2 + offsetX;
  const imgTop = (PREVIEW_SIZE - displayH) / 2 + offsetY;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = { px: e.clientX, py: e.clientY, ox: offsetX, oy: offsetY };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const { px, py, ox, oy } = dragStart.current;
    setOffsetX(ox + (e.clientX - px));
    setOffsetY(oy + (e.clientY - py));
  }

  function onPointerUp() {
    setDragging(false);
  }

  function handleConfirm() {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d")!;
    const factor = OUTPUT_SIZE / PREVIEW_SIZE;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.drawImage(img, imgLeft * factor, imgTop * factor, displayW * factor, displayH * factor);
    canvas.toBlob((blob) => { if (blob) onConfirm(blob); }, "image/jpeg", 0.92);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.88)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "var(--font-rubik), Rubik, sans-serif",
        direction: "rtl",
      }}
    >
      <div
        style={{
          background: "#130d2b",
          border: "1px solid rgba(139,92,246,0.4)",
          borderRadius: 20,
          padding: 24,
          width: "100%",
          maxWidth: 320,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 15, color: "#f9fafb", marginBottom: 6, textAlign: "center" }}>
          התאם תמונת פרופיל
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginBottom: 18 }}>
          גרור להזזה · השתמש בסליידר לזום
        </div>

        {/* Circular preview */}
        <div
          style={{
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
            borderRadius: "50%",
            overflow: "hidden",
            border: "3px solid #7c3aed",
            cursor: dragging ? "grabbing" : "grab",
            margin: "0 auto 18px",
            background: "rgba(124,58,237,0.15)",
            position: "relative",
            userSelect: "none",
            touchAction: "none",
            boxShadow: "0 0 0 4px rgba(124,58,237,0.15)",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {imgSrc && naturalW > 0 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt=""
              style={{
                position: "absolute",
                width: displayW,
                height: displayH,
                left: imgLeft,
                top: imgTop,
                pointerEvents: "none",
                userSelect: "none",
              }}
            />
          )}
        </div>

        {/* Zoom slider */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginBottom: 6 }}>
            זום: {Math.round(scale * 100)}%
          </div>
          <input
            type="range"
            min={100}
            max={300}
            value={Math.round(scale * 100)}
            onChange={(e) => {
              setScale(Number(e.target.value) / 100);
              setOffsetX(0);
              setOffsetY(0);
            }}
            style={{ width: "100%", accentColor: "#7c3aed" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleConfirm}
            style={{
              flex: 1,
              padding: "13px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            אישור
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: "13px 18px",
              borderRadius: 12,
              border: "1px solid rgba(139,92,246,0.3)",
              background: "transparent",
              color: "#9ca3af",
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function ManagePageClient({
  data: initial,
  isAdmin = false,
  allProfiles,
  embedded = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState(initial);
  const [reviews, setReviews] = useState<MoverReview[]>(initial.reviews);
  const [photos, setPhotos] = useState<MoverPhoto[]>(initial.photos);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState("");
  const [profileImageUploading, setProfileImageUploading] = useState(false);
  const [profileImageError, setProfileImageError] = useState("");
  const [cropFile, setCropFile] = useState<File | null>(null);

  // Editable profile fields
  const [name, setName] = useState(initial.name);
  const [bio, setBio] = useState(initial.bio);
  const [coverArea, setCoverArea] = useState(initial.coverArea);
  const [services, setServices] = useState<MoverService[]>(initial.services);
  const [profileImageUrl, setProfileImageUrl] = useState(initial.profileImageUrl);
  const [displayTheme, setDisplayTheme] = useState<MoverDisplayTheme>(initial.displayTheme);

  async function saveProfile() {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/movers/${profile.slug}/manage/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bio, coverArea, services, profileImageUrl, displayTheme }),
      });
      if (res.ok) {
        setProfile((p) => ({ ...p, name, bio, coverArea, services, profileImageUrl, displayTheme }));
        setSaveMsg("נשמר בהצלחה ✓");
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        setSaveMsg("שגיאה בשמירה");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleReview(reviewId: string, isHidden: boolean) {
    const res = await fetch(
      `/api/movers/${profile.slug}/manage/reviews/${reviewId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden }),
      }
    );
    if (res.ok) {
      setReviews((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, isHidden } : r))
      );
    }
  }

  async function deleteReviewItem(reviewId: string) {
    if (!confirm("למחוק את ההמלצה לצמיתות? פעולה זו לא ניתנת לביטול.")) return;
    const res = await fetch(`/api/movers/${profile.slug}/manage/reviews/${reviewId}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    try {
      const pr = await fetch(`/api/movers/${profile.slug}`);
      const j = (await pr.json()) as {
        ok?: boolean;
        profile?: Pick<PublicMoverData, "rating" | "reviewCount" | "ratingBreakdown">;
      };
      if (j.ok && j.profile) {
        setProfile((p) => ({
          ...p,
          rating: j.profile!.rating,
          reviewCount: j.profile!.reviewCount,
          ratingBreakdown: j.profile!.ratingBreakdown,
        }));
      }
    } catch {
      /* ignore */
    }
  }

  async function togglePhoto(photoId: string, isHidden: boolean) {
    const res = await fetch(
      `/api/movers/${profile.slug}/manage/photos/${photoId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden }),
      }
    );
    if (res.ok) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, isHidden } : p))
      );
    }
  }

  async function deletePhotoItem(photoId: string) {
    if (!confirm("למחוק את התמונה לצמיתות? הקובץ יוסר גם מהאחסון אם אפשר.")) return;
    const res = await fetch(`/api/movers/${profile.slug}/manage/photos/${photoId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    }
  }

  async function uploadPhoto(file: File) {
    setPhotoUploading(true);
    setPhotoUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/movers/${profile.slug}/photos`, {
        method: "POST",
        body: formData,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        photo?: MoverPhoto;
        error?: string;
      };
      if (!res.ok || !json.photo) {
        setPhotoUploadError(json.error ?? "העלאת התמונה נכשלה");
        return;
      }
      setPhotos((prev) => [json.photo!, ...prev]);
    } finally {
      setPhotoUploading(false);
    }
  }

  async function uploadProfileImage(blob: Blob) {
    setProfileImageUploading(true);
    setProfileImageError("");
    try {
      const formData = new FormData();
      formData.append("file", blob, "profile.jpg");
      const res = await fetch(`/api/movers/${profile.slug}/manage/profile-image`, {
        method: "POST",
        body: formData,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        imageUrl?: string;
        error?: string;
      };
      if (!res.ok || !json.imageUrl) {
        setProfileImageError(json.error ?? "העלאת תמונת הפרופיל נכשלה");
        return;
      }
      setProfileImageUrl(json.imageUrl);
      setProfile((p) => ({ ...p, profileImageUrl: json.imageUrl! }));
    } finally {
      setProfileImageUploading(false);
    }
  }

  function toggleService(svc: MoverService) {
    setServices((prev) =>
      prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc]
    );
  }

  const profileUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/movers/${profile.slug}`
      : `/movers/${profile.slug}`;

  return (
    <>
      {/* Crop modal */}
      {cropFile && (
        <ProfileImageCropModal
          file={cropFile}
          onConfirm={(blob) => {
            setCropFile(null);
            uploadProfileImage(blob);
          }}
          onCancel={() => setCropFile(null)}
        />
      )}

      <div
        style={{
          minHeight: embedded ? "auto" : "100vh",
          background: "linear-gradient(135deg, #0d0d1a 0%, #130d2b 100%)",
          fontFamily: "var(--font-rubik), Rubik, sans-serif",
          direction: "rtl",
          color: "#f9fafb",
          paddingBottom: embedded ? 24 : undefined,
        }}
      >
        {/* Admin switcher bar */}
        {isAdmin && allProfiles && allProfiles.length > 1 && (
          <div
            style={{
              background: "rgba(234,179,8,0.12)",
              borderBottom: "1px solid rgba(234,179,8,0.3)",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              direction: "rtl",
            }}
          >
            <span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700, whiteSpace: "nowrap" }}>
              👑 מצב אדמין
            </span>
            <select
              defaultValue={initial.slug}
              onChange={(e) => {
                window.location.href = `/movers/${e.target.value}?tab=manage`;
              }}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(234,179,8,0.4)",
                background: "rgba(0,0,0,0.4)",
                color: "#fbbf24",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {allProfiles.map((p) => (
                <option key={p.id} value={p.slug} style={{ background: "#1a0a3b", color: "#f9fafb" }}>
                  {p.name}
                </option>
              ))}
            </select>
            <a
              href="/mover-profiles"
              style={{
                fontSize: 11,
                color: "#fbbf24",
                textDecoration: "none",
                whiteSpace: "nowrap",
                opacity: 0.8,
              }}
            >
              ← חזור ל-CRM
            </a>
          </div>
        )}
        {isAdmin && !allProfiles && (
          <div
            style={{
              background: "rgba(234,179,8,0.12)",
              borderBottom: "1px solid rgba(234,179,8,0.3)",
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700 }}>👑 מצב אדמין CRM</span>
            <a href="/mover-profiles" style={{ fontSize: 11, color: "#fbbf24", opacity: 0.8, textDecoration: "none" }}>
              ← חזור ל-CRM
            </a>
          </div>
        )}

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px",
            borderBottom: "1px solid rgba(139,92,246,0.2)",
            background: "rgba(0,0,0,0.3)",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: "#f9fafb" }}>
              ניהול פרופיל — {profile.name}
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>מאחורי הקלעים</div>
          </div>
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid rgba(139,92,246,0.4)",
              background: "rgba(124,58,237,0.15)",
              color: "#c4b5fd",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            צפה בפרופיל ↗
          </a>
        </div>

        {/* Profile URL */}
        <div
          style={{
            margin: "16px 16px 0",
            background: "rgba(124,58,237,0.1)",
            border: "1px solid rgba(124,58,237,0.25)",
            borderRadius: 12,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "#9ca3af" }}>לינק הפרופיל שלך:</span>
          <span style={{ fontSize: 12, color: "#c4b5fd", flex: 1, direction: "ltr" }}>
            {profileUrl}
          </span>
          <button
            onClick={() => navigator.clipboard.writeText(profileUrl)}
            style={{
              background: "none",
              border: "none",
              color: "#a78bfa",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            העתק
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            margin: "16px 16px 0",
            background: "rgba(255,255,255,0.05)",
            borderRadius: 12,
            padding: 4,
          }}
        >
          {(["profile", "reviews", "photos"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 10,
                border: "none",
                background: activeTab === tab ? "rgba(124,58,237,0.6)" : "transparent",
                color: activeTab === tab ? "#f9fafb" : "#9ca3af",
                fontSize: 13,
                fontWeight: activeTab === tab ? 700 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.2s",
              }}
            >
              {tab === "profile"
                ? "פרופיל"
                : tab === "reviews"
                ? `המלצות (${reviews.length})`
                : `תמונות (${photos.length})`}
            </button>
          ))}
        </div>

        <div style={{ padding: "16px" }}>
          {/* Profile tab */}
          {activeTab === "profile" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <FieldBlock label="שם">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                />
              </FieldBlock>

              <FieldBlock label="ביו / תיאור">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" as const }}
                />
              </FieldBlock>

              <FieldBlock label="אזור פעילות">
                <input
                  type="text"
                  value={coverArea}
                  onChange={(e) => setCoverArea(e.target.value)}
                  style={inputStyle}
                />
              </FieldBlock>

              <FieldBlock label="מראה כרטיס ציבורי (ללקוחות)">
                <div style={{ display: "flex", gap: 8 }}>
                  {(
                    [
                      { id: "light" as const, label: "בהיר (מותג)" },
                      { id: "dark" as const, label: "כהה (קלאסי)" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDisplayTheme(opt.id)}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border:
                          displayTheme === opt.id
                            ? "1px solid #7c3aed"
                            : "1px solid rgba(139,92,246,0.25)",
                        background:
                          displayTheme === opt.id
                            ? "rgba(124,58,237,0.35)"
                            : "rgba(255,255,255,0.04)",
                        color: displayTheme === opt.id ? "#c4b5fd" : "#9ca3af",
                        fontSize: 13,
                        fontWeight: displayTheme === opt.id ? 700 : 400,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                  משפיע על דף הכרטיס הציבורי בלבד, לא על מסך הניהול
                </div>
              </FieldBlock>

              {/* Profile image with circular crop */}
              <FieldBlock label="תמונת פרופיל">
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {/* Preview circle */}
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: "50%",
                      border: "2px solid rgba(139,92,246,0.5)",
                      overflow: "hidden",
                      flexShrink: 0,
                      background: "rgba(124,58,237,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 28,
                    }}
                  >
                    {profileImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profileImageUrl}
                        alt="תמונת פרופיל"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      "👤"
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: "inline-block",
                        padding: "10px 18px",
                        borderRadius: 10,
                        border: "1px solid rgba(139,92,246,0.4)",
                        background: profileImageUploading
                          ? "rgba(124,58,237,0.06)"
                          : "rgba(124,58,237,0.15)",
                        color: profileImageUploading ? "#9ca3af" : "#c4b5fd",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: profileImageUploading ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {profileImageUploading ? "מעלה…" : "בחר תמונה"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        disabled={profileImageUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) { e.target.value = ""; setCropFile(f); }
                        }}
                      />
                    </label>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 5 }}>
                      ניתן לגרור ולהתאים את התמונה לפרופיל
                    </div>
                    {profileImageError ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#fca5a5",
                          marginTop: 8,
                          background: "rgba(239,68,68,0.12)",
                          border: "1px solid rgba(239,68,68,0.25)",
                          borderRadius: 8,
                          padding: "8px 10px",
                        }}
                      >
                        {profileImageError}
                      </div>
                    ) : null}
                  </div>
                </div>
              </FieldBlock>

              <FieldBlock label="שירותים">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {ALL_SERVICES.map((svc) => (
                    <button
                      key={svc}
                      onClick={() => toggleService(svc)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 10,
                        border: services.includes(svc)
                          ? "1px solid #7c3aed"
                          : "1px solid rgba(139,92,246,0.25)",
                        background: services.includes(svc)
                          ? "rgba(124,58,237,0.35)"
                          : "rgba(255,255,255,0.04)",
                        color: services.includes(svc) ? "#c4b5fd" : "#9ca3af",
                        fontSize: 13,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {SERVICE_ICONS[svc]} {SERVICE_LABELS[svc]}
                    </button>
                  ))}
                </div>
              </FieldBlock>

              {saveMsg && (
                <div
                  style={{
                    background: saveMsg.includes("שגיאה")
                      ? "rgba(239,68,68,0.15)"
                      : "rgba(16,185,129,0.15)",
                    border: saveMsg.includes("שגיאה")
                      ? "1px solid rgba(239,68,68,0.4)"
                      : "1px solid rgba(16,185,129,0.4)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    color: saveMsg.includes("שגיאה") ? "#fca5a5" : "#6ee7b7",
                    fontSize: 14,
                  }}
                >
                  {saveMsg}
                </div>
              )}

              <button
                onClick={saveProfile}
                disabled={saving}
                style={{
                  padding: "14px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  fontFamily: "inherit",
                }}
              >
                {saving ? "שומר…" : "שמור שינויים"}
              </button>
            </div>
          )}

          {/* Reviews tab */}
          {activeTab === "reviews" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {reviews.length === 0 && (
                <div style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: 40 }}>
                  אין המלצות עדיין
                </div>
              )}
              {reviews.map((review) => (
                <div
                  key={review.id}
                  style={{
                    background: review.isHidden
                      ? "rgba(255,255,255,0.02)"
                      : "rgba(255,255,255,0.05)",
                    border: `1px solid ${review.isHidden ? "rgba(107,114,128,0.2)" : "rgba(139,92,246,0.2)"}`,
                    borderRadius: 14,
                    padding: "14px 16px",
                    opacity: review.isHidden ? 0.5 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: "#e5e7eb", fontSize: 14 }}>
                        {review.reviewerName}
                        {review.isHidden && (
                          <span
                            style={{
                              marginRight: 8,
                              background: "rgba(107,114,128,0.3)",
                              borderRadius: 6,
                              padding: "2px 6px",
                              fontSize: 11,
                              color: "#9ca3af",
                              fontWeight: 400,
                            }}
                          >
                            מוסתר
                          </span>
                        )}
                      </div>
                      <StarRating rating={review.rating} size={14} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() => toggleReview(review.id, !review.isHidden)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${review.isHidden ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.3)"}`,
                          background: review.isHidden
                            ? "rgba(16,185,129,0.1)"
                            : "rgba(239,68,68,0.1)",
                          color: review.isHidden ? "#6ee7b7" : "#fca5a5",
                          fontSize: 12,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {review.isHidden ? "הצג" : "הסתר"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteReviewItem(review.id)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: "1px solid rgba(239,68,68,0.45)",
                          background: "rgba(239,68,68,0.12)",
                          color: "#fca5a5",
                          fontSize: 12,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          whiteSpace: "nowrap",
                        }}
                      >
                        מחק
                      </button>
                    </div>
                  </div>
                  <div style={{ color: "#d1d5db", fontSize: 13, lineHeight: 1.5 }}>
                    {review.text}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: 11, marginTop: 8 }}>
                    {review.createdAt instanceof Date
                      ? review.createdAt.toLocaleDateString("he-IL")
                      : new Date(review.createdAt).toLocaleDateString("he-IL")}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Photos tab */}
          {activeTab === "photos" && (
            <div>
              <label
                style={{
                  display: "block",
                  padding: "16px",
                  borderRadius: 14,
                  border: "2px dashed rgba(139,92,246,0.3)",
                  background: "rgba(124,58,237,0.05)",
                  color: "#9ca3af",
                  fontSize: 14,
                  cursor: photoUploading ? "not-allowed" : "pointer",
                  textAlign: "center",
                  marginBottom: 16,
                  fontFamily: "inherit",
                }}
              >
                {photoUploading ? "מעלה…" : "📸 הוסף תמונה חדשה"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={photoUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { e.target.value = ""; uploadPhoto(file); }
                  }}
                />
              </label>

              {photoUploadError ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "#fca5a5",
                    marginBottom: 12,
                    background: "rgba(239,68,68,0.12)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  {photoUploadError}
                </div>
              ) : null}

              {photos.length === 0 && (
                <div style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: 40 }}>
                  אין תמונות עדיין
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    style={{
                      borderRadius: 14,
                      overflow: "hidden",
                      border: `1px solid ${photo.isHidden ? "rgba(107,114,128,0.2)" : "rgba(139,92,246,0.2)"}`,
                      opacity: photo.isHidden ? 0.5 : 1,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt=""
                      style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
                    />
                    <div
                      style={{
                        padding: "8px 10px",
                        background: "rgba(13,13,26,0.9)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: 10, color: "#9ca3af" }}>
                        {photo.uploadedBy === "mover" ? "שלך" : "לקוח"}
                        {photo.isHidden && " • מוסתר"}
                      </span>
                      <div style={{ display: "flex", gap: 6, marginInlineStart: "auto" }}>
                        <button
                          type="button"
                          onClick={() => togglePhoto(photo.id, !photo.isHidden)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: `1px solid ${photo.isHidden ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.3)"}`,
                            background: photo.isHidden
                              ? "rgba(16,185,129,0.1)"
                              : "rgba(239,68,68,0.1)",
                            color: photo.isHidden ? "#6ee7b7" : "#fca5a5",
                            fontSize: 11,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          {photo.isHidden ? "הצג" : "הסתר"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePhotoItem(photo.id)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: "1px solid rgba(239,68,68,0.45)",
                            background: "rgba(239,68,68,0.12)",
                            color: "#fca5a5",
                            fontSize: 11,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          מחק
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(139,92,246,0.3)",
  background: "rgba(255,255,255,0.05)",
  color: "#f9fafb",
  fontSize: 14,
  outline: "none",
  fontFamily: "var(--font-rubik), Rubik, sans-serif",
  boxSizing: "border-box",
};
