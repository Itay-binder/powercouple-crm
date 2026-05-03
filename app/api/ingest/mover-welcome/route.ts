import { NextRequest, NextResponse } from "next/server";
import { validateCustomValues } from "@/lib/customFields/repo";
import { getAdminDb, getRequestTenantDatabaseId } from "@/lib/firebase/admin";
import { getTenantByDatabaseId } from "@/lib/tenant/config";
import { isMovingOrdersTenant } from "@/lib/tenant/movingOrders";
import { isValidIngestApiKeyAsync } from "@/lib/ingest/apiKey";
import { MOVER_CONTACT_FIELD_IDS } from "@/lib/movingOrders/fieldIds";
import { seedPayingCustomersMoverQuestionnaireFields } from "@/lib/movingOrders/seedPayingCustomersMoverQuestionnaire";
import {
  buildMoverContactCustomPatchFromWelcome,
  buildWelcomeOpportunityCustomValues,
  normalizeMoverWelcomeItems,
  type MoverWelcomeWebhookItem,
} from "@/lib/movingOrders/moverWelcomePayload";
import {
  createOpportunity,
  ensureDefaultPipeline,
  findCustomersPipelineOpportunityByNormalizedPhone,
  getOpportunityById,
  getPayingCustomersPipelineId,
  updateOpportunity,
  WON_PIPELINE_STAGE_LABEL,
} from "@/lib/opportunities/repo";
import { getLeadById, normalizePhone, updateLead, upsertLead } from "@/lib/leads/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

async function resolveOpportunityId(
  item: MoverWelcomeWebhookItem,
  payingPipelineId: string
): Promise<string | null> {
  const explicit = String(item.opportunity_id ?? "")
    .trim()
    .replace(/^"|"$/g, "");
  if (explicit) {
    const opp = await getOpportunityById(explicit);
    if (!opp || opp.pipelineId !== payingPipelineId) return null;
    return explicit;
  }
  const phone = String(item.phone ?? "").trim();
  if (!phone) return null;
  return findCustomersPipelineOpportunityByNormalizedPhone(phone);
}

function readFirestoreTsMillis(raw: unknown): number {
  if (raw && typeof raw === "object" && "toDate" in raw) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((raw as any).toDate?.() as Date | undefined)?.getTime?.() ?? 0;
  }
  return 0;
}

async function findLatestOpportunityIdByContactAndPipeline(
  contactIdRaw: string,
  pipelineIdRaw: string
): Promise<string | null> {
  const contactId = contactIdRaw.trim();
  const pipelineId = pipelineIdRaw.trim();
  if (!contactId || !pipelineId) return null;
  const db = await getAdminDb();
  const snap = await db
    .collection("opportunities")
    .where("contactId", "==", contactId)
    .where("pipelineId", "==", pipelineId)
    .get();
  let bestId: string | null = null;
  let bestTs = -1;
  for (const doc of snap.docs) {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    const ts = Math.max(readFirestoreTsMillis(d.updatedAt), readFirestoreTsMillis(d.createdAt));
    if (ts >= bestTs) {
      bestTs = ts;
      bestId = doc.id;
    }
  }
  return bestId;
}

async function findPayingOpportunityIdBySourceOpportunityId(
  sourceOpportunityIdRaw: string
): Promise<string | null> {
  const sourceOpportunityId = sourceOpportunityIdRaw.trim();
  if (!sourceOpportunityId) return null;
  const db = await getAdminDb();
  const snap = await db
    .collection("opportunities")
    .where("sourceOpportunityId", "==", sourceOpportunityId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0]?.id ?? null;
}

async function readSourceOpportunityId(payingOpportunityIdRaw: string): Promise<string | null> {
  const payingOpportunityId = payingOpportunityIdRaw.trim();
  if (!payingOpportunityId) return null;
  const db = await getAdminDb();
  const snap = await db.collection("opportunities").doc(payingOpportunityId).get();
  if (!snap.exists) return null;
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const raw = typeof d.sourceOpportunityId === "string" ? d.sourceOpportunityId.trim() : "";
  return raw || null;
}

