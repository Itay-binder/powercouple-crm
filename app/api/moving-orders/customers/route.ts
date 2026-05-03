import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listLeadsFiltered } from "@/lib/leads/repo";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { leadIsMoverPoolMember } from "@/lib/movingOrders/moverFieldReaders";
import { ensureCustomersPipeline, listOpportunities } from "@/lib/opportunities/repo";
import { PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const g = await assertMovingOrdersWorkspace();
  if (!g.ok) {
    return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const moversOnly =
    req.nextUrl.searchParams.get("moversOnly") === "1" ||
    req.nextUrl.searchParams.get("moversOnly") === "true";
  const forManualPick =
    req.nextUrl.searchParams.get("forManualPick") === "1" ||
    req.nextUrl.searchParams.get("forManualPick") === "true";

  try {
    const payingMeta = await ensureCustomersPipeline();
    const payingPipelineId = PAYING_CUSTOMERS_PIPELINE_ID;
    const [leads, opps] = await Promise.all([
      listLeadsFiltered(),
      listOpportunities(payingPipelineId),
    ]);
    const contactIds = new Set<string>();
    for (const o of opps) {
      const cid = (o.contactId ?? "").trim();
      if (cid) contactIds.add(cid);
    }
    let customers = leads.filter((l) => contactIds.has(l.id));

    if (forManualPick) {
      /* אנשי קשר שמקושרים להזדמנות בפייפליין «לקוחות משלמים» */
    } else if (moversOnly) {
      customers = customers.filter(leadIsMoverPoolMember);
    }

    const filtered = q
      ? customers.filter((l) => {
          const hay = `${l.name ?? ""} ${l.phone ?? ""} ${l.email ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : customers;

    const sorted = [...filtered].sort((a, b) =>
      (a.name ?? a.id).localeCompare(b.name ?? b.id, "he")
    );

    const limit = forManualPick ? 900 : 200;

    return NextResponse.json({
      ok: true,
      payingPipelineId: payingMeta.id,
      payingPipelineName: payingMeta.name || "לקוחות",
      contacts: sorted.slice(0, limit).map((l) => ({
        id: l.id,
        name: l.name ?? "",
        phone: l.phone ?? "",
        email: l.email ?? "",
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
