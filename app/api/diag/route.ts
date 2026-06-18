import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const out: Record<string, unknown> = {};
  out.vercelEnv = process.env.VERCEL_ENV || null;
  out.adminEmailsValue = (process.env.ADMIN_EMAILS || "").slice(0, 70);
  out.env = {
    SUPABASE_DB_URL: (process.env.SUPABASE_DB_URL || "").length,
    SUPABASE_SERVICE_ROLE_KEY: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").length,
    NEXT_PUBLIC_SUPABASE_URL: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").length,
    SUPABASE_STORAGE_BUCKET: (process.env.SUPABASE_STORAGE_BUCKET || "").length,
    ADMIN_EMAILS: (process.env.ADMIN_EMAILS || "").length,
  };
  try {
    const { getSql, getFirestore } = await import("@/lib/supabase/firestoreShim");
    const sql = getSql();
    const r = await sql`select 1 as ok`;
    out.select1 = r[0];
    const db = getFirestore();
    const snap = await db.collection("users").limit(1).get();
    out.usersQuerySize = snap.size;
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = e instanceof Error ? e.message : String(e);
    out.stack = (e instanceof Error ? e.stack || "" : "").split("\n").slice(0, 5);
  }
  return NextResponse.json(out);
}
