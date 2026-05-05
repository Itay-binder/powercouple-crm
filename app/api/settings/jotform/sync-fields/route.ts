import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { upsertCustomField, type CustomFieldType } from "@/lib/customFields/repo";
import { fetchJotformQuestions } from "@/lib/jotform/client";
import { getJotformConfig, saveJotformConfig, type JotformFieldMapping } from "@/lib/jotform/configRepo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

function mapQuestionToFieldType(qType: string): CustomFieldType {
  const t = qType.toLowerCase();
  if (t.includes("email")) return "email";
  if (t.includes("phone")) return "phone";
  if (t.includes("number") || t.includes("money")) return "number";
  if (t.includes("date") || t.includes("datetime")) return "date";
  if (t.includes("checkbox") || t.includes("dropdown") || t.includes("radio")) return "select";
  return "text";
}

function normalizeBaseLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().slice(0, 120);
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canManage(auth.user)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  try {
    const cfg = await getJotformConfig();
    if (!cfg.apiKey?.trim()) throw new Error("חסר Jotform API key");
    if (!cfg.formId?.trim()) throw new Error("חסר formId לשאלון");

    const questions = await fetchJotformQuestions(cfg.apiKey, cfg.formId);
    const mappings: JotformFieldMapping[] = [];
    for (const q of questions) {
      const label = normalizeBaseLabel(q.text);
      if (!label || label === "uid") continue;
      const qid = q.id.trim();
      const qType = q.type.trim();
      const isFile = qType.toLowerCase().includes("fileupload");
      const type = isFile ? "text" : mapQuestionToFieldType(qType);
      const contactFieldId = `contact_jf_${cfg.formId}_${qid}`;
      const opportunityFieldId = `opportunity_jf_${cfg.formId}_${qid}`;

      await upsertCustomField({
        entityType: "contact",
        fieldId: contactFieldId,
        label: `Jotform: ${label}`,
        type,
        options: q.options,
        isRequired: false,
        isActive: true,
      });
      await upsertCustomField({
        entityType: "opportunity",
        fieldId: opportunityFieldId,
        label: `Jotform: ${label}`,
        type,
        options: q.options,
        isRequired: false,
        isActive: true,
      });

      mappings.push({
        questionId: qid,
        label,
        questionType: qType,
        contactFieldId,
        opportunityFieldId,
        isFile,
      });
    }
    const next = await saveJotformConfig({ mappings });
    return NextResponse.json({ ok: true, mappingsCount: next.mappings.length });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}

