import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listLabels } from "@/lib/labels/repo";
import { enrichLeadsWithOpportunityLabels, listLeadsFiltered } from "@/lib/leads/repo";

export const dynamic = "force-dynamic";

type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }
  try {
    const [labels, leadsRaw] = await Promise.all([listLabels(), listLeadsFiltered(null, null)]);
    const leads = await enrichLeadsWithOpportunityLabels(leadsRaw);
    const byId = new Map(
      labels.map((l) => [
        l.id,
        {
          id: l.id,
          name: l.name,
          color: l.color,
          count: 0,
          contacts: [] as Array<{ id: string; name: string; phone: string; email: string }>,
        },
      ])
    );
    for (const lead of leads) {
      const ids = Array.isArray(lead.labelIds)
        ? Array.from(new Set(lead.labelIds.map((x) => String(x).trim()).filter(Boolean)))
        : [];
      for (const lid of ids) {
        const row = byId.get(lid);
        if (!row) continue;
        row.count += 1;
        row.contacts.push({
          id: lead.id,
          name: String(lead.name ?? "").trim() || "ללא שם",
          phone: String(lead.phone ?? "").trim(),
          email: String(lead.email ?? "").trim(),
        });
      }
    }
    const tagStats = Array.from(byId.values())
      .map((row) => ({
        ...row,
        contacts: row.contacts.sort((a, b) => a.name.localeCompare(b.name, "he")),
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name, "he");
      });
    return NextResponse.json({ ok: true, tagStats });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}
