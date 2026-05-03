import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { createPropertyDeal, listPropertyDeals } from "@/lib/deals/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = { ok: true; deals: Awaited<ReturnType<typeof listPropertyDeals>> };
type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  try {
    let deals = await listPropertyDeals();
    deals = [...deals].sort((a, b) => {
      const ta = a.updatedAt?.getTime() ?? a.createdAt?.getTime() ?? 0;
      const tb = b.updatedAt?.getTime() ?? b.createdAt?.getTime() ?? 0;
      return tb - ta;
    });
    return NextResponse.json({ ok: true, deals } satisfies ApiOk);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const deal = await createPropertyDeal({
      name: String(body.name ?? ""),
      pipelineId: typeof body.pipelineId === "string" ? body.pipelineId : undefined,
      pipelineStage: typeof body.pipelineStage === "string" ? body.pipelineStage : undefined,
      clientCount: typeof body.clientCount === "number" ? body.clientCount : undefined,
      dealType: typeof body.dealType === "string" ? body.dealType : undefined,
      city: typeof body.city === "string" ? body.city : undefined,
      fullAddress: typeof body.fullAddress === "string" ? body.fullAddress : undefined,
      linkedContactIds: Array.isArray(body.linkedContactIds)
        ? body.linkedContactIds.map((x) => String(x).trim()).filter(Boolean)
        : undefined,
      saleAgreementUrl: typeof body.saleAgreementUrl === "string" ? body.saleAgreementUrl : undefined,
      driveFolderUrl: typeof body.driveFolderUrl === "string" ? body.driveFolderUrl : undefined,
      businessPlanUrl: typeof body.businessPlanUrl === "string" ? body.businessPlanUrl : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });
    return NextResponse.json({ ok: true, deal });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 400 });
  }
}
