import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Session is managed by Supabase Auth via cookies (set during /auth/callback).
 * This route is kept for backwards compatibility with any client that still calls it.
 */
export async function POST() {
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  } catch {
    // ignore — signing out is best effort
  }
  return NextResponse.json({ ok: true });
}
