import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listLabels } from "@/lib/labels/repo";
import { enrichLeadsWithOpportunityLabels, isLeadWhatsAppMarketingApproved, listLeadsFiltered } from "@/lib/leads/repo";
import {
  filterLeadsByAudience,
  type AudienceCondition,
  type AudienceLogic,
} from "@/lib/whatsapp/audienceFilter";

export const dynamic = "force-dynamic";

async function normalizeTagConditions(
  conditions: AudienceCondition[]
): Promise<AudienceCondition[]> {
  if (!conditions.some((c) => c.field === "tag" && c.value.trim())) return conditions;
  const labels = await listLabels();
  const ids = new Set(labels.map((l) => l.id));
  const byName = new Map(labels.map((l) => [l.name.trim().toLowerCase(), l.id]));
  return conditions.map((c) => {
    if (c.field !== "tag") return c;
    const raw = c.value.trim();
    if (!raw) return c;
    if (ids.has(raw)) return c;
    const mapped = byName.get(raw.toLowerCase());
    return mapped ? { ...c, value: mapped } : c;
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    conditions?: AudienceCondition[];
    logic?: AudienceLogic;
    recipientIds?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const conditionsRaw = Array.isArray(body.conditions) ? body.conditions : [];
  const logic: AudienceLogic = body.logic === "or" ? "or" : "and";
  const recipientIds = Array.isArray(body.recipientIds)
    ? Array.from(new Set(body.recipientIds.map((x) => String(x).trim()).filter(Boolean)))
    : [];

  const MAX_LIST = 500;

  try {
    const conditions = await normalizeTagConditions(conditionsRaw);
    const leadsRaw = await listLeadsFiltered(null, null);
    const leads = await enrichLeadsWithOpportunityLabels(leadsRaw);
    const matchedBase = filterLeadsByAudience(leads, conditions, logic);
    const matched =
      recipientIds.length > 0 ? matchedBase.filter((l) => recipientIds.includes(l.id)) : matchedBase;
    const ids = matched.map((l) => l.id);
    const slice = matched.slice(0, MAX_LIST);
    const contacts = slice.map((l) => ({
      id: l.id,
      name: String(l.name ?? ""),
      phone: String(l.phone ?? ""),
      email: String(l.email ?? ""),
      status: String(l.status ?? ""),
      marketingApproved: isLeadWhatsAppMarketingApproved(l),
    }));
    return NextResponse.json({
      ok: true,
      count: matched.length,
      sampleIds: ids.slice(0, 40),
      contacts,
      truncated: matched.length > MAX_LIST,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
