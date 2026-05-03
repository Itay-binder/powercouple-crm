import { NextRequest, NextResponse } from "next/server";
import { getExternalRef, upsertExternalRef } from "@/lib/externalRefs/repo";
import { getLeadById, upsertLead } from "@/lib/leads/repo";
import { validateCustomValues } from "@/lib/customFields/repo";
import { isValidIngestApiKeyAsync } from "@/lib/ingest/apiKey";
import {
  isHistoricalIngestAllowedForDatabaseId,
  tenantDatabaseIdFromIngestRequest,
} from "@/lib/tenant/historicalIngest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

function pickString(
  obj: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  if (!(await isValidIngestApiKeyAsync(req))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" } satisfies ApiErr,
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as {
      provider?: string;
      externalId?: string;
      contact?: Record<string, unknown> & {
        uniqueKey?: string;
        email?: string;
        phone?: string;
        fullName?: string;
        name?: string;
        stage?: string;
        source?: string;
        customValues?: Record<string, unknown>;
      };
    };

    const provider = body.provider?.trim() || "make";
    const externalId = body.externalId?.trim();
    const c = (body.contact ?? {}) as Record<string, unknown>;

    let existingEntityId: string | undefined;
    if (externalId) {
      const ref = await getExternalRef(provider, externalId);
      if (ref?.entityType === "contact" && ref.entityId) {
        existingEntityId = ref.entityId;
      }
    }

    const uniqueKey = pickString(c, ["uniqueKey", "contact_unique_key"]);
    const email = pickString(c, ["email", "contact_email"]);
    const phone = pickString(c, ["phone", "contact_phone"]);
    const name = pickString(c, ["fullName", "name", "contact_name"]);
    const stage = pickString(c, ["stage", "contact_stage"]);
    const source = pickString(c, ["source", "contact_source"]);
    const statusRaw = pickString(c, ["status", "contact_status"]);
    const assignedRep = pickString(c, [
      "assignedRep",
      "contact_assigned_rep",
      "contact_assignedRep",
    ]);
    const pipelineId = pickString(c, ["pipelineId", "contact_pipeline_id"]);
    const createdAt = pickString(c, ["createdAt", "contact_created_at"]);
    const updatedAt = pickString(c, ["updatedAt", "contact_updated_at"]);

    const systemKeys = new Set([
      "uniqueKey",
      "contact_unique_key",
      "email",
      "contact_email",
      "phone",
      "contact_phone",
      "fullName",
      "name",
      "contact_name",
      "stage",
      "contact_stage",
      "source",
      "contact_source",
      "status",
      "contact_status",
      "assignedRep",
      "contact_assigned_rep",
      "contact_assignedRep",
      "pipelineId",
      "contact_pipeline_id",
      "createdAt",
      "contact_created_at",
      "updatedAt",
      "contact_updated_at",
      "customValues",
      "customFields",
    ]);
    const directFieldIdValues = Object.fromEntries(
      Object.entries(c).filter(([k]) => !systemKeys.has(k))
    );
    const customInput = {
      ...((c.customValues as Record<string, unknown> | undefined) ?? {}),
      ...((c.customFields as Record<string, unknown> | undefined) ?? {}),
      ...directFieldIdValues,
    };
    let prevCustom: Record<string, unknown> | undefined;
    let prevPipeline: string | undefined;
    if (existingEntityId) {
      const ex = await getLeadById(existingEntityId);
      if (ex) {
        prevCustom = ex.customFields;
        prevPipeline = ex.pipelineId;
      }
    }
    const effectivePipe = (pipelineId ?? prevPipeline ?? "").trim();
    const customValues = await validateCustomValues("contact", customInput, {
      pipelineId: effectivePipe || null,
      previousValues: prevCustom,
    });
    const allowHistorical = isHistoricalIngestAllowedForDatabaseId(
      tenantDatabaseIdFromIngestRequest(req)
    );
    const lead = await upsertLead({
      id: existingEntityId,
      uniqueKey,
      email,
      phone,
      name,
      stage: stage ?? "Pending",
      source: source ?? "ingest",
      status:
        statusRaw === "זכיה" || statusRaw === "הפסד" || statusRaw === "פתוח"
          ? statusRaw
          : "פתוח",
      assignedRep,
      pipelineId,
      customFields: customValues,
      ...(allowHistorical && createdAt ? { createdAt } : {}),
      ...(allowHistorical && updatedAt ? { updatedAt } : {}),
    });

    if (externalId) {
      await upsertExternalRef({
        provider,
        externalId,
        entityType: "contact",
        entityId: lead.id,
      });
    }

    return NextResponse.json({
      ok: true,
      contact: {
        id: lead.id,
        contactCode: lead.contactCode ?? "",
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        name: lead.name ?? "",
        stage: lead.stage,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}

