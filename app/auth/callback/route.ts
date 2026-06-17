import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Supabase OAuth callback: exchanges the auth code for a session (sets cookies),
 * then redirects back to the originally requested path.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const rawReturn = url.searchParams.get("returnTo") || "/dashboard";
  const returnTo =
    rawReturn.startsWith("/") && !rawReturn.includes("//") ? rawReturn : "/dashboard";

  const supabase = await createServerSupabase();
  if (code) {
    try {
      await supabase.auth.exchangeCodeForSession(code);
    } catch {
      return NextResponse.redirect(new URL("/login", url.origin));
    }
  }

  return NextResponse.redirect(new URL(returnTo, url.origin));
}
