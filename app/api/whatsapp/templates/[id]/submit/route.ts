import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getWhatsAppMetaConfig,
  listWhatsAppTemplates,
  patchWhatsAppTemplateMeta,
} from "@/lib/whatsapp/repo";
import { submitTemplateToMeta } from "@/lib/whatsapp/meta";

export const dynamic = "force-dynamic";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const templateId = id?.trim();
  if (!templateId) {
    return NextResponse.json({ ok: false, error: "Invalid template id" }, { status: 400 });
  }
  try {
    const db = await getAdminDb();
    const [config, templates] = await Promise.all([
      getWhatsAppMetaConfig(db),
      listWhatsAppTemplates(db),
    ]);
    if (!config) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "לא הוגדרו הגדרות Meta. פתחו «חשבון WhatsApp», מלאו WABA ID ומזהה מספר טלפון (Phone Number ID), הדביקו System User Access Token ושמרו.",
        },
        { status: 400 }
      );
    }
    if (!config.wabaId.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "חסר WhatsApp Business Account ID (WABA). הזינו אותו ב«חשבון WhatsApp» ושמרו.",
        },
        { status: 400 }
      );
    }
    if (!config.systemUserToken.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "חסר System User Access Token — בלי טוקן אי אפשר לשלוח תבנית לאישור Meta. הדביקו טוקן בשדה המתאים ב«חשבון WhatsApp», שמרו (השדה לא יישאר ריק בפעם הראשונה), ואז נסו שוב «שלח לאישור במטא».",
        },
        { status: 400 }
      );
    }
    const template = templates.find((t) => t.id === templateId);
    if (!template) {
      return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
    }
    const metaRes = await submitTemplateToMeta(config, template);
    const patched = await patchWhatsAppTemplateMeta(db, templateId, {
      status: "submitted",
      metaTemplateId: metaRes.id,
      metaStatus: metaRes.status ?? "PENDING",
      rejectionReason: undefined,
    });
    return NextResponse.json({ ok: true, template: patched, meta: metaRes });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    try {
      const db = await getAdminDb();
      await patchWhatsAppTemplateMeta(db, templateId, {
        // כשל טכני בשליחה לאישור אינו דחייה של Meta עצמה.
        metaStatus: "SUBMIT_FAILED",
        rejectionReason: message,
      });
    } catch {
      // ignore patch errors to avoid masking root cause
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
