import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import {
  createPipeline,
  listPipelines,
  type PipelineScope,
} from "@/lib/opportunities/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }

  try {
    const scopeQ = req.nextUrl.searchParams.get("scope");
    const scope: PipelineScope =
      scopeQ === "moving_order" ? "moving_order" : "opportunity";
    const pipelines = await listPipelines(scope);
    return NextResponse.json({ ok: true, pipelines });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}

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
      name?: string;
      stages?: string[];
      scope?: PipelineScope;
    };
    const created = await createPipeline({
      name: body.name ?? "",
      stages: Array.isArray(body.stages) ? body.stages : [],
      scope: body.scope === "moving_order" ? "moving_order" : "opportunity",
    });
    return NextResponse.json({ ok: true, pipeline: created });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}

