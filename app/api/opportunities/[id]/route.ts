import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser, requireApprovedUserOrIngestApiKey } from "@/lib/auth/guard";
import { enrichOpportunitiesForApi, listLabels } from "@/lib/labels/repo";
import { reconcileContactNotesAcrossEntities } from "@/lib/notes/contactNotesSync";
import { attachContactLastLeadAt } from "@/lib/opportunities/attachContactLastLeadAt";
import { deleteOpportunity, getOpportunityById, updateOpportunity } from "@/lib/opportunities/repo";
import { validateCustomValues } from "@/lib/customFields/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type ApiErr = { ok: false; error: string };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUserOrIngestApiKey(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  const { id } = await params;
  let opportunity = await getOpportunityById(id);
  if (!opportunity) {
    return NextResponse.json(
      { ok: false, error: "Opportunity not found" } satisfies ApiErr,
      { status: 404 }
    );
  }
  const contactId = String(opportunity.contactId ?? "").trim();
  if (contactId) {
    // Ensure the notes shown in opportunity details always include full contact history.
    await reconcileContactNotesAcrossEntities(contactId);
    opportunity = await getOpportunityById(id);
    if (!opportunity) {
      return NextResponse.json(
        { ok: false, error: "Opportunity not found" } satisfies ApiErr,
        { status: 404 }
      );
    }
  }
  const catalog = await listLabels();
  const [withContact] = await attachContactLastLeadAt([opportunity]);
  const [enriched] = enrichOpportunitiesForApi([withContact], catalog);
  return NextResponse.json({ ok: true, opportunity: enriched });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUserOrIngestApiKey(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  const { id } = await params;
  try {
    const body = (await req.json()) as {
      name?: string;
      contactId?: string;
      pipelineId?: string;
      stage?: string;
      status?: "פתוח" | "זכיה" | "הפסד";
      value?: number | null;
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
      tags?: string[];
      assignedRep?: string;
      customValues?: Record<string, unknown>;
      notes?: Array<{
        id: string;
        text: string;
        createdAt: string;
        createdBy?: string;
        attachments?: Array<{ id: string; fileName: string; url: string }>;
      }>;
      tasks?: Array<{
        id: string;
        title: string;
        dueAt: string;
        reminderAt?: string;
        done: boolean;
        status?: "todo" | "in_progress" | "done";
        comments?: Array<{ id: string; text: string; createdAt: string }>;
        createdAt: string;
      }>;
    };
    const prev = await getOpportunityById(id);
    if (!prev) {
      return NextResponse.json(
        { ok: false, error: "Opportunity not found" } satisfies ApiErr,
        { status: 404 }
      );
    }
    const effectivePipeline = (body.pipelineId ?? prev.pipelineId ?? "").trim();
    const customValues =
      body.customValues === undefined
        ? undefined
        : await validateCustomValues("opportunity", body.customValues, {
            pipelineId: effectivePipeline || null,
            previousValues: prev.customValues as Record<string, unknown> | undefined,
          });

    const opportunity = await updateOpportunity(id, {
      ...body,
      utmSource: body.utmSource ?? body.utm_source,
      utmCampaign: body.utmCampaign ?? body.utm_campaign,
      utmMedium: body.utmMedium ?? body.utm_medium,
      utmContent: body.utmContent ?? body.utm_content,
      customValues,
    });
    const catalog = await listLabels();
    const [withContact] = await attachContactLastLeadAt([opportunity]);
    const [enriched] = enrichOpportunitiesForApi([withContact], catalog);
    return NextResponse.json({ ok: true, opportunity: enriched });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUser(_req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  const { id } = await params;
  try {
    await deleteOpportunity(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}

