"use client";

import { useCallback, useEffect, useState } from "react";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import type { MetaAdsCampaignVm, MetaAdSetVm } from "@/lib/metaAds/graph";

type CanvaStatus = { connected: boolean; expiresAt: string; updatedAt: string };
type CanvaDesign = { id: string; title: string; thumbnailUrl: string; updatedAt: string };

const CTA_OPTIONS = [
  { value: "LEARN_MORE", label: "למידע נוסף (Learn More)" },
  { value: "SHOP_NOW", label: "קנה עכשיו (Shop Now)" },
  { value: "SIGN_UP", label: "הירשם (Sign Up)" },
  { value: "CONTACT_US", label: "צור קשר (Contact Us)" },
  { value: "GET_QUOTE", label: "קבל הצעת מחיר (Get Quote)" },
  { value: "BOOK_TRAVEL", label: "הזמן (Book Now)" },
  { value: "DOWNLOAD", label: "הורד (Download)" },
  { value: "SUBSCRIBE", label: "הירשם לעדכונים (Subscribe)" },
  { value: "WATCH_MORE", label: "צפה עוד (Watch More)" },
  { value: "GET_OFFER", label: "קבל הצעה (Get Offer)" },
];

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

function buildPreviewUrl(
  base: string,
  params: { utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string }
): string {
  try {
    const url = new URL(base);
    if (params.utmSource) url.searchParams.set("utm_source", params.utmSource);
    if (params.utmMedium) url.searchParams.set("utm_medium", params.utmMedium);
    if (params.utmCampaign) url.searchParams.set("utm_campaign", params.utmCampaign);
    if (params.utmContent) url.searchParams.set("utm_content", params.utmContent);
    if (params.utmTerm) url.searchParams.set("utm_term", params.utmTerm);
    return url.toString();
  } catch {
    return base;
  }
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  fontSize: 13,
  boxSizing: "border-box",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
      {children}
    </div>
  );
}

