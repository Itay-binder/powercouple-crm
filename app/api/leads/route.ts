import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUserOrIngestApiKey } from "@/lib/auth/guard";
import { upsertLead, listLeadsFiltered } from "@/lib/leads/repo";
import { phoneSearchMatches } from "@/lib/phoneSearch";
import { isValidIngestApiKeyAsync } from "@/lib/ingest/apiKey";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = { ok: true; lead: { id: string; stage: string } };
type ApiErr = { ok: false; error: string };

export async function POST(req: NextRequest) {
  if (!(await isValidIngestApiKeyAsync(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" } satisfies ApiErr, {
      status: 401,
    });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const input = body as any;
    const lead = await upsertLead(input);
    const payload: ApiOk = { ok: true, lead: { id: lead.id, stage: lead.stage } };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 400 });
  }
}

/**
 * Optional admin/debug endpoint.
 * Browser UI uses `/api/contacts` instead.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApprovedUserOrIngestApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }

  const dateFrom = req.nextUrl.searchParams.get("date_from");
  const dateTo = req.nextUrl.searchParams.get("date_to");
  const phoneQ = req.nextUrl.searchParams.get("phone")?.trim() ?? "";

  try {
    let leads = await listLeadsFiltered(dateFrom, dateTo);
    if (phoneQ) {
      leads = leads.filter((l) => phoneSearchMatches(l.phone, phoneQ));
    }
    return NextResponse.json({
      ok: true,
      count: leads.length,
      leads: leads.slice(0, 1000).map((l) => ({ id: l.id, email: l.email, phone: l.phone, name: l.name, stage: l.stage })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 500 });
  }
}

