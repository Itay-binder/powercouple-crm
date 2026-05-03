import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertPhoneNumberBelongsToWaba, listTemplatesFromMeta } from "@/lib/whatsapp/meta";
import {
  getWhatsAppMetaConfig,
  listWhatsAppTemplates,
  patchWhatsAppTemplateMeta,
  saveWhatsAppTemplate,
} from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const db = await getAdminDb();
    const config = await getWhatsAppMetaConfig(db);
    if (!config) {
      return NextResponse.json(
        { ok: false, error: "הגדרות Meta חסרות. הגדירו קודם חשבון WhatsApp." },
        { status: 400 }
      );
    }
    if (!config.wabaId.trim() || !config.phoneNumberId.trim() || !config.systemUserToken.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "חסרים WABA / Phone Number ID / Token. השלימו ב«חשבון WhatsApp» ושמרו.",
        },
        { status: 400 }
      );
    }

    await assertPhoneNumberBelongsToWaba(config);

    const [metaTemplates, localTemplates] = await Promise.all([
      listTemplatesFromMeta(config),
      listWhatsAppTemplates(db),
    ]);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const mt of metaTemplates) {
      const existing = localTemplates.find(
        (t) =>
          (t.metaTemplateId && t.metaTemplateId === mt.metaTemplateId) ||
          (t.name === mt.name && t.language === mt.language)
      );
      const id = existing?.id ?? `meta_${mt.metaTemplateId}`;
      const bodyText = mt.bodyText.trim();
      if (!bodyText) {
        skipped += 1;
        continue;
      }
      const saved = await saveWhatsAppTemplate(db, {
        id,
        name: mt.name,
        category: mt.category,
        language: mt.language,
        bodyText,
        exampleValues: mt.exampleValues,
        headerFormat: mt.headerFormat,
        headerText: mt.headerText,
        footerText: mt.footerText,
        buttonRows: mt.buttonRows,
        parameterSources: undefined,
        status: mt.status,
      });
      await patchWhatsAppTemplateMeta(db, saved.id, {
        status: mt.status,
        metaTemplateId: mt.metaTemplateId,
        metaStatus: mt.metaStatus,
        rejectionReason: mt.status === "rejected" ? mt.rejectionReason ?? "נדחה במטא" : undefined,
      });
      if (existing) updated += 1;
      else created += 1;
    }

    const templates = await listWhatsAppTemplates(db);
    return NextResponse.json({
      ok: true,
      created,
      updated,
      skipped,
      totalMeta: metaTemplates.length,
      templates,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}

