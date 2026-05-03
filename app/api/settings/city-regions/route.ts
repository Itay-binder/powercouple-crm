import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import {
  bundledCityRegionRowCount,
  clearCityRegionOverrides,
  getCityRegionSettings,
  saveCityRegionRows,
  type CityRegionRow,
} from "@/lib/movingOrders/cityRegionSettingsRepo";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";

export const dynamic = "force-dynamic";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

function parseRows(body: unknown): CityRegionRow[] | null {
  if (!body || typeof body !== "object") return null;
  const rows = (body as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return null;
  const out: CityRegionRow[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const settlement = String((r as CityRegionRow).settlement ?? "").trim();
    const region = String((r as CityRegionRow).region ?? "").trim();
    if (settlement.length > 200 || region.length > 120) continue;
    if (settlement && region) out.push({ settlement, region });
  }
  if (out.length > 25_000) return null;
  if (out.length === 0) return null;
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const mo = await assertMovingOrdersWorkspace();
  if (!mo.ok) {
    return NextResponse.json({ ok: false, error: mo.error }, { status: mo.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const { rows, source } = await getCityRegionSettings();
    return NextResponse.json({
      ok: true,
      rows,
      source,
      bundledRowCount: bundledCityRegionRowCount,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const mo = await assertMovingOrdersWorkspace();
  if (!mo.ok) {
    return NextResponse.json({ ok: false, error: mo.error }, { status: mo.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const rows = parseRows(body);
  if (!rows) {
    return NextResponse.json({ ok: false, error: "חובה לשלוח מערך rows לא ריק" }, { status: 400 });
  }
  try {
    await saveCityRegionRows(rows);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const mo = await assertMovingOrdersWorkspace();
  if (!mo.ok) {
    return NextResponse.json({ ok: false, error: mo.error }, { status: mo.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    await clearCityRegionOverrides();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
