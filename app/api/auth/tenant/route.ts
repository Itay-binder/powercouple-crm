import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Single-tenant deployment (PowerCouple): there is nothing to switch.
 * Kept as a no-op so the UI tenant switcher (if ever rendered) keeps working.
 */
export async function POST() {
  return NextResponse.json({ ok: true });
}
