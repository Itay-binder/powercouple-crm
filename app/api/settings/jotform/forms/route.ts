import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getJotformConfig } from "@/lib/jotform/configRepo";
import { fetchJotformForms } from "@/lib/jotform/client";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canManage(auth.user)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  try {
    const cfg = await getJotformConfig();
    if (!cfg.apiKey?.trim()) {
      return NextResponse.json({ ok: false, error: "Jotform API key is missing" }, { status: 400 });
    }
    const forms = await fetchJotformForms(cfg.apiKey);
    return NextResponse.json({ ok: true, forms });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

