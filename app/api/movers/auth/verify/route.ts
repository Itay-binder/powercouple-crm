import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Mover phone-auth verification relied on Firebase Phone Auth, which was removed
 * in the Supabase migration. The mover-profile feature is not part of the
 * PowerCouple CRM scope; this endpoint is disabled until reimplemented on Supabase.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "התחברות נותני שירות אינה זמינה כעת" },
    { status: 501 }
  );
}