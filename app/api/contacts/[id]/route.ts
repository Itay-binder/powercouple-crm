import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUserOrIngestApiKey } from "@/lib/auth/guard";
import { getLeadById, updateLead } from "@/lib/leads/repo";
import { validateCustomValues } from "@/lib/customFields/repo";
import { listOpportunities, listPipelines } from "@/lib/opportunities/repo";

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
  const lead = await getLeadById(id);
  if (!lead) {
    return NextResponse.json(
      { ok: false, error: "Contact not found" } satisfies ApiErr,
      { status: 404 }
    );
  }
  const [opportunitiesRaw, pipelines] = await Promise.all([
    listOpportunities(),
    listPipelines(),
  ]);
  const pipelineNameById = new Map(pipelines.map((p) => [p.id, p.name]));
  const opportunities = opportunitiesRaw
    .filter((o) => o.contactId === lead.id)
    .map((o) => ({
      ...o,
      pipelineName: pipelineNameById.get(o.pipelineId) ?? o.pipelineId,
    }));
  const aggregatedNotes = opportunities.flatMap((o) => o.notes ?? []);
  const aggregatedTasks = opportunities.flatMap((o) => o.tasks ?? []);
  return NextResponse.json({
    ok: true,
    lead,
    opportunities,
    aggregatedNotes,
    aggregatedTasks,
  });
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
      email?: string;
      phone?: string;
      pipelineId?: string;
      status?: "פתוח" | "זכיה" | "הפסד";
      assignedRep?: string;
      labelIds?: string[];
      tags?: string[];
      customFields?: Record<string, unknown>;
      notes?: Array<{
        id: string;
        text: string;
        createdAt: string;
        createdBy?: string;
        category?: string;
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
    const prev = await getLeadById(id);
    if (!prev) {
      return NextResponse.json(
        { ok: false, error: "Contact not found" } satisfies ApiErr,
        { status: 404 }
      );
    }
    const effectivePipe = (body.pipelineId ?? prev.pipelineId ?? "").trim();
    const customFields =
      body.customFields === undefined
        ? undefined
        : await validateCustomValues("contact", body.customFields, {
            pipelineId: effectivePipe || null,
            previousValues: prev.customFields,
          });
    const lead = await updateLead(id, {
      ...body,
      customFields,
    });
    return NextResponse.json({ ok: true, lead });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}