export async function POST(req: NextRequest) {
  if (!(await isValidIngestApiKeyAsync(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" } satisfies ApiErr, { status: 401 });
  }

  const dbId = await getRequestTenantDatabaseId();
  const tenant = getTenantByDatabaseId(dbId);
  if (!tenant || !isMovingOrdersTenant(tenant.id)) {
    return NextResponse.json(
      {
        ok: false,
        error: "ניהול הזמנות לא מופעל לטננט הזה. שלח כותרת x-crm-tenant או בחר עסק מתאים.",
      } satisfies ApiErr,
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" } satisfies ApiErr, { status: 400 });
  }

  const items = normalizeMoverWelcomeItems(body);
  if (items.length === 0) {
    return NextResponse.json(
      { ok: false, error: "ציפיתי למערך אובייקטים או גוף עם items" } satisfies ApiErr,
      { status: 400 }
    );
  }

  let payingPipelineId: string;
  let salesPipelineId: string;
  try {
    await seedPayingCustomersMoverQuestionnaireFields();
    payingPipelineId = await getPayingCustomersPipelineId();
    salesPipelineId = (await ensureDefaultPipeline()).id;
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "זריעת שדות מוביל נכשלה",
      } satisfies ApiErr,
      { status: 500 }
    );
  }

  const moverFieldIdSet = new Set(MOVER_CONTACT_FIELD_IDS);

  const results: Array<{
    opportunityId: string;
    contactId?: string;
    updated: boolean;
    error?: string;
  }> = [];

  for (const item of items) {
    try {
      const normalizedPhone = normalizePhone(String(item.phone ?? ""));
      const normalizedEmail = String(item.email ?? "").trim().toLowerCase();
      const normalizedName = String(item.name ?? "").trim();

      let payingOppId = await resolveOpportunityId(item, payingPipelineId);
      let salesOppId: string | null = null;
      let contactId = "";

      if (payingOppId) {
        const sourceOpportunityId = await readSourceOpportunityId(payingOppId);
        if (sourceOpportunityId) {
          salesOppId = sourceOpportunityId;
        }
      }

      if (!payingOppId) {
        if (!normalizedPhone && !normalizedEmail) {
          results.push({
            opportunityId: "",
            updated: false,
            error: "חסרים phone/email כדי לאתר או ליצור איש קשר והזדמנויות",
          });
          continue;
        }
        const lead = await upsertLead({
          phone: normalizedPhone,
          email: normalizedEmail || undefined,
          name: normalizedName || undefined,
          source: "mover_welcome",
          pipelineId: salesPipelineId,
          stage: "Pending",
          status: "פתוח",
        });
        contactId = lead.id;
        salesOppId = await findLatestOpportunityIdByContactAndPipeline(contactId, salesPipelineId);
        if (!salesOppId) {
          const createdSales = await createOpportunity({
            contactId,
            pipelineId: salesPipelineId,
            ...(normalizedName ? { name: normalizedName } : {}),
            ...(normalizedPhone ? { phone: normalizedPhone } : {}),
            ...(normalizedEmail ? { email: normalizedEmail } : {}),
            status: "פתוח",
          });
          salesOppId = createdSales.id;
        }
      }

      if (payingOppId) {
        const payingExisting = await getOpportunityById(payingOppId);
        if (payingExisting) {
          contactId = String(payingExisting.contactId ?? "").trim();
          if (!salesOppId && contactId) {
            salesOppId = await findLatestOpportunityIdByContactAndPipeline(contactId, salesPipelineId);
          }
        }
      }

      if (salesOppId) {
        await updateOpportunity(salesOppId, {
          ...(normalizedName ? { name: normalizedName } : {}),
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
          ...(normalizedEmail ? { email: normalizedEmail } : {}),
          stage: WON_PIPELINE_STAGE_LABEL,
          status: "זכיה",
        });
      }

      if (!payingOppId && salesOppId) {
        payingOppId = await findPayingOpportunityIdBySourceOpportunityId(salesOppId);
      }

      if (!payingOppId && contactId) {
        const createdPaying = await createOpportunity({
          contactId,
          pipelineId: payingPipelineId,
          ...(normalizedName ? { name: normalizedName } : {}),
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
          ...(normalizedEmail ? { email: normalizedEmail } : {}),
          status: "פתוח",
        });
        payingOppId = createdPaying.id;
      }

      if (!payingOppId) {
        results.push({ opportunityId: "", updated: false, error: "לא הצלחתי לאתר או ליצור הזדמנות לקוחות משלמים" });
        continue;
      }

      const welcomeVals = buildWelcomeOpportunityCustomValues(item);
      const existing = await getOpportunityById(payingOppId);
      if (!existing) {
        results.push({ opportunityId: payingOppId, updated: false, error: "הזדמנות לקוחות משלמים לא קיימת" });
        continue;
      }
      const mergedOppCustom = { ...(existing.customValues ?? {}), ...welcomeVals };
      const customValues = await validateCustomValues("opportunity", mergedOppCustom, {
        pipelineId: payingPipelineId,
        previousValues: existing.customValues as Record<string, unknown> | undefined,
      });

      await updateOpportunity(payingOppId, {
        ...(normalizedName ? { name: normalizedName } : {}),
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        customValues,
      });

      const effectiveContactId = String(existing.contactId ?? "").trim();
      if (effectiveContactId) {
        const lead =
          (await getLeadById(effectiveContactId)) ??
          (await upsertLead({
            id: effectiveContactId,
            ...(normalizedName ? { name: normalizedName } : {}),
            ...(normalizedEmail ? { email: normalizedEmail } : {}),
            ...(normalizedPhone ? { phone: normalizedPhone } : {}),
            source: "mover_welcome",
            pipelineId: payingPipelineId,
            status: "זכיה",
            stage: WON_PIPELINE_STAGE_LABEL,
          }));
        const patch = buildMoverContactCustomPatchFromWelcome(item);
        const patchRec = patch as Record<string, unknown>;
        const prevCf = (lead.customFields ?? {}) as Record<string, unknown>;
        const mergedCf = { ...prevCf, ...patchRec };
        let customFields = await validateCustomValues("contact", mergedCf, {
          pipelineId: payingPipelineId,
          previousValues: prevCf,
        });
        for (const fid of moverFieldIdSet) {
          if (Object.prototype.hasOwnProperty.call(patchRec, fid)) {
            customFields = { ...customFields, [fid]: patchRec[fid] };
          }
        }
        await updateLead(effectiveContactId, {
          pipelineId: payingPipelineId,
          status: "זכיה",
          stage: WON_PIPELINE_STAGE_LABEL,
          ...(normalizedName ? { name: normalizedName } : {}),
          ...(normalizedEmail ? { email: normalizedEmail } : {}),
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
          customFields,
        });
        results.push({ opportunityId: payingOppId, contactId: effectiveContactId, updated: true });
      } else {
        results.push({ opportunityId: payingOppId, updated: true, error: "לא קיים contactId על הזדמנות לקוחות משלמים" });
      }
    } catch (e) {
      results.push({
        opportunityId: "",
        updated: false,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  const failed = results.filter((r) => !r.updated);
  if (failed.length === results.length) {
    return NextResponse.json(
      { ok: false, error: failed[0]?.error ?? "Update failed", results },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, results });
}
