import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUserOrIngestApiKey } from "@/lib/auth/guard";
import { enrichOpportunitiesForApi, listLabels } from "@/lib/labels/repo";
import { attachContactLastLeadAt } from "@/lib/opportunities/attachContactLastLeadAt";
import { createOpportunity, listOpportunities } from "@/lib/opportunities/repo";
import { phoneSearchMatches } from "@/lib/phoneSearch";
import { validateCustomValues } from "@/lib/customFields/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUserOrIngestApiKey(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }

  const pipelineId = req.nextUrl.searchParams.get("pipelineId");
  const phoneQ = req.nextUrl.searchParams.get("phone")?.trim() ?? "";

  try {
    let opportunities = await listOpportunities(pipelineId);
    if (phoneQ) {
      opportunities = opportunities.filter(
        (o) => phoneSearchMatches(o.phone, phoneQ) || phoneSearchMatches(o.contactPhone, phoneQ)
      );
    }
    const catalog = await listLabels();
    const withContactLead = await attachContactLastLeadAt(opportunities);
    const enriched = enrichOpportunitiesForApi(withContactLead, catalog);
    return NextResponse.json({ ok: true, opportunities: enriched });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUserOrIngestApiKey(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }

  try {
    const body = (await req.json()) as {
      name?: string;
      contactId?: string;
      pipelineId?: string;
      stage?: string;
      status?: "פתוח" | "זכיה" | "הפסד";
      value?: number;
      email?: string;
      phone?: string;
      utmSource?: string;
      utm_source?: string;
      utmCampaign?: string;
      utm_campaign?: string;
      utmMedium?: string;
      utm_medium?: string;
      utmContent?: string;
      utm_content?: string;
      landingpage?: string;
      labelIds?: string[];
      tags?: string[];
      customValues?: Record<string, unknown>;
      assignedRep?: string;
    };
    const pipe = (body.pipelineId ?? "").trim();
    const customValues = await validateCustomValues("opportunity", body.customValues, {
      pipelineId: pipe || null,
    });
    const created = await createOpportunity({
      name: body.name,
      contactId: body.contactId ?? "",
      pipelineId: body.pipelineId ?? "",
      stage: body.stage,
      status: body.status,
      value: body.value,
      email: body.email,
      phone: body.phone,
      utmSource: body.utmSource ?? body.utm_source,
      utmCampaign: body.utmCampaign ?? body.utm_campaign,
      utmMedium: body.utmMedium ?? body.utm_medium,
      utmContent: body.utmContent ?? body.utm_content,
      landingpage: body.landingpage,
      labelIds: body.labelIds,
      tags: body.tags,
      customValues,
      assignedRep: body.assignedRep,
    });
    const catalog = await listLabels();
    const [withContact] = await attachContactLastLeadAt([created]);
    const [enriched] = enrichOpportunitiesForApi([withContact], catalog);
    return NextResponse.json({ ok: true, opportunity: enriched });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}

