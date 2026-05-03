import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { listLabels } from "@/lib/labels/repo";
import {
  getLeadWhatsAppMarketingApprovalByPhone,
  getLeadById,
  listLeadsFiltered,
  normalizePhone,
} from "@/lib/leads/repo";
import type { AudienceCondition, AudienceLogic } from "@/lib/whatsapp/audienceFilter";
import { filterLeadsByAudience } from "@/lib/whatsapp/audienceFilter";
import { assertPhoneNumberBelongsToWaba, sendTemplateMessageViaMeta } from "@/lib/whatsapp/meta";
import { buildTemplateParametersForLead } from "@/lib/whatsapp/templateParams";
import {
  appendWhatsAppCampaign,
  appendWhatsAppChatMessage,
  getWhatsAppMetaConfig,
  listWhatsAppBroadcastDrafts,
  listWhatsAppCampaigns,
  listWhatsAppTemplates,
  type WhatsAppCampaignDispatch,
} from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 500;

async function normalizeTagConditions(
  conditions: AudienceCondition[]
): Promise<AudienceCondition[]> {
  if (!conditions.some((c) => c.field === "tag" && c.value.trim())) return conditions;
  const labels = await listLabels();
  const ids = new Set(labels.map((l) => l.id));
  const byName = new Map(labels.map((l) => [l.name.trim().toLowerCase(), l.id]));
  return conditions.map((c) => {
    if (c.field !== "tag") return c;
    const raw = c.value.trim();
    if (!raw) return c;
    if (ids.has(raw)) return c;
    const mapped = byName.get(raw.toLowerCase());
    return mapped ? { ...c, value: mapped } : c;
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const campaigns = await listWhatsAppCampaigns(db);
    return NextResponse.json({ ok: true, campaigns });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    broadcastName?: string;
    templateId?: string;
    /** אם הוגדר קהל בתנאים — מצמצם לרשימה זו (צ'קבוקסים) */
    recipientIds?: string[];
    /**
     * מזהי אנשי קשר שלא פעילים לדיוור — שליחה חד-פעמית בלבד (אחרי אישור כפול ב-UI).
     * לא מעדכן את שדה האישור ב-CRM; חייב להתאים ללידים שבאמת !isLeadWhatsAppMarketingApproved.
     */
    oneTimeMarketingOverrideIds?: string[];
    parameterValues?: string[];
    conditions?: AudienceCondition[];
    logic?: AudienceLogic;
    draftId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const draftId = body.draftId?.trim() ?? "";
  let templateId = body.templateId?.trim() ?? "";
  let parameterValues = Array.isArray(body.parameterValues)
    ? body.parameterValues.map((x) => String(x ?? "").trim())
    : [];
  let broadcastName = body.broadcastName?.trim() ?? "";
  let recipientIds: string[] = [];

  try {
    const db = await getAdminDb();

    let useAudienceFilter = false;
    let audienceConditions: AudienceCondition[] = [];
    let audienceLogic: AudienceLogic = "and";

    if (draftId) {
      const drafts = await listWhatsAppBroadcastDrafts(db);
      const draft = drafts.find((d) => d.id === draftId);
      if (!draft) {
        return NextResponse.json({ ok: false, error: "Draft not found" }, { status: 404 });
      }
      templateId = draft.templateId;
      parameterValues = draft.parameterValues;
      if (!broadcastName) broadcastName = draft.name;
      useAudienceFilter = true;
      // תצוגת הקהל במסך משתמשת במצב הנוכחי; אם לא ממזגים כאן, שליחה עם draftId
      // הייתה מתעלמת מתנאים שעודכנו בממשק בלי «שמור טיוטה» — ואז recipientIds יתרוקנו.
      if (Array.isArray(body.conditions)) {
        audienceConditions = await normalizeTagConditions(body.conditions);
        audienceLogic = body.logic === "or" ? "or" : "and";
      } else {
        audienceConditions = await normalizeTagConditions(draft.conditions);
        audienceLogic = draft.logic;
      }
    } else if (body.conditions !== undefined) {
      useAudienceFilter = true;
      audienceConditions = Array.isArray(body.conditions)
        ? await normalizeTagConditions(body.conditions)
        : [];
      audienceLogic = body.logic === "or" ? "or" : "and";
    }

    const selectedRaw = Array.isArray(body.recipientIds)
      ? Array.from(new Set(body.recipientIds.map((x) => String(x).trim()).filter(Boolean)))
      : [];
    const oneTimeOverrideRaw = Array.isArray(body.oneTimeMarketingOverrideIds)
      ? Array.from(new Set(body.oneTimeMarketingOverrideIds.map((x) => String(x).trim()).filter(Boolean)))
      : [];
    const oneTimeOverrideSet = new Set(oneTimeOverrideRaw);

    if (useAudienceFilter) {
      const leads = await listLeadsFiltered(null, null);
      const matched = filterLeadsByAudience(leads, audienceConditions, audienceLogic);
      const matchedIds = matched.map((l) => l.id);
      recipientIds =
        selectedRaw.length > 0 ? matchedIds.filter((id) => selectedRaw.includes(id)) : matchedIds;
    } else {
      recipientIds = selectedRaw;
    }

    recipientIds = recipientIds.slice(0, MAX_RECIPIENTS);

    for (const oid of oneTimeOverrideRaw) {
      if (!recipientIds.includes(oid)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "רשימת oneTimeMarketingOverrideIds חייבת להיות תת-קבוצה של הנמענים שנבחרו לשליחה.",
          },
          { status: 400 }
        );
      }
    }

    if (!templateId) {
      return NextResponse.json({ ok: false, error: "templateId is required" }, { status: 400 });
    }
    if (recipientIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No recipients match (empty list or filters)." },
        { status: 400 }
      );
    }
    if (recipientIds.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        { ok: false, error: `For safety, one campaign is limited to ${MAX_RECIPIENTS} recipients.` },
        { status: 400 }
      );
    }

    const [config, templates] = await Promise.all([
      getWhatsAppMetaConfig(db),
      listWhatsAppTemplates(db),
    ]);
    if (!config) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "לא הוגדרו הגדרות Meta. מלאו ב«חשבון WhatsApp»: Phone Number ID, WABA, וטוקן — ושמרו.",
        },
        { status: 400 }
      );
    }
    if (!config.phoneNumberId.trim()) {
      return NextResponse.json(
        { ok: false, error: "חסר Phone Number ID (מזהה מספר השולח). הזינו ב«חשבון WhatsApp» ושמרו." },
        { status: 400 }
      );
    }
    if (!config.systemUserToken.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "חסר System User Access Token. הדביקו טוקן ב«חשבון WhatsApp» ושמרו — נדרש לשליחת הודעות.",
        },
        { status: 400 }
      );
    }
    if (!config.wabaId.trim()) {
      return NextResponse.json(
        { ok: false, error: "חסר WABA ID (חשבון WhatsApp Business). הזינו ב«חשבון WhatsApp» ושמרו." },
        { status: 400 }
      );
    }
    await assertPhoneNumberBelongsToWaba(config);
    const template = templates.find((t) => t.id === templateId);
    if (!template) {
      return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
    }

    const dispatches: WhatsAppCampaignDispatch[] = [];
    for (const id of recipientIds) {
      const lead = await getLeadById(id);
      if (!lead) {
        dispatches.push({
          contactId: id,
          contactName: id,
          to: "",
          status: "failed",
          error: "Contact not found",
        });
        continue;
      }
      const normalized = normalizePhone(lead.phone);
      if (!normalized) {
        dispatches.push({
          contactId: lead.id,
          contactName: lead.name || lead.email || lead.id,
          to: lead.phone || "",
          status: "failed",
          error: "Contact has no valid WhatsApp number",
        });
        continue;
      }
      const marketingState = await getLeadWhatsAppMarketingApprovalByPhone(normalized, db);
      const marketingOk = marketingState.approved;
      const allowOneTimeInactive = !marketingOk && oneTimeOverrideSet.has(lead.id);
      if (!marketingOk && !allowOneTimeInactive) {
        dispatches.push({
          contactId: lead.id,
          contactName: lead.name || lead.email || lead.id,
          to: normalized,
          status: "failed",
          error: "Contact is inactive for WhatsApp marketing",
        });
        continue;
      }
      try {
        const paramValuesForLead = buildTemplateParametersForLead(lead, template, parameterValues);
        const sent = await sendTemplateMessageViaMeta(config, {
          to: normalized,
          template,
          bodyParameterValues: paramValuesForLead,
        });
        const previewText = template.bodyText
          .replace(/\{\{(\d+)\}\}/g, (_, raw) => {
            const idx = Number.parseInt(String(raw), 10) - 1;
            return idx >= 0 ? String(paramValuesForLead[idx] ?? "").trim() : "";
          })
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 400);
        try {
          await appendWhatsAppChatMessage(db, {
            phone: normalized,
            direction: "outbound",
            text: previewText || `[Template ${template.name}]`,
            from: config.phoneNumberId,
            to: normalized,
            createdAt: new Date().toISOString(),
            messageId: sent.messageId,
            contactId: lead.id,
            contactName: lead.name || lead.email || lead.id,
            marketingApproved: marketingOk,
          });
        } catch {
          // ההודעה כבר נשלחה בהצלחה למטא; כשל בלוג השיחה לא צריך להפוך את השליחה ל-failed.
        }
        dispatches.push({
          contactId: lead.id,
          contactName: lead.name || lead.email || lead.id,
          to: normalized,
          status: "sent",
          messageId: sent.messageId,
        });
      } catch (e) {
        dispatches.push({
          contactId: lead.id,
          contactName: lead.name || lead.email || lead.id,
          to: normalized,
          status: "failed",
          error: e instanceof Error ? e.message : "Meta send failed",
        });
      }
    }

    const sentCount = dispatches.filter((d) => d.status === "sent").length;
    const failedCount = dispatches.length - sentCount;
    const campaign = {
      id: randomUUID(),
      broadcastName: broadcastName || undefined,
      templateId: template.id,
      templateName: template.name,
      templateLanguage: template.language,
      parameterValues,
      recipientCount: dispatches.length,
      sentCount,
      failedCount,
      createdBy: auth.user.email ?? auth.user.uid,
      createdAt: new Date().toISOString(),
      dispatches,
    };
    try {
      await appendWhatsAppCampaign(db, campaign);
      return NextResponse.json({ ok: true, campaign });
    } catch (e) {
      return NextResponse.json({
        ok: true,
        campaign,
        warning:
          `ההודעות נשלחו, אבל שמירת ההיסטוריה נכשלה: ${e instanceof Error ? e.message : "Unknown error"}`,
      });
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
