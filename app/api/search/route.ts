import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listLeadsFiltered } from "@/lib/leads/repo";
import { listOpportunities } from "@/lib/opportunities/repo";
import { searchPropertyDeals } from "@/lib/deals/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Hit =
  | { kind: "contact"; id: string; title: string; subtitle: string }
  | { kind: "opportunity"; id: string; title: string; subtitle: string }
  | { kind: "deal"; id: string; title: string; subtitle: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ ok: true, hits: [] as Hit[] });
  }

  const needle = q.toLowerCase();
  const hits: Hit[] = [];

  try {
    const [leads, opps, deals] = await Promise.all([
      listLeadsFiltered(),
      listOpportunities(),
      searchPropertyDeals(q),
    ]);

    for (const l of leads) {
      const blob = `${l.name ?? ""} ${l.email ?? ""} ${l.phone ?? ""}`.toLowerCase();
      if (!blob.includes(needle)) continue;
      hits.push({
        kind: "contact",
        id: l.id,
        title: (l.name ?? "").trim() || "איש קשר",
        subtitle: [l.phone, l.email].filter(Boolean).join(" · ") || l.id,
      });
      if (hits.length >= 25) break;
    }

    if (hits.length < 25) {
      for (const o of opps) {
        const blob = `${o.name ?? ""} ${o.contactName ?? ""} ${o.contactPhone ?? ""} ${o.stage ?? ""}`.toLowerCase();
        if (!blob.includes(needle)) continue;
        hits.push({
          kind: "opportunity",
          id: o.id,
          title: (o.name ?? "").trim() || "הזדמנות",
          subtitle: [o.stage, o.contactPhone].filter(Boolean).join(" · ") || o.id,
        });
        if (hits.length >= 25) break;
      }
    }

    if (hits.length < 25) {
      for (const d of deals) {
        hits.push({
          kind: "deal",
          id: d.id,
          title: d.name,
          subtitle: [d.city, d.status].filter(Boolean).join(" · ") || d.id,
        });
        if (hits.length >= 25) break;
      }
    }

    return NextResponse.json({ ok: true, hits: hits.slice(0, 25) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
