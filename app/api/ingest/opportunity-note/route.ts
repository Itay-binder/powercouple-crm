import { NextRequest, NextResponse } from "next/server";
import { isValidIngestApiKeyAsync } from "@/lib/ingest/apiKey";
import { appendOpportunityNote } from "@/lib/opportunities/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function POST(req: NextRequest) {
  if (!(await isValidIngestApiKeyAsync(req))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" } satisfies ApiErr,
      { status: 401 }
    );
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      opportunityId?: string;
      id?: string;
      text?: string;
      createdBy?: string;
      createdAt?: string;
    };
    const opportunityId = String(body.opportunityId ?? "").trim();
    if (!opportunityId) {
      return NextResponse.json(
        { ok: false, error: "opportunityId is required" } satisfies ApiErr,
        { status: 400 }
      );
    }
    const opportunity = await appendOpportunityNote(opportunityId, {
      id: body.id,
      text: body.text ?? "",
      createdBy: body.createdBy,
      createdAt: body.createdAt,
    });
    return NextResponse.json({ ok: true, opportunity });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
