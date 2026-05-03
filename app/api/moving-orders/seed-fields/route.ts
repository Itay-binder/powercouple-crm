import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { seedPayingCustomersMoverQuestionnaireFields } from "@/lib/movingOrders/seedPayingCustomersMoverQuestionnaire";

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

  try {
    const seeded = await seedPayingCustomersMoverQuestionnaireFields();
    return NextResponse.json({
      ok: true,
      fieldIds: seeded.fieldIds,
      contactFieldIds: seeded.contactFieldIds,
      opportunityWelcomeFieldIds: seeded.opportunityFieldIds,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
