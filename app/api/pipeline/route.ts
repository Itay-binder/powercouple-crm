import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listLeadsFiltered } from "@/lib/leads/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = {
  ok: true;
  stageColumn?: string | null;
  stages: string[];
  leadsByStage: Record<string, Record<string, string>[]>;
};
type ApiErr = { ok: false; error: string };

function normalizeStage(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

function stageOrderFromEnv(): string[] | null {
  const raw = process.env.CRM_STAGE_ORDER?.trim();
  if (!raw) return null;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });

  const dateFrom = req.nextUrl.searchParams.get("date_from");
  const dateTo = req.nextUrl.searchParams.get("date_to");

  try {
    const leads = await listLeadsFiltered(dateFrom, dateTo);

    const stageSet = new Set<string>();
    const leadsByStage: Record<string, Record<string, string>[]> = {};
    for (const l of leads) {
      const key = normalizeStage(l.stage || "") || "—";
      stageSet.add(key);
      leadsByStage[key] ||= [];
      leadsByStage[key].push({
        id: l.id,
        name: l.name ?? "",
        email: l.email ?? "",
        phone: l.phone ?? "",
        stage: l.stage ?? "",
      });
    }

    const order = stageOrderFromEnv();
    let stages = Array.from(stageSet);
    if (order) {
      const ordered = order.filter((s) => stageSet.has(s));
      const rest = stages.filter((s) => !ordered.includes(s)).sort();
      stages = [...ordered, ...rest];
    } else {
      stages = stages.sort();
    }

    const payload: ApiOk = {
      ok: true,
      stageColumn: null,
      stages,
      leadsByStage,
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 500 });
  }
}

