import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getPropertyDeal, updatePropertyDeal } from "@/lib/deals/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  const { id } = await ctx.params;
  try {
    const deal = await getPropertyDeal(id);
    if (!deal) return NextResponse.json({ ok: false, error: "לא נמצא" } satisfies ApiErr, { status: 404 });
    return NextResponse.json({ ok: true, deal });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  const { id } = await ctx.params;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tasks = Array.isArray(body.tasks)
      ? body.tasks
          .filter((x) => x && typeof x === "object")
          .map((x) => {
            const t = x as Record<string, unknown>;
            const status: "todo" | "in_progress" | "done" | undefined =
              t.status === "todo" || t.status === "in_progress" || t.status === "done"
                ? t.status
                : undefined;
            return {
              id: String(t.id ?? "").trim(),
              title: String(t.title ?? "").trim(),
              dueAt: String(t.dueAt ?? "").trim(),
              reminderAt: typeof t.reminderAt === "string" ? t.reminderAt : undefined,
              done: Boolean(t.done),
              status,
              comments: Array.isArray(t.comments)
                ? t.comments
                    .filter((c) => c && typeof c === "object")
                    .map((c) => {
                      const cc = c as Record<string, unknown>;
                      return {
                        id: String(cc.id ?? "").trim(),
                        text: String(cc.text ?? ""),
                        createdAt: String(cc.createdAt ?? ""),
                      };
                    })
                : [],
              createdAt: String(t.createdAt ?? ""),
            };
          })
          .filter((t) => t.id && t.title)
      : undefined;
    const deal = await updatePropertyDeal(id, {
      name: typeof body.name === "string" ? body.name : undefined,
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
      tasks,
    });
    return NextResponse.json({ ok: true, deal });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 400 });
  }
}
