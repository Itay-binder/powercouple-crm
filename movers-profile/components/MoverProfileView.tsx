"use client";

import { useState, useEffect, useMemo } from "react";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase/client";
import StarRating from "./StarRating";
import type { PublicMoverData, MoverReview, MoverPhoto } from "../types";
import { SERVICE_LABELS, SERVICE_ICONS } from "../types";
import { getMoverViewPalette, normalizeMoverDisplayTheme } from "../viewTheme";

type Props = {
  data: PublicMoverData;
  /** מוסתר כשמוצגים בתוך MoverProfileShell (סרגל לשוניות חיצוני) */
  embedInShell?: boolean;
  /** סרטון השקה / קריאייטיב — כרטיס liftygo-card */
  creativeCampaignRibbon?: boolean;
  /** כרטיס דמה — ללא שליחת המלצה / העלאת תמונה */
  disablePublicActions?: boolean;
};

type GoogleUser = {
  uid: string;
  name: string;
  photo: string | null;
  idToken: string;
};

function toWhatsAppPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function MoverProfileView({
  data,
  embedInShell = false,
  creativeCampaignRibbon = false,
  disablePublicActions = false,
}: Props) {
  const [reviews, setReviews] = useState<MoverReview[]>(data.reviews);
  const [photos, setPhotos] = useState<MoverPhoto[]>(data.photos);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState("");
  const [activeReviewIdx, setActiveReviewIdx] = useState(0);
  const [shareTooltip, setShareTooltip] = useState(false);

  const ratingMax = Math.max(1, ...Object.values(data.ratingBreakdown));
  const visibleReviews = reviews.filter((r) => !r.isHidden);
  const waPhone = toWhatsAppPhone(data.phone);

  const C = useMemo(
    () => getMoverViewPalette(normalizeMoverDisplayTheme(data.displayTheme)),
    [data.displayTheme]
  );

  const navBtnStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: `1px solid ${C.navBtnBorder}`,
    background: C.navBtnBg,
    color: C.navBtnColor,
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
    padding: 0,
  };

  const inputStyleThemed: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: `1px solid ${C.inputBorder}`,
    background: C.inputBg,
    color: C.text,
    fontSize: 14,
    outline: "none",
    fontFamily: "var(--font-rubik), Rubik, sans-serif",
    boxSizing: "border-box",
  };

  // Restore Google auth state on mount
  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user && user.providerData.some((p: { providerId?: string }) => p.providerId === "google.com")) {
        try {
          const idToken = await user.getIdToken();
          setGoogleUser({
            uid: user.uid,
            name: user.displayName || user.email?.split("@")[0] || "משתמש Google",
            photo: user.photoURL,
            idToken,
          });
        } catch {
          // token refresh failed
        }
      } else {
        setGoogleUser(null);
      }
    });
    return unsub;
  }, []);

  async function signInWithGoogle() {
    setGoogleSigningIn(true);
    try {
      const auth = getFirebaseAuth();
      const provider = getGoogleProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      setGoogleUser({
        uid: result.user.uid,
        name: result.user.displayName || result.user.email?.split("@")[0] || "משתמש Google",
        photo: result.user.photoURL,
        idToken,
      });
      setShowReviewForm(true);
    } catch {
      // user cancelled popup
    } finally {
      setGoogleSigningIn(false);
    }
  }

  async function signOutGoogle() {
    await signOut(getFirebaseAuth());
    setGoogleUser(null);
    setShowReviewForm(false);
  }

  async function submitReview() {
    if (!googleUser || !reviewText.trim()) return;
    setSubmittingReview(true);
    setReviewError("");
    try {
      // Refresh token in case it expired
      const auth = getFirebaseAuth();
      const freshToken = await auth.currentUser?.getIdToken(true) ?? googleUser.idToken;

      const res = await fetch(`/api/movers/${data.slug}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleIdToken: freshToken, rating: reviewRating, text: reviewText }),
      });
      const json = await res.json();
      if (res.ok && json.review) {
        setReviews((prev) => [json.review, ...prev]);
        setActiveReviewIdx(0);
        setShowReviewForm(false);
        setReviewText("");
        setReviewRating(5);
        setReviewSuccess(true);
        setTimeout(() => setReviewSuccess(false), 4000);
      } else {
        setReviewError(json.error ?? "שגיאה בשליחה");
      }
    } finally {
      setSubmittingReview(false);
    }
  }

  async function uploadPhoto(file: File) {
    setPhotoUploading(true);
    setPhotoUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/movers/${data.slug}/photos`, {
        method: "POST",
        body: formData,
      });
      const json = (await res.json().catch(() => ({}))) as {
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

  function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: `${data.name} - LiftyGo`, url });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setShareTooltip(true);
        setTimeout(() => setShareTooltip(false), 2000);
      });
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.pageBg,
        fontFamily: "var(--font-rubik), Rubik, sans-serif",
        direction: "rtl",
        color: C.text,
        paddingBottom: 100,
      }}
    >
      {!embedInShell ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px 16px",
            borderBottom: `1px solid ${C.headerBorder}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: C.brand }}>✦</span>
            <span style={{ fontWeight: 900, fontSize: 18, color: C.text }}>LiftyGo</span>
          </div>
          <div
            style={{
              background: C.headerPillBg,
              border: `1px solid ${C.headerPillBorder}`,
              borderRadius: 20,
              padding: "4px 14px",
              fontSize: 11,
              color: C.headerPillText,
              fontWeight: 600,
            }}
          >
            כרטיס מוביל דיגיטלי
          </div>
        </div>
      ) : null}

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px" }}>
        {creativeCampaignRibbon ? (
          <div
            style={{
              marginTop: embedInShell ? 16 : 20,
              marginBottom: 4,
              padding: "10px 14px",
              borderRadius: 14,
              background: "rgba(124,58,237,0.18)",
              border: "1px solid rgba(167,139,250,0.45)",
              fontSize: 12,
              fontWeight: 700,
              color: C.sectionTitle,
              textAlign: "center",
              lineHeight: 1.45,
            }}
          >
            תצוגה לקריאייטיב · השקת «כרטיס המוביל של ליפטיגו»
            <span style={{ display: "block", fontWeight: 600, opacity: 0.9, marginTop: 4 }}>
              דירוג דמה 4.7 · 107 המלצות · 20 ביקורות מוצגות
            </span>
          </div>
        ) : null}
        {/* Profile header */}
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.cardBorder}`,
            boxShadow: C.cardShadow,
            backdropFilter: "blur(20px)",
            borderRadius: 20,
            padding: "24px 20px 20px",
            marginTop: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                border: `3px solid ${C.avatarBorder}`,
                overflow: "hidden",
                flexShrink: 0,
                background: C.avatarPlaceholderBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
              }}
            >
              {data.profileImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.profileImageUrl} alt={data.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : "👤"}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: C.verifiedBg,
                  border: `1px solid ${C.verifiedBorder}`,
                  borderRadius: 20,
                  padding: "3px 10px",
                  fontSize: 11,
                  color: C.verifiedText,
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                <span>✓</span><span>מוביל מאומת LiftyGo</span>
              </div>
              <div style={{ fontWeight: 900, fontSize: 22, color: C.text, lineHeight: 1.2 }}>
                {data.name}
              </div>
              {data.reviewCount > 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                  <StarRating rating={data.rating} size={14} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{data.rating.toFixed(1)}</span>
                  <span style={{ fontSize: 12, color: C.textMuted }}>({data.reviewCount} המלצות)</span>
                </div>
              ) : (
                <div style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>מוביל מקצועי</div>
              )}
              {data.coverArea && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, color: C.textMuted, fontSize: 13 }}>
                  <span>📍</span><span>{data.coverArea}</span>
                </div>
              )}
            </div>
          </div>

          {data.bio && (
            <div style={{ marginTop: 16, color: C.textBio, fontSize: 14, lineHeight: 1.6, borderTop: `1px solid ${C.headerBorder}`, paddingTop: 14 }}>
              {data.bio}
            </div>
          )}

          {data.services.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {data.services.map((svc) => (
                <div
                  key={svc}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    background: C.serviceChipBg, border: `1px solid ${C.serviceChipBorder}`,
                    borderRadius: 12, padding: "8px 12px", fontSize: 11, color: C.serviceChipText,
                    flex: "1 1 70px", textAlign: "center",
                  }}
                >
                  <span style={{ fontSize: 20 }}>{SERVICE_ICONS[svc]}</span>
                  <span>{SERVICE_LABELS[svc]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rating breakdown */}
        {data.reviewCount > 0 && (
          <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, boxShadow: C.cardShadow, backdropFilter: "blur(20px)", borderRadius: 20, padding: "20px", marginTop: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: C.sectionTitle, marginBottom: 14 }}>הדירוג שלי</div>
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 900, fontSize: 48, color: C.breakdownNumber, lineHeight: 1 }}>{data.rating.toFixed(1)}</div>
                <StarRating rating={data.rating} size={18} />
                <div style={{ color: C.textMuted, fontSize: 11, marginTop: 4 }}>מבוסס על {data.reviewCount} דירוגים</div>
              </div>
              <div style={{ flex: 1 }}>
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = data.ratingBreakdown[star] ?? 0;
                  const pct = ratingMax > 0 ? (count / ratingMax) * 100 : 0;
                  return (
                    <div key={star} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ color: "#f59e0b", fontSize: 12, width: 14, textAlign: "center" }}>{star}★</span>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.starBarTrack, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #7c3aed, #a855f7)", borderRadius: 3, transition: "width 0.6s ease" }} />
                      </div>
                      <span style={{ color: C.textMuted, fontSize: 11, width: 24, textAlign: "center" }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Reviews carousel */}
        {visibleReviews.length > 0 && (
          <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, boxShadow: C.cardShadow, backdropFilter: "blur(20px)", borderRadius: 20, padding: "20px", marginTop: 16, overflow: "hidden" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: C.sectionTitle, marginBottom: 14 }}>💬 המלצות מלקוחות</div>
            <div style={{ background: C.reviewInnerBg, border: `1px solid ${C.reviewInnerBorder}`, borderRadius: 16, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {visibleReviews[activeReviewIdx]?.reviewerPhoto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={visibleReviews[activeReviewIdx].reviewerPhoto} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.textSoft, marginBottom: 3 }}>
                      {visibleReviews[activeReviewIdx]?.reviewerName}
                    </div>
                    <StarRating rating={visibleReviews[activeReviewIdx]?.rating ?? 5} size={14} />
                  </div>
                </div>
                <div style={{ fontSize: 28, color: C.reviewQuote, lineHeight: 1, opacity: 0.7 }}>&ldquo;</div>
              </div>
              <div style={{ color: C.reviewBody, fontSize: 14, lineHeight: 1.6, minHeight: 54 }}>
                {visibleReviews[activeReviewIdx]?.text}
              </div>
            </div>

            {visibleReviews.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                <button onClick={() => setActiveReviewIdx((i) => (i + 1) % visibleReviews.length)} style={navBtnStyle}>›</button>
                <div style={{ display: "flex", gap: 6 }}>
                  {visibleReviews.slice(0, 8).map((_, i) => (
                    <button key={i} onClick={() => setActiveReviewIdx(i)} style={{ width: i === activeReviewIdx ? 20 : 8, height: 8, borderRadius: 4, background: i === activeReviewIdx ? C.brand : C.starBarTrack, border: "none", cursor: "pointer", transition: "all 0.3s ease", padding: 0 }} />
                  ))}
                </div>
                <button onClick={() => setActiveReviewIdx((i) => (i - 1 + visibleReviews.length) % visibleReviews.length)} style={navBtnStyle}>‹</button>
              </div>
            )}
          </div>
        )}

        {/* Photos */}
        {photos.filter((p) => !p.isHidden).length > 0 && (
          <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, boxShadow: C.cardShadow, backdropFilter: "blur(20px)", borderRadius: 20, padding: "20px", marginTop: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: C.sectionTitle, marginBottom: 14 }}>📸 תמונות מהובלות</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {photos.filter((p) => !p.isHidden).slice(0, 6).map((photo) => (
                <div key={photo.id} style={{ aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: C.photoCellBg }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Review section */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, boxShadow: C.cardShadow, backdropFilter: "blur(20px)", borderRadius: 20, padding: "20px", marginTop: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: C.sectionTitle, marginBottom: 14 }}>דרג ✍️ שתף חוויה</div>

          {disablePublicActions ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "rgba(124,58,237,0.12)",
                border: `1px solid rgba(167,139,250,0.35)`,
                fontSize: 13,
                color: C.textMuted,
                lineHeight: 1.5,
              }}
            >
              בכרטיס דמה זה לא ניתן להוסיף המלצות או תמונות — מיועד לצילומים והשקה בלבד.
            </div>
          ) : null}

          {!disablePublicActions && reviewSuccess && (
            <div style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 10, padding: "10px 14px", color: "#6ee7b7", fontSize: 13, marginBottom: 14 }}>
              תודה! ההמלצה שלך נשלחה בהצלחה 🎉
            </div>
          )}

          {!disablePublicActions && googleUser && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.subtleSurface, borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
              {googleUser.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={googleUser.photo} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{googleUser.name}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>מחובר עם Google</div>
              </div>
              <button onClick={signOutGoogle} style={{ background: "none", border: `1px solid ${C.secondaryBtnBorder}`, borderRadius: 8, color: C.secondaryBtnColor, fontSize: 11, cursor: "pointer", padding: "4px 10px", fontFamily: "inherit" }}>
                התנתק
              </button>
            </div>
          )}

          {!disablePublicActions && !googleUser && !showReviewForm && (
            <button
              onClick={signInWithGoogle}
              disabled={googleSigningIn}
              style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1px solid ${C.telBorder}`, background: C.inputBg, color: C.text, fontSize: 14, cursor: googleSigningIn ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: googleSigningIn ? 0.7 : 1 }}
            >
              <GoogleIcon />
              {googleSigningIn ? "מתחבר…" : "התחבר עם Google להוספת המלצה"}
            </button>
          )}

          {!disablePublicActions && googleUser && !showReviewForm && (
            <button
              onClick={() => setShowReviewForm(true)}
              style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1px solid ${C.telBorder}`, background: C.telBg, color: C.telColor, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
            >
              + הוסף המלצה ודירוג
            </button>
          )}

          {!disablePublicActions && googleUser && showReviewForm && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 6 }}>הדירוג שלך</div>
                <StarRating rating={reviewRating} size={32} interactive onRate={setReviewRating} />
              </div>
              <textarea
                placeholder="ספר על החוויה שלך עם המוביל..."
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                rows={3}
                style={{ ...inputStyleThemed, resize: "vertical" as const }}
              />
              {reviewError && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "8px 12px", color: "#fca5a5", fontSize: 13 }}>
                  {reviewError}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={submitReview}
                  disabled={submittingReview || !reviewText.trim()}
                  style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: submittingReview ? "not-allowed" : "pointer", opacity: submittingReview ? 0.6 : 1, fontFamily: "inherit" }}
                >
                  {submittingReview ? "שולח…" : "שלח המלצה"}
                </button>
                <button
                  onClick={() => { setShowReviewForm(false); setReviewText(""); setReviewRating(5); setReviewError(""); }}
                  style={{ padding: "12px 16px", borderRadius: 12, border: `1px solid ${C.secondaryBtnBorder}`, background: C.secondaryBtnBg, color: C.secondaryBtnColor, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
                >
                  ביטול
                </button>
              </div>
            </div>
          )}

          {/* Customer photo upload */}
          {!disablePublicActions ? (
            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", width: "100%", padding: "10px", borderRadius: 12, border: `1px dashed ${C.dashedUploadBorder}`, background: "transparent", color: C.secondaryBtnColor, fontSize: 13, cursor: photoUploading ? "not-allowed" : "pointer", textAlign: "center", fontFamily: "inherit", boxSizing: "border-box" }}>
                {photoUploading ? "מעלה תמונה…" : "📷 הוסף תמונה מההובלה"}
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={photoUploading}
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadPhoto(file); }}
                />
              </label>
              {photoUploadError ? (
                <div style={{ marginTop: 8, fontSize: 12, color: "#fca5a5", textAlign: "center" }}>
                  {photoUploadError}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Bottom action bar */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.barBg, backdropFilter: "blur(20px)", borderTop: `1px solid ${C.barBorder}`, padding: "14px 16px", display: "flex", gap: 10, maxWidth: 480, margin: "0 auto" }}>
          <button
            onClick={handleShare}
            style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}
          >
            🔗 {shareTooltip ? "הועתק!" : "שיתוף הכרטיס"}
          </button>
          <a href={`tel:${data.phone}`} style={{ padding: "12px 16px", borderRadius: 12, border: `1px solid ${C.telBorder}`, background: C.telBg, color: C.telColor, fontSize: 14, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
            📞
          </a>
          <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer" style={{ padding: "12px 16px", borderRadius: 12, border: "none", background: "#25d366", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <WhatsAppIcon />
          </a>
        </div>
      </div>
    </div>
  );
}
