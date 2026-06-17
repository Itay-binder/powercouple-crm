"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import { metaAdSetEligibleForBidCap } from "@/lib/metaAds/graph";
import type { MetaAdsCampaignVm, MetaAdSetVm, MetaAdVm } from "@/lib/metaAds/graph";
import CreateCampaignClient from "@/app/meta-ads/CreateCampaignClient";
import AddAdModal from "@/app/meta-ads/AddAdModal";

type SettingsVm = {
  appId: string;
  businessId: string;
  adAccountId: string;
  hasToken: boolean;
  tokenPreview: string;
  hasStatusTogglePassword: boolean;
  statusTogglePasswordMasked: string;
  updatedAt: string;
  canManage: boolean;
};

type TokenStatus = {
  connected: boolean;
  scopes: string[];
  expiresAt: string;
  error: string | null;
};

type Tab = "campaigns" | "adsets" | "ads" | "create";
type MetaObjectType = "campaign" | "adset" | "ad";
type PendingToggle = {
  objectType: MetaObjectType;
  objectId: string;
  currentStatus: string;
  effectiveStatus: string;
};

function money(v: number): string {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(v || 0);
}

function intFmt(v: number): string {
  return new Intl.NumberFormat("he-IL").format(v || 0);
}

function cpr(spend: number, results: number): string {
  if (!results || !spend) return "—";
  return money(spend / results);
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

function nextStatusFromCurrent(currentStatus: string, effectiveStatus: string): "ACTIVE" | "PAUSED" {
  const source = (effectiveStatus || currentStatus || "").toUpperCase();
  return source === "ACTIVE" ? "PAUSED" : "ACTIVE";
}

function daysUntil(isoDate: string): number | null {
  if (!isoDate) return null;
  const ms = new Date(isoDate).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#16a34a",
  PAUSED: "#ca8a04",
  DELETED: "#dc2626",
  ARCHIVED: "#6b7280",
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#6b7280";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        color,
        background: `${color}18`,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

const DATE_PRESETS = [
  { value: "today", label: "היום" },
  { value: "yesterday", label: "אתמול" },
  { value: "last_3d", label: "3 ימים" },
  { value: "last_7d", label: "7 ימים" },
  { value: "last_14d", label: "14 ימים" },
  { value: "last_28d", label: "28 ימים" },
  { value: "last_30d", label: "30 ימים" },
  { value: "this_month", label: "החודש" },
  { value: "last_month", label: "חודש קודם" },
  { value: "this_quarter", label: "רבעון נוכחי" },
  { value: "maximum", label: "מקסימום" },
];

const DATE_PRESET_SET = new Set(DATE_PRESETS.map((p) => p.value));
const META_ADS_DATE_PRESET_COOKIE = "crm_meta_ads_date_preset";
const META_ADS_DATE_PRESET_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = document.cookie.match(new RegExp(`(?:^|; )${esc}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeMetaAdsDatePresetCookie(value: string) {
  document.cookie = `${encodeURIComponent(META_ADS_DATE_PRESET_COOKIE)}=${encodeURIComponent(value)}; path=/; max-age=${META_ADS_DATE_PRESET_COOKIE_MAX_AGE}; SameSite=Lax`;
}

const TH_STYLE: React.CSSProperties = {
  textAlign: "right",
  padding: "10px 12px",
  borderBottom: "2px solid #e5e7eb",
  background: "#f8fafc",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const TD_STYLE: React.CSSProperties = { padding: "10px 12px", fontSize: 13 };

export default function MetaAdsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsVm | null>(null);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);

  const [campaigns, setCampaigns] = useState<MetaAdsCampaignVm[]>([]);
  const [adSets, setAdSets] = useState<MetaAdSetVm[]>([]);
  const [ads, setAds] = useState<MetaAdVm[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");

  const [activeTab, setActiveTab] = useState<Tab>("campaigns");
  const [datePreset, setDatePreset] = useState("today");
  const [search, setSearch] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedAdSetId, setSelectedAdSetId] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<string[]>([]);
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);
  const [pendingBidCap, setPendingBidCap] = useState<{ campaignId: string; bidCapShekels: number } | null>(null);
  const [savingBidCapCampaignId, setSavingBidCapCampaignId] = useState<string | null>(null);
  const [togglePassword, setTogglePassword] = useState("");
  const [statusTogglePasswordInput, setStatusTogglePasswordInput] = useState("");
  const [resettingStatusPassword, setResettingStatusPassword] = useState(false);
  const [addAdTarget, setAddAdTarget] = useState<{ adSetId?: string; adSetName?: string } | null>(null);

  // Advanced / manual token section
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [appId, setAppId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("meta_connected") === "1") {
      setOkMsg("Meta Ads חובר בהצלחה! טוקן נשמר ל-60 יום.");
      window.history.replaceState({}, "", "/meta-ads");
    }
    const metaError = params.get("meta_error");
    if (metaError) {
      setErr(decodeURIComponent(metaError));
      window.history.replaceState({}, "", "/meta-ads");
    }
  }, []);

  useEffect(() => {
    const c = readCookie(META_ADS_DATE_PRESET_COOKIE)?.trim();
    if (c && DATE_PRESET_SET.has(c)) setDatePreset(c);
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/meta-ads/settings", { credentials: "include", cache: "no-store" });
    if (res.status === 401) {
      window.location.href = `/login?returnTo=${encodeURIComponent("/meta-ads")}`;
      return null;
    }
    const j = await parseJson<{ ok?: boolean; config?: SettingsVm; error?: string }>(res);
    if (!res.ok || !j.ok || !j.config) throw new Error(j.error || "טעינת הגדרות נכשלה");
    setSettings(j.config);
    setAdAccountId(j.config.adAccountId ?? "");
    setAppId(j.config.appId ?? "");
    setBusinessId(j.config.businessId ?? "");
    return j.config;
  }, []);

  const loadTokenStatus = useCallback(async () => {
    const res = await fetch("/api/meta-ads/status", { credentials: "include", cache: "no-store" });
    const j = await parseJson<{
      ok?: boolean;
      connected?: boolean;
      scopes?: string[];
      expiresAt?: string;
      error?: string | null;
    }>(res);
    if (res.ok && j.ok) {
      setTokenStatus({
        connected: j.connected ?? false,
        scopes: j.scopes ?? [],
        expiresAt: j.expiresAt ?? "",
        error: j.error ?? null,
      });
    }
  }, []);

  const loadData = useCallback(async (preset: string) => {
    const [cRes, sRes, aRes] = await Promise.all([
      fetch(`/api/meta-ads/campaigns?datePreset=${encodeURIComponent(preset)}`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/meta-ads/adsets?datePreset=${encodeURIComponent(preset)}`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/meta-ads/ads?datePreset=${encodeURIComponent(preset)}`, {
        credentials: "include",
        cache: "no-store",
      }),
    ]);

    const [cj, sj, aj] = await Promise.all([
      parseJson<{ ok?: boolean; campaigns?: MetaAdsCampaignVm[]; fetchedAt?: string; error?: string }>(cRes),
      parseJson<{ ok?: boolean; adSets?: MetaAdSetVm[]; error?: string }>(sRes),
      parseJson<{ ok?: boolean; ads?: MetaAdVm[]; error?: string }>(aRes),
    ]);

    const partialErrors: string[] = [];
    if (!cRes.ok || !cj.ok) {
      setCampaigns([]);
      setFetchedAt("");
    } else {
      setCampaigns(cj.campaigns ?? []);
      setFetchedAt(cj.fetchedAt ?? "");
    }
    if (!sRes.ok || !sj.ok) {
      setAdSets([]);
      partialErrors.push(sj.error || "טעינת סדרות מודעות נכשלה");
    } else {
      setAdSets(sj.adSets ?? []);
    }
    if (!aRes.ok || !aj.ok) {
      setAds([]);
      partialErrors.push(aj.error || "טעינת מודעות נכשלה");
    } else {
      setAds(aj.ads ?? []);
    }

    if (!cRes.ok || !cj.ok) {
      throw new Error(cj.error || "טעינת קמפיינים נכשלה");
    }
    if (partialErrors.length > 0) {
      setErr(partialErrors.join(" · "));
    } else {
      setErr(null);
    }
  }, []);

  const loadAll = useCallback(
    async (preset: string) => {
      setLoading(true);
      setErr(null);
      try {
        const cfg = await loadSettings();
        await loadTokenStatus();
        if (cfg?.adAccountId && cfg.hasToken) {
          await loadData(preset);
        } else {
          setCampaigns([]);
          setAdSets([]);
          setAds([]);
          setFetchedAt("");
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    },
    [loadData, loadSettings, loadTokenStatus]
  );

  useEffect(() => {
    void loadAll(datePreset);
  }, [datePreset, loadAll]);

  async function refresh() {
    setRefreshing(true);
    setErr(null);
    try {
      await loadData(datePreset);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "רענון נכשל");
    } finally {
      setRefreshing(false);
    }
  }

  async function saveAdAccountOnly() {
    if (!settings?.canManage) return;
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/meta-ads/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId }),
      });
      const j = await parseJson<{ ok?: boolean; config?: SettingsVm; error?: string }>(res);
      if (!res.ok || !j.ok || !j.config) throw new Error(j.error || "שמירה נכשלה");
      setSettings(j.config);
      setOkMsg("Ad Account ID נשמר.");
      if (j.config.hasToken) await loadData(datePreset);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function saveAdvanced() {
    if (!settings?.canManage) return;
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/meta-ads/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId,
          businessId,
          adAccountId,
          accessToken: accessToken.trim() || undefined,
        }),
      });
      const j = await parseJson<{ ok?: boolean; config?: SettingsVm; error?: string }>(res);
      if (!res.ok || !j.ok || !j.config) throw new Error(j.error || "שמירה נכשלה");
      setSettings(j.config);
      setAccessToken("");
      setOkMsg("הגדרות Meta Ads נשמרו.");
      await loadTokenStatus();
      await loadData(datePreset);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!settings?.canManage) return;
    setDisconnecting(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/meta-ads/disconnect", { method: "POST", credentials: "include" });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "ניתוק נכשל");
      setOkMsg("Meta Ads נותק.");
      setTokenStatus({ connected: false, scopes: [], expiresAt: "", error: null });
      setCampaigns([]);
      setAdSets([]);
      setAds([]);
      setFetchedAt("");
      const updated = await loadSettings();
      if (updated) setSettings(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ניתוק נכשל");
    } finally {
      setDisconnecting(false);
    }
  }

  async function toggleStatus(
    objectType: MetaObjectType,
    objectId: string,
    currentStatus: string,
    effectiveStatus: string,
    password: string
  ) {
    if (!settings?.canManage) return;
    const targetStatus = nextStatusFromCurrent(currentStatus, effectiveStatus);
    setErr(null);
    setOkMsg(null);
    setTogglingIds((prev) => (prev.includes(objectId) ? prev : [...prev, objectId]));
    try {
      const res = await fetch("/api/meta-ads/toggle-status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectType, objectId, status: targetStatus, password }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "שינוי סטטוס נכשל");

      if (objectType === "campaign") {
        setCampaigns((prev) =>
          prev.map((row) =>
            row.id === objectId ? { ...row, status: targetStatus, effectiveStatus: targetStatus } : row
          )
        );
      } else if (objectType === "adset") {
        setAdSets((prev) =>
          prev.map((row) =>
            row.id === objectId ? { ...row, status: targetStatus, effectiveStatus: targetStatus } : row
          )
        );
      } else {
        setAds((prev) =>
          prev.map((row) =>
            row.id === objectId ? { ...row, status: targetStatus, effectiveStatus: targetStatus } : row
          )
        );
      }
      setOkMsg(targetStatus === "ACTIVE" ? "הפריט הופעל בהצלחה." : "הפריט הושהה בהצלחה.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שינוי סטטוס נכשל");
    } finally {
      setTogglingIds((prev) => prev.filter((id) => id !== objectId));
    }
  }

  function askTogglePassword(
    objectType: MetaObjectType,
    objectId: string,
    currentStatus: string,
    effectiveStatus: string
  ) {
    if (!settings?.canManage) return;
    setErr(null);
    setOkMsg(null);
    setPendingToggle({ objectType, objectId, currentStatus, effectiveStatus });
    setTogglePassword("");
  }

  async function confirmToggleStatus() {
    if (!pendingToggle) return;
    if (!togglePassword.trim()) {
      setErr("יש להזין סיסמת אימות.");
      return;
    }
    const action = pendingToggle;
    setPendingToggle(null);
    await toggleStatus(
      action.objectType,
      action.objectId,
      action.currentStatus,
      action.effectiveStatus,
      togglePassword
    );
    setTogglePassword("");
  }

  function beginBidCapUpdate(campaignId: string, shekels: number) {
    if (!Number.isFinite(shekels) || shekels <= 0) {
      setErr("יש להזין סכום ביד-קאפ חיובי.");
      return;
    }
    setErr(null);
    setOkMsg(null);
    setPendingBidCap({ campaignId, bidCapShekels: shekels });
    setTogglePassword("");
  }

  async function confirmBidCap() {
    if (!pendingBidCap) return;
    if (!togglePassword.trim()) {
      setErr("יש להזין סיסמת אימות.");
      return;
    }
    const { campaignId, bidCapShekels } = pendingBidCap;
    setPendingBidCap(null);
    setErr(null);
    setOkMsg(null);
    setSavingBidCapCampaignId(campaignId);
    try {
      const res = await fetch(`/api/meta-ads/campaigns/${encodeURIComponent(campaignId)}/bid-cap`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bidCapShekels, password: togglePassword }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string; updated?: number }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "עדכון ביד-קאפ נכשל");
      setOkMsg(
        j.updated != null
          ? `ביד-קאפ עודכן ב-${j.updated} סדרות מודעות בקמפיין.`
          : "ביד-קאפ עודכן."
      );
      setTogglePassword("");
      await loadData(datePreset);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "עדכון ביד-קאפ נכשל");
      setTogglePassword("");
    } finally {
      setSavingBidCapCampaignId(null);
    }
  }

  async function saveStatusTogglePassword(resetToDefault: boolean) {
    if (!settings?.canManage) return;
    if (!resetToDefault && !statusTogglePasswordInput.trim()) {
      setErr("יש להזין סיסמה חדשה.");
      return;
    }
    setSaving(true);
    setResettingStatusPassword(resetToDefault);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/meta-ads/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adAccountId,
          statusTogglePassword: resetToDefault ? undefined : statusTogglePasswordInput.trim(),
          resetStatusTogglePassword: resetToDefault || undefined,
        }),
      });
      const j = await parseJson<{ ok?: boolean; config?: SettingsVm; error?: string }>(res);
      if (!res.ok || !j.ok || !j.config) throw new Error(j.error || "שמירת סיסמה נכשלה");
      setSettings(j.config);
      setStatusTogglePasswordInput("");
      setOkMsg(
        resetToDefault
          ? "סיסמת האימות אופסה לברירת מחדל (250599)."
          : "סיסמת האימות לפעולות סטטוס נשמרה."
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירת סיסמה נכשלה");
    } finally {
      setSaving(false);
      setResettingStatusPassword(false);
    }
  }

  const q = search.trim().toLowerCase();

  function activeFirst<T extends { effectiveStatus: string }>(arr: T[]): T[] {
    return [...arr].sort((a, b) => {
      const aActive = a.effectiveStatus === "ACTIVE" ? 0 : 1;
      const bActive = b.effectiveStatus === "ACTIVE" ? 0 : 1;
      return aActive - bActive;
    });
  }

  const filteredCampaigns = useMemo(
    () =>
      activeFirst(
        q
          ? campaigns.filter(
              (c) => c.name.toLowerCase().includes(q) || c.id.includes(q) || c.objective.toLowerCase().includes(q)
            )
          : campaigns
      ),
    [campaigns, q]
  );
  const filteredAdSets = useMemo(
    () =>
      activeFirst(
        (selectedCampaignId ? adSets.filter((s) => s.campaignId === selectedCampaignId) : adSets).filter(
          (s) =>
            !q ||
            s.name.toLowerCase().includes(q) ||
            s.id.includes(q) ||
            s.campaignName.toLowerCase().includes(q)
        )
      ),
    [adSets, q, selectedCampaignId]
  );
  const filteredAds = useMemo(
    () =>
      activeFirst(
        (selectedAdSetId
          ? ads.filter((a) => a.adSetId === selectedAdSetId)
          : selectedCampaignId
          ? ads.filter((a) => a.campaignId === selectedCampaignId)
          : ads
        ).filter(
          (a) =>
            !q ||
            a.name.toLowerCase().includes(q) ||
            a.id.includes(q) ||
            a.adSetName.toLowerCase().includes(q) ||
            a.campaignName.toLowerCase().includes(q)
        )
      ),
    [ads, q, selectedCampaignId, selectedAdSetId]
  );

  const daysLeft = tokenStatus?.expiresAt ? daysUntil(tokenStatus.expiresAt) : null;
  const tokenWarning = daysLeft !== null && daysLeft <= 14;

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: "campaigns", label: "קמפיינים", count: campaigns.length },
    { id: "adsets", label: "סדרות מודעות", count: adSets.length },
    { id: "ads", label: "מודעות", count: ads.length },
    { id: "create", label: "צור קמפיין + Canva", count: 0 },
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {err && (
        <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>
          {err}
        </div>
      )}
      {okMsg && (
        <div style={{ padding: 12, borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>
          {okMsg}
        </div>
      )}

      {/* ── Connection card ── */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>חיבור Meta Ads Manager</div>

        {!loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 10,
              background: tokenStatus?.connected ? (tokenWarning ? "#fffbeb" : "#ecfdf5") : "#f9fafb",
              border: `1px solid ${tokenStatus?.connected ? (tokenWarning ? "#fcd34d" : "#6ee7b7") : "#e5e7eb"}`,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: tokenStatus?.connected ? (tokenWarning ? "#f59e0b" : "#10b981") : "#d1d5db",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, fontSize: 13 }}>
              {tokenStatus?.connected ? (
                <>
                  <strong>מחובר</strong>
                  {tokenStatus.expiresAt && (
                    <span style={{ color: tokenWarning ? "#92400e" : "#6b7280" }}>
                      {" "}· פג תוקף{" "}
                      {daysLeft !== null && daysLeft > 0
                        ? `בעוד ${daysLeft} ימים (${formatIsraelDateTime(tokenStatus.expiresAt)})`
                        : "היום!"}
                    </span>
                  )}
                  {tokenStatus.expiresAt === "" && <span style={{ color: "#6b7280" }}> · System User Token (ללא פקיעה)</span>}
                  {tokenStatus.scopes.length > 0 && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }} dir="ltr">
                      {tokenStatus.scopes.join(" · ")}
                    </div>
                  )}
                </>
              ) : (
                <span style={{ color: "#6b7280" }}>
                  {tokenStatus?.error ? `שגיאה: ${tokenStatus.error}` : "לא מחובר"}
                </span>
              )}
            </div>
            {settings?.canManage && tokenStatus?.connected && (
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={disconnecting}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #fca5a5",
                  background: "#fff",
                  color: "#dc2626",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {disconnecting ? "מנתק..." : "נתק"}
              </button>
            )}
          </div>
        )}

        {settings?.canManage && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <a
              href="/api/meta-ads/connect"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "11px 20px",
                borderRadius: 10,
                background: "#1877f2",
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                textDecoration: "none",
                alignSelf: "start",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              {tokenStatus?.connected ? "חבר מחדש עם Meta" : "התחבר עם Meta"}
            </a>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
              הרשאות: ads_read · ads_management · business_management · טוקן תקף 60 יום
            </p>
          </div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ fontWeight: 700, fontSize: 14 }}>
            Ad Account ID <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              placeholder="מספר החשבון (עם act_ או בלי)"
              dir="ltr"
              disabled={loading || !settings?.canManage}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14 }}
            />
            {settings?.canManage && (
              <button
                type="button"
                onClick={() => void saveAdAccountOnly()}
                disabled={saving || loading || !adAccountId.trim()}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "#1d4ed8",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {saving ? "שומר..." : "שמור"}
              </button>
            )}
          </div>
        </div>

        {settings?.canManage && (
          <details
            open={showAdvanced}
            onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
          >
            <summary style={{ cursor: "pointer", fontSize: 13, color: "#6b7280", fontWeight: 600, userSelect: "none" }}>
              הגדרות מתקדמות — System User Token ידני
            </summary>
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <input
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="Meta App ID (אופציונלי)"
                dir="ltr"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <input
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                placeholder="Meta Business ID (אופציונלי)"
                dir="ltr"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <input
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Access Token ידני (ads_read)"
                dir="ltr"
                type="password"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              {settings?.hasToken && (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  טוקן שמור: {settings.tokenPreview}
                  {settings.updatedAt ? ` · עודכן ${formatIsraelDateTime(settings.updatedAt)}` : ""}
                </div>
              )}
              <div
                style={{
                  marginTop: 4,
                  paddingTop: 10,
                  borderTop: "1px dashed #e5e7eb",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800 }}>אימות הפעלה/כיבוי קמפיינים</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  סיסמה נוכחית: {settings?.statusTogglePasswordMasked || "••••••"} (מוסתרת)
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    value={statusTogglePasswordInput}
                    onChange={(e) => setStatusTogglePasswordInput(e.target.value)}
                    placeholder="סיסמה חדשה לאימות פעולה"
                    dir="ltr"
                    type="password"
                    style={{
                      flex: 1,
                      minWidth: 220,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void saveStatusTogglePassword(false)}
                    disabled={saving || !statusTogglePasswordInput.trim()}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: "#1d4ed8",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {saving && !resettingStatusPassword ? "שומר..." : "שמור סיסמה"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveStatusTogglePassword(true)}
                    disabled={saving}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {saving && resettingStatusPassword ? "מאפס..." : "איפוס לברירת מחדל"}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void saveAdvanced()}
                disabled={saving}
                style={{
                  justifySelf: "start",
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: "#374151",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {saving ? "שומר..." : "שמור הגדרות מתקדמות"}
              </button>
            </div>
          </details>
        )}
      </div>

      {/* ── Data section ── */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "2px solid #e5e7eb", padding: "0 16px" }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setActiveTab(tab.id); setSearch(""); setSelectedCampaignId(null); setSelectedAdSetId(null); }}
              style={{
                padding: "14px 18px",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #1d4ed8" : "2px solid transparent",
                marginBottom: -2,
                background: "transparent",
                fontWeight: activeTab === tab.id ? 900 : 600,
                fontSize: 14,
                color: activeTab === tab.id ? "#1d4ed8" : "#6b7280",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  style={{
                    background: activeTab === tab.id ? "#dbeafe" : "#f3f4f6",
                    color: activeTab === tab.id ? "#1d4ed8" : "#6b7280",
                    borderRadius: 999,
                    padding: "1px 7px",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filters bar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "12px 16px",
            borderBottom: "1px solid #f3f4f6",
          }}
        >
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {fetchedAt ? `עודכן: ${formatIsraelDateTime(fetchedAt)}` : "אין נתונים עדיין"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <select
              value={datePreset}
              onChange={(e) => {
                const v = e.target.value;
                setDatePreset(v);
                writeMetaAdsDatePresetCookie(v);
              }}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }}
            >
              {DATE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם / ID"
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, minWidth: 160 }}
            />
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing || loading}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {refreshing ? "מרענן..." : "רענן"}
            </button>
            {settings?.canManage && adSets.length > 0 && activeTab !== "create" && (
              <button
                type="button"
                onClick={() => setAddAdTarget({})}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#1d4ed8",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                + הוסף מודעה
              </button>
            )}
          </div>
        </div>

        {/* Breadcrumb */}
        {(selectedCampaignId || selectedAdSetId) && (
          <div style={{ padding: "6px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <button
              type="button"
              onClick={() => { setSelectedCampaignId(null); setSelectedAdSetId(null); setActiveTab("campaigns"); }}
              style={{ background: "none", border: "none", color: "#1d4ed8", cursor: "pointer", padding: 0, fontWeight: 700 }}
            >
              כל הקמפיינים
            </button>
            {selectedCampaignId && (
              <>
                <span style={{ color: "#9ca3af" }}>›</span>
                <button
                  type="button"
                  onClick={() => { setSelectedAdSetId(null); setActiveTab("adsets"); }}
                  style={{ background: "none", border: "none", color: selectedAdSetId ? "#1d4ed8" : "#374151", cursor: "pointer", padding: 0, fontWeight: 700 }}
                >
                  {campaigns.find((c) => c.id === selectedCampaignId)?.name ?? selectedCampaignId}
                </button>
              </>
            )}
            {selectedAdSetId && (
              <>
                <span style={{ color: "#9ca3af" }}>›</span>
                <span style={{ color: "#374151", fontWeight: 700 }}>
                  {adSets.find((s) => s.id === selectedAdSetId)?.name ?? selectedAdSetId}
                </span>
              </>
            )}
          </div>
        )}

        {/* Tables */}
        <div style={{ padding: 16 }}>
          {activeTab === "create" ? (
            <CreateCampaignClient />
          ) : loading ? (
            <div style={{ color: "#6b7280", padding: "20px 0" }}>טוען...</div>
          ) : activeTab === "campaigns" ? (
            <CampaignsTable
              rows={filteredCampaigns}
              adSets={adSets}
              selectedId={selectedCampaignId}
              canManage={Boolean(settings?.canManage)}
              togglingIds={togglingIds}
              savingBidCapCampaignId={savingBidCapCampaignId}
              onToggleStatus={(id, status, effectiveStatus) =>
                askTogglePassword("campaign", id, status, effectiveStatus)
              }
              onRequestBidCap={beginBidCapUpdate}
              onRowClick={(id) => { setSelectedCampaignId(id); setSelectedAdSetId(null); setActiveTab("adsets"); }}
            />
          ) : activeTab === "adsets" ? (
            <AdSetsTable
              rows={filteredAdSets}
              selectedId={selectedAdSetId}
              canManage={Boolean(settings?.canManage)}
              togglingIds={togglingIds}
              onToggleStatus={(id, status, effectiveStatus) =>
                askTogglePassword("adset", id, status, effectiveStatus)
              }
              onRowClick={(id) => { setSelectedAdSetId(id); setActiveTab("ads"); }}
              onAddAd={(id: string, name: string) => setAddAdTarget({ adSetId: id, adSetName: name })}
            />
          ) : (
            <AdsTable
              rows={filteredAds}
              canManage={Boolean(settings?.canManage)}
              togglingIds={togglingIds}
              onToggleStatus={(id, status, effectiveStatus) =>
                askTogglePassword("ad", id, status, effectiveStatus)
              }
            />
          )}
        </div>
      </div>
      {addAdTarget && (
        <AddAdModal
          adSetId={addAdTarget.adSetId}
          adSetName={addAdTarget.adSetName}
          campaigns={campaigns}
          adSets={adSets}
          onClose={() => setAddAdTarget(null)}
          onSuccess={() => {
            setOkMsg("המודעה נוצרה בהצלחה ב-Meta Ads Manager.");
            setAddAdTarget(null);
          }}
        />
      )}
      {(pendingToggle || pendingBidCap) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #e5e7eb",
              padding: 16,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 900 }}>
              {pendingBidCap ? "אימות עדכון ביד-קאפ" : "אימות פעולה"}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              {pendingBidCap
                ? "לשינוי ביד-קאפ בכל סדרות המודעות הרלוונטיות בקמפיין יש להזין את סיסמת האימות (אותה סיסמה כמו לכיבוי/הפעלה)."
                : "להזנת הפעלה/כיבוי יש להזין את סיסמת האימות."}
            </div>
            <input
              value={togglePassword}
              onChange={(e) => setTogglePassword(e.target.value)}
              placeholder="סיסמת אימות"
              type="password"
              dir="ltr"
              autoFocus
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setPendingToggle(null);
                  setPendingBidCap(null);
                  setTogglePassword("");
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => (pendingBidCap ? void confirmBidCap() : void confirmToggleStatus())}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#1d4ed8",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                אישור פעולה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleStatusButton({
  status,
  effectiveStatus,
  disabled,
  onClick,
}: {
  status: string;
  effectiveStatus: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const target = nextStatusFromCurrent(status, effectiveStatus);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        background: "#fff",
        color: target === "PAUSED" ? "#92400e" : "#166534",
        fontWeight: 700,
        fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {disabled ? "מעדכן..." : target === "PAUSED" ? "כבה" : "הפעל"}
    </button>
  );
}

// ── Campaigns Table ────────────────────────────────────────────────────────────

function CampaignBidCapCell({
  campaignId,
  adSets,
  canManage,
  onRequestUpdate,
  saving,
}: {
  campaignId: string;
  adSets: MetaAdSetVm[];
  canManage: boolean;
  onRequestUpdate: (cid: string, shekels: number) => void;
  saving: boolean;
}) {
  const { eligible, summary, defaultInput } = useMemo(() => {
    const sets = adSets.filter((s) => s.campaignId === campaignId);
    const eligible = sets.filter((s) =>
      metaAdSetEligibleForBidCap({
        bidStrategy: s.bidStrategy,
        bidAmountMinor: Math.round(s.bidAmount * 100),
      })
    );
    if (eligible.length === 0) {
      return { eligible: [] as MetaAdSetVm[], summary: "—", defaultInput: "" };
    }
    const amounts = eligible.map((s) => s.bidAmount);
    const first = amounts[0] ?? 0;
    const allSame = amounts.every((a) => Math.abs(a - first) < 0.0001);
    const summary = allSame ? money(first) : `שונות (${eligible.length})`;
    const defaultInput = String(allSame ? Math.round(first * 100) / 100 : Math.max(...amounts));
    return { eligible, summary, defaultInput };
  }, [adSets, campaignId]);

  const [val, setVal] = useState("");
  useEffect(() => {
    setVal(defaultInput);
  }, [defaultInput, campaignId]);

  if (eligible.length === 0) {
    return (
      <td
        style={TD_STYLE}
        title="מוצג כאשר יש לפחות סדרת מודעות עם ביד-קאפ / עלות יעד ב-Meta"
        onClick={(e) => e.stopPropagation()}
      >
        <span style={{ color: "#9ca3af" }}>—</span>
      </td>
    );
  }
  if (!canManage) {
    return (
      <td style={TD_STYLE} onClick={(e) => e.stopPropagation()}>
        {summary}
      </td>
    );
  }
  return (
    <td
      style={{ ...TD_STYLE, minWidth: 200, verticalAlign: "top" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 12, marginBottom: 4, color: "#374151" }}>{summary}</div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <input
          type="number"
          step={0.01}
          min={0.01}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={saving}
          dir="ltr"
          style={{ width: 88, padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            const n = parseFloat(String(val).replace(",", "."));
            onRequestUpdate(campaignId, n);
          }}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #1d4ed8",
            background: "#eff6ff",
            color: "#1d4ed8",
            fontWeight: 700,
            fontSize: 12,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "..." : "עדכן"}
        </button>
      </div>
    </td>
  );
}

function CampaignsTable({
  rows,
  adSets,
  selectedId,
  canManage,
  togglingIds,
  savingBidCapCampaignId,
  onRowClick,
  onToggleStatus,
  onRequestBidCap,
}: {
  rows: MetaAdsCampaignVm[];
  adSets: MetaAdSetVm[];
  selectedId?: string | null;
  canManage: boolean;
  togglingIds: string[];
  savingBidCapCampaignId?: string | null;
  onRowClick?: (id: string) => void;
  onToggleStatus?: (id: string, status: string, effectiveStatus: string) => void;
  onRequestBidCap?: (campaignId: string, shekels: number) => void;
}) {
  if (rows.length === 0)
    return <div style={{ color: "#6b7280" }}>אין קמפיינים להצגה. בדוק חיבור/הרשאות או שנה טווח זמן.</div>;
  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", minWidth: 1250, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["קמפיין", "סטטוס", "פעולה", "מטרה", "תוצאות", "עלות/תוצאה", "הוצאה", "חשיפות", "Reach", "קליקי קישור", "CTR (קישור)", "CPC (קישור)", "ביד-קאפ (סדרות)", "תקציב יומי", "תקציב כולל"].map((h) => (
              <th key={h} style={TH_STYLE}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr
              key={c.id}
              onClick={() => onRowClick?.(c.id)}
              style={{
                borderBottom: "1px solid #f3f4f6",
                background: selectedId === c.id ? "#eff6ff" : undefined,
                cursor: onRowClick ? "pointer" : undefined,
              }}
            >
              <td style={TD_STYLE}>
                <div style={{ fontWeight: 700, color: onRowClick ? "#1d4ed8" : undefined }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }} dir="ltr">{c.id}</div>
              </td>
              <td style={TD_STYLE}><StatusBadge status={c.effectiveStatus} /></td>
              <td style={TD_STYLE}>
                {canManage ? (
                  <ToggleStatusButton
                    status={c.status}
                    effectiveStatus={c.effectiveStatus}
                    disabled={togglingIds.includes(c.id)}
                    onClick={() => onToggleStatus?.(c.id, c.status, c.effectiveStatus)}
                  />
                ) : (
                  "—"
                )}
              </td>
              <td style={TD_STYLE}><span style={{ fontSize: 12, color: "#6b7280" }}>{c.objective || "—"}</span></td>
              <td style={{ ...TD_STYLE, fontWeight: 700, color: c.results > 0 ? "#1d4ed8" : undefined }}>{c.results > 0 ? intFmt(c.results) : "—"}</td>
              <td style={TD_STYLE}>{cpr(c.spend, c.results)}</td>
              <td style={{ ...TD_STYLE, fontWeight: 700 }}>{money(c.spend)}</td>
              <td style={TD_STYLE}>{intFmt(c.impressions)}</td>
              <td style={TD_STYLE}>{intFmt(c.reach)}</td>
              <td style={TD_STYLE}>{intFmt(c.clicks)}</td>
              <td style={TD_STYLE}>{c.ctr ? `${c.ctr.toFixed(2)}%` : "—"}</td>
              <td style={TD_STYLE}>{c.cpc ? money(c.cpc) : "—"}</td>
              <CampaignBidCapCell
                campaignId={c.id}
                adSets={adSets}
                canManage={canManage && Boolean(onRequestBidCap)}
                onRequestUpdate={(cid, n) => onRequestBidCap?.(cid, n)}
                saving={savingBidCapCampaignId === c.id}
              />
              <td style={TD_STYLE}>{c.dailyBudget ? money(c.dailyBudget) : "—"}</td>
              <td style={TD_STYLE}>{c.lifetimeBudget ? money(c.lifetimeBudget) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Ad Sets Table ─────────────────────────────────────────────────────────────

function AdSetsTable({
  rows,
  selectedId,
  canManage,
  togglingIds,
  onRowClick,
  onToggleStatus,
  onAddAd,
}: {
  rows: MetaAdSetVm[];
  selectedId?: string | null;
  canManage: boolean;
  togglingIds: string[];
  onRowClick?: (id: string) => void;
  onToggleStatus?: (id: string, status: string, effectiveStatus: string) => void;
  onAddAd?: (id: string, name: string) => void;
}) {
  if (rows.length === 0)
    return <div style={{ color: "#6b7280" }}>אין סדרות מודעות להצגה.</div>;
  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", minWidth: 1280, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["סדרת מודעות", "קמפיין", "סטטוס", "פעולה", "הוסף מודעה", "אופטימיזציה", "ביד-קאפ", "תוצאות", "עלות/תוצאה", "הוצאה", "חשיפות", "Reach", "קליקי קישור", "CTR (קישור)", "CPC (קישור)", "CPM", "תקציב"].map((h) => (
              <th key={h} style={TH_STYLE}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.id}
              onClick={() => onRowClick?.(s.id)}
              style={{
                borderBottom: "1px solid #f3f4f6",
                background: selectedId === s.id ? "#eff6ff" : undefined,
                cursor: onRowClick ? "pointer" : undefined,
              }}
            >
              <td style={TD_STYLE}>
                <div style={{ fontWeight: 700, color: onRowClick ? "#1d4ed8" : undefined }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }} dir="ltr">{s.id}</div>
              </td>
              <td style={{ ...TD_STYLE, fontSize: 12, color: "#6b7280", maxWidth: 160 }}>{s.campaignName || "—"}</td>
              <td style={TD_STYLE}><StatusBadge status={s.effectiveStatus} /></td>
              <td style={TD_STYLE}>
                {canManage ? (
                  <ToggleStatusButton
                    status={s.status}
                    effectiveStatus={s.effectiveStatus}
                    disabled={togglingIds.includes(s.id)}
                    onClick={() => onToggleStatus?.(s.id, s.status, s.effectiveStatus)}
                  />
                ) : (
                  "—"
                )}
              </td>
              <td style={TD_STYLE}>
                {canManage ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAddAd?.(s.id, s.name); }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #a5b4fc",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    + מודעה
                  </button>
                ) : (
                  "—"
                )}
              </td>
              <td style={{ ...TD_STYLE, fontSize: 12, color: "#6b7280" }}>{s.optimizationGoal || "—"}</td>
              <td
                style={TD_STYLE}
                title={
                  s.bidStrategy ? `אסטרטגיית מחיר: ${s.bidStrategy}` : undefined
                }
              >
                {s.bidAmount > 0 ? money(s.bidAmount) : "—"}
              </td>
              <td style={{ ...TD_STYLE, fontWeight: 700, color: s.results > 0 ? "#1d4ed8" : undefined }}>{s.results > 0 ? intFmt(s.results) : "—"}</td>
              <td style={TD_STYLE}>{cpr(s.spend, s.results)}</td>
              <td style={{ ...TD_STYLE, fontWeight: 700 }}>{money(s.spend)}</td>
              <td style={TD_STYLE}>{intFmt(s.impressions)}</td>
              <td style={TD_STYLE}>{intFmt(s.reach)}</td>
              <td style={TD_STYLE}>{intFmt(s.clicks)}</td>
              <td style={TD_STYLE}>{s.ctr ? `${s.ctr.toFixed(2)}%` : "—"}</td>
              <td style={TD_STYLE}>{s.cpc ? money(s.cpc) : "—"}</td>
              <td style={TD_STYLE}>{s.cpm ? money(s.cpm) : "—"}</td>
              <td style={TD_STYLE}>
                {s.dailyBudget ? money(s.dailyBudget) : s.lifetimeBudget ? money(s.lifetimeBudget) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Ads Table ─────────────────────────────────────────────────────────────────

function AdsTable({
  rows,
  canManage,
  togglingIds,
  onToggleStatus,
}: {
  rows: MetaAdVm[];
  canManage: boolean;
  togglingIds: string[];
  onToggleStatus?: (id: string, status: string, effectiveStatus: string) => void;
}) {
  if (rows.length === 0)
    return <div style={{ color: "#6b7280" }}>אין מודעות להצגה.</div>;
  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["מודעה", "סדרת מודעות", "קמפיין", "סטטוס", "פעולה", "תוצאות", "עלות/תוצאה", "הוצאה", "חשיפות", "Reach", "קליקי קישור", "CTR (קישור)", "CPC (קישור)"].map((h) => (
              <th key={h} style={TH_STYLE}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={TD_STYLE}>
                <div style={{ fontWeight: 700 }}>{a.name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }} dir="ltr">{a.id}</div>
              </td>
              <td style={{ ...TD_STYLE, fontSize: 12, color: "#6b7280", maxWidth: 140 }}>{a.adSetName || "—"}</td>
              <td style={{ ...TD_STYLE, fontSize: 12, color: "#6b7280", maxWidth: 140 }}>{a.campaignName || "—"}</td>
              <td style={TD_STYLE}><StatusBadge status={a.effectiveStatus} /></td>
              <td style={TD_STYLE}>
                {canManage ? (
                  <ToggleStatusButton
                    status={a.status}
                    effectiveStatus={a.effectiveStatus}
                    disabled={togglingIds.includes(a.id)}
                    onClick={() => onToggleStatus?.(a.id, a.status, a.effectiveStatus)}
                  />
                ) : (
                  "—"
                )}
              </td>
              <td style={{ ...TD_STYLE, fontWeight: 700, color: a.results > 0 ? "#1d4ed8" : undefined }}>{a.results > 0 ? intFmt(a.results) : "—"}</td>
              <td style={TD_STYLE}>{cpr(a.spend, a.results)}</td>
              <td style={{ ...TD_STYLE, fontWeight: 700 }}>{money(a.spend)}</td>
              <td style={TD_STYLE}>{intFmt(a.impressions)}</td>
              <td style={TD_STYLE}>{intFmt(a.reach)}</td>
              <td style={TD_STYLE}>{intFmt(a.clicks)}</td>
              <td style={TD_STYLE}>{a.ctr ? `${a.ctr.toFixed(2)}%` : "—"}</td>
              <td style={TD_STYLE}>{a.cpc ? money(a.cpc) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
