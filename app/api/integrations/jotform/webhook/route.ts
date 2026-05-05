import { NextRequest, NextResponse } from "next/server";
import { appendLeadNote, listLeadsFiltered, normalizePhone, upsertLead } from "@/lib/leads/repo";
import {
  createOpportunity,
  getPayingCustomersPipelineId,
  getPipelineById,
  listOpportunities,
  updateOpportunity,
} from "@/lib/opportunities/repo";
import { validateCustomValues } from "@/lib/customFields/repo";
import {
  createDriveFolderAndUploadFiles,
  fetchSubmissionAnswers,
} from "@/lib/jotform/client";
import { getJotformConfig } from "@/lib/jotform/configRepo";
import { upsertJotformSubmission } from "@/lib/jotform/submissionsRepo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Answer = {
  questionId: string;
  label: string;
  type: string;
  value: string;
  fileUrls: string[];
};

function pickAnswer(answers: Answer[], keywords: string[]): string {
  const lower = keywords.map((k) => k.toLowerCase());
  const a = answers.find((x) => {
    const label = x.label.toLowerCase();
    if (label.includes("בן/בת זוג") || label.includes("בן / בת זוג")) return false;
    return lower.some((k) => label.includes(k));
  });
  return a?.value?.trim() || "";
}

function inferName(answers: Answer[]): string {
  return pickAnswer(answers, ["שם מלא", "full name", "name"]) || "לקוח חדש";
}
function inferEmail(answers: Answer[]): string {
  return pickAnswer(answers, ["מייל", "email"]);
}
function inferPhone(answers: Answer[]): string {
  return pickAnswer(answers, ["טלפון", "phone", "mobile"]);
}

function answerMapForCustom(
  answers: Answer[],
  mappings: Array<{ questionId: string; contactFieldId: string; opportunityFieldId: string }>
): { contactValues: Record<string, unknown>; opportunityValues: Record<string, unknown> } {
  const byQ = new Map(answers.map((a) => [a.questionId, a]));
  const contactValues: Record<string, unknown> = {};
  const opportunityValues: Record<string, unknown> = {};
  for (const m of mappings) {
    const a = byQ.get(m.questionId);
    if (!a) continue;
    const value = a.value?.trim() || (a.fileUrls.length ? a.fileUrls.join(", ") : "");
    if (!value) continue;
    contactValues[m.contactFieldId] = value;
    opportunityValues[m.opportunityFieldId] = value;
  }
  return { contactValues, opportunityValues };
}

async function findContactIdByPhoneOrName(phone: string, name: string): Promise<string | null> {
  const leads = await listLeadsFiltered();
  const p = normalizePhone(phone);
  if (p) {
    const byPhone = leads.find((l) => normalizePhone(l.phone) === p);
    if (byPhone) return byPhone.id;
  }
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const byName = leads.find((l) => String(l.name ?? "").trim().toLowerCase() === n);
  return byName?.id ?? null;
}

async function ensureOpportunityForContact(contactId: string, customValues: Record<string, unknown>) {
  const allOpps = await listOpportunities();
  const existing = allOpps.find((o) => o.contactId === contactId);
  if (existing) {
    const validated = await validateCustomValues("opportunity", customValues, {
      pipelineId: existing.pipelineId || null,
      previousValues: existing.customValues,
    });
    await updateOpportunity(existing.id, { customValues: validated });
    return existing.id;
  }
  const pipelineId = await getPayingCustomersPipelineId();
  const p = await getPipelineById(pipelineId);
  const stage = p?.stages?.[0] || "חדש";
  const validated = await validateCustomValues("opportunity", customValues, {
    pipelineId,
  });
  const created = await createOpportunity({
    contactId,
    pipelineId,
    stage,
    name: "ליד Jotform",
    customValues: validated,
  });
  return created.id;
}

export async function POST(req: NextRequest) {
  try {
    const cfg = await getJotformConfig();
    if (!cfg.enabled) return NextResponse.json({ ok: true, ignored: "disabled" });
    const token = req.nextUrl.searchParams.get("token")?.trim() || "";
    if (!cfg.webhookToken?.trim() || token !== cfg.webhookToken.trim()) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const submissionId =
      String(body.submissionID ?? body.submission_id ?? "").trim();
    if (!submissionId) {
      return NextResponse.json({ ok: false, error: "submissionID is required" }, { status: 400 });
    }
    if (!cfg.apiKey?.trim()) {
      return NextResponse.json({ ok: false, error: "Jotform API key is missing" }, { status: 400 });
    }

    const answers = await fetchSubmissionAnswers(cfg.apiKey, submissionId);
    const submittedAt =
      String(body.created_at ?? body.createdAt ?? "").trim() || new Date().toISOString();
    const name = inferName(answers);
    const email = inferEmail(answers);
    const phone = inferPhone(answers);
    const existingId = await findContactIdByPhoneOrName(phone, name);
    const { contactValues, opportunityValues } = answerMapForCustom(answers, cfg.mappings);

    const lead = await upsertLead({
      id: existingId ?? undefined,
      name,
      email,
      phone,
      source: "jotform",
      status: "פתוח",
      customFields: await validateCustomValues("contact", contactValues, {
        previousValues: undefined,
      }),
    });

    let folderUrl = "";
    const fileAnswers = answers.filter((a) => a.fileUrls.length > 0);
    if (cfg.driveParentFolderId?.trim() && fileAnswers.length > 0) {
      const files = fileAnswers.flatMap((a) =>
        a.fileUrls.map((u, i) => ({ url: u, nameHint: `${a.label}-${i + 1}` }))
      );
      const drive = await createDriveFolderAndUploadFiles({
        parentFolderId: cfg.driveParentFolderId,
        folderName: name || lead.name || lead.id,
        files,
      });
      folderUrl = drive.folderUrl;
    }

    const opportunityId = await ensureOpportunityForContact(lead.id, opportunityValues);
    await upsertJotformSubmission({
      submissionId,
      formId: cfg.formId || "",
      contactId: lead.id,
      opportunityId,
      customerName: name || lead.name || "",
      customerPhone: phone || lead.phone || "",
      customerEmail: email || lead.email || "",
      driveFolderUrl: folderUrl || undefined,
      answers,
      files: fileAnswers.flatMap((a) => a.fileUrls.map((url) => ({ label: a.label, url }))),
      submittedAt,
    });
    await appendLeadNote(lead.id, {
      text: `נקלט שאלון Jotform (${cfg.formId ?? ""})${folderUrl ? `\nתיקיית מסמכים: ${folderUrl}` : ""}`,
      createdBy: "Jotform",
      category: "פניות",
    });

    return NextResponse.json({
      ok: true,
      contactId: lead.id,
      opportunityId,
      driveFolderUrl: folderUrl || undefined,
      answersCount: answers.length,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

