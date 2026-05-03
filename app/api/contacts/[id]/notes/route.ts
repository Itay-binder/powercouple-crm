import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isValidIngestApiKeyAsync } from "@/lib/ingest/apiKey";
import { appendLeadNote } from "@/lib/leads/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userAuth = await requireApprovedUser(req);
  if (!userAuth.ok && !(await isValidIngestApiKeyAsync(req))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" } satisfies ApiErr,
      { status: 401 }
    );
  }

  const { id } = await params;
  try {
    const body = (await req.json()) as {
      text?: string;
      createdBy?: string;
      id?: string;
      createdAt?: string;
    };
    const lead = await appendLeadNote(id, {
      text: body.text ?? "",
      createdBy: body.createdBy,
      id: body.id,
      createdAt: body.createdAt,
    });
    return NextResponse.json({ ok: true, lead });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
