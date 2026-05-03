import type { Firestore } from "firebase-admin/firestore";
import { getCanvaConfig, saveCanvaConfig } from "@/lib/canva/repo";

const CANVA_API_BASE = "https://api.canva.com/rest/v1";

export type CanvaDesign = {
  id: string;
  title: string;
  thumbnailUrl: string;
  updatedAt: string;
};

type CanvaApiError = { code?: string; message?: string };

async function callCanva<T>(token: string, path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${CANVA_API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: CanvaApiError };
  if (!res.ok) {
    throw new Error((json as { error?: CanvaApiError }).error?.message ?? `Canva API error (${res.status})`);
  }
  return json;
}

export async function listCanvaDesigns(
  accessToken: string,
  continuation?: string
): Promise<{ designs: CanvaDesign[]; continuation?: string }> {
  const params = new URLSearchParams({ ownership: "owned", page_size: "50" });
  if (continuation) params.set("continuation", continuation);
  const json = await callCanva<{
    items?: Array<{ id?: string; title?: string; thumbnail?: { url?: string }; updated_at?: number }>;
    continuation?: string;
  }>(accessToken, `/designs?${params.toString()}`);

  const designs: CanvaDesign[] = (json.items ?? [])
    .filter((item) => item.id)
    .map((item) => ({
      id: item.id!,
      title: (item.title ?? "").trim() || "ללא שם",
      thumbnailUrl: item.thumbnail?.url?.trim() ?? "",
      updatedAt: item.updated_at ? new Date(item.updated_at * 1000).toISOString() : "",
    }));
  return { designs, continuation: json.continuation };
}

export async function startCanvaExport(accessToken: string, designId: string): Promise<string> {
  const res = await fetch(`${CANVA_API_BASE}/exports`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ design_id: designId, format: "PNG", export_quality: "pro" }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    job?: { id?: string; status?: string };
    error?: CanvaApiError;
  };
  if (!res.ok || !json.job?.id) {
    throw new Error(json.error?.message ?? `Export start failed (${res.status})`);
  }
  return json.job.id;
}

export async function getCanvaExport(
  accessToken: string,
  exportJobId: string
): Promise<{ status: "in_progress" | "success" | "failed"; url?: string }> {
  const json = await callCanva<{ job?: { status?: string; urls?: string[] } }>(
    accessToken,
    `/exports/${exportJobId}`
  );
  if (json.job?.status === "success" && json.job.urls?.[0]) {
    return { status: "success", url: json.job.urls[0] };
  }
  if (json.job?.status === "failed") return { status: "failed" };
  return { status: "in_progress" };
}

export async function refreshCanvaToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}> {
  const clientId = process.env.CANVA_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.CANVA_CLIENT_SECRET?.trim() ?? "";
  const res = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error ?? `Canva token refresh failed (${res.status})`);
  }
  const expiresInSec = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
  };
}

export async function getValidCanvaToken(db: Firestore): Promise<string | null> {
  const config = await getCanvaConfig(db);
  if (!config?.accessToken) return null;

  const expiresAt = config.expiresAt ? new Date(config.expiresAt).getTime() : 0;
  const bufferMs = 5 * 60 * 1000; // refresh 5 minutes before expiry
  if (Date.now() + bufferMs < expiresAt) return config.accessToken;

  if (!config.refreshToken) return null;
  try {
    const refreshed = await refreshCanvaToken(config.refreshToken);
    await saveCanvaConfig(db, refreshed);
    return refreshed.accessToken;
  } catch {
    return null;
  }
}