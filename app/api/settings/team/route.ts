import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { listTeamUsers, upsertTeamUser } from "@/lib/users/repo";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canManage(auth.user)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  try {
    const users = await listTeamUsers();
    return NextResponse.json({ ok: true, users });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canManage(auth.user)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  try {
    const body = (await req.json()) as {
      email?: string;
      name?: string;
      role?: "admin" | "user";
      approved?: boolean;
    };
    await upsertTeamUser({
      email: String(body.email ?? ""),
      name: typeof body.name === "string" ? body.name : undefined,
      role: body.role === "admin" ? "admin" : "user",
      approved: body.approved !== false,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}