function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #f3f4f6" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function DesignCard({
  design, selected, onClick, exporting,
}: {
  design: CanvaDesign; selected: boolean; onClick: () => void; exporting: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={exporting}
      style={{
        border: selected ? "2px solid #7c3aed" : "2px solid #e5e7eb",
        borderRadius: 12, padding: 8,
        background: selected ? "#f5f3ff" : "#fff",
        cursor: exporting ? "wait" : "pointer",
        textAlign: "right",
        transition: "border-color 0.15s",
      }}
    >
      {design.thumbnailUrl ? (
        <img
          src={design.thumbnailUrl}
          alt={design.title}
          style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 8, display: "block", marginBottom: 6 }}
        />
      ) : (
        <div style={{ width: "100%", height: 90, background: "#e5e7eb", borderRadius: 8, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#9ca3af" }}>
          אין תצוגה
        </div>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {exporting ? "מייצא..." : design.title}
      </div>
    </button>
  );
}

type Props = {
  adSetId?: string;
  adSetName?: string;
  campaigns: MetaAdsCampaignVm[];
  adSets: MetaAdSetVm[];
  onClose: () => void;
  onSuccess: () => void;
};

export default function AddAdModal({ adSetId: adSetIdProp, adSetName: adSetNameProp, campaigns, adSets, onClose, onSuccess }: Props) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(() => {
    if (adSetIdProp) return adSets.find((s) => s.id === adSetIdProp)?.campaignId ?? "";
    return campaigns.length === 1 ? campaigns[0].id : "";
  });
  const [selectedAdSetId, setSelectedAdSetId] = useState<string>(adSetIdProp ?? "");

  const filteredAdSets = selectedCampaignId
    ? adSets.filter((s) => s.campaignId === selectedCampaignId)
    : adSets;

  const resolvedAdSetId = selectedAdSetId;
  const resolvedAdSetName = adSets.find((s) => s.id === selectedAdSetId)?.name ?? adSetNameProp ?? "";
  const [canvaStatus, setCanvaStatus] = useState<CanvaStatus | null>(null);
  const [canvaStatusLoading, setCanvaStatusLoading] = useState(true);
  const [disconnectingCanva, setDisconnectingCanva] = useState(false);

  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [designsLoading, setDesignsLoading] = useState(false);
  const [designsContinuation, setDesignsContinuation] = useState<string | undefined>();
  const [selectedDesign, setSelectedDesign] = useState<CanvaDesign | null>(null);
  const [exportingDesign, setExportingDesign] = useState(false);
  const [exportedImageUrl, setExportedImageUrl] = useState("");

  const [uploadSource, setUploadSource] = useState<"canva" | "local">("canva");
  const [localUploading, setLocalUploading] = useState(false);
  const [localMediaType, setLocalMediaType] = useState<"image" | "video" | null>(null);
  const [localImageHash, setLocalImageHash] = useState("");
  const [localVideoId, setLocalVideoId] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [localFileName, setLocalFileName] = useState("");

  const [adName, setAdName] = useState("");
  const [pageId, setPageId] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [callToAction, setCallToAction] = useState("LEARN_MORE");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [utmSource, setUtmSource] = useState("meta");
  const [utmMedium, setUtmMedium] = useState("cpc");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [utmTerm, setUtmTerm] = useState("");
  const [advantageCreative, setAdvantageCreative] = useState(true);
  const [launchStatus, setLaunchStatus] = useState<"PAUSED" | "ACTIVE">("PAUSED");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ adCreativeId: string; adId: string } | null>(null);

  const loadCanvaStatus = useCallback(async () => {
    setCanvaStatusLoading(true);
    try {
      const res = await fetch("/api/meta-ads/canva/status", { credentials: "include", cache: "no-store" });
      const j = await parseJson<{ ok?: boolean; connected?: boolean; expiresAt?: string; updatedAt?: string }>(res);
      if (res.ok && j.ok) {
        setCanvaStatus({ connected: j.connected ?? false, expiresAt: j.expiresAt ?? "", updatedAt: j.updatedAt ?? "" });
      }
    } finally {
      setCanvaStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCanvaStatus();
  }, [loadCanvaStatus]);

  async function loadDesigns(continuation?: string) {
    setDesignsLoading(true);
    setErr(null);
    try {
      const url = `/api/meta-ads/canva/designs${continuation ? `?continuation=${encodeURIComponent(continuation)}` : ""}`;
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      const j = await parseJson<{ ok?: boolean; designs?: CanvaDesign[]; continuation?: string; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "טעינת עיצובים נכשלה");
      if (continuation) {
        setDesigns((prev) => [...prev, ...(j.designs ?? [])]);
      } else {
        setDesigns(j.designs ?? []);
      }
      setDesignsContinuation(j.continuation);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setDesignsLoading(false);
    }
  }

  async function selectDesignAndExport(design: CanvaDesign) {
    setSelectedDesign(design);
    setExportedImageUrl("");
    setExportingDesign(true);
    setErr(null);
    try {
      const res = await fetch("/api/meta-ads/canva/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId: design.id }),
      });
      const j = await parseJson<{ ok?: boolean; imageUrl?: string; error?: string }>(res);
      if (!res.ok || !j.ok || !j.imageUrl) throw new Error(j.error || "ייצוא עיצוב נכשל");
      setExportedImageUrl(j.imageUrl);
      if (!adName) setAdName(design.title);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ייצוא נכשל");
      setSelectedDesign(null);
    } finally {
      setExportingDesign(false);
    }
  }

  async function disconnectCanva() {
    setDisconnectingCanva(true);
    try {
      await fetch("/api/meta-ads/canva/disconnect", { method: "POST", credentials: "include" });
      setCanvaStatus({ connected: false, expiresAt: "", updatedAt: "" });
      setDesigns([]);
      setSelectedDesign(null);
      setExportedImageUrl("");
    } finally {
      setDisconnectingCanva(false);
    }
  }

  async function handleLocalFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalUploading(true);
    setLocalImageHash("");
    setLocalVideoId("");
    setLocalMediaType(null);
    setErr(null);
    const prev = localPreviewUrl;
    if (prev) URL.revokeObjectURL(prev);
    const preview = URL.createObjectURL(file);
    setLocalPreviewUrl(preview);
    setLocalFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/meta-ads/creative/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const j = await parseJson<{ ok?: boolean; type?: string; imageHash?: string; videoId?: string; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "העלאה נכשלה");
      setLocalMediaType(j.type === "video" ? "video" : "image");
      if (j.imageHash) setLocalImageHash(j.imageHash);
      if (j.videoId) setLocalVideoId(j.videoId);
      const baseName = file.name.replace(/\.[^.]+$/, "");
      if (!adName) setAdName(baseName);
    } catch (err2) {
      setErr(err2 instanceof Error ? err2.message : "העלאה נכשלה");
      URL.revokeObjectURL(preview);
      setLocalPreviewUrl("");
    } finally {
      setLocalUploading(false);
      e.target.value = "";
    }
  }

  async function submitAd() {
    if (!resolvedAdSetId) { setErr("יש לבחור סדרת מודעות תחילה"); return; }
    const mediaReady = uploadSource === "canva" ? !!exportedImageUrl : !!(localImageHash || localVideoId);
    if (!mediaReady) { setErr(uploadSource === "canva" ? "בחר עיצוב מ-Canva תחילה" : "העלה קובץ תחילה"); return; }
    if (!pageId.trim()) { setErr("Facebook Page ID נדרש"); return; }
    if (!adName.trim()) { setErr("שם מודעה נדרש"); return; }
    if (!primaryText.trim()) { setErr("טקסט ראשי נדרש"); return; }
    if (!headline.trim()) { setErr("כותרת נדרשת"); return; }
    if (!websiteUrl.trim()) { setErr("קישור יעד נדרש"); return; }

    setSubmitting(true);
    setErr(null);
    setSuccessResult(null);
    try {
      const res = await fetch("/api/meta-ads/ads/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adSetId: resolvedAdSetId,
          ...(uploadSource === "canva"
            ? { canvaImageUrl: exportedImageUrl }
            : localVideoId
            ? { videoId: localVideoId }
            : { imageHash: localImageHash }),
          adName: adName.trim(),
          pageId: pageId.trim(),
          primaryText: primaryText.trim(),
          headline: headline.trim(),
          description: description.trim() || undefined,
          callToAction,
          websiteUrl: websiteUrl.trim(),
          utmSource: utmSource.trim() || undefined,
          utmMedium: utmMedium.trim() || undefined,
          utmCampaign: utmCampaign.trim() || undefined,
          utmContent: utmContent.trim() || undefined,
          utmTerm: utmTerm.trim() || undefined,
          advantageCreative,
          launchStatus,
        }),
      });
      const j = await parseJson<{ ok?: boolean; adCreativeId?: string; adId?: string; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "יצירת מודעה נכשלה");
      setSuccessResult({ adCreativeId: j.adCreativeId ?? "", adId: j.adId ?? "" });
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  }

  const mediaReady = uploadSource === "canva" ? !!exportedImageUrl : !!(localImageHash || localVideoId);

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        zIndex: 2000, padding: "24px 12px",
        overflowY: "auto",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%", maxWidth: 700,
          background: "#fff", borderRadius: 18,
          border: "1px solid #e5e7eb",
          display: "grid", gap: 0,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        }}
        dir="rtl"
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #e5e7eb",
        }}>
          <div style={{ fontWeight: 900, fontSize: 17 }}>הוסף מודעה</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280", lineHeight: 1, padding: "4px 8px" }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          {err && (
            <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>
              {err}
            </div>
          )}

          {successResult && (
            <div style={{ padding: 14, borderRadius: 12, background: "#ecfdf5", border: "1px solid #6ee7b7" }}>
              <div style={{ fontWeight: 900, color: "#065f46", marginBottom: 6 }}>המודעה נוצרה בהצלחה!</div>
              <div style={{ fontSize: 13, color: "#047857", display: "grid", gap: 3 }}>
                <span>Ad ID: <strong dir="ltr">{successResult.adId}</strong></span>
                <span>Creative ID: <strong dir="ltr">{successResult.adCreativeId}</strong></span>
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                המודעה נשמרה ב-Meta Ads Manager. בדוק אותה בטאב המודעות.
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{ marginTop: 10, padding: "8px 16px", borderRadius: 8, border: "none", background: "#065f46", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
              >
                סגור
              </button>
            </div>
          )}

          {/* Campaign / Ad Set selector */}
          <SectionBox title="קמפיין וסדרת מודעות">
            <FormGrid>
              <Field label="קמפיין">
                <select
                  value={selectedCampaignId}
                  onChange={(e) => {
                    setSelectedCampaignId(e.target.value);
                    setSelectedAdSetId("");
                  }}
                  style={{ ...inputStyle }}
                >
                  <option value="">— בחר קמפיין —</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="סדרת מודעות">
                <select
                  value={selectedAdSetId}
                  onChange={(e) => setSelectedAdSetId(e.target.value)}
                  disabled={!selectedCampaignId && adSets.length === 0}
                  style={{ ...inputStyle }}
                >
                  <option value="">— בחר סדרת מודעות —</option>
                  {filteredAdSets.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
            </FormGrid>
            {resolvedAdSetId && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#065f46" }}>
                ✓ {resolvedAdSetName}
                <span dir="ltr" style={{ color: "#9ca3af", marginRight: 6, fontFamily: "monospace" }}>({resolvedAdSetId})</span>
              </div>
            )}
          </SectionBox>

          {/* Source Toggle */}
          <div style={{ display: "flex", gap: 8 }}>
            {(["canva", "local"] as const).map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => { setUploadSource(src); setErr(null); }}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 10,
                  border: `2px solid ${uploadSource === src ? "#7c3aed" : "#e5e7eb"}`,
                  background: uploadSource === src ? "#f5f3ff" : "#fff",
                  fontWeight: 800, fontSize: 14,
                  color: uploadSource === src ? "#7c3aed" : "#6b7280",
                  cursor: "pointer",
                }}
              >
                {src === "canva" ? "🎨 עיצוב מ-Canva" : "💻 העלאה מהמחשב"}
              </button>
            ))}
          </div>

          {/* Local Upload */}
          {uploadSource === "local" && (
            <SectionBox title="העלאת תמונה / סרטון מהמחשב">
              <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 10 }}>
                תומך ב-JPG, PNG, GIF ו-MP4, MOV (עד 4MB).
              </div>
              <label
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 8, padding: "24px 16px",
                  border: "2px dashed #d1d5db", borderRadius: 12,
                  background: "#fafafa", cursor: "pointer",
                }}
                onDragOver={(e) => { e.preventDefault(); (e.currentTarget as HTMLLabelElement).style.borderColor = "#7c3aed"; }}
                onDragLeave={(e) => { (e.currentTarget as HTMLLabelElement).style.borderColor = "#d1d5db"; }}
                onDrop={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLLabelElement).style.borderColor = "#d1d5db";
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    const fakeEvent = { target: { files: [file], value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>;
                    void handleLocalFileChange(fakeEvent);
                  }
                }}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,video/mp4,video/quicktime,video/mov"
                  style={{ display: "none" }}
                  onChange={(e) => void handleLocalFileChange(e)}
                  disabled={localUploading}
                />
                {localUploading ? (
                  <div style={{ color: "#7c3aed", fontWeight: 700, fontSize: 13 }}>מעלה ל-Meta... אנא המתן</div>
                ) : localPreviewUrl && (localImageHash || localVideoId) ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                    {localMediaType === "video" ? (
                      <video src={localPreviewUrl} controls style={{ width: 100, height: 70, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                    ) : (
                      <img src={localPreviewUrl} alt="preview" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{localFileName}</div>
                      <div style={{ fontSize: 12, color: "#065f46", marginTop: 2 }}>
                        {localMediaType === "video" ? "סרטון" : "תמונה"} הועלה בהצלחה ל-Meta
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>לחץ להחלפה</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 28 }}>📁</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>גרור קובץ לכאן או לחץ לבחירה</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>JPG · PNG · GIF · MP4 · MOV (עד 4MB)</div>
                  </>
                )}
              </label>
            </SectionBox>
          )}

          {/* Canva Section */}
          {uploadSource === "canva" && (
            <SectionBox title="חיבור Canva">
              {canvaStatusLoading ? (
                <div style={{ color: "#6b7280", fontSize: 13 }}>בודק חיבור...</div>
              ) : canvaStatus?.connected ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 10,
                    background: "#ecfdf5", border: "1px solid #6ee7b7",
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13 }}>
                      <strong>Canva מחובר</strong>
                      {canvaStatus.updatedAt && (
                        <span style={{ color: "#6b7280" }}> · עודכן {formatIsraelDateTime(canvaStatus.updatedAt)}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void disconnectCanva()}
                      disabled={disconnectingCanva}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                    >
                      {disconnectingCanva ? "מנתק..." : "נתק"}
                    </button>
                  </div>

                  {designs.length === 0 && !designsLoading && (
                    <button
                      type="button"
                      onClick={() => void loadDesigns()}
                      disabled={designsLoading}
                      style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 800, cursor: "pointer", alignSelf: "start", fontSize: 13 }}
                    >
                      טען עיצובים מ-Canva
                    </button>
                  )}

                  {designs.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>בחר עיצוב:</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, maxHeight: 320, overflowY: "auto", padding: 4 }}>
                        {designs.map((d) => (
                          <DesignCard
                            key={d.id}
                            design={d}
                            selected={selectedDesign?.id === d.id}
                            onClick={() => void selectDesignAndExport(d)}
                            exporting={exportingDesign && selectedDesign?.id === d.id}
                          />
                        ))}
                      </div>
                      {designsContinuation && (
                        <button
                          type="button"
                          onClick={() => void loadDesigns(designsContinuation)}
                          disabled={designsLoading}
                          style={{ marginTop: 8, padding: "8px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
                        >
                          {designsLoading ? "טוען..." : "טען עוד"}
                        </button>
                      )}
                    </div>
                  )}

                  {designsLoading && designs.length === 0 && (
                    <div style={{ color: "#6b7280", fontSize: 13 }}>טוען עיצובים...</div>
                  )}

                  {selectedDesign && exportedImageUrl && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: "#f0fdf4", borderRadius: 10, border: "1px solid #6ee7b7" }}>
                      <img src={exportedImageUrl} alt={selectedDesign.title} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{selectedDesign.title}</div>
                        <div style={{ fontSize: 12, color: "#065f46" }}>יוצא ומוכן להעלאה ל-Meta</div>
                      </div>
                    </div>
                  )}

                  {exportingDesign && (
                    <div style={{ fontSize: 13, color: "#6b7280" }}>מייצא עיצוב מ-Canva... (עד 30 שניות)</div>
                  )}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 13, color: "#4b5563" }}>
                    חבר את חשבון Canva שלך כדי לבחור עיצובים ישירות.
                  </div>
                  <a
                    href="/api/meta-ads/canva/connect"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      padding: "10px 18px", borderRadius: 10, background: "#7c3aed",
                      color: "#fff", fontWeight: 800, fontSize: 14, textDecoration: "none",
                      alignSelf: "start",
                    }}
                  >
                    התחבר עם Canva
                  </a>
                </div>
              )}
            </SectionBox>
          )}

          {/* Ad Creative Fields */}
          <SectionBox title="קריאייטיב המודעה">
            <FormGrid>
              <Field label="שם המודעה *">
                <input value={adName} onChange={(e) => setAdName(e.target.value)} placeholder="שם המודעה" style={inputStyle} />
              </Field>
              <Field label="Facebook Page ID *">
                <input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="123456789012345" dir="ltr" style={inputStyle} />
              </Field>
              <Field label="קישור יעד (URL) *">
                <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://yoursite.com" dir="ltr" style={inputStyle} />
              </Field>
              <Field label="כפתור CTA">
                <select value={callToAction} onChange={(e) => setCallToAction(e.target.value)} style={inputStyle}>
                  {CTA_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="סטטוס השקה">
                <select value={launchStatus} onChange={(e) => setLaunchStatus(e.target.value as "ACTIVE" | "PAUSED")} style={inputStyle}>
                  <option value="PAUSED">מושהה (Paused)</option>
                  <option value="ACTIVE">פעיל מיד (Active)</option>
                </select>
              </Field>
            </FormGrid>
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <Field label="טקסט ראשי *">
                <textarea
                  value={primaryText}
                  onChange={(e) => setPrimaryText(e.target.value)}
                  placeholder="הטקסט הראשי שיופיע מעל המודעה..."
                  rows={3}
                  maxLength={500}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <div style={{ fontSize: 11, color: "#6b7280" }}>{primaryText.length}/500</div>
              </Field>
              <Field label="כותרת (Headline) *">
                <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="כותרת קצרה וחזקה" maxLength={255} style={inputStyle} />
              </Field>
              <Field label="תיאור (אופציונלי)">
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="פירוט קצר נוסף" maxLength={255} style={inputStyle} />
              </Field>
            </div>
          </SectionBox>

          {/* Advantage+ Creative */}
          <SectionBox title="שיפורי AI — Advantage+">
            <label style={{
              display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer",
              padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb",
              background: advantageCreative ? "#eff6ff" : "#f9fafb",
            }}>
              <input
                type="checkbox"
                checked={advantageCreative}
                onChange={(e) => setAdvantageCreative(e.target.checked)}
                style={{ marginTop: 2, cursor: "pointer", width: 16, height: 16, accentColor: "#1d4ed8" }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: advantageCreative ? "#1d4ed8" : "#374151" }}>
                  Advantage+ Creative
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  Meta מבצעת שיפורים אוטומטיים לקריאייטיב (ניגודיות, בהירות, כיתוב)
                </div>
              </div>
            </label>
          </SectionBox>

          {/* UTM Parameters */}
          <SectionBox title="UTM Parameters">
            <FormGrid>
              <Field label="utm_source">
                <input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="meta" dir="ltr" style={inputStyle} />
              </Field>
              <Field label="utm_medium">
                <input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="cpc" dir="ltr" style={inputStyle} />
              </Field>
              <Field label="utm_campaign">
                <input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="שם הקמפיין" dir="ltr" style={inputStyle} />
              </Field>
              <Field label="utm_content (אופציונלי)">
                <input value={utmContent} onChange={(e) => setUtmContent(e.target.value)} placeholder="ad_variant_1" dir="ltr" style={inputStyle} />
              </Field>
              <Field label="utm_term (אופציונלי)">
                <input value={utmTerm} onChange={(e) => setUtmTerm(e.target.value)} placeholder="keyword" dir="ltr" style={inputStyle} />
              </Field>
            </FormGrid>
            {websiteUrl && (
              <div style={{ marginTop: 10, padding: 10, background: "#f9fafb", borderRadius: 8, fontSize: 11, color: "#6b7280", wordBreak: "break-all" }} dir="ltr">
                Preview: {buildPreviewUrl(websiteUrl, { utmSource, utmMedium, utmCampaign, utmContent, utmTerm })}
              </div>
            )}
          </SectionBox>

          {/* Submit */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingTop: 4 }}>
            <button
              type="button"
              onClick={() => void submitAd()}
              disabled={submitting || !mediaReady}
              style={{
                padding: "12px 24px", borderRadius: 12, border: "none",
                background: mediaReady ? "#1d4ed8" : "#9ca3af",
                color: "#fff", fontWeight: 900, fontSize: 15,
                cursor: submitting || !mediaReady ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "יוצר מודעה..." : "צור מודעה ל-Meta"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: "12px 20px", borderRadius: 12, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              ביטול
            </button>
            {!mediaReady && (
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {uploadSource === "canva" ? "יש לבחור עיצוב מ-Canva תחילה" : "יש להעלות תמונה/סרטון תחילה"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
