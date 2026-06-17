import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { deleteCustomField } from "@/lib/customFields/repo";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { MOVER_WELCOME_QUESTIONNAIRE_CUSTOM_FIELD_IDS } from "@/lib/movingOrders/fieldIds";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const g = await assertMovingOrdersWorkspace();
  if (!g.ok) {
    return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  }

  const deleted: string[] = [];
  const failed: Array<{ fieldId: string; error: string }> = [];

  for (const fieldId of MOVER_WELCOME_QUESTIONNAIRE_CUSTOM_FIELD_IDS) {
    try {
      await deleteCustomField(fieldId);
      deleted.push(fieldId);
    } catch (e) {
      failed.push({
        fieldId,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    deleted,
    failed: failed.length ? failed : undefined,
  });
}
