import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import { getMetaAdsConfig } from "@/lib/metaAds/repo";
import { normalizeAdAccountId } from "@/lib/metaAds/repo";

export const dynamic = "force-dynamic";

// Vercel serverless body limit is 4.5MB; images fine, short videos fine
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4MB guard

function graphBaseUrl(): string {
  return (process.env.META_GRAPH_API_BASE?.trim() || "https://graph.facebook.com/v22.0").replace(/\/$/, "");
}

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canManage(auth.user))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "קובץ לא הועבר" }, { status: 400 });
  }

  const mime = file.type.toLowerCase();
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");

  if (!isImage && !isVideo) {
    return NextResponse.json(
      { ok: false, error: "סוג קובץ לא נתמך. העלה JPG, PNG, GIF, MP4, MOV" },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: `הקובץ גדול מדי (מקסימום 4MB). לסרטונים גדולים העלה ישירות ב-Meta Ads Manager.` },
      { status: 413 }
    );
  }

  try {
    const db = await getAdminDb();
    const config = await getMetaAdsConfig(db);
    if (!config?.adAccountId || !config.accessToken) {
      return NextResponse.json(
        { ok: false, error: "חסרה הגדרת Meta Ads (Ad Account / Access Token)." },
        { status: 400 }
      );
    }

    const adAccountId = normalizeAdAccountId(config.adAccountId);
    const base = graphBaseUrl();

    if (isImage) {
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const metaForm = new FormData();
      metaForm.append("bytes", base64);
      metaForm.append("access_token", config.accessToken);

      const res = await fetch(`${base}/act_${adAccountId}/adimages`, {
        method: "POST",
        body: metaForm,
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        images?: Record<string, { hash?: string }>;
        error?: { message?: string; error_user_msg?: string };
      };
      if (!res.ok) {
        const msg = json.error?.error_user_msg ?? json.error?.message ?? `Meta API error (${res.status})`;
        throw new Error(msg);
      }
      const hash = Object.values(json.images ?? {})[0]?.hash;
      if (!hash) throw new Error("Meta לא החזיר hash לתמונה");
      return NextResponse.json({ ok: true, type: "image", imageHash: hash });
    } else {
      // Video — upload as multipart to Meta
      const metaForm = new FormData();
      metaForm.append(
        "source",
        new Blob([arrayBuffer], { type: mime }),
        file.name || "video.mp4"
      );
      metaForm.append("access_token", config.accessToken);

      const res = await fetch(`${base}/act_${adAccountId}/advideos`, {
        method: "POST",
        body: metaForm,
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string; error_user_msg?: string };
      };
      if (!res.ok || !json.id) {
        const msg = json.error?.error_user_msg ?? json.error?.message ?? `Meta API error (${res.status})`;
        throw new Error(msg);
      }
      return NextResponse.json({ ok: true, type: "video", videoId: json.id });
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "העלאה נכשלה" },
      { status: 500 }
    );
  }
}
