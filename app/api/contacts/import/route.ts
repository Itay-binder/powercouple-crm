import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { upsertLead } from "@/lib/leads/repo";
import { validateCustomValues } from "@/lib/customFields/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }

  try {
    const body = (await req.json()) as {
      rows?: Array<{
        email?: string;
        phone?: string;
        name?: string;
        firstName?: string;
        lastName?: string;
        source?: string;
        uniqueKey?: string;
        customFields?: Record<string, unknown>;
        customValues?: Record<string, unknown>;
        pipelineId?: string;
      }>;
    };

    const rows = body.rows ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "rows[] is required" } satisfies ApiErr,
        { status: 400 }
      );
    }

    let success = 0;
    let failed = 0;
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const pipe = r.pipelineId?.trim() || null;
        const customValues = await validateCustomValues(
          "contact",
          r.customValues ?? r.customFields,
          { pipelineId: pipe }
        );
        await upsertLead({
          uniqueKey: r.uniqueKey,
          email: r.email,
          phone: r.phone,
          name: r.name,
          firstName: r.firstName,
          lastName: r.lastName,
          source: r.source ?? "import",
          pipelineId: pipe ?? undefined,
          customFields: customValues,
        });
        success++;
      } catch (e) {
        failed++;
        errors.push({
          index: i,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      total: rows.length,
      success,
      failed,
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message } satisfies ApiErr,
      { status: 400 }
    );
  }
}

